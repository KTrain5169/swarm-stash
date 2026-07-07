// Swarm: the member list and other players' public binders.

import { $, esc } from './dom.ts';
import { state, cardById } from './state.ts';
import { api } from './api.ts';
import { cardEl } from './cards.ts';
import { nav, registerView } from './nav.ts';
import { renderShowcase, groupCollection, groupCard, groupFoil } from './binder.ts';

async function renderSwarm() {
  const { users } = await api('/api/users');
  const grid = $('#user-grid');
  grid.replaceChildren(...users.filter((u) => u.id !== state.me.id).map((u, i) => {
    const el = document.createElement('div');
    el.className = 'user-card';
    el.style.setProperty('--i', String(i));
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
registerView('swarm', renderSwarm);

async function openMember(userId) {
  const { user, cards, showcase } = await api(`/api/collection?user=${encodeURIComponent(userId)}`);
  state.member = { user, cards };
  renderShowcase('member-showcase', 'member-showcase-cards', showcase || [], cards);
  $('#member-head').innerHTML = `
    <img src="${user.avatar}" alt="">
    <div><h2>${esc(user.name)}${user.bot ? ' <span class="bot-tag">SWARM BOT</span>' : ''}</h2>
    <div class="u-stats">${user.cardCount} cards · ${user.uniqueCount} unique</div></div>`;
  const byId = cardById();
  const grid = $('#member-grid');
  grid.replaceChildren();
  [...groupCollection(cards).entries()].forEach(([key, insts], i) => {
    const cell = document.createElement('div');
    cell.className = 'card-cell';
    cell.style.setProperty('--i', String(i));
    cell.appendChild(cardEl(byId[groupCard(key)], { qty: insts.length, foil: groupFoil(key) }));
    grid.appendChild(cell);
  });
  nav('member');
}
