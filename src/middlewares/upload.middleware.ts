import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors.js";

// Reads one optional file from the given form field into memory (req.file.buffer).
function singleFileUpload(field: string, maxMb: number, label: string) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Math.floor(maxMb * 1024 * 1024),
      files: 1,
      fields: 10,
    },
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    upload.single(field)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          next(
            new AppError(
              413,
              "PAYLOAD_TOO_LARGE",
              `${label} must be at most ${maxMb} MB`,
            ),
          );
          return;
        }
        next(new AppError(400, "INVALID_UPLOAD", "Invalid file upload"));
        return;
      }
      next(err);
    });
  };
}

export const avatarUpload = singleFileUpload(
  "avatar",
  env.AVATAR_MAX_MB,
  "Image",
);

export const documentUpload = singleFileUpload(
  "file",
  env.DOCUMENT_MAX_MB,
  "File",
);
