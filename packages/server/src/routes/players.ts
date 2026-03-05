import { Router } from 'express';
import { Player, validateLogin } from '../models/Player.js';
import { getLogger } from '../logger.js';

const log = getLogger('players');

export const playersRouter = Router();

/** POST /api/players/login — body: { login: string } (a-z 0-9). Zwraca { playerId }. */
playersRouter.post('/login', async (req, res) => {
  try {
    const { login } = req.body ?? {};
    if (!validateLogin(login)) {
      res.status(400).json({ error: 'Login musi być niepustym ciągiem znaków a-z i 0-9 (max 64)' });
      return;
    }
    const normalized = String(login).toLowerCase().trim();
    let player = await Player.findOne({ login: normalized }).lean();
    if (!player) {
      const created = await Player.create({ login: normalized });
      player = { _id: created._id, login: created.login, createdAt: created.createdAt, updatedAt: created.updatedAt };
      log.info({ playerId: created._id, login: normalized }, 'Player created');
    }
    res.json({ playerId: (player as { _id: unknown })._id.toString() });
  } catch (err) {
    log.error({ err }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});
