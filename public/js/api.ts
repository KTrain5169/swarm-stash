// Fetch wrapper for the JSON API + the shared post-request bookkeeping.

import { $, toast } from './dom.ts';
import { state } from './state.ts';

export async function api(path: string, opts: { method?: string; body?: unknown } = {}): Promise<any> {
  const res = await fetch(path, {
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    method: opts.method,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

// Shared handling for endpoints that may pay out achievements
export function handleUnlocks(r) {
  if (r.neuros != null && state.me) {
    state.me.neuros = r.neuros;
    $('#neuro-count').textContent = r.neuros;
  }
  for (const a of r.unlocked || []) {
    toast(`${a.emoji} Achievement unlocked: ${a.name}${a.reward ? ` · +⚡${a.reward}` : ''}`);
  }
}

// Re-pull the card pool (needed after a meme is minted as a new card).
export async function refreshCatalog() {
  const catalog = await api('/api/catalog');
  Object.assign(state, { cards: catalog.cards, rarities: catalog.rarities, series: catalog.series });
}
