import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Character } from '../models/Character.js';
import { characterQueue } from '../jobs/characterProcessor.js';
import { getLogger } from '../logger.js';

const log = getLogger('upload');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `original-${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|webp)$/i;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (jpeg, png, webp) are allowed'));
    }
  },
});

export const uploadRouter = Router();

uploadRouter.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      log.warn('Upload: no file in request');
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const playerId = req.body?.playerId ?? req.headers['x-player-id'];
    if (!playerId) {
      res.status(400).json({ error: 'playerId required (body.playerId or X-Player-Id header)' });
      return;
    }
    const fullPath = path.join(uploadsDir, req.file.filename);
    log.info({ filename: req.file.filename, playerId, mimetype: req.file.mimetype, size: req.file.size }, 'Upload: creating character');
    const character = await Character.create({
      playerId,
      originalImagePath: fullPath,
      status: 'pending',
    });
    const characterId = character._id.toString();
    await characterQueue.add(
      'process',
      { characterId },
      { jobId: characterId }
    );
    log.info({ characterId, path: fullPath }, 'Upload: character created, job enqueued');
    res.status(201).json({ id: characterId });
  } catch (err) {
    log.error({ err }, 'Upload: error');
    res.status(500).json({ error: 'Upload failed' });
  }
});
