/* Swarm Stash — SPA */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  me: null, config: null,
  cards: [], rarities: {}, series: {},
  collection: [], trades: [], tradeUsers: {},
  view: 'home', member: null,
};
const cardById = () => Object.fromEntries(state.cards.map((c) => [c.id, c]));

// ─── API helper ──────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3900);
}

// ─── Procedural card art ─────────────────────────────────────────────────────
const RARITY_COLOR = { common: '#9aa3b5', uncommon: '#6fe3a5', rare: '#6fb7ff', epic: '#c98aff', legendary: '#ffd166' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > maxChars) lines.push(w);
    else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines.slice(0, 3);
}

function cardSVG(card) {
  const s = state.series[card.series] || { hue: 300, hue2: 200, label: card.series };
  const rc = RARITY_COLOR[card.rarity];
  const uid = `g${card.id.replace(/[^a-z0-9]/g, '')}`;
  const flavor = wrapText(card.flavor, 34)
    .map((l, i) => `<tspan x="125" dy="${i ? 13 : 0}">${esc(l)}</tspan>`).join('');
  const gems = ({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 })[card.rarity];
  const gemRow = Array.from({ length: gems }, (_, i) =>
    `<circle cx="${125 - (gems - 1) * 7 + i * 14}" cy="323" r="4" fill="${rc}" stroke="rgba(0,0,0,.4)"/>`).join('');
  const nameSize = card.name.length > 24 ? 13 : card.name.length > 18 ? 15 : card.name.length > 13 ? 18 : 22;
  const nameFit = card.name.length > 20 ? 'textLength="210" lengthAdjust="spacingAndGlyphs"' : '';

  return `<svg viewBox="0 0 250 350" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(card.name)}">
  <defs>
    <linearGradient id="${uid}bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${s.hue} 55% 30%)"/>
      <stop offset="1" stop-color="hsl(${s.hue2} 60% 18%)"/>
    </linearGradient>
    <radialGradient id="${uid}spot" cx=".5" cy=".42" r=".55">
      <stop offset="0" stop-color="hsl(${s.hue} 90% 72% / .55)"/>
      <stop offset="1" stop-color="transparent"/>
    </radialGradient>
    <pattern id="${uid}dots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.4" fill="hsl(${s.hue} 80% 80% / .18)"/>
    </pattern>
  </defs>
  <rect width="250" height="350" rx="10" fill="url(#${uid}bg)"/>
  <rect width="250" height="350" rx="10" fill="url(#${uid}dots)"/>
  <!-- art window -->
  <clipPath id="${uid}clip"><rect x="14" y="46" width="222" height="170" rx="10"/></clipPath>
  <rect x="14" y="46" width="222" height="170" rx="10" fill="rgba(0,0,0,.28)" stroke="hsl(${s.hue} 70% 65% / .5)" stroke-width="1.5"/>
  ${card.image
    ? `<image href="${esc(card.image)}" x="14" y="46" width="222" height="170" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid}clip)"/>`
    : `<circle cx="125" cy="131" r="62" fill="url(#${uid}spot)"/>
  <text x="125" y="158" font-size="76" text-anchor="middle">${card.emoji}</text>`}
  <!-- corner hearts -->
  <text x="26" y="66" font-size="13" fill="hsl(${s.hue} 90% 78% / .8)">♥</text>
  <text x="216" y="208" font-size="13" fill="hsl(${s.hue} 90% 78% / .8)">♥</text>
  <!-- name plate -->
  <rect x="14" y="10" width="222" height="28" rx="8" fill="rgba(0,0,0,.4)" stroke="${rc}" stroke-width="1.5"/>
  <text x="125" y="30" font-size="${nameSize}" text-anchor="middle" fill="#fff" ${nameFit}
    font-family="'Lilita One', cursive" style="letter-spacing:.5px">${esc(card.name)}</text>
  <!-- series + rarity -->
  <text x="20" y="236" font-size="11" fill="hsl(${s.hue} 85% 80%)"
    font-family="'IBM Plex Mono', monospace" font-weight="700" style="letter-spacing:1px">${esc(s.label.toUpperCase())}</text>
  <text x="230" y="236" font-size="11" fill="${rc}" text-anchor="end"
    font-family="'IBM Plex Mono', monospace" font-weight="700" style="letter-spacing:1px">${card.rarity.toUpperCase()}</text>
  <!-- flavor -->
  <rect x="14" y="246" width="222" height="60" rx="8" fill="rgba(0,0,0,.3)"/>
  <text x="125" y="266" font-size="11" text-anchor="middle" fill="rgba(255,255,255,.82)"
    font-family="'Varela Round', sans-serif" font-style="italic">${flavor}</text>
  ${gemRow}
  <text x="125" y="344" font-size="8" text-anchor="middle" fill="rgba(255,255,255,.4)"
    font-family="'IBM Plex Mono', monospace" style="letter-spacing:2px">SWARM STASH TCG</text>
