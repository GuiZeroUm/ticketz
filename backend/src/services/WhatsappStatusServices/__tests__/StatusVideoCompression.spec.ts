import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import AppError from "../../../errors/AppError";
import privateFiles from "../../../config/privateFiles";
import {
  storeStatusMedia,
  statusMediaLimits,
  maxVideoUploadBytes
} from "../StatusMediaService";
import {
  needsConversion,
  parseVideoInfo,
  probeStatusVideo
} from "../StatusVideoService";

jest.setTimeout(120000);

jest.mock("../../../config/privateFiles", () => {
  const mockFs = jest.requireActual<typeof import("fs")>("fs");
  const mockPath = jest.requireActual<typeof import("path")>("path");
  const mockOs = jest.requireActual<typeof import("os")>("os");
  return {
    __esModule: true,
    default: {
      directory: mockFs.mkdtempSync(
        mockPath.join(mockOs.tmpdir(), "ticketz-status-video-test-")
      )
    }
  };
});
jest.mock("../../../models/WhatsappStatusPost", () => ({
  __esModule: true,
  default: { findAll: jest.fn(), update: jest.fn() }
}));
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const ENV_KEYS = [
  "WHATSAPP_STATUS_MEDIA_COMPRESSION",
  "WHATSAPP_STATUS_VIDEO_TARGET_MB",
  "WHATSAPP_STATUS_MAX_VIDEO_SECONDS",
  "WHATSAPP_STATUS_VIDEO_TIMEOUT_SECONDS",
  "WHATSAPP_STATUS_MAX_VIDEO_MB",
  "WHATSAPP_STATUS_MAX_VIDEO_UPLOAD_MB",
  "WHATSAPP_STATUS_MAX_IMAGE_MB",
  "WHATSAPP_STATUS_MAX_IMAGE_UPLOAD_MB"
];

const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), "ticketz-video-fx-"));
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "ticketz-video-up-"));
let counter = 0;

const makeVideo = (name: string, args: string[]): string => {
  const file = path.join(fixtures, name);
  execFileSync(
    ffmpegInstaller.path,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      args[0],
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      ...args.slice(1),
      "-c:a",
      "aac",
      "-shortest",
      "-y",
      file
    ],
    { stdio: "ignore" }
  );
  return file;
};

// Each upload is a fresh copy, because storeStatusMedia deletes its input.
const upload = (source: string | Buffer, ext = ".mp4"): string => {
  counter += 1;
  const file = path.join(uploads, `upload-${counter}${ext}`);
  if (typeof source === "string") fs.copyFileSync(source, file);
  else fs.writeFileSync(file, new Uint8Array(source));
  return file;
};

const leftovers = (): string[] =>
  fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("status-video-"));

const b64 = (file: string): string => fs.readFileSync(file).toString("base64");

const stored = (mediaPath: string): string =>
  path.resolve(privateFiles.directory, mediaPath);

let notH264: string;
let smallH264: string;
let fourSeconds: string;

beforeAll(() => {
  notH264 = makeVideo("not-h264.mp4", [
    "testsrc=size=1920x1080:rate=50",
    "-t",
    "2",
    "-c:v",
    "mpeg4",
    "-q:v",
    "5"
  ]);
  smallH264 = makeVideo("small.mp4", [
    "testsrc=size=320x240:rate=25",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p"
  ]);
  fourSeconds = makeVideo("four-seconds.mp4", [
    "testsrc=size=320x240:rate=25",
    "-t",
    "4",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p"
  ]);
});

beforeEach(() => {
  ENV_KEYS.forEach(key => delete process.env[key]);
});

afterAll(() => {
  ENV_KEYS.forEach(key => delete process.env[key]);
  fs.rmSync(fixtures, { recursive: true, force: true });
  fs.rmSync(uploads, { recursive: true, force: true });
});

const expectAppError = async (
  promise: Promise<unknown>,
  message: string,
  statusCode: number
) => {
  const error = await promise.then(
    () => null,
    caught => caught
  );
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ message, statusCode });
};

