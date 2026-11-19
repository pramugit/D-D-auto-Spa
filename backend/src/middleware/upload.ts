import fs from "fs";
import path from "path";
import multer, { type FileFilterCallback } from "multer";
import type { Request } from "express";
import { AppError } from "../utils/AppError";

// Local disk storage for dev. In production, swap this for a cloud
// storage adapter (e.g. S3 or Supabase Storage) that uploads the buffer
// and returns a public/signed URL instead of a local path — see README.
function diskStorageFor(subdir: string) {
  const dir = path.join(__dirname, "..", "..", process.env.UPLOAD_DIR ?? "uploads", subdir);
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });
}

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const SLIP_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, "application/pdf"]);
const SLIP_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ".pdf"]);

// Every upload in this system ends up served back out statelessly from
// /uploads (see index.ts's express.static mount) — checking mimetype AND
// extension against an allowlist (not just the size limit) keeps someone
// from storing/serving arbitrary files (e.g. .html, .svg with a script,
// .exe) through what's meant to be an image/slip field. mimetype is
// client-supplied and spoofable, but paired with the extension check this
// matches the validation depth used elsewhere in this codebase (Phase E)
// rather than attempting real content-sniffing.
function fileFilterFor(allowedMimeTypes: Set<string>, allowedExtensions: Set<string>, label: string) {
  return (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(ext)) {
      cb(new AppError(400, `Only ${label} files are allowed`));
      return;
    }
    cb(null, true);
  };
}

export const uploadPhoto = multer({
  storage: diskStorageFor("photos"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilterFor(IMAGE_MIME_TYPES, IMAGE_EXTENSIONS, "image (jpg, png, webp, gif)"),
});

export const uploadSlip = multer({
  storage: diskStorageFor("slips"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilterFor(SLIP_MIME_TYPES, SLIP_EXTENSIONS, "image or PDF (jpg, png, webp, gif, pdf)"),
});

export const uploadGallery = multer({
  storage: diskStorageFor("gallery"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilterFor(IMAGE_MIME_TYPES, IMAGE_EXTENSIONS, "image (jpg, png, webp, gif)"),
});

export const uploadContentImage = multer({
  storage: diskStorageFor("content"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilterFor(IMAGE_MIME_TYPES, IMAGE_EXTENSIONS, "image (jpg, png, webp, gif)"),
});

export const uploadDamagePhoto = multer({
  storage: diskStorageFor("damage-markings"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilterFor(IMAGE_MIME_TYPES, IMAGE_EXTENSIONS, "image (jpg, png, webp, gif)"),
});

// Supplier bill / stock list for the Inventory import (PDF or photo). Kept
// in memory only — it's read once by the scanner and never stored/served.
export const uploadStockDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: fileFilterFor(SLIP_MIME_TYPES, SLIP_EXTENSIONS, "PDF or JPG/PNG/WEBP image"),
});
