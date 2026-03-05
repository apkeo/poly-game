import './loadEnv.js';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { connectDb } from './db.js';
import { uploadRouter } from './routes/upload.js';
import { characterRouter } from './routes/character.js';
import { playersRouter } from './routes/players.js';
import { proxyAssetRouter } from './routes/proxyAsset.js';
import { initSocket } from './socket.js';
import { initQueueWorker } from './jobs/characterProcessor.js';
import { initRiggingWorker } from './jobs/riggingProcessor.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

logger.info('Server: starting');
connectDb();
initSocket(httpServer);
initQueueWorker();
initRiggingWorker();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/upload', uploadRouter);
app.use('/api/players', playersRouter);
app.use('/api/characters', characterRouter);
app.use('/api/proxy-asset', proxyAssetRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server listening');
});
