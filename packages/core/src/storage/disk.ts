/**
 * Upload storage behind a tiny interface so S3-compatible storage can replace disk later without
 * touching booking code. Keys look like: <tenantId>/2026/09/<uuid>.jpg
 */
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { Errors } from "../errors/domain";

export type StoredFile = { key: string; size: number; mime: ImageMime };
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface Storage {
  saveImage(tenantId: string, data: Buffer): Promise<StoredFile>;
  openStream(key: string): Readable;
  exists(key: string): Promise<boolean>;
  absolutePath(key: string): string;
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Detect image type from magic bytes; never trust the client's content-type. */
export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

const EXT: Record<ImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function createDiskStorage(rootDir: string): Storage {
  const root = path.resolve(rootDir);
  const safe = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw Errors.validation("invalid storage key");
    return p;
  };
  return {
    async saveImage(tenantId, data) {
      if (data.length > MAX_UPLOAD_BYTES)
        throw Errors.validation("حجم فایل باید کمتر از ۵ مگابایت باشد.");
      const mime = sniffImage(data);
      if (!mime) throw Errors.validation("فقط عکس (JPG، PNG یا WebP) پذیرفته می‌شود.");
      const now = new Date();
      const dir = `${tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const key = `${dir}/${randomUUID()}.${EXT[mime]}`;
      await mkdir(path.join(root, dir), { recursive: true });
      await writeFile(safe(key), data, { flag: "wx" });
      return { key, size: data.length, mime };
    },
    openStream(key) {
      return createReadStream(safe(key));
    },
    async exists(key) {
      try {
        await stat(safe(key));
        return true;
      } catch {
        return false;
      }
    },
    absolutePath(key) {
      return safe(key);
    },
  };
}

let shared: Storage | undefined;
export function getStorage(): Storage {
  if (!shared) shared = createDiskStorage(process.env.UPLOADS_DIR ?? "./data/uploads");
  return shared;
}

export function mimeFromKey(key: string): ImageMime {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