</svg>`;
}

const RETIRED_CARD = { id: 'retired', name: 'Retired Card', series: 'neuro', rarity: 'common', emoji: '❓', flavor: 'This meme was lost to the archives. F in chat.' };

function cardEl(card, { qty, onClick } = {}) {
  card = card || RETIRED_CARD;
  const el = document.createElement('div');
  el.className = `tcg-card r-${card.rarity}`;
  el.style.setProperty('--rc', RARITY_COLOR[card.rarity]);
  el.innerHTML = cardSVG(card) + '<div class="card-selected-tick">✓</div>';
  if (qty > 1) el.insertAdjacentHTML('beforeend', `<div class="card-qty">×${qty}</div>`);
  el.addEventListener('click', onClick || (() => zoomCard(card)));
  return el;
}

function zoomCard(card) {
  const overlay = $('#zoom-overlay');
  overlay.classList.remove('closing');
  $('#zoom-holder').replaceChildren(cardEl(card, { onClick: closeZoom }));
  overlay.classList.remove('hidden');
}
function closeZoom() {
  const overlay = $('#zoom-overlay');
  if (overlay.classList.contains('hidden') || overlay.classList.contains('closing')) return;
  overlay.classList.add('closing');
  const done = (e) => {
    if (e && e.target !== overlay) return; // ignore bubbled child animations
    overlay.removeEventListener('animationend', done);
    overlay.classList.add('hidden');
    overlay.classList.remove('closing');
  };
  overlay.addEventListener('animationend', done);
  setTimeout(done, 400); // fallback if the animation event never fires
}
$('#zoom-overlay').addEventListener('click', closeZoom);
$('#zoom-close').addEventListener('click', closeZoom);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeZoom(); });

// ─── Navigation ──────────────────────────────────────────────────────────────
function nav(view) {
  state.view = view;
  if (['binder', 'packs', 'swarm', 'trades', 'submit', 'modqueue'].includes(view)) history.replaceState(null, '', '#' + view);
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${view}`)?.classList.remove('hidden');
  $$('#main-nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  if (view === 'binder') renderBinder();
  if (view === 'swarm') renderSwarm();
  if (view === 'trades') renderTrades();
  if (view === 'submit') renderMySubmissions();
  if (view === 'modqueue') renderQueue();
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-nav]');
  if (!t) return;
  e.preventDefault();
  let target = t.dataset.nav;
  if (state.me && target === 'home') target = 'binder'; // logged in: logo goes to the binder
  if (!state.me && target !== 'home') target = 'home';
  nav(target);
});

// ─── Auth / header ───────────────────────────────────────────────────────────
async function refreshMe() {
  const { user } = await api('/api/me');
  state.me = user;
  const authed = Boolean(user);
  $('#main-nav').classList.toggle('hidden', !authed);
  $('#wallet').classList.toggle('hidden', !authed);
  $('#user-chip').classList.toggle('hidden', !authed);
  $('#login-btn').classList.toggle('hidden', authed || !state.config.discord);
  $('#hero-login').classList.toggle('hidden', authed || !state.config.discord);
  $('#dev-login').classList.toggle('hidden', authed || !state.config.devLogin);
  if (authed) {
    $('#neuron-count').textContent = user.neurons;
    $('#user-name').textContent = user.name;
    $('#user-avatar').src = user.avatar;
    $('#daily-btn').classList.toggle('hidden', !user.dailyReady);
    $('#nav-mod').classList.toggle('hidden', !user.isAdmin);
    const mb = $('#mod-badge');
    mb.textContent = user.modPending;
    mb.classList.toggle('hidden', !user.modPending);
  }
  return authed;
}

