import { spawn } from "child_process";
import { constants as fsConstants } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { Semaphore, withTimeout } from "async-mutex";
import { v4 as uuidv4 } from "uuid";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

// Story videos are converted to what WhatsApp itself sends as status:
// H.264 + AAC in MP4, at most 720p on the short side and 30 fps, with the
// index at the start of the file (faststart), around the target size.

const MB = 1024 * 1024;
const MAX_SHORT_SIDE = 720;
const MAX_FPS = 30;
const AUDIO_KBPS = 96;
const MIN_VIDEO_KBPS = 300;
const MAX_VIDEO_KBPS = 2500;
const FFMPEG_THREADS = "2";
// Largest width or height accepted before any decoding work.
export const MAX_VIDEO_SIDE = 4096;
const PRLIMIT = "/usr/bin/prlimit";
const STDERR_LIMIT = 64 * 1024;

const envNumber = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const compressionEnabled = (): boolean =>
  (process.env.WHATSAPP_STATUS_MEDIA_COMPRESSION || "true")
    .trim()
    .toLowerCase() !== "false";

export const videoTargetBytes = (): number =>
  envNumber("WHATSAPP_STATUS_VIDEO_TARGET_MB", 16) * MB;

export const maxVideoSeconds = (): number =>
  envNumber("WHATSAPP_STATUS_MAX_VIDEO_SECONDS", 90);

const conversionTimeoutMs = (): number =>
  envNumber("WHATSAPP_STATUS_VIDEO_TIMEOUT_SECONDS", 180) * 1000;

const queueWaitMs = (): number =>
  envNumber("WHATSAPP_STATUS_VIDEO_QUEUE_SECONDS", 60) * 1000;

// Address-space cap for each ffmpeg process (0 turns it off). The static
// build needs more than 1 GiB of address space to start the H.264 encoder.
const ffmpegMemoryBytes = (): number => {
  const value = Number(process.env.WHATSAPP_STATUS_FFMPEG_MAX_MEMORY_MB);
  return (Number.isFinite(value) && value >= 0 ? value : 2048) * MB;
};

let prlimitAvailable: boolean | null = null;
const hasPrlimit = async (): Promise<boolean> => {
  if (prlimitAvailable === null) {
    prlimitAvailable = await fs
      .access(PRLIMIT, fsConstants.X_OK)
      .then(() => true)
      .catch(() => false);
  }
  return prlimitAvailable;
};

// Created on first use, so the variable is read after the env is loaded.
let slots: Semaphore | null = null;
const conversionSlots = (): Semaphore => {
  if (!slots) {
    slots = new Semaphore(
      Math.max(1, Math.floor(envNumber("WHATSAPP_STATUS_VIDEO_CONCURRENCY", 2)))
    );
  }
  return slots;
};

// Every heavy media step (video probe, video conversion and image
// processing) shares the same slots, with a bounded wait for a free one.
export const withMediaSlot = async <T>(task: () => Promise<T>): Promise<T> => {
  const busy = new Error("ERR_STATUS_MEDIA_BUSY");
  try {
    return await withTimeout(
      conversionSlots(),
      queueWaitMs(),
      busy
    ).runExclusive(task);
  } catch (error) {
    if (error === busy) throw new AppError("ERR_STATUS_MEDIA_BUSY", 503);
    throw error;
  }
};

// Only ISO base media (MP4/MOV) read from a local file reaches ffmpeg: the
// demuxer is forced and every other protocol is refused.
const inputArgs = (file: string): string[] => [
  "-hide_banner",
  "-nostdin",
  "-protocol_whitelist",
  "file",
  "-f",
  "mov",
  "-i",
  file
];

type RunResult = { code: number | null; stderr: string; timedOut: boolean };

const runFfmpeg = async (
  args: string[],
  limitMs: number
): Promise<RunResult> => {
  const memory = ffmpegMemoryBytes();
  const [command, commandArgs] =
    memory > 0 && (await hasPrlimit())
      ? [
          PRLIMIT,
          [`--as=${Math.floor(memory)}`, "--", ffmpegInstaller.path, ...args]
        ]
      : [ffmpegInstaller.path, args];
  return new Promise((resolve, reject) => {
    // prlimit runs ffmpeg in its own process, so the pid is ffmpeg's.
    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    try {
      // Lower priority than the API process (best effort).
      if (child.pid) os.setPriority(child.pid, 10);
    } catch {
      // ignore
    }
    let stderr = "";
    let timedOut = false;
    child.stderr.on("data", chunk => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_LIMIT);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limitMs);
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ code, stderr, timedOut });
    });
  });
};

export type VideoInfo = {
  durationSeconds: number;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
};

