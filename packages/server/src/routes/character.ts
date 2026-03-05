import { Router } from 'express';
import { Character } from '../models/Character.js';
import { getLogger } from '../logger.js';
import { riggingQueue } from '../jobs/riggingProcessor.js';

const log = getLogger('character');

export const characterRouter = Router();

/** GET /api/characters?playerId=... — lista postaci gracza. */
characterRouter.get('/', async (req, res) => {
  const playerId = (req.query.playerId as string) ?? (req.headers['x-player-id'] as string);
  if (!playerId) {
    res.status(400).json({ error: 'playerId required (query or X-Player-Id header)' });
    return;
  }
  try {
    const list = await Character.find({ playerId }).sort({ createdAt: -1 }).lean();
    const out = list.map((c) => {
      const obj = { ...c } as Record<string, unknown>;
      if (c.riggedModelPath) {
        obj.riggedModelUrl = `/uploads/${String(c.riggedModelPath).replace(/\\/g, '/')}`;
      }
      if (c.animations?.length) {
        obj.animationUrls = c.animations.map((a) => ({
          id: a.id,
          name: a.name,
          url: `/uploads/${String(a.glbPath).replace(/\\/g, '/')}`,
        }));
      }
      return obj;
    });
    res.json(out);
  } catch (err) {
    log.error({ playerId, err }, 'Characters list error');
    res.status(500).json({ error: 'Failed to list characters' });
  }
});

characterRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    log.debug({ id }, 'Character GET');
    const character = await Character.findById(id).lean();
    if (!character) {
      log.warn({ id }, 'Character not found');
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    const out = { ...character } as Record<string, unknown>;
    if (character.riggedModelPath) {
      out.riggedModelUrl = `/uploads/${String(character.riggedModelPath).replace(/\\/g, '/')}`;
    }
    if (character.animations?.length) {
      out.animationUrls = character.animations.map((a) => ({
        id: a.id,
        name: a.name,
        url: `/uploads/${String(a.glbPath).replace(/\\/g, '/')}`,
      }));
    }
    log.info({ id, status: character.status }, 'Character GET: ok');
    res.json(out);
  } catch (err) {
    log.error({ id, err }, 'Character fetch error');
    res.status(500).json({ error: 'Failed to fetch character' });
  }
});

/** Kolejkuje job rigowania dla istniejącej postaci (kompatybilność wsteczna). */
characterRouter.post('/:id/request-rig', async (req, res) => {
  const { id } = req.params;
  try {
    const character = await Character.findById(id).lean();
    if (!character) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    if (character.rigTaskId && character.riggedModelPath) {
      res.json({ ok: true, message: 'Already rigged' });
      return;
    }
    if (!character.modelUrl) {
      res.status(400).json({ error: 'Model not ready yet' });
      return;
    }
    await riggingQueue.add('rig', { characterId: id }, { jobId: `rig-${id}` });
    log.info({ id }, 'Request-rig: job enqueued');
    res.json({ ok: true, message: 'Rigging job queued' });
  } catch (err) {
    log.error({ id, err }, 'Request-rig error');
    res.status(500).json({ error: 'Failed to queue rigging' });
  }
});

/** Proxy pliku GLB przez backend (omija CORS przy ładowaniu z Meshy CDN). */
characterRouter.get('/:id/model', async (req, res) => {
  const { id } = req.params;
  try {
    const character = await Character.findById(id).lean();
    if (!character?.modelUrl) {
      log.warn({ id }, 'Character model: brak modelUrl');
      res.status(404).json({ error: 'Model not found' });
      return;
    }
    log.info({ id }, 'Character model: pobieranie z Meshy');
    const proxyRes = await fetch(character.modelUrl, { redirect: 'follow' });
    if (!proxyRes.ok) {
      log.error({ id, status: proxyRes.status }, 'Character model: błąd pobierania');
      res.status(502).json({ error: 'Failed to fetch model' });
      return;
    }
    const contentType = proxyRes.headers.get('content-type') ?? 'model/gltf-binary';
    res.setHeader('Content-Type', contentType);
    const buffer = await proxyRes.arrayBuffer();
    res.send(Buffer.from(buffer));
    log.info({ id, size: buffer.byteLength }, 'Character model: wysłano');
  } catch (err) {
    log.error({ id, err }, 'Character model: error');
    res.status(500).json({ error: 'Failed to proxy model' });
  }
});
