import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.floor(env.AVATAR_MAX_MB * 1024 * 1024),
    files: 1,
    fields: 10,
  },
});

// Reads one optional file in the "avatar" field into memory (req.file.buffer).
export function avatarUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.single("avatar")(req, res, (err: unknown) => {
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
            `Image must be at most ${env.AVATAR_MAX_MB} MB`,
          ),
        );
        return;
      }
      next(new AppError(400, "INVALID_UPLOAD", "Invalid file upload"));
      return;
    }
    next(err);
  });
}
