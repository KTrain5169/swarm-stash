// SQLite storage layer (node:sqlite — built into Node ≥22.13, zero dependencies).
// Migrates a legacy data/db.json automatically on first run.

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CARDS } = require('./catalog');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'swarm.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id        TEXT PRIMARY KEY,
    discordId TEXT UNIQUE,
    name      TEXT NOT NULL,
    avatar    TEXT NOT NULL,
    bot       INTEGER NOT NULL DEFAULT 0,
    neurons   INTEGER NOT NULL DEFAULT 0,
    lastDaily INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id         TEXT PRIMARY KEY,
    cardId     TEXT NOT NULL,
    ownerId    TEXT NOT NULL REFERENCES users(id),
    obtainedAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_inventory_owner ON inventory(ownerId);

  CREATE TABLE IF NOT EXISTS trades (
    id         TEXT PRIMARY KEY,
    fromId     TEXT NOT NULL REFERENCES users(id),
    toId       TEXT NOT NULL REFERENCES users(id),
    offer      TEXT NOT NULL,   -- JSON array of instance ids
    request    TEXT NOT NULL,   -- JSON array of instance ids
    message    TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'pending',
    createdAt  INTEGER NOT NULL,
    resolvedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_trades_users ON trades(fromId, toId);

  CREATE TABLE IF NOT EXISTS memes (
    id          TEXT PRIMARY KEY,   -- 'm_' + content hash, so re-uploads dedupe
    name        TEXT NOT NULL,
    file        TEXT NOT NULL,
    rarity      TEXT NOT NULL,
    submitterId TEXT NOT NULL REFERENCES users(id),
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    createdAt   INTEGER NOT NULL,
    resolvedAt  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_memes_status ON memes(status);
`);

const newId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

// ─── prepared statements ─────────────────────────────────────────────────────
const q = {
  insertUser: db.prepare(`INSERT INTO users (id, discordId, name, avatar, bot, neurons, lastDaily, createdAt)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  getUser: db.prepare(`SELECT * FROM users WHERE id = ?`),
  getUserByDiscord: db.prepare(`SELECT * FROM users WHERE discordId = ?`),
  getDevUserByName: db.prepare(`SELECT * FROM users WHERE discordId IS NULL AND bot = 0 AND lower(name) = lower(?)`),
  getUserByName: db.prepare(`SELECT * FROM users WHERE name = ?`),
  listUsers: db.prepare(`SELECT * FROM users`),
  setProfile: db.prepare(`UPDATE users SET name = ?, avatar = ? WHERE id = ?`),
  setNeurons: db.prepare(`UPDATE users SET neurons = ? WHERE id = ?`),
  setDaily: db.prepare(`UPDATE users SET neurons = ?, lastDaily = ? WHERE id = ?`),
  userCounts: db.prepare(`SELECT COUNT(*) AS cardCount, COUNT(DISTINCT cardId) AS uniqueCount FROM inventory WHERE ownerId = ?`),

  insertInstance: db.prepare(`INSERT INTO inventory (id, cardId, ownerId, obtainedAt) VALUES (?, ?, ?, ?)`),
  getInstance: db.prepare(`SELECT * FROM inventory WHERE id = ?`),
  listByOwner: db.prepare(`SELECT * FROM inventory WHERE ownerId = ? ORDER BY obtainedAt DESC`),
  setOwner: db.prepare(`UPDATE inventory SET ownerId = ? WHERE id = ?`),
  deleteInstance: db.prepare(`DELETE FROM inventory WHERE id = ?`),

  insertTrade: db.prepare(`INSERT INTO trades (id, fromId, toId, offer, request, message, status, createdAt)
                           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`),
  getTrade: db.prepare(`SELECT * FROM trades WHERE id = ?`),
  listTradesFor: db.prepare(`SELECT * FROM trades WHERE fromId = ? OR toId = ? ORDER BY createdAt DESC`),
  resolveTrade: db.prepare(`UPDATE trades SET status = ?, resolvedAt = ? WHERE id = ?`),
  pendingTrades: db.prepare(`SELECT offer, request FROM trades WHERE status = 'pending'`),

  insertMeme: db.prepare(`INSERT INTO memes (id, name, file, rarity, submitterId, status, createdAt)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`),
  getMeme: db.prepare(`SELECT * FROM memes WHERE id = ?`),
  memesByStatus: db.prepare(`SELECT m.*, u.name AS submitterName, u.avatar AS submitterAvatar
                             FROM memes m JOIN users u ON u.id = m.submitterId
                             WHERE m.status = ? ORDER BY m.createdAt DESC`),
  memesBySubmitter: db.prepare(`SELECT * FROM memes WHERE submitterId = ? ORDER BY createdAt DESC`),
  resolveMeme: db.prepare(`UPDATE memes SET status = ?, resolvedAt = ? WHERE id = ?`),
  countPendingBy: db.prepare(`SELECT COUNT(*) AS n FROM memes WHERE submitterId = ? AND status = 'pending'`),
  countPending: db.prepare(`SELECT COUNT(*) AS n FROM memes WHERE status = 'pending'`),
};

const rowToTrade = (r) => r && { ...r, offer: JSON.parse(r.offer), request: JSON.parse(r.request) };

// ─── public API ──────────────────────────────────────────────────────────────
const store = {
  newId,

  createUser({ discordId = null, name, avatar, bot = false, neurons = 0 }) {
    const user = { id: newId('u'), discordId, name, avatar, bot: bot ? 1 : 0, neurons, lastDaily: 0, createdAt: Date.now() };
    q.insertUser.run(user.id, user.discordId, user.name, user.avatar, user.bot, user.neurons, user.lastDaily, user.createdAt);
    return user;
  },
  getUser: (id) => q.getUser.get(id),
  getUserByDiscord: (discordId) => q.getUserByDiscord.get(discordId),
  getDevUserByName: (name) => q.getDevUserByName.get(name),
  getUserByName: (name) => q.getUserByName.get(name),
  listUsers: () => q.listUsers.all(),
  setProfile: (id, name, avatar) => q.setProfile.run(name, avatar, id),
  setNeurons: (id, neurons) => q.setNeurons.run(neurons, id),
  claimDaily: (id, neurons, when) => q.setDaily.run(neurons, when, id),
  userCounts: (id) => q.userCounts.get(id),

  grantCard(ownerId, cardId) {
    const inst = { id: newId('c'), cardId, ownerId, obtainedAt: Date.now() };
    q.insertInstance.run(inst.id, inst.cardId, inst.ownerId, inst.obtainedAt);
    return inst;
  },
  getInstance: (id) => q.getInstance.get(id),
  listByOwner: (ownerId) => q.listByOwner.all(ownerId),
  deleteInstance: (id) => q.deleteInstance.run(id),

  createTrade({ fromId, toId, offer, request, message }) {
    const trade = { id: newId('t'), fromId, toId, offer, request, message, status: 'pending', createdAt: Date.now(), resolvedAt: null };
    q.insertTrade.run(trade.id, fromId, toId, JSON.stringify(offer), JSON.stringify(request), message, trade.createdAt);
    return trade;
  },
  getTrade: (id) => rowToTrade(q.getTrade.get(id)),
  listTradesFor: (userId) => q.listTradesFor.all(userId, userId).map(rowToTrade),
  resolveTrade: (id, status) => q.resolveTrade.run(status, Date.now(), id),

  lockedInstanceIds() {
    const locked = new Set();
    for (const r of q.pendingTrades.all()) {
      for (const id of [...JSON.parse(r.offer), ...JSON.parse(r.request)]) locked.add(id);
    }
    return locked;
  },

  createMeme({ id, name, file, rarity, submitterId, status }) {
    q.insertMeme.run(id, name, file, rarity, submitterId, status, Date.now());
  },
  getMeme: (id) => q.getMeme.get(id),
  memesByStatus: (status) => q.memesByStatus.all(status),
  memesBySubmitter: (userId) => q.memesBySubmitter.all(userId),
  resolveMeme: (id, status) => q.resolveMeme.run(status, Date.now(), id),
  pendingCountBy: (userId) => q.countPendingBy.get(userId).n,
  pendingCount: () => q.countPending.get().n,

  // Swap card ownership atomically, then mark the trade resolved.
  executeTrade(trade) {
    db.exec('BEGIN');
    try {
      for (const id of trade.offer) q.setOwner.run(trade.toId, id);
      for (const id of trade.request) q.setOwner.run(trade.fromId, id);
      q.resolveTrade.run('accepted', Date.now(), trade.id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
};

// ─── one-time migration from the legacy JSON store ───────────────────────────
(function migrateLegacyJSON() {
  const legacyPath = path.join(DATA_DIR, 'db.json');
  if (!fs.existsSync(legacyPath)) return;
  if (q.listUsers.all().length > 0) return; // sqlite already populated
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    const knownCards = new Set(CARDS.map((c) => c.id));
    db.exec('BEGIN');
    for (const u of Object.values(legacy.users || {})) {
      q.insertUser.run(u.id, u.discordId || null, u.name, u.avatar, u.bot ? 1 : 0, u.neurons | 0, u.lastDaily | 0, u.createdAt | 0);
    }
    let skipped = 0;
    for (const i of Object.values(legacy.inventory || {})) {
      if (!knownCards.has(i.cardId)) { skipped++; continue; } // card retired from the catalog
      q.insertInstance.run(i.id, i.cardId, i.ownerId, i.obtainedAt | 0);
    }
    for (const t of Object.values(legacy.trades || {})) {
      q.insertTrade.run(t.id, t.fromId, t.toId, JSON.stringify(t.offer), JSON.stringify(t.request), t.message || '', t.createdAt | 0);
      if (t.status !== 'pending') q.resolveTrade.run(t.status, t.resolvedAt || t.createdAt, t.id);
    }
    db.exec('COMMIT');
    fs.renameSync(legacyPath, legacyPath + '.migrated');
    console.log(`Migrated legacy db.json to SQLite${skipped ? ` (${skipped} cards from retired sets dropped)` : ''}.`);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('Legacy db.json migration failed:', e.message);
  }
})();

module.exports = store;
