import path from 'path';
import { fileURLToPath } from 'url';
import dotenvExtended from 'dotenv-extended';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvExtended.load({ path: path.join(__dirname, '../.env') });
