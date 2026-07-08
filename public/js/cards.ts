// Procedural card art + the card element and zoom overlay used everywhere.

import { $, esc } from './dom.ts';
import { state } from './state.ts';
import type { CardT } from './types.ts';

export const RARITY_COLOR = { common: '#9aa3b5', uncommon: '#6fe3a5', rare: '#6fb7ff', epic: '#c98aff', legendary: '#ffd166' };

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

export function cardEl(card: CardT, { qty, onClick, foil }: { qty?: number; onClick?: () => void; foil?: boolean } = {}) {
  card = card || RETIRED_CARD;
  const el = document.createElement('div');
  el.className = `tcg-card r-${card.rarity}` + (foil ? ' foil' : '');
  el.style.setProperty('--rc', RARITY_COLOR[card.rarity]);
  el.innerHTML = cardSVG(card) + '<div class="card-selected-tick">✓</div>';
  if (foil) el.insertAdjacentHTML('beforeend', '<div class="foil-badge">✦ FOIL</div>');
  if (qty > 1) el.insertAdjacentHTML('beforeend', `<div class="card-qty">×${qty}</div>`);
  el.addEventListener('click', onClick || (() => zoomCard(card, foil)));
  return el;
}

// Combat stat readout for a card (foils fight ~10% harder)
export function statLine(card, foil) {
  const c = card && card.combat;
  if (!c) return '';
  const v = (x) => Math.round(x * (foil ? 1.1 : 1));
  return `<div class="stat-line">♥${v(c.maxHp)} ⚔${v(c.atk)} 🛡${v(c.def)} ⚡${v(c.spd)} · <span class="special-name" title="${esc(c.special.desc)}">${esc(c.special.name)}</span></div>`;
}

export function zoomCard(card: CardT, foil?: boolean) {
  const overlay = $('#zoom-overlay');
  overlay.classList.remove('closing');
  const stats = document.createElement('div');
  stats.className = 'zoom-stats';
  stats.innerHTML = statLine(card, foil);
  $('#zoom-holder').replaceChildren(cardEl(card, { onClick: closeZoom, foil }), stats);
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