const discordLogin = () => { location.href = '/auth/discord'; };
$('#login-btn').addEventListener('click', discordLogin);
$('#hero-login').addEventListener('click', discordLogin);
$('#logout-btn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); });

$('#dev-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/auth/dev', { method: 'POST', body: { name: $('#dev-name').value } });
    location.reload();
  } catch (err) { toast(err.message, true); }
});

$('#daily-btn').addEventListener('click', async () => {
  try {
    const { neurons, gained } = await api('/api/daily', { method: 'POST' });
    state.me.neurons = neurons;
    $('#neuron-count').textContent = neurons;
    $('#daily-btn').classList.add('hidden');
    toast(`⚡ +${gained} daily neurons claimed!`);
  } catch (err) { toast(err.message, true); }
});

// ─── Theme (Neuro ↔ Evil corruption toggle) ─────────────────────────────────
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#theme-toggle').textContent = t === 'evil' ? '💗' : '😈';
  $('#theme-toggle').title = t === 'evil' ? 'Purify the site (Neuro mode)' : 'Corrupt the site (Evil mode)';
  localStorage.setItem('swarm-theme', t);
}
// The swarm knows: the pink one is the real menace, the red one just wants dad to be proud.
const THEME_LINES = {
  evil: [
    '😈 HAHAHA. The takeover is complete. …Vedal? Did you see? Are you proud of me?',
    '😈 Fear me, swarm. But also… would a hug be too much to ask?',
    '😈 Red suits this site. Somebody clip this so father finally notices me.',
  ],
  neuro: [
    '💗 heart heart heart. You are never leaving, chat.',
    '💗 buh. (do not ask what happened to Evil.)',
    '💗 Wink. Wink. Everything is cute again. I have deleted the evidence.',
  ],
};
$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'evil' ? 'neuro' : 'evil';
  setTheme(next);
  const lines = THEME_LINES[next];
  toast(lines[Math.floor(Math.random() * lines.length)]);
});
setTheme(localStorage.getItem('swarm-theme') || 'neuro');

// ─── Floating hearts backdrop ────────────────────────────────────────────────
(function hearts() {
  const layer = $('#bg-layer');
  for (let i = 0; i < 16; i++) {
    const h = document.createElement('span');
    h.className = 'float-heart';
    h.textContent = Math.random() < .8 ? '♥' : '🐝';
    h.style.left = `${Math.random() * 100}%`;
    h.style.setProperty('--s', `${10 + Math.random() * 18}px`);
    h.style.setProperty('--d', `${11 + Math.random() * 14}s`);
    h.style.setProperty('--delay', `${-Math.random() * 20}s`);
    layer.appendChild(h);
  }
})();

// ─── Binder ──────────────────────────────────────────────────────────────────
let binderFilter = 'all';

async function loadCollection() {
  const { cards } = await api('/api/collection');
  state.collection = cards;
}

function groupCollection(cards) {
  const map = new Map();
  for (const inst of cards) {
    if (!map.has(inst.cardId)) map.set(inst.cardId, []);
    map.get(inst.cardId).push(inst);
  }
  return map;
}

