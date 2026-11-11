import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../web/dist');
const destination = path.resolve(here, '../renderer');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error('Build web tidak ditemukan. Jalankan: npm run build -w @toolsapps/web');
  process.exit(1);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
console.log(`Renderer disalin ke ${destination}`);
