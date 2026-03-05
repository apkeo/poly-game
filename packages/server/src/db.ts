import mongoose from 'mongoose';
import { getLogger } from './logger.js';

const log = getLogger('db');
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/poly-game';

export async function connectDb(): Promise<void> {
  log.info('Connecting to MongoDB');
  await mongoose.connect(MONGODB_URI);
  log.info('MongoDB connected');
}