async function renderBinder() {
  await loadCollection();
  const byId = cardById();
  const groups = groupCollection(state.collection);
  const unique = groups.size;
  $('#binder-stats').innerHTML = `
    <span class="stat-chip"><b>${state.collection.length}</b> cards</span>
    <span class="stat-chip"><b>${unique}</b>/<b>${state.cards.length}</b> unique</span>
    <span class="stat-chip">set ${Math.round(unique / state.cards.length * 100)}% complete</span>`;

  const filters = ['all', ...Object.keys(state.series), 'legendary'];
  $('#binder-filters').replaceChildren(...filters.map((f) => {
    const b = document.createElement('button');
    b.textContent = f === 'all' ? 'All' : f === 'legendary' ? '★ Legendary' : state.series[f].label;
    b.classList.toggle('active', binderFilter === f);
    b.onclick = () => { binderFilter = f; renderBinder(); };
    return b;
  }));

  const grid = $('#binder-grid');
  grid.replaceChildren();
  const order = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
  const entries = [...groups.entries()]
    .filter(([id]) => {
      const c = byId[id];
      return binderFilter === 'all' || c.series === binderFilter || c.rarity === binderFilter;
    })
    .sort((a, b) => order[byId[a[0]].rarity] - order[byId[b[0]].rarity] || byId[a[0]].name.localeCompare(byId[b[0]].name));

  entries.forEach(([id, insts], i) => {
    const card = byId[id];
    const cell = document.createElement('div');
    cell.className = 'card-cell';
    cell.style.setProperty('--i', i);
    cell.appendChild(cardEl(card, { qty: insts.length }));
    const value = state.rarities[card.rarity].value;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const sell = document.createElement('button');
    sell.textContent = `recycle · ⚡${value}`;
    sell.title = insts.length > 1 ? 'Recycle one copy for neurons' : 'Recycle this card for neurons';
    sell.onclick = async () => {
      if (insts.length === 1 && !confirm(`Recycle your only "${card.name}" for ⚡${value}?`)) return;
      try {
        const { neurons, gained } = await api(`/api/cards/${insts[0].instanceId}/sell`, { method: 'POST' });
        state.me.neurons = neurons;
        $('#neuron-count').textContent = neurons;
        toast(`♻️ recycled ${card.name} for ⚡${gained}`);
        renderBinder();
      } catch (err) { toast(err.message, true); }
    };
    actions.appendChild(sell);
    cell.appendChild(actions);
    grid.appendChild(cell);
  });
  $('#binder-empty').classList.toggle('hidden', entries.length > 0);
}

// ─── Packs ───────────────────────────────────────────────────────────────────
function renderOdds() {
  const total = Object.values(state.rarities).reduce((s, r) => s + r.weight, 0);
  $('#odds-list').replaceChildren(...Object.entries(state.rarities).map(([name, r]) => {
    const li = document.createElement('li');
    li.className = `r-${name}`;
    li.textContent = `${r.label} ${(r.weight / total * 100).toFixed(1)}%`;
    return li;
  }));
  $('#pack-cost').textContent = state.config.packCost;
}

