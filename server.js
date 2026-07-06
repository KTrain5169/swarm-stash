// Swarm Stash — zero-dependency Node server
// Serves the SPA, handles Discord OAuth, and runs the trading API on SQLite (node:sqlite).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CARDS, RARITIES, SERIES, PACK_COST, PACK_SIZE, DAILY_NEURONS, STARTING_NEURONS, STARTER_CARDS } = require('./catalog');

// ─── Config (.env) ───────────────────────────────────────────────────────────
// Checked next to server.js and in the working directory — the latter matters
// when running the nix-store copy (`nix run`) from the project checkout.
const envPath = [path.join(__dirname, '.env'), path.join(process.cwd(), '.env')].find((p) => fs.existsSync(p));
if (envPath) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const store = require('./db'); // reads DATA_DIR from env, so load after .env

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_ENABLED = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
const DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === '1' || !DISCORD_ENABLED;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const REDIRECT_URI = `${BASE_URL}/auth/discord/callback`;

// ─── Meme submission portal config ───────────────────────────────────────────
// ADMINS: comma-separated Discord user IDs (or dev-login names) who moderate
// submissions. If empty, submissions are auto-approved (fine for local play).
const ADMINS = (process.env.ADMINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const MODERATION = ADMINS.length > 0;
const isAdmin = (u) => Boolean(u) && (ADMINS.includes(u.discordId) || (!u.discordId && ADMINS.includes(u.name)));

const UPLOAD_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'memes');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_MEME_BYTES = 5 * 1024 * 1024;
const MAX_PENDING_PER_USER = 3;
const APPROVAL_COPIES = 2; // copies the submitter receives when their meme is minted

