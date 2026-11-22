import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export interface StoredImage {
  publicId: string; // saved in users.avatar_storage_key
  url: string; // saved in users.avatar_url
}

export function uploadAvatarImage(
  buffer: Buffer,
  userId: string,
): Promise<StoredImage> {
  // Random suffix: every upload gets a new URL, so CDN caches never show an old avatar.
  const name = `${userId}-${randomBytes(6).toString("hex")}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "jiggasha/avatars",
        public_id: name,
        resource_type: "image",
        overwrite: false,
        timeout: 20_000,
      },
      (error, result) => {
        if (error || !result) {
          logger.error({ err: error }, "Cloudinary upload failed");
          reject(
            new AppError(
              502,
              "IMAGE_UPLOAD_FAILED",
              "Could not upload the image. Please try again.",
            ),
          );
          return;
        }
        resolve({ publicId: result.public_id, url: result.secure_url });
      },
    );
    Readable.from(buffer).pipe(stream);
  });
}

export async function deleteImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
  } catch (err) {
    logger.error({ err, publicId }, "Cloudinary delete failed");
  }
}