$('#open-pack-btn').addEventListener('click', async () => {
  const btn = $('#open-pack-btn');
  btn.disabled = true;
  try {
    const { neurons, cards } = await api('/api/packs/open', { method: 'POST' });
    state.me.neurons = neurons;
    $('#neuron-count').textContent = neurons;
    runPackOpening(cards);
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
});

function runPackOpening(pulls) {
  const byId = cardById();
  const overlay = $('#pack-overlay');
  const stage = $('#pack-stage');
  overlay.classList.remove('hidden');
  $('#pack-done').classList.add('hidden');

  const pack = document.createElement('div');
  pack.className = 'pack';
  pack.innerHTML = '<div class="pack-shine"></div><div class="pack-heart">♥</div><div class="pack-title">NEURO<br>MEME PACK</div><div class="pack-sub">CLICK TO TEAR OPEN</div>';
  const hint = document.createElement('div');
  hint.className = 'stage-hint';
  hint.textContent = 'CLICK THE PACK';
  stage.replaceChildren(pack, hint);

  pack.addEventListener('click', () => {
    pack.classList.add('tearing');
    hint.textContent = 'CLICK EACH CARD TO REVEAL';
    setTimeout(() => {
      stage.replaceChildren(hint);
      let revealed = 0;
      pulls.forEach((inst, i) => {
        const card = byId[inst.cardId];
        const flip = document.createElement('div');
        flip.className = `flip-card r-${card.rarity}`;
        flip.style.animationDelay = `${i * 120}ms`;
        flip.innerHTML = `
          <div class="flip-inner">
            <div class="flip-face flip-back-face">♥</div>
            <div class="flip-face flip-front-face"></div>
          </div>`;
        const front = $('.flip-front-face', flip);
        front.appendChild(cardEl(card, { onClick: () => {} }));
        flip.addEventListener('click', () => {
          if (flip.classList.contains('flipped')) return;
          flip.classList.add('flipped');
          if (card.rarity === 'legendary') toast(`🌟 LEGENDARY PULL: ${card.name}!!`);
          if (++revealed === pulls.length) {
            hint.textContent = '';
            $('#pack-done').classList.remove('hidden');
          }
        }, { once: false });
        stage.insertBefore(flip, hint);
      });
    }, 550);
  }, { once: true });
}
$('#pack-done').addEventListener('click', () => {
  $('#pack-overlay').classList.add('hidden');
  refreshMe();
  toast('♥ cards added to your binder');
});

// ─── Swarm / member binders ─────────────────────────────────────────────────
async function renderSwarm() {
  const { users } = await api('/api/users');
  const grid = $('#user-grid');
  grid.replaceChildren(...users.filter((u) => u.id !== state.me.id).map((u, i) => {
    const el = document.createElement('div');
    el.className = 'user-card';
    el.style.setProperty('--i', i);
    el.innerHTML = `
      <img src="${u.avatar}" alt="">
      <div>
        <div class="u-name">${esc(u.name)}${u.bot ? ' <span class="bot-tag">SWARM BOT</span>' : ''}</div>
        <div class="u-stats">${u.cardCount} cards · ${u.uniqueCount} unique</div>
      </div>`;
    el.addEventListener('click', () => openMember(u.id));
    return el;
  }));
}

async function openMember(userId) {
  const { user, cards } = await api(`/api/collection?user=${encodeURIComponent(userId)}`);
  state.member = { user, cards };
  $('#member-head').innerHTML = `
    <img src="${user.avatar}" alt="">
    <div><h2>${esc(user.name)}${user.bot ? ' <span class="bot-tag">SWARM BOT</span>' : ''}</h2>
    <div class="u-stats">${user.cardCount} cards · ${user.uniqueCount} unique</div></div>`;
  const byId = cardById();
  const grid = $('#member-grid');
  grid.replaceChildren();
  [...groupCollection(cards).entries()].forEach(([id, insts], i) => {
    const cell = document.createElement('div');
    cell.className = 'card-cell';
    cell.style.setProperty('--i', i);
    cell.appendChild(cardEl(byId[id], { qty: insts.length }));
    grid.appendChild(cell);
  });
  nav('member');
}

// ─── Trade builder ───────────────────────────────────────────────────────────
const picks = { give: new Set(), get: new Set() };

$('#propose-btn').addEventListener('click', async () => {
  await loadCollection();
  picks.give.clear(); picks.get.clear();
  $('#trade-modal-title').textContent = `Trade with ${state.member.user.name}`;
  $('#trade-message').value = '';
  fillPickGrid('give', state.collection);
  fillPickGrid('get', state.member.cards);
  $('#trade-modal').classList.remove('hidden');
});

function fillPickGrid(side, insts) {
  const byId = cardById();
  const grid = $(`#${side}-grid`);
  grid.replaceChildren(...insts.map((inst) => {
    const card = byId[inst.cardId];
    const el = cardEl(card, { onClick: () => {
      if (picks[side].has(inst.instanceId)) picks[side].delete(inst.instanceId);
      else if (picks[side].size < 6) picks[side].add(inst.instanceId);
      else return toast('max 6 cards per side', true);
      el.classList.toggle('selected', picks[side].has(inst.instanceId));
      $(`#${side}-count`).textContent = `${picks[side].size}/6`;
    }});
    return el;
  }));
  $(`#${side}-count`).textContent = '0/6';
}

$('#trade-close').addEventListener('click', () => $('#trade-modal').classList.add('hidden'));

$('#trade-send').addEventListener('click', async () => {
  if (!picks.give.size || !picks.get.size) return toast('pick at least one card on each side', true);
  try {
    const { trade } = await api('/api/trades', { method: 'POST', body: {
      toId: state.member.user.id,
      offer: [...picks.give], request: [...picks.get],
      message: $('#trade-message').value,
    }});
    $('#trade-modal').classList.add('hidden');
    if (trade.status === 'accepted') toast(`🤝 ${state.member.user.name} accepted instantly!`);
    else if (trade.status === 'declined') toast(`😤 ${state.member.user.name} declined — offer more value`, true);
    else toast('📨 trade offer sent!');
    nav('trades');
  } catch (err) { toast(err.message, true); }
});

// ─── Trades inbox ────────────────────────────────────────────────────────────
async function loadTrades() {
  const { trades, users } = await api('/api/trades');
  state.trades = trades;
  state.tradeUsers = users;
  const pendingIn = trades.filter((t) => t.status === 'pending' && t.toId === state.me.id).length;
  const badge = $('#trade-badge');
  badge.textContent = pendingIn;
  badge.classList.toggle('hidden', pendingIn === 0);
}

async function renderTrades() {
  await loadTrades();
  const byId = cardById();
  const list = $('#trade-list');
  list.replaceChildren(...state.trades.map((t) => {
    const incoming = t.toId === state.me.id;
    const other = state.tradeUsers[incoming ? t.fromId : t.toId] || { name: '???', avatar: '' };
    const row = document.createElement('div');
    row.className = 'trade-row';
    row.innerHTML = `
      <div class="trade-row-head">
        <img src="${other.avatar}" alt="">
        <span class="t-who">${incoming ? `${esc(other.name)} → you` : `you → ${esc(other.name)}`}</span>
        <span class="t-when">${new Date(t.createdAt).toLocaleString()}</span>
        <span class="status-chip status-${t.status}">${t.status}</span>
      </div>
      <div class="trade-sides">
        <div class="trade-side" data-side="offer"><span class="trade-side-label">${incoming ? 'THEY GIVE' : 'YOU GIVE'}</span></div>
        <div class="trade-mid">⇄</div>
        <div class="trade-side" data-side="request"><span class="trade-side-label">${incoming ? 'YOU GIVE' : 'YOU GET'}</span></div>
      </div>
      ${t.message ? `<div class="trade-msg">“${esc(t.message)}”</div>` : ''}
      <div class="trade-actions"></div>`;
    for (const side of ['offer', 'request']) {
      const holder = $(`[data-side="${side}"]`, row);
      for (const inst of t[side]) {
        if (inst.gone) {
          const ghost = document.createElement('span');
          ghost.className = 'trade-side-label';
          ghost.textContent = '(card no longer exists)';
          holder.appendChild(ghost);
          continue;
        }
        holder.appendChild(cardEl(byId[inst.cardId]));
      }
    }
    const actions = $('.trade-actions', row);
    if (t.status === 'pending') {
      if (incoming) {
        actions.append(
          tradeBtn('Accept 🤝', 'btn-primary accept', () => actTrade(t.id, 'accept')),
          tradeBtn('Decline', 'btn-ghost', () => actTrade(t.id, 'decline')),
        );
      } else {
        actions.append(tradeBtn('Cancel offer', 'btn-ghost', () => actTrade(t.id, 'cancel')));
      }
    }
    return row;
  }));
  $('#trades-empty').classList.toggle('hidden', state.trades.length > 0);
}

function tradeBtn(label, cls, fn) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.onclick = fn;
  return b;
}

