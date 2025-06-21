import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from 'url';

// Get current directory path (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure allowed file types
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg"
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = path.join(__dirname, '../../public/temp'); // Adjusted path

// Ensure upload directory exists
const ensureUploadDirExists = async () => {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    console.log(`Created upload directory at: ${UPLOAD_DIR}`);
  }
};

// Custom storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureUploadDirExists();
      cb(null, UPLOAD_DIR);
    } catch (err) {
      console.error('Directory creation error:', err);
      cb(new Error("Failed to create upload directory"));
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${uniqueSuffix}${ext}`;
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error(
        `Invalid file type. Only ${ALLOWED_MIME_TYPES.join(", ")} are allowed`
      ),
      false
    );
  }
  cb(null, true);
};

// Error handling middleware
const handleMulterErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
    }
    return res.status(400).json({
      success: false,
      error: "File upload error",
      details: err.message
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      error: "Upload failed",
      details: err.message
    });
  }
  next();
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  }
});

export { upload, handleMulterErrors, UPLOAD_DIR };