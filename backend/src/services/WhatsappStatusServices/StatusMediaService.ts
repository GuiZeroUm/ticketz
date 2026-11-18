import fs from "fs/promises";
import os from "os";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { Op } from "sequelize";
import privateFiles from "../../config/privateFiles";
import AppError from "../../errors/AppError";
import WhatsappStatusPost from "../../models/WhatsappStatusPost";
import { logger } from "../../utils/logger";
import {
  compressionEnabled,
  convertStatusVideo,
  maxVideoSeconds,
  needsConversion,
  probeStatusVideo
} from "./StatusVideoService";

export type StatusMediaMime =
  "image/jpeg" | "image/png" | "image/webp" | "video/mp4";

const MEDIA_ROOT = "whatsapp-status";
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const ORPHAN_AGE_MS = DAY_MS;
const RETENTION_MS = 7 * DAY_MS;

const envMb = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const maxImageBytes = (): number =>
  envMb("WHATSAPP_STATUS_MAX_IMAGE_MB", 5) * MB;

export const maxVideoBytes = (): number =>
  envMb("WHATSAPP_STATUS_MAX_VIDEO_MB", 20) * MB;

// Largest file accepted from the browser. With compression on, bigger files
// are accepted and reduced; the stored file still respects the limits above.
export const maxImageUploadBytes = (): number =>
  compressionEnabled()
    ? Math.max(
        envMb("WHATSAPP_STATUS_MAX_IMAGE_UPLOAD_MB", 30) * MB,
        maxImageBytes()
      )
    : maxImageBytes();

export const maxVideoUploadBytes = (): number =>
  compressionEnabled()
    ? Math.max(
        envMb("WHATSAPP_STATUS_MAX_VIDEO_UPLOAD_MB", 100) * MB,
        maxVideoBytes()
      )
    : maxVideoBytes();

export const maxUploadBytes = (): number =>
  Math.max(maxImageUploadBytes(), maxVideoUploadBytes());

const toMb = (bytes: number): number => Math.round((bytes / MB) * 10) / 10;

// Limits shown on the story screen.
export const statusMediaLimits = (): {
  imageMb: number;
  videoMb: number;
  videoSeconds: number | null;
  compression: boolean;
} => ({
  imageMb: toMb(maxImageUploadBytes()),
  videoMb: toMb(maxVideoUploadBytes()),
  videoSeconds: compressionEnabled() ? maxVideoSeconds() : null,
  compression: compressionEnabled()
});

const IMAGE_MAX_SIDE = 1920;
const IMAGE_QUALITIES = [85, 70];