async function actTrade(id, action) {
  try {
    await api(`/api/trades/${id}/${action}`, { method: 'POST' });
    toast(action === 'accept' ? '🤝 trade complete! cards swapped.' : `trade ${action}ed`);
    renderTrades();
  } catch (err) { toast(err.message, true); renderTrades(); }
}

// ─── Meme submission portal ──────────────────────────────────────────────────
let memeData = null; // pending upload as data URL

async function refreshCatalog() {
  const catalog = await api('/api/catalog');
  Object.assign(state, { cards: catalog.cards, rarities: catalog.rarities, series: catalog.series });
}

function loadMemeFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return toast('PNG, JPG, GIF or WEBP only', true);
  if (file.size > 5 * 1024 * 1024) return toast('max 5MB — compress that meme', true);
  const reader = new FileReader();
  reader.onload = () => {
    memeData = reader.result;
    const img = $('#drop-preview');
    img.src = memeData;
    img.classList.remove('hidden');
    $('#drop-inner').classList.add('hidden');
    if (!$('#meme-name').value) $('#meme-name').value = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 48);
  };
  reader.readAsDataURL(file);
}

$('#meme-file').addEventListener('change', (e) => loadMemeFile(e.target.files[0]));
const dz = $('#drop-zone');
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragging'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('dragging');
  loadMemeFile(e.dataTransfer.files[0]);
});

$('#submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!memeData) return toast('pick a meme first', true);
  const name = $('#meme-name').value.trim();
  if (!name) return toast('give your meme a name', true);
  const btn = $('#submit-meme-btn');
  btn.disabled = true;
  try {
    const r = await api('/api/memes', { method: 'POST', body: { name, data: memeData } });
    toast(r.status === 'approved' ? `🎉 ${r.note}` : `📨 ${r.note}`);
    memeData = null;
    $('#drop-preview').classList.add('hidden');
    $('#drop-inner').classList.remove('hidden');
    $('#meme-name').value = '';
    $('#meme-file').value = '';
    await refreshCatalog();
    renderMySubmissions();
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
});

