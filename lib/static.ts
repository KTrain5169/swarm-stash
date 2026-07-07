// Static file serving for the SPA, including the one special rule: the
// frontend source is TypeScript (public/js/*.ts); browsers can't run that, so
// any .ts file under public/ is served with the types stripped — the same
// machinery Node uses to run server.ts, no build step and no committed
// artifact. Import specifiers keep their .ts extensions and just work.

import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import type { ServerResponse } from 'node:http';
import { ROOT } from './config.ts';
import { err } from './http.ts';

const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

// Stripped modules are cached until the source changes (mtime), so each file
// strips once per edit, not once per request.
const stripCache = new Map<string, { mtimeMs: number; code: string }>();
function strippedTs(file: string): string | null {
  try {
    const { mtimeMs } = fs.statSync(file);
    const hit = stripCache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.code;
    const code = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'));
    stripCache.set(file, { mtimeMs, code });
    return code;
  } catch { return null; }
}

export function serveStatic(res: ServerResponse, urlPath: string): void {
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return err(res, 403, 'forbidden');
  if (file.endsWith('.ts')) {
    const code = strippedTs(file);
    if (code === null) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(code);
    return;
  }
  fs.readFile(file, (e, buf) => {
    if (e) {
      // SPA fallback
      if (!path.extname(file)) return serveStatic(res, '/');
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}