// magic-byte sniffing — only real raster images become cards (no SVG: script risk)
const IMAGE_TYPES = [
  { ext: '.png',  mime: 'image/png',  match: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.jpg',  mime: 'image/jpeg', match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif',  mime: 'image/gif',  match: (b) => b.slice(0, 4).toString('latin1') === 'GIF8' },
  { ext: '.webp', mime: 'image/webp', match: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
];

// deterministic rarity from the image hash, matching normal pack odds
function rarityFromHash(seed) {
  const total = Object.values(RARITIES).reduce((s, r) => s + r.weight, 0);
  let roll = (crypto.createHash('sha1').update(seed).digest().readUInt32BE(0) / 0xffffffff) * total;
  for (const [name, r] of Object.entries(RARITIES)) {
    roll -= r.weight;
    if (roll <= 0) return name;
  }
  return 'common';
}

// ─── Sessions (HMAC-signed cookie) ───────────────────────────────────────────
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');

function makeSession(uid) {
  const payload = b64u(JSON.stringify({ uid, exp: Date.now() + 30 * 864e5 }));
  return `${payload}.${sign(payload)}`;
}
function readSession(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith('sess='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(5).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (exp < Date.now()) return null;
    return store.getUser(uid) || null;
  } catch { return null; }
}
const sessionCookie = (token) =>
  `sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`;

// ─── Game helpers ────────────────────────────────────────────────────────────
// The card pool is the built-in lore set plus every approved community meme.
const RETIRED = { id: 'retired', name: 'Retired Card', series: 'meme', rarity: 'common' };

const memeToCard = (m) => ({
  id: m.id, name: m.name, series: 'meme', rarity: m.rarity,
  emoji: '🖼️', flavor: `submitted by ${m.submitterName}`,
  image: `/memes/${m.file}`,
});

const allCards = () => CARDS.concat(store.memesByStatus('approved').map(memeToCard));
const getCard = (id) => allCards().find((c) => c.id === id) || RETIRED;

function rollCard() {
  const cards = allCards();
  const total = Object.values(RARITIES).reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  let rarity = 'common';
  for (const [name, r] of Object.entries(RARITIES)) {
    roll -= r.weight;
    if (roll <= 0) { rarity = name; break; }
  }
  const pool = cards.filter((c) => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

function openPackFor(user) {
  const cards = [];
  for (let i = 0; i < PACK_SIZE; i++) cards.push(rollCard());
  // pity: guarantee at least one uncommon or better per pack
  if (cards.every((c) => c.rarity === 'common')) {
    const pool = allCards().filter((c) => c.rarity !== 'common');
    cards[Math.floor(Math.random() * cards.length)] = pool[Math.floor(Math.random() * pool.length)];
  }
  return cards.map((c) => store.grantCard(user.id, c.id));
}

function publicUser(u) {
  const counts = store.userCounts(u.id);
  return {
    id: u.id, name: u.name, avatar: u.avatar, bot: Boolean(u.bot),
    cardCount: counts.cardCount, uniqueCount: counts.uniqueCount,
    joinedAt: u.createdAt,
  };
}
const instOut = (i) => ({ instanceId: i.id, cardId: i.cardId, ownerId: i.ownerId, obtainedAt: i.obtainedAt });

function tradeOut(t) {
  const resolve = (id) => {
    const inst = store.getInstance(id);
    return inst ? instOut(inst) : { instanceId: id, gone: true };
  };
  return { ...t, offer: t.offer.map(resolve), request: t.request.map(resolve) };
}

// ─── Seed bot swarm members so trading works out of the box ─────────────────
function seedBots() {
  const bots = [
    { name: 'gymbag_enjoyer',  packs: 5 },
    { name: 'buh_collector',   packs: 6 },
    { name: 'tutel_truther',   packs: 4 },
    { name: 'evil_hag_stan',   packs: 5 },
  ];
  for (const b of bots) {
    if (store.getUserByName(b.name)) continue;
    const user = store.createUser({
      name: b.name, bot: true, neurons: 500,
      avatar: `/api/avatar/${encodeURIComponent(b.name)}.svg`,
    });
    for (let i = 0; i < b.packs; i++) openPackFor(user);
  }
}
seedBots();

// Bots respond to trades: accept if the offered value is fair, otherwise decline.
function botConsiderTrade(trade) {
  const value = (ids) => ids.reduce((s, id) => {
    const inst = store.getInstance(id);
    return s + (inst ? RARITIES[getCard(inst.cardId).rarity].value : 0);
  }, 0);
  if (value(trade.offer) >= value(trade.request)) store.executeTrade(trade);
  else store.resolveTrade(trade.id, 'declined');
  return store.getTrade(trade.id);
}

// ─── HTTP plumbing ───────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
const err = (res, status, message) => sendJSON(res, status, { error: message });

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > maxBytes) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

function serveStatic(res, urlPath) {
  const file = path.normalize(path.join(__dirname, 'public', urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(path.join(__dirname, 'public'))) return err(res, 403, 'forbidden');
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

// Deterministic pastel identicon for bot / dev accounts
function avatarSVG(seed) {
  const h = crypto.createHash('sha1').update(seed).digest();
  const hue = h[0] * 360 / 255, hue2 = (hue + 60) % 360;
  const initial = seed.replace(/[^a-zA-Z0-9]/g, ' ').trim().charAt(0).toUpperCase() || '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 70% 65%)"/><stop offset="1" stop-color="hsl(${hue2} 70% 45%)"/>
  </linearGradient></defs>
  <rect width="96" height="96" fill="url(#g)"/>
  <text x="48" y="62" font-family="sans-serif" font-size="44" font-weight="bold" fill="rgba(255,255,255,.92)" text-anchor="middle">${initial}</text>
</svg>`;
}

const oauthStates = new Map(); // state -> expiry

// ─── Routes ──────────────────────────────────────────────────────────────────
async function handle(req, res) {
  const url = new URL(req.url, BASE_URL);
  const p = url.pathname;
  const me = readSession(req);

  // ── auth ──
  if (p === '/auth/discord' && req.method === 'GET') {
    if (!DISCORD_ENABLED) return err(res, 400, 'Discord OAuth is not configured. Set DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET in .env');
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, Date.now() + 10 * 60e3);
    const auth = new URL('https://discord.com/oauth2/authorize');
    auth.search = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'identify', state });
    res.writeHead(302, { Location: auth.href });
    return res.end();
  }

  if (p === '/auth/discord/callback' && req.method === 'GET') {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const exp = oauthStates.get(state);
    oauthStates.delete(state);
    if (!code || !exp || exp < Date.now()) { res.writeHead(302, { Location: '/?login=failed' }); return res.end(); }
    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
      });
      if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}`);
      const { access_token } = await tokenRes.json();
      const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
      if (!userRes.ok) throw new Error(`user fetch ${userRes.status}`);
      const d = await userRes.json();
      const avatar = d.avatar
        ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(d.id) >> 22n) % 6}.png`;

      let user = store.getUserByDiscord(d.id);
      if (!user) {
        user = store.createUser({ discordId: d.id, name: d.global_name || d.username, avatar, neurons: STARTING_NEURONS });
        for (const c of STARTER_CARDS) store.grantCard(user.id, c);
      } else {
        store.setProfile(user.id, d.global_name || d.username, avatar); // keep profile in sync with Discord
      }
      res.writeHead(302, { 'Set-Cookie': sessionCookie(makeSession(user.id)), Location: '/' });
      return res.end();
    } catch (e) {
      console.error('OAuth failed:', e.message);
      res.writeHead(302, { Location: '/?login=failed' });
      return res.end();
    }
  }

  if (p === '/auth/dev' && req.method === 'POST') {
    if (!DEV_LOGIN) return err(res, 403, 'dev login disabled');
    const { name } = await readBody(req);
    const clean = String(name || '').trim().slice(0, 32);
    if (!clean) return err(res, 400, 'name required');
    let user = store.getDevUserByName(clean);
    if (!user) {
      user = store.createUser({ name: clean, avatar: `/api/avatar/${encodeURIComponent(clean)}.svg`, neurons: STARTING_NEURONS });
      for (const c of STARTER_CARDS) store.grantCard(user.id, c);
    }
    res.writeHead(200, { 'Set-Cookie': sessionCookie(makeSession(user.id)), 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (p === '/auth/logout' && req.method === 'POST') {
    res.writeHead(200, { 'Set-Cookie': 'sess=; Path=/; Max-Age=0', 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }

  // ── public API ──
  if (p === '/api/config') return sendJSON(res, 200, { discord: DISCORD_ENABLED, devLogin: DEV_LOGIN, packCost: PACK_COST, packSize: PACK_SIZE, daily: DAILY_NEURONS, moderation: MODERATION });
  if (p === '/api/catalog') return sendJSON(res, 200, { cards: allCards(), rarities: RARITIES, series: SERIES });

  // uploaded meme images
  const memeFile = p.match(/^\/memes\/([^/]+)$/);
  if (memeFile) {
    const file = path.join(UPLOAD_DIR, path.basename(decodeURIComponent(memeFile[1])));
    return fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404); return res.end('not found'); }
      const type = IMAGE_TYPES.find((t) => file.endsWith(t.ext));
      res.writeHead(200, {
        'Content-Type': type ? type.mime : 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400, immutable',
      });
      res.end(buf);
    });
  }

  const avatarMatch = p.match(/^\/api\/avatar\/(.+)\.svg$/);
  if (avatarMatch) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    return res.end(avatarSVG(decodeURIComponent(avatarMatch[1])));
  }

  if (p === '/api/me') {
    if (!me) return sendJSON(res, 200, { user: null });
    return sendJSON(res, 200, { user: {
      ...publicUser(me), neurons: me.neurons,
      dailyReady: Date.now() - me.lastDaily > 20 * 3600e3,
      isAdmin: isAdmin(me),
      modPending: isAdmin(me) ? store.pendingCount() : 0,
    } });
  }

  if (p === '/api/users') {
    const users = store.listUsers().map(publicUser).sort((a, b) => b.cardCount - a.cardCount);
    return sendJSON(res, 200, { users });
  }

  if (p === '/api/collection') {
    const targetId = url.searchParams.get('user') || (me && me.id);
    const target = targetId && store.getUser(targetId);
    if (!target) return err(res, 404, 'user not found');
    const cards = store.listByOwner(target.id).map(instOut);
    return sendJSON(res, 200, { user: publicUser(target), cards });
  }

  // static frontend is public; everything below requires login
  if (!p.startsWith('/api/') && !p.startsWith('/auth/')) return serveStatic(res, p);
  if (!me) return err(res, 401, 'login required');

  if (p === '/api/daily' && req.method === 'POST') {
    if (Date.now() - me.lastDaily < 20 * 3600e3) return err(res, 429, 'Daily neurons already claimed. Come back later!');
    const neurons = me.neurons + DAILY_NEURONS;
    store.claimDaily(me.id, neurons, Date.now());
    return sendJSON(res, 200, { neurons, gained: DAILY_NEURONS });
  }

  if (p === '/api/packs/open' && req.method === 'POST') {
    if (me.neurons < PACK_COST) return err(res, 400, `Not enough neurons — a pack costs ${PACK_COST}.`);
    const neurons = me.neurons - PACK_COST;
    store.setNeurons(me.id, neurons);
    const pulls = openPackFor(me);
    return sendJSON(res, 200, { neurons, cards: pulls.map(instOut) });
  }

  const sellMatch = p.match(/^\/api\/cards\/([^/]+)\/sell$/);
  if (sellMatch && req.method === 'POST') {
    const inst = store.getInstance(sellMatch[1]);
    if (!inst || inst.ownerId !== me.id) return err(res, 404, 'card not found in your binder');
    if (store.lockedInstanceIds().has(inst.id)) return err(res, 400, 'card is locked in a pending trade');
    const value = RARITIES[getCard(inst.cardId).rarity].value;
    store.deleteInstance(inst.id);
    const neurons = me.neurons + value;
    store.setNeurons(me.id, neurons);
    return sendJSON(res, 200, { neurons, gained: value });
  }

  // ── meme submission portal ──
  if (p === '/api/memes' && req.method === 'POST') {
    if (store.pendingCountBy(me.id) >= MAX_PENDING_PER_USER)
      return err(res, 429, `You already have ${MAX_PENDING_PER_USER} memes waiting for review — patience, swarm member.`);
    let body;
    try { body = await readBody(req, Math.ceil(MAX_MEME_BYTES * 1.4) + 4096); } // base64 overhead
    catch { return err(res, 413, `Meme too large — max ${MAX_MEME_BYTES / 1024 / 1024}MB.`); }

    const name = String(body.name || '').trim().slice(0, 48);
    if (!name) return err(res, 400, 'give your meme a name');
    const dataUrl = String(body.data || '');
    const b64 = dataUrl.replace(/^data:[^,]*,/, '');
    let buf;
    try { buf = Buffer.from(b64, 'base64'); } catch { return err(res, 400, 'bad image data'); }
    if (buf.length < 100) return err(res, 400, 'bad image data');
    if (buf.length > MAX_MEME_BYTES) return err(res, 413, `Meme too large — max ${MAX_MEME_BYTES / 1024 / 1024}MB.`);
    const type = IMAGE_TYPES.find((t) => t.match(buf));
    if (!type) return err(res, 400, 'unsupported format — use PNG, JPEG, GIF, or WEBP');

    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    const id = 'm_' + hash.slice(0, 16);
    if (store.getMeme(id)) return err(res, 409, 'this exact meme was already submitted');

    const file = `${hash.slice(0, 20)}${type.ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
    const rarity = rarityFromHash(hash);
    const status = MODERATION ? 'pending' : 'approved';
    store.createMeme({ id, name, file, rarity, submitterId: me.id, status });
    if (status === 'approved') for (let i = 0; i < APPROVAL_COPIES; i++) store.grantCard(me.id, id);
    return sendJSON(res, 200, { id, rarity, status,
      note: status === 'approved'
        ? `Minted instantly as a ${rarity} card — ${APPROVAL_COPIES} copies are in your binder!`
        : 'Submitted for review. A moderator will take a look.' });
  }

  if (p === '/api/memes/mine' && req.method === 'GET') {
    return sendJSON(res, 200, { memes: store.memesBySubmitter(me.id) });
  }

  if (p === '/api/memes/queue' && req.method === 'GET') {
    if (!isAdmin(me)) return err(res, 403, 'moderators only');
    return sendJSON(res, 200, { memes: store.memesByStatus('pending') });
  }

  const memeAction = p.match(/^\/api\/memes\/([^/]+)\/(approve|reject)$/);
  if (memeAction && req.method === 'POST') {
    if (!isAdmin(me)) return err(res, 403, 'moderators only');
    const meme = store.getMeme(memeAction[1]);
    if (!meme) return err(res, 404, 'meme not found');
    if (meme.status !== 'pending') return err(res, 400, 'already reviewed');
    if (memeAction[2] === 'approve') {
      store.resolveMeme(meme.id, 'approved');
      for (let i = 0; i < APPROVAL_COPIES; i++) store.grantCard(meme.submitterId, meme.id);
    } else {
      store.resolveMeme(meme.id, 'rejected');
      fs.unlink(path.join(UPLOAD_DIR, meme.file), () => {});
    }
    return sendJSON(res, 200, { ok: true, status: memeAction[2] === 'approve' ? 'approved' : 'rejected' });
  }

  // ── trades ──
  if (p === '/api/trades' && req.method === 'GET') {
    const mine = store.listTradesFor(me.id).map(tradeOut);
    const names = {};
    for (const t of mine) {
      for (const id of [t.fromId, t.toId]) {
        if (names[id]) continue;
        const u = store.getUser(id);
        if (u) names[id] = { name: u.name, avatar: u.avatar };
      }
    }
    return sendJSON(res, 200, { trades: mine, users: names });
  }

  if (p === '/api/trades' && req.method === 'POST') {
    const { toId, offer = [], request = [], message = '' } = await readBody(req);
    const target = store.getUser(toId);
    if (!target || target.id === me.id) return err(res, 400, 'invalid trade partner');
    if (!offer.length || !request.length) return err(res, 400, 'both sides of the trade need at least one card');
    if (offer.length > 6 || request.length > 6) return err(res, 400, 'max 6 cards per side');
    for (const id of offer) {
      const inst = store.getInstance(id);
      if (!inst || inst.ownerId !== me.id) return err(res, 400, 'you can only offer cards you own');
    }
    for (const id of request) {
      const inst = store.getInstance(id);
      if (!inst || inst.ownerId !== target.id) return err(res, 400, 'requested cards must belong to the trade partner');
    }
    const locked = store.lockedInstanceIds();
    if ([...offer, ...request].some((id) => locked.has(id))) return err(res, 400, 'one of these cards is locked in another pending trade');

    let trade = store.createTrade({
      fromId: me.id, toId: target.id,
      offer: [...new Set(offer)], request: [...new Set(request)],
      message: String(message).slice(0, 200),
    });
    if (target.bot) trade = botConsiderTrade(trade);
    return sendJSON(res, 200, { trade: tradeOut(trade) });
  }

  const tradeAction = p.match(/^\/api\/trades\/([^/]+)\/(accept|decline|cancel)$/);
  if (tradeAction && req.method === 'POST') {
    const [, id, action] = tradeAction;
    const t = store.getTrade(id);
    if (!t) return err(res, 404, 'trade not found');
    if (t.status !== 'pending') return err(res, 400, 'trade already resolved');
    if (action === 'cancel' && t.fromId !== me.id) return err(res, 403, 'only the sender can cancel');
    if ((action === 'accept' || action === 'decline') && t.toId !== me.id) return err(res, 403, 'only the recipient can respond');

    if (action === 'accept') {
      // re-validate ownership at accept time
      const owns = (cid, uid) => { const i = store.getInstance(cid); return i && i.ownerId === uid; };
      const ok = t.offer.every((cid) => owns(cid, t.fromId)) && t.request.every((cid) => owns(cid, t.toId));
      if (!ok) { store.resolveTrade(t.id, 'expired'); return err(res, 409, 'a card in this trade changed hands — trade expired'); }
      store.executeTrade(t);
    } else {
      store.resolveTrade(t.id, action === 'decline' ? 'declined' : 'cancelled');
    }
    return sendJSON(res, 200, { trade: tradeOut(store.getTrade(id)) });
  }

  if (p.startsWith('/api/') || p.startsWith('/auth/')) return err(res, 404, 'no such endpoint');
  return serveStatic(res, p);
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(`${req.method} ${req.url} →`, e);
    if (!res.headersSent) err(res, 500, 'internal error');
  });
}).listen(PORT, () => {
  console.log(`🐝 Swarm Stash running at ${BASE_URL}`);
  console.log(`   Discord OAuth: ${DISCORD_ENABLED ? 'enabled' : 'NOT configured (using dev login)'} · dev login: ${DEV_LOGIN ? 'on' : 'off'}`);
});
