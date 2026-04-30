import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../../../../data');
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 20);

const ALLOWED_MIME_TYPES = (
  process.env.ALLOWED_FILE_TYPES ??
  'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json,text/javascript,text/typescript,text/html,text/css'
)
  .split(',')
  .map((s) => s.trim());

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const conversationId = req.body.conversationId as string | undefined;
    if (!conversationId) {
      cb(new Error('conversationId is required'), '');
      return;
    }
    const dir = path.join(DATA_DIR, 'conversations', conversationId);
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err as Error, '');
    }
  },
  filename: (_req, file, cb) => {
    const fileId = randomUUID();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${fileId}-${safeName}`);
  },
});

export const uploadSingle = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not allowed`));
    }
  },
}).single('file');
