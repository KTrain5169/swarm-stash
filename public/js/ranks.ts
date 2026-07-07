// Ranks: leaderboard + the achievements grid.

import { $, esc } from './dom.ts';
import { state } from './state.ts';
import { api } from './api.ts';
import { registerView } from './nav.ts';

async function renderRanks() {
  const [{ board }, { defs, unlocked }] = await Promise.all([api('/api/leaderboard'), api('/api/achievements')]);
  const medals = ['🥇', '🥈', '🥉'];
  const list = $('#lb-list');
  list.replaceChildren(...board.map((u, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row' + (u.id === state.me.id ? ' me' : '');
    row.style.setProperty('--i', String(i));
    row.innerHTML = `
      <span class="lb-rank">${medals[i] || '#' + (i + 1)}</span>
      <img src="${u.avatar}" alt="">
      <span class="lb-name">${esc(u.name)}${u.id === state.me.id ? ' <span class="bot-tag">YOU</span>' : ''}</span>
      <span class="lb-stats">${u.unique} unique · ${u.foils} ✦ · ${u.achievements} 🏆</span>
      <span class="lb-score">⚡${u.score}</span>`;
    return row;
  }));
  $('#lb-empty').classList.toggle('hidden', board.length > 0);

  $('#ach-count').textContent = `${Object.keys(unlocked).length}/${defs.length}`;
  $('#ach-grid').replaceChildren(...defs.map((a) => {
    const el = document.createElement('div');
    el.className = 'ach' + (unlocked[a.id] ? ' unlocked' : '');
    el.title = unlocked[a.id] ? `Unlocked ${new Date(unlocked[a.id]).toLocaleDateString()}` : 'Locked';
    el.innerHTML = `
      <span class="ach-emoji">${a.emoji}</span>
      <div class="ach-info"><b>${esc(a.name)}</b><span class="ach-desc">${esc(a.desc)}</span></div>
      ${a.reward ? `<span class="ach-reward">+⚡${a.reward}</span>` : ''}`;
    return el;
  }));
}
registerView('ranks', renderRanks);