describe("story video compression", () => {
  it("converts a 1080p non-H.264 video to H.264/AAC MP4 at 720p, 30 fps, with faststart", async () => {
    const before = leftovers();
    const input = upload(notH264);

    const result = await storeStatusMedia(7, "video", input);

    expect(result.mediaMime).toBe("video/mp4");
    const output = stored(result.mediaPath);
    const info = await probeStatusVideo(output);
    expect(info).toMatchObject({
      videoCodec: "h264",
      audioCodec: "aac",
      width: 1280,
      height: 720
    });
    expect(info.fps).toBeLessThanOrEqual(30);
    const bytes = fs.readFileSync(output).toString("latin1");
    expect(bytes.indexOf("moov")).toBeLessThan(bytes.indexOf("mdat"));
    expect(fs.existsSync(input)).toBe(false);
    expect(leftovers()).toEqual(before);
  });

  it("converts an H.264 video that is above the target size", async () => {
    process.env.WHATSAPP_STATUS_VIDEO_TARGET_MB = "0.001";
    const input = upload(smallH264);
    const original = b64(smallH264);

    const result = await storeStatusMedia(7, "video", input);

    expect(b64(stored(result.mediaPath)) === original).toBe(false);
  });

  it("stores a small H.264/AAC video as it was sent", async () => {
    const result = await storeStatusMedia(7, "video", upload(smallH264));

    expect(b64(stored(result.mediaPath)) === b64(smallH264)).toBe(true);
  });

  it("refuses a file that is not a video before calling ffmpeg", async () => {
    const input = upload(Buffer.from("not a video at all"));
    await expectAppError(
      storeStatusMedia(7, "video", input),
      "ERR_STATUS_MEDIA_INVALID",
      400
    );
    expect(fs.existsSync(input)).toBe(false);
  });

  it("refuses a file with an MP4 header that ffmpeg cannot read", async () => {
    const fake = Buffer.alloc(4096, 7);
    fake.writeUInt32BE(32, 0);
    fake.write("ftypisom", 4, "ascii");
    const input = upload(fake);
    await expectAppError(
      storeStatusMedia(7, "video", input),
      "ERR_STATUS_MEDIA_INVALID",
      400
    );
    expect(fs.existsSync(input)).toBe(false);
  });

  it("refuses a video longer than the status limit", async () => {
    process.env.WHATSAPP_STATUS_MAX_VIDEO_SECONDS = "2";
    const input = upload(fourSeconds);
    await expectAppError(
      storeStatusMedia(7, "video", input),
      "ERR_STATUS_VIDEO_TOO_LONG",
      400
    );
    expect(fs.existsSync(input)).toBe(false);
  });

  it("stops a conversion that takes too long and removes every temp file", async () => {
    process.env.WHATSAPP_STATUS_VIDEO_TIMEOUT_SECONDS = "0.05";
    const before = leftovers();
    const input = upload(notH264);
    await expectAppError(
      storeStatusMedia(7, "video", input),
      "ERR_STATUS_MEDIA_TIMEOUT",
      422
    );
    expect(fs.existsSync(input)).toBe(false);
    expect(leftovers()).toEqual(before);
  });

  it("keeps the previous behaviour when compression is off", async () => {
    process.env.WHATSAPP_STATUS_MEDIA_COMPRESSION = "false";
    process.env.WHATSAPP_STATUS_MAX_VIDEO_MB = "20";
    expect(maxVideoUploadBytes()).toBe(20 * 1024 * 1024);
    const fake = Buffer.alloc(64);
    fake.writeUInt32BE(32, 0);
    fake.write("ftypisom", 4, "ascii");

    const result = await storeStatusMedia(7, "video", upload(fake));

    expect(b64(stored(result.mediaPath)) === fake.toString("base64")).toBe(
      true
    );
    expect(statusMediaLimits()).toEqual({
      imageMb: 5,
      videoMb: 20,
      videoSeconds: null,
      compression: false
    });
  });

  it("reports the default limits with compression on", () => {
    expect(statusMediaLimits()).toEqual({
      imageMb: 30,
      videoMb: 100,
      videoSeconds: 90,
      compression: true
    });
  });

  it("reduces an image above the stored limit instead of refusing it", async () => {
    const noise = Buffer.alloc(2600 * 2600 * 3);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) % 251;
    // Smoothed noise behaves like a photo: large as PNG, small as JPEG.
    const png = await sharp(noise, {
      raw: { width: 2600, height: 2600, channels: 3 }
    })
      .blur(4)
      .png()
      .toBuffer();
    // The stored limit is half of the upload, so it must be reduced.
    const limitBytes = png.length / 2;
    process.env.WHATSAPP_STATUS_MAX_IMAGE_MB = String(limitBytes / 1024 / 1024);

    const result = await storeStatusMedia(7, "image", upload(png, ".png"));

    const output = stored(result.mediaPath);
    const meta = await sharp(output).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(1920);
    expect(fs.statSync(output).size).toBeLessThanOrEqual(limitBytes);
  });
});

describe("parseVideoInfo and needsConversion", () => {
  const stderr = [
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x':",
    "  Duration: 00:01:02.50, start: 0.000000, bitrate: 9000 kb/s",
    "    Stream #0:0(und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv), 1920x1080, 8900 kb/s, 59.94 fps, 60 tbr (default)",
    "    Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 96 kb/s (default)",
    "At least one output file must be specified"
  ].join("\n");

  it("reads duration, codecs, size and fps from the ffmpeg input summary", () => {
    expect(parseVideoInfo(stderr)).toEqual({
      durationSeconds: 62.5,
      videoCodec: "hevc",
      audioCodec: "aac",
      width: 1920,
      height: 1080,
      fps: 59.94
    });
    expect(parseVideoInfo("Invalid data found when processing input")).toBe(
      null
    );
  });

  it("converts other codecs and files above the target, and keeps small H.264/AAC", () => {
    const info = parseVideoInfo(stderr);
    expect(needsConversion(info, 1024)).toBe(true);
    const h264 = { ...info, videoCodec: "h264" };
    expect(needsConversion(h264, 1024)).toBe(false);
    expect(needsConversion(h264, 17 * 1024 * 1024)).toBe(true);
    expect(needsConversion({ ...h264, audioCodec: null }, 1024)).toBe(false);
  });
});
