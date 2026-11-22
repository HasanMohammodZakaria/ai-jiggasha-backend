import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { AppError } from "./errors.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const AVATAR_SIZE = 256;

// Validates the real file type (magic bytes) and returns a small, clean WebP.
// sharp removes all metadata (EXIF, GPS) by default; rotate() applies the EXIF orientation first.
export async function processAvatar(input: Buffer): Promise<Buffer> {
  const detected = await fileTypeFromBuffer(input);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new AppError(
      415,
      "UNSUPPORTED_IMAGE",
      "Only JPEG, PNG or WebP images are allowed",
    );
  }
  try {
    return await sharp(input, { limitInputPixels: 24_000_000 })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new AppError(
      400,
      "INVALID_IMAGE",
      "The image could not be processed",
    );
  }
}
