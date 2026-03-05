import { Router } from 'express';
import { getLogger } from '../logger.js';

const log = getLogger('proxy-asset');

const ALLOWED_ORIGINS = ['https://assets.meshy.ai', 'https://api.meshy.ai'];

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_ORIGINS.some((origin) => u.origin === origin);
  } catch {
    return false;
  }
}

export const proxyAssetRouter = Router();

proxyAssetRouter.get('/', async (req, res) => {
  const url = req.query.url as string;
  if (!url || !isAllowedUrl(url)) {
    res.status(400).json({ error: 'Invalid or disallowed URL' });
    return;
  }
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      res.status(response.status).send(response.statusText);
      return;
    }
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    log.error({ url, err }, 'Proxy asset error');
    res.status(502).json({ error: 'Failed to fetch asset' });
  }
});
