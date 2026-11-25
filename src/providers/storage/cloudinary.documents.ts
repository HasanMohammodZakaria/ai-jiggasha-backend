import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors.js";
import "./cloudinary.js"; // configures the Cloudinary SDK (side effect)
import type {
  DocumentStorage,
  DownloadLink,
  UploadDocumentParams,
} from "./storage.types.js";

// Documents are private ("authenticated"): there is no public URL, only expiring download links.
export const documentStorage: DocumentStorage = {
  upload(buffer: Buffer, params: UploadDocumentParams): Promise<string> {
    const publicId = `jiggasha/documents/${params.userId}/${params.documentId}.${params.extension}`;
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: "raw",
          type: "authenticated",
          overwrite: false,
          timeout: 60_000,
        },
        (error, result) => {
          if (error || !result) {
            logger.error({ err: error }, "Cloudinary document upload failed");
            reject(
              new AppError(
                502,
                "DOCUMENT_UPLOAD_FAILED",
                "Could not store the file. Please try again.",
              ),
            );
            return;
          }
          resolve(result.public_id);
        },
      );
      Readable.from(buffer).pipe(stream);
    });
  },

  async remove(storageKey: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(storageKey, {
        resource_type: "raw",
        type: "authenticated",
        invalidate: true,
      });
    } catch (err) {
      logger.error({ err, storageKey }, "Cloudinary document delete failed");
    }
  },

  async getDownloadUrl(
    storageKey: string,
    expiresInSeconds: number,
  ): Promise<DownloadLink> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const url = cloudinary.utils.private_download_url(storageKey, "", {
      resource_type: "raw",
      type: "authenticated",
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
    return { url, expiresAt };
  },
};