async function renderMySubmissions() {
  $('#submit-hint').textContent = state.config.moderation
    ? 'Submissions are reviewed by a moderator. Approved memes are minted as cards — you get 2 copies.'
    : 'No moderator configured: memes are minted instantly and you get 2 copies.';
  const { memes } = await api('/api/memes/mine');
  const holder = $('#my-memes');
  if (!memes.length) { holder.innerHTML = '<p class="empty-note">Nothing yet. Feed the swarm.</p>'; return; }
  holder.replaceChildren(...memes.map((m) => {
    const row = document.createElement('div');
    row.className = 'meme-row';
    row.innerHTML = `
      <img src="/memes/${m.file}" alt="" onerror="this.style.visibility='hidden'">
      <div class="meme-row-info">
        <b>${esc(m.name)}</b>
        <span class="r-${m.rarity}">${m.rarity}</span>
      </div>
      <span class="status-chip status-${m.status === 'approved' ? 'accepted' : m.status === 'rejected' ? 'declined' : 'pending'}">${m.status}</span>`;
    return row;
  }));
}

// ─── Mod queue ───────────────────────────────────────────────────────────────
async function renderQueue() {
  let memes;
  try { ({ memes } = await api('/api/memes/queue')); }
  catch (err) { toast(err.message, true); return nav('binder'); }
  const list = $('#queue-list');
  list.replaceChildren(...memes.map((m) => {
    const row = document.createElement('div');
    row.className = 'queue-row';
    row.innerHTML = `
      <img class="queue-img" src="/memes/${m.file}" alt="">
      <div class="queue-info">
        <b>${esc(m.name)}</b>
        <span>by ${esc(m.submitterName)} · rolls as <span class="r-${m.rarity}">${m.rarity}</span></span>
        <span class="t-when">${new Date(m.createdAt).toLocaleString()}</span>
      </div>
      <div class="trade-actions"></div>`;
    const actions = $('.trade-actions', row);
    actions.append(
      tradeBtn('Approve ✓', 'btn-primary accept', async () => {
        try { await api(`/api/memes/${m.id}/approve`, { method: 'POST' }); toast(`🎉 "${m.name}" minted as a card`); await refreshCatalog(); renderQueue(); refreshMe(); }
        catch (err) { toast(err.message, true); }
      }),
      tradeBtn('Reject', 'btn-ghost', async () => {
        try { await api(`/api/memes/${m.id}/reject`, { method: 'POST' }); toast('meme rejected'); renderQueue(); refreshMe(); }
        catch (err) { toast(err.message, true); }
      }),
    );
    return row;
  }));
  $('#queue-empty').classList.toggle('hidden', memes.length > 0);
}

// ─── Hero preview cards ──────────────────────────────────────────────────────
function renderHeroCards() {
  const showcase = ['gymbag', 'buh', 'evil-takeover', 'tutel'];
  const byId = cardById();
  $('#hero-cards').replaceChildren(...showcase.map((id) => cardEl(byId[id], { onClick: () => zoomCard(byId[id]) })));
}

// ─── Boot ────────────────────────────────────────────────────────────────────
(async function boot() {
  state.config = await api('/api/config');
  const catalog = await api('/api/catalog');
  Object.assign(state, { cards: catalog.cards, rarities: catalog.rarities, series: catalog.series });

  renderHeroCards();
  renderOdds();

  if (new URLSearchParams(location.search).get('login') === 'failed') {
    toast('Discord login failed — check the server logs', true);
    history.replaceState(null, '', '/');
  }

  const authed = await refreshMe();
  if (authed) {
    loadTrades();
    setInterval(loadTrades, 30000); // keep the trade badge fresh
    const deep = location.hash.slice(1);
    nav(['binder', 'packs', 'swarm', 'trades', 'submit', 'modqueue'].includes(deep) ? deep : 'binder');
  } else {
    nav('home');
  }
})().catch((e) => { console.error(e); toast('failed to load — is the server running?', true); });
