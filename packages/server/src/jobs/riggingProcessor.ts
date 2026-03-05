import { Queue, Worker, type Job } from 'bullmq';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { Character } from '../models/Character.js';
import { emitCharacterProgress } from '../socket.js';
import {
  createRiggingTask,
  pollRiggingTask,
  createAnimationTask,
  pollAnimationTask,
  MESHY_ANIMATION_ACTION_IDS,
} from '../services/ai.js';
import { getLogger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = getLogger('rigging-job');

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const connection = { host: REDIS_HOST, port: REDIS_PORT };

export const riggingQueue = new Queue('character-rigging', { connection });

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

async function downloadToFile(url: string, filePath: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(await res.arrayBuffer()));
}

async function processRiggingJob(job: Job<{ characterId: string }>): Promise<void> {
  const { characterId } = job.data;
  log.info({ characterId }, 'Rigging job: start');

  const character = await Character.findById(characterId);
  if (!character) {
    log.error({ characterId }, 'Rigging job: character not found');
    throw new Error(`Character ${characterId} not found`);
  }
  if (character.riggedModelPath && character.animations?.length) {
    log.info({ characterId }, 'Rigging job: already has rig and animations, skip');
    return;
  }
  if (!character.meshyTaskId) {
    log.error({ characterId }, 'Rigging job: no meshyTaskId');
    throw new Error('Character has no meshyTaskId (image-to-3d task)');
  }

  const emit = (progress: number, status?: string) => {
    emitCharacterProgress(characterId, { progress, status });
  };

  try {
    const charDir = path.join(UPLOADS_DIR, 'characters', characterId);
    await fs.mkdir(charDir, { recursive: true });

    log.info({ characterId }, 'Rigging job: creating rigging task (from image-to-3d task)');
    const rigTaskId = await createRiggingTask(character.meshyTaskId);
    await Character.updateOne({ _id: characterId }, { rigTaskId });
    emit(10, 'rigging');

    const rigResult = await pollRiggingTask(rigTaskId, (p) => emit(10 + Math.round(p * 0.3), 'rigging'));
    if (rigResult.status !== 'SUCCEEDED' || !rigResult.result) {
      throw new Error(rigResult.task_error?.message ?? 'Rigging failed');
    }

    const riggedUrl = rigResult.result.rigged_character_glb_url;
    const basicAnims = rigResult.result.basic_animations;
    if (!riggedUrl) throw new Error('No rigged model URL');

    log.info({ characterId }, 'Rigging job: downloading rigged model and basic animations');
    const rigPath = path.join(charDir, 'rig.glb');
    await downloadToFile(riggedUrl, rigPath);

    const animations: { id: string; name: string; glbPath: string }[] = [];
    const walkingUrl = basicAnims?.walking_glb_url;
    const runningUrl = basicAnims?.running_glb_url;
    if (walkingUrl) {
      const p = path.join(charDir, 'walking.glb');
      await downloadToFile(walkingUrl, p);
      animations.push({ id: 'walking', name: 'Walking', glbPath: p });
    }
    if (runningUrl) {
      const p = path.join(charDir, 'walking2.glb');
      await downloadToFile(runningUrl, p);
      animations.push({ id: 'walking2', name: 'Walking 2', glbPath: p });
    }

    emit(50, 'animating');
    log.info({ characterId }, 'Rigging job: creating Wave One Hand animation task');
    const animTaskId = await createAnimationTask(rigTaskId, MESHY_ANIMATION_ACTION_IDS.wave);
    const animResult = await pollAnimationTask(animTaskId, (p) =>
      emit(50 + Math.round(p * 0.5), 'animating')
    );
    if (animResult.status === 'SUCCEEDED' && animResult.result?.animation_glb_url) {
      const wavePath = path.join(charDir, 'wave.glb');
      await downloadToFile(animResult.result.animation_glb_url, wavePath);
      animations.push({ id: 'wave', name: 'Wave One Hand', glbPath: wavePath });
    }

    emit(75, 'animating');
    const throwTaskId = await createAnimationTask(rigTaskId, MESHY_ANIMATION_ACTION_IDS.throwCast);
    const throwResult = await pollAnimationTask(throwTaskId, (p) =>
      emit(75 + Math.round(p * 0.25), 'animating')
    );
    if (throwResult.status === 'SUCCEEDED' && throwResult.result?.animation_glb_url) {
      const throwPath = path.join(charDir, 'throw.glb');
      await downloadToFile(throwResult.result.animation_glb_url, throwPath);
      animations.push({ id: 'throw', name: 'Mage Soul Cast 4', glbPath: throwPath });
    }

    const relativeRigPath = path.relative(UPLOADS_DIR, rigPath);
    const animationsForDb = animations.map((a) => ({
      id: a.id,
      name: a.name,
      glbPath: path.relative(UPLOADS_DIR, a.glbPath),
    }));

    await Character.updateOne(
      { _id: characterId },
      {
        riggedModelPath: relativeRigPath,
        animations: animationsForDb,
      }
    );
    emit(100, 'completed');
    log.info({ characterId, animationsCount: animations.length }, 'Rigging job: completed');
  } catch (err) {
    log.error({ characterId, err }, 'Rigging job: failed');
    emitCharacterProgress(characterId, { status: 'failed', error: String(err) });
    throw err;
  }
}

export function initRiggingWorker(): Worker {
  const worker = new Worker<{ characterId: string }>(
    'character-rigging',
    processRiggingJob,
    { connection, concurrency: 1 }
  );
  worker.on('failed', (j, err) => log.error({ jobId: j?.id, err }, 'Rigging worker: job failed'));
  return worker;
}
