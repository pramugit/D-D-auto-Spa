import fs from "fs";
import path from "path";
import multer from "multer";

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

export const uploadPhoto = multer({
  storage: diskStorageFor("photos"),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadSlip = multer({
  storage: diskStorageFor("slips"),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadGallery = multer({
  storage: diskStorageFor("gallery"),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadContentImage = multer({
  storage: diskStorageFor("content"),
  limits: { fileSize: 10 * 1024 * 1024 },
});
