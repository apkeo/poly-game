import { Queue, Worker, type Job } from 'bullmq';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { Character } from '../models/Character.js';
import { emitCharacterProgress } from '../socket.js';
import { runNanoBananaPortrait, runMeshyImageTo3D, pollMeshyTask, describeImageWithGemini } from '../services/ai.js';
import { getLogger } from '../logger.js';
import { riggingQueue } from './riggingProcessor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = getLogger('job');

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
};

export const characterQueue = new Queue('character-process', { connection });

async function processCharacterJob(job: Job<{ characterId: string }>): Promise<void> {
  const { characterId } = job.data;
  log.info({ characterId, jobId: job.id }, 'Character job: start');

  const character = await Character.findById(characterId);
  if (!character) {
    log.error({ characterId }, 'Character job: character not found');
    throw new Error(`Character ${characterId} not found`);
  }

  const emit = (progress: number, status?: string) => {
    emitCharacterProgress(characterId, { progress, status });
  };

  try {
    await Character.updateOne({ _id: characterId }, { status: 'processing', jobProgress: 0 });
    emit(5, 'processing');
    log.info({ characterId }, 'Character job: reading original image');

    const imageBuffer = await fs.readFile(character.originalImagePath);
    const base64Image = imageBuffer.toString('base64');
    const mime = path.extname(character.originalImagePath).toLowerCase() === '.png' ? 'png' : 'jpeg';
    const dataUri = `data:image/${mime};base64,${base64Image}`;

    const description = await describeImageWithGemini(dataUri);
    if (description) {
      await Character.updateOne({ _id: characterId }, { description });
      log.info({ characterId, descriptionLength: description.length }, 'Character job: description saved');
    }

    const portraitBase64 = await runNanoBananaPortrait(dataUri);
    if (!portraitBase64) {
      log.error({ characterId }, 'Character job: Nano Banana did not return image');
      throw new Error('Nano Banana did not return portrait image');
    }
    emit(15, 'processing');
    log.info({ characterId }, 'Character job: Nano Banana portrait done');

    const uploadsDir = path.join(__dirname, '../../uploads');
    const generatedPath = path.join(uploadsDir, `generated-${characterId}.png`);
    await fs.writeFile(generatedPath, Buffer.from(portraitBase64, 'base64'));
    await Character.updateOne({ _id: characterId }, { generatedImagePath: generatedPath });
    emit(25, 'processing');
    log.info({ characterId }, 'Character job: generated image saved, starting Meshy');

    const generatedBase64 = `data:image/png;base64,${portraitBase64}`;
    const meshyTaskId = await runMeshyImageTo3D(generatedBase64);
    await Character.updateOne({ _id: characterId }, { meshyTaskId });
    emit(30, 'processing');
    log.info({ characterId, meshyTaskId }, 'Character job: Meshy task created, polling');

    const result = await pollMeshyTask(meshyTaskId!, (progress) => {
      const p = 30 + Math.round(progress * 0.7);
      emit(p, 'processing');
    });

    if (result.status !== 'SUCCEEDED') {
      log.error({ characterId, meshyTaskId, status: result.status, error: result.task_error?.message }, 'Character job: Meshy task failed');
      throw new Error(result.task_error?.message ?? 'Meshy task failed');
    }

    const modelUrl = result.model_urls?.glb;
    const thumbnailUrl = result.thumbnail_url;
    log.info({ characterId, modelUrl, thumbnailUrl }, 'Character job: Meshy succeeded, saving');

    await Character.updateOne(
      { _id: characterId },
      {
        status: 'completed',
        jobProgress: 100,
        modelUrl,
        thumbnailUrl,
        error: undefined,
      }
    );
    emitCharacterProgress(characterId, { progress: 100, status: 'completed', modelUrl });
    log.info({ characterId }, 'Character job: completed');
    await riggingQueue.add('rig', { characterId }, { jobId: `rig-${characterId}` });
    log.info({ characterId }, 'Character job: rigging job enqueued');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ characterId, error: message, err }, 'Character job: failed');
    await Character.updateOne(
      { _id: characterId },
      { status: 'failed', error: message, jobProgress: undefined }
    );
    emitCharacterProgress(characterId, { status: 'failed', error: message });
    throw err;
  }
}

export function initQueueWorker(): Worker {
  const worker = new Worker<{ characterId: string }>(
    'character-process',
    processCharacterJob,
    { connection, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, jobData: job?.data, err }, 'Character worker: job failed');
  });

  return worker;
}
