// Loads .env into process.env. Import this before any module that reads
// config at load time (db.ts reads DATA_DIR) — ESM imports hoist, so the
// old "require db after parsing .env" trick no longer works.

import fs from 'node:fs';
import path from 'node:path';

// Checked next to the source and in the working directory — the latter matters
// when running the nix-store copy (`nix run`) from the project checkout.
const envPath = [path.join(import.meta.dirname, '.env'), path.join(process.cwd(), '.env')].find((p) => fs.existsSync(p));
if (envPath) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}