export const parseVideoInfo = (stderr: string): VideoInfo | null => {
  const start = stderr.indexOf("Input #0");
  if (start === -1) return null;
  const end = stderr.indexOf("Output #0", start);
  const input = stderr.slice(start, end === -1 ? undefined : end);

  const duration = input.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const videoLine = input.match(/Stream #0:\d+[^\n]*: Video: ([^\n]*)/);
  const audioLine = input.match(/Stream #0:\d+[^\n]*: Audio: ([^\n]*)/);
  const size = videoLine?.[1].match(/, (\d{2,5})x(\d{2,5})[ ,[]/);
  const fps = videoLine?.[1].match(/, (\d+(?:\.\d+)?) fps/);

  return {
    durationSeconds: duration
      ? Number(duration[1]) * 3600 +
        Number(duration[2]) * 60 +
        Number(duration[3])
      : 0,
    videoCodec: videoLine ? videoLine[1].split(/[ ,(]/)[0] : null,
    audioCodec: audioLine ? audioLine[1].split(/[ ,(]/)[0] : null,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    fps: fps ? Number(fps[1]) : null
  };
};

export const probeStatusVideo = async (file: string): Promise<VideoInfo> => {
  // Without an output ffmpeg exits with an error after printing the input.
  const { stderr, timedOut } = await withMediaSlot(() =>
    runFfmpeg(inputArgs(file), 30000)
  );
  const info = timedOut ? null : parseVideoInfo(stderr);
  if (!info || !info.videoCodec || !info.durationSeconds) {
    throw new AppError("ERR_STATUS_MEDIA_INVALID", 400);
  }
  return info;
};

// Refuses huge frames before any decoding, so a crafted file cannot make the
// converter allocate gigabytes.
export const assertVideoResolution = (info: VideoInfo): void => {
  if (!info.width || !info.height) {
    throw new AppError("ERR_STATUS_MEDIA_INVALID", 400);
  }
  if (info.width > MAX_VIDEO_SIDE || info.height > MAX_VIDEO_SIDE) {
    throw new AppError("ERR_STATUS_MEDIA_RESOLUTION_TOO_LARGE", 400);
  }
};

export const needsConversion = (info: VideoInfo, size: number): boolean =>
  size > videoTargetBytes() ||
  info.videoCodec !== "h264" ||
  (info.audioCodec !== null && info.audioCodec !== "aac");

const videoKbps = (durationSeconds: number): number => {
  const totalKbps =
    (videoTargetBytes() * 0.92 * 8) / Math.max(durationSeconds, 1) / 1000;
  return Math.round(
    Math.min(MAX_VIDEO_KBPS, Math.max(MIN_VIDEO_KBPS, totalKbps - AUDIO_KBPS))
  );
};

const evenMin = (side: string): string =>
  `trunc(min(${MAX_SHORT_SIDE},${side})/2)*2`;

const videoFilter = (info: VideoInfo): string => {
  // The short side goes to 720 at most; the other keeps the aspect ratio.
  const scale = `scale=w='if(gt(iw,ih),-2,${evenMin("iw")})':h='if(gt(iw,ih),${evenMin("ih")},-2)'`;
  return info.fps && info.fps > MAX_FPS ? `${scale},fps=${MAX_FPS}` : scale;
};

const unlinkQuietly = async (file: string): Promise<void> => {
  await fs.unlink(file).catch(() => undefined);
};

// Converts the upload to a new temp file and returns its path. The caller
// moves it and must delete it; on any failure the temp output is removed.
export const convertStatusVideo = async (
  input: string,
  info: VideoInfo
): Promise<string> => {
  const output = path.join(os.tmpdir(), `status-video-${uuidv4()}.mp4`);
  const kbps = videoKbps(info.durationSeconds);
  const args = [
    ...inputArgs(input),
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    videoFilter(info),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "main",
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    `${kbps}k`,
    "-maxrate",
    `${Math.round(kbps * 1.5)}k`,
    "-bufsize",
    `${kbps * 2}k`,
    "-c:a",
    "aac",
    "-b:a",
    `${AUDIO_KBPS}k`,
    "-ac",
    "2",
    "-map_metadata",
    "-1",
    "-movflags",
    "+faststart",
    "-threads",
    FFMPEG_THREADS,
    // Never longer than a story, whatever the header says.
    "-t",
    String(maxVideoSeconds()),
    "-y",
    output
  ];

  const started = Date.now();
  try {
    const result = await withMediaSlot(() =>
      runFfmpeg(args, conversionTimeoutMs())
    );
    if (result.timedOut) {
      throw new AppError("ERR_STATUS_MEDIA_TIMEOUT", 422);
    }
    if (result.code !== 0) {
      throw new AppError("ERR_STATUS_MEDIA_INVALID", 400);
    }
    logger.info(
      {
        durationSeconds: Math.round(info.durationSeconds),
        videoKbps: kbps,
        elapsedMs: Date.now() - started
      },
      "Whatsapp status video converted"
    );
    return output;
  } catch (error) {
    await unlinkQuietly(output);
    throw error;
  }
};
