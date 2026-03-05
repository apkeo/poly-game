import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(__dirname, '../log');
const logFile = path.join(logDir, 'log.txt');

fs.mkdirSync(logDir, { recursive: true });

const transport = pino.transport({
  targets: [
    {
      level: 'trace',
      target: 'pino/file',
      options: {
        destination: logFile,
        append: true,
      },
    },
    {
      level: 'info',
      target: 'pino/file',
      options: { destination: 1 },
    },
  ],
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport
);

export function getLogger(service: string): pino.Logger {
  return logger.child({ service });
}
