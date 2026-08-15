import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Local development keeps one `.env` at the repository root so the API, Prisma
 * and the web app cannot drift apart. In production the platform injects real
 * environment variables and no file exists, which is why this is best effort.
 */
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../../.env'),
];

for (const path of candidates) {
  if (existsSync(path)) {
    config({ path });
    break;
  }
}