// Multer instance for the status API: files land in the OS temp folder and
// are only moved into private storage by storeStatusMedia after validation.
export const statusMediaUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename(_req, file, cb) {
      cb(null, `status-upload-${uuidv4()}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: maxUploadBytes() }
});

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, index) => buffer[offset + index] === byte);

const asciiAt = (buffer: Buffer, offset: number, text: string): boolean =>
  buffer.length >= offset + text.length &&
  buffer.toString("ascii", offset, offset + text.length) === text;

export const sniffMime = (buffer: Buffer): StatusMediaMime | null => {
  if (!buffer || buffer.length < 3) return null;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (asciiAt(buffer, 0, "RIFF") && asciiAt(buffer, 8, "WEBP")) {
    return "image/webp";
  }
  if (asciiAt(buffer, 4, "ftyp")) return "video/mp4";
  return null;
};

const readHead = async (filePath: string, length = 16): Promise<Buffer> => {
  const handle = await fs.open(filePath, "r");
  try {
    const bytes = new Uint8Array(length);
    const { bytesRead } = await handle.read(bytes, 0, length, 0);
    return Buffer.from(bytes.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};

const unlinkQuietly = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      logger.warn({ error, filePath }, "Could not remove status media file");
    }
  }
};

// JPEG, rotated as shot. With compression on, the longest side goes to 1920
// and the quality drops once if the file is still above the stored limit.
const storeImage = async (
  tmpFilePath: string,
  destination: string
): Promise<void> => {
  const qualities = compressionEnabled() ? IMAGE_QUALITIES : [85];
  // eslint-disable-next-line no-restricted-syntax
  for (const quality of qualities) {
    try {
      let image = sharp(tmpFilePath).rotate();
      if (compressionEnabled()) {
        image = image.resize({
          width: IMAGE_MAX_SIDE,
          height: IMAGE_MAX_SIDE,
          fit: "inside",
          withoutEnlargement: true
        });
      }

      await image.jpeg({ quality }).toFile(destination);
    } catch {
      await unlinkQuietly(destination);
      throw new AppError("ERR_STATUS_MEDIA_INVALID", 400);
    }

    const { size } = await fs.stat(destination);
    if (size <= maxImageBytes()) return;
  }
  await unlinkQuietly(destination);
  throw new AppError("ERR_STATUS_MEDIA_TOO_LARGE", 413);
};

// With compression off the upload is stored as sent. With it on, the file is
// checked by ffmpeg (a real MP4/MOV with a video track, within the status
// duration) and converted when it is above the target or not H.264/AAC.
const storeVideo = async (
  tmpFilePath: string,
  size: number,
  destination: string
): Promise<void> => {
  if (!compressionEnabled()) {
    await fs.copyFile(tmpFilePath, destination);
    return;
  }

  const info = await probeStatusVideo(tmpFilePath);
  if (info.durationSeconds > maxVideoSeconds() + 0.5) {
    throw new AppError("ERR_STATUS_VIDEO_TOO_LONG", 400);
  }

  if (!needsConversion(info, size)) {
    if (size > maxVideoBytes()) {
      throw new AppError("ERR_STATUS_MEDIA_TOO_LARGE", 413);
    }
    await fs.copyFile(tmpFilePath, destination);
    return;
  }

  const converted = await convertStatusVideo(tmpFilePath, info);
  try {
    const { size: convertedSize } = await fs.stat(converted);
    if (convertedSize > maxVideoBytes()) {
      throw new AppError("ERR_STATUS_MEDIA_TOO_LARGE", 413);
    }
    await fs.copyFile(converted, destination);
    logger.info(
      { inputBytes: size, outputBytes: convertedSize },
      "Whatsapp status video optimized"
    );
  } finally {
    await unlinkQuietly(converted);
  }
};

const companyRoot = (companyId: number): string =>
  path.resolve(privateFiles.directory, MEDIA_ROOT, String(companyId));

export const storeStatusMedia = async (
  companyId: number,
  kind: "image" | "video",
  tmpFilePath: string
): Promise<{ mediaPath: string; mediaMime: string }> => {
  try {
    const mime = sniffMime(await readHead(tmpFilePath));
    const isImage = kind === "image" && mime !== null && mime !== "video/mp4";
    const isVideo = kind === "video" && mime === "video/mp4";
    if (!isImage && !isVideo) {
      throw new AppError("ERR_STATUS_MEDIA_INVALID", 400);
    }

    const { size } = await fs.stat(tmpFilePath);
    const limit =
      kind === "image" ? maxImageUploadBytes() : maxVideoUploadBytes();
    if (size > limit) {
      throw new AppError("ERR_STATUS_MEDIA_TOO_LARGE", 413);
    }

    const ext = kind === "image" ? "jpg" : "mp4";
    const mediaPath = `${MEDIA_ROOT}/${companyId}/${uuidv4()}.${ext}`;
    const destination = path.resolve(privateFiles.directory, mediaPath);
    await fs.mkdir(companyRoot(companyId), { recursive: true });

    if (kind === "image") {
      await storeImage(tmpFilePath, destination);
      return { mediaPath, mediaMime: "image/jpeg" };
    }

    await storeVideo(tmpFilePath, size, destination);
    return { mediaPath, mediaMime: "video/mp4" };
  } finally {
    await unlinkQuietly(tmpFilePath);
  }
};

export const resolveStatusMediaPath = (
  companyId: number,
  mediaPath: string
): string => {
  const prefix = `${MEDIA_ROOT}/${companyId}/`;
  if (typeof mediaPath !== "string" || !mediaPath.startsWith(prefix)) {
    throw new AppError("ERR_STATUS_NOT_FOUND", 404);
  }

  const root = companyRoot(companyId);
  const absolute = path.resolve(privateFiles.directory, mediaPath);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new AppError("ERR_STATUS_NOT_FOUND", 404);
  }

  return absolute;
};

export const removeStatusMedia = async (
  companyId: number,
  mediaPath: string
): Promise<void> => {
  await unlinkQuietly(resolveStatusMediaPath(companyId, mediaPath));
};

const listDir = async (dir: string) => {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};

// Drafts and unsupported posts nobody touched for 7 days are cancelled and
// lose their media. Conditional, so a post edited or published meanwhile is
// kept. Returns how many files were removed.
const cancelStaleDrafts = async (retentionLimit: Date): Promise<number> => {
  let removed = 0;
  const stale = await WhatsappStatusPost.findAll({
    where: {
      state: { [Op.in]: ["draft", "unsupported"] },
      updatedAt: { [Op.lt]: retentionLimit }
    }
  });
  await Promise.all(
    stale.map(async post => {
      const [count] = await WhatsappStatusPost.update(
        {
          state: "cancelled",
          failureCode: "ERR_STATUS_EXPIRED_DRAFT",
          mediaPath: null,
          mediaMime: null
        },
        {
          where: {
            id: post.id,
            state: post.state,
            updatedAt: { [Op.lt]: retentionLimit }
          }
        }
      );
      if (!count || !post.mediaPath) return;
      try {
        await fs.unlink(resolveStatusMediaPath(post.companyId, post.mediaPath));
        removed += 1;
      } catch (error) {
        // A file left behind is unreferenced now; the orphan sweep removes it.
        if (error?.code !== "ENOENT") {
          logger.warn(
            { error, postId: post.id },
            "Could not remove stale draft status media"
          );
        }
      }
    })
  );
  return removed;
};

// Removes files nobody references (older than 24h, so an upload whose post
// is still being created is not raced) and the media of posts that no longer
// need it: published posts after their 24-hour expiry, cancelled/failed posts older than 7 days, or
// drafts/unsupported posts untouched for 7 days (which are cancelled).
// This hourly sweep is a fallback if the per-post expiry job is lost.
export const cleanupOrphanStatusMedia = async (
  now: Date = new Date()
): Promise<number> => {
  let removed = 0;
  const root = path.resolve(privateFiles.directory, MEDIA_ROOT);

  const candidates: { mediaPath: string; absolute: string }[] = [];
  const companyDirs = (await listDir(root)).filter(entry =>
    entry.isDirectory()
  );
  await Promise.all(
    companyDirs.map(async companyDir => {
      const dir = path.join(root, companyDir.name);
      const files = (await listDir(dir)).filter(entry => entry.isFile());
      await Promise.all(
        files.map(async file => {
          const absolute = path.join(dir, file.name);
          const { mtime } = await fs.stat(absolute);
          if (now.getTime() - mtime.getTime() > ORPHAN_AGE_MS) {
            candidates.push({
              mediaPath: `${MEDIA_ROOT}/${companyDir.name}/${file.name}`,
              absolute
            });
          }
        })
      );
    })
  );

  if (candidates.length) {
    const referenced = await WhatsappStatusPost.findAll({
      attributes: ["mediaPath"],
      where: { mediaPath: { [Op.in]: candidates.map(c => c.mediaPath) } }
    });
    const keep = new Set(referenced.map(post => post.mediaPath));
    await Promise.all(
      candidates
        .filter(candidate => !keep.has(candidate.mediaPath))
        .map(async candidate => {
          await unlinkQuietly(candidate.absolute);
          removed += 1;
        })
    );
  }

  const retentionLimit = new Date(now.getTime() - RETENTION_MS);
  const finishedPosts = await WhatsappStatusPost.findAll({
    where: {
      mediaPath: { [Op.ne]: null },
      [Op.or]: [
        { state: "published", expiresAt: { [Op.lte]: now } },
        {
          state: { [Op.in]: ["cancelled", "failed"] },
          updatedAt: { [Op.lt]: retentionLimit }
        }
      ]
    }
  });

  await Promise.all(
    finishedPosts.map(async post => {
      try {
        await fs.unlink(resolveStatusMediaPath(post.companyId, post.mediaPath));
        removed += 1;
      } catch (error) {
        if (error?.code !== "ENOENT") {
          logger.warn(
            { error, postId: post.id },
            "Could not remove expired status media"
          );
          return;
        }
      }
      await post.update({ mediaPath: null });
    })
  );

  removed += await cancelStaleDrafts(retentionLimit);

  return removed;
};
