import { ServerResponse } from "node:http";
import crypto from 'node:crypto';

import type { InstanceRow, UserRow } from "../../features/db.ts";
import store from "../../features/db.ts";
import { getCard, SESSION_SECRET } from "./consts.ts";
import { FOIL_MULT, RARITIES } from "../../features/catalog.ts";

export function sendJSON(res: ServerResponse, status: number, obj: unknown): void {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export function publicUser(u: UserRow) {
  const counts = store.userCounts(u.id);
  return {
    id: u.id, name: u.name, avatar: u.avatar, bot: Boolean(u.bot),
    cardCount: counts.cardCount, uniqueCount: counts.uniqueCount,
    joinedAt: u.createdAt,
  };
}

const b64u = (buf: string | Buffer): string => Buffer.from(buf).toString('base64url');
export const sign = (data: string): string => crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');

export function readSession(cookie: string): UserRow | null {
  const raw = cookie.split(/;\s*/).find((c) => c.startsWith('sess='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(5).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { uid: string; exp: number };
    if (exp < Date.now()) return null;
    return store.getUser(uid) || null;
  } catch { return null; }
}

export function avatarSVG(seed: string): string {
  const h = crypto.createHash('sha1').update(seed).digest();
  const hue = h[0]! * 360 / 255, hue2 = (hue + 60) % 360;
  const initial = seed.replace(/[^a-zA-Z0-9]/g, ' ').trim().charAt(0).toUpperCase() || '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 70% 65%)"/><stop offset="1" stop-color="hsl(${hue2} 70% 45%)"/>
  </linearGradient></defs>
  <rect width="96" height="96" fill="url(#g)"/>
  <text x="48" y="62" font-family="sans-serif" font-size="44" font-weight="bold" fill="rgba(255,255,255,.92)" text-anchor="middle">${initial}</text>
</svg>`;
}

export const instValue = (inst: InstanceRow): number => RARITIES[getCard(inst.cardId).rarity].value * (inst.foil ? FOIL_MULT : 1);
export const instOut = (i: InstanceRow) => ({ instanceId: i.id, cardId: i.cardId, ownerId: i.ownerId, obtainedAt: i.obtainedAt, foil: Boolean(i.foil) });

export const oauthStates = new Map<string, number>(); // state -> expiry
export const sessionCookie = (token: string): string => `sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`;

export function makeSession(uid: string): string {
  const payload = b64u(JSON.stringify({ uid, exp: Date.now() + 30 * 864e5 }));
  return `${payload}.${sign(payload)}`;
}
