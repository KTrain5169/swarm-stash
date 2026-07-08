// The binder: your collection grid with recycle / sell / pin actions, plus
// the collection helpers other views reuse (loading, grouping, showcase row).

import { $, toast, askPrompt } from './dom.ts';
import { state, cardById } from './state.ts';
import { api, handleUnlocks } from './api.ts';
import { cardEl } from './cards.ts';
import { registerView } from './nav.ts';

let binderFilter = 'all';

export async function loadCollection() {
  const { cards, showcase } = await api('/api/collection');
  state.collection = cards;
  state.showcase = showcase || [];
}

export function renderShowcase(rowId, cardsId, instIds, collection) {
  const byId = cardById();
  const insts = instIds.map((id) => collection.find((c) => c.instanceId === id)).filter(Boolean);
  $(`#${rowId}`).classList.toggle('hidden', insts.length === 0);
  $(`#${cardsId}`).replaceChildren(...insts.map((inst) => cardEl(byId[inst.cardId], { foil: inst.foil })));
}

// Groups instances by card, foils separately from normal copies.
export function groupCollection(cards) {
  const map = new Map();
  for (const inst of cards) {
    const key = inst.cardId + (inst.foil ? '|foil' : '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(inst);
  }
  return map;
}
export const groupCard = (key) => key.split('|')[0];
export const groupFoil = (key) => key.endsWith('|foil');

async function renderBinder() {
  await loadCollection();
  const byId = cardById();
  const groups = groupCollection(state.collection);
  const ownedIds = new Set(state.collection.map((c) => c.cardId));
  const foilCount = state.collection.filter((c) => c.foil).length;
  $('#binder-stats').innerHTML = `
    <span class="stat-chip"><b>${state.collection.length}</b> cards</span>
    <span class="stat-chip"><b>${ownedIds.size}</b>/<b>${state.cards.length}</b> unique</span>
    <span class="stat-chip"><b>${foilCount}</b> ✦ foil${foilCount === 1 ? '' : 's'}</span>
    <span class="stat-chip">set ${Math.round(ownedIds.size / state.cards.length * 100)}% complete</span>`;
  renderShowcase('binder-showcase', 'binder-showcase-cards', state.showcase, state.collection);

  const filters = ['all', ...Object.keys(state.series), 'legendary'];
  $('#binder-filters').replaceChildren(...filters.map((f) => {
    const b = document.createElement('button');
    if (f === 'all') b.textContent = 'All';
    else if (f === 'legendary') b.textContent = '★ Legendary';
    else {
      const inSeries = state.cards.filter((c) => c.series === f);
      const owned = inSeries.filter((c) => ownedIds.has(c.id)).length;
      b.textContent = `${state.series[f].label} ${owned}/${inSeries.length}`;
      if (inSeries.length && owned === inSeries.length) b.classList.add('complete');
    }
    b.classList.toggle('active', binderFilter === f);
    b.onclick = () => { binderFilter = f; renderBinder(); };
    return b;
  }));

  const grid = $('#binder-grid');
  grid.replaceChildren();
  const order = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
  const entries = [...groups.entries()]
    .filter(([key]) => {
      const c = byId[groupCard(key)];
      return binderFilter === 'all' || c.series === binderFilter || c.rarity === binderFilter;
    })
    .sort((a, b) => {
      const ca = byId[groupCard(a[0])], cb = byId[groupCard(b[0])];
      return order[ca.rarity] - order[cb.rarity] || ca.name.localeCompare(cb.name) || groupFoil(b[0]) - groupFoil(a[0]);
    });

  entries.forEach(([key, insts], i) => {
    const card = byId[groupCard(key)];
    const foil = groupFoil(key);
    const cell = document.createElement('div');
    cell.className = 'card-cell';
    cell.style.setProperty('--i', String(i));
    cell.appendChild(cardEl(card, { qty: insts.length, foil }));
    const value = state.rarities[card.rarity].value * (foil ? state.config.foilMult : 1);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const sell = document.createElement('button');
    sell.textContent = `recycle · ⚡${value}`;
    sell.title = insts.length > 1 ? 'Recycle one copy for neuros' : 'Recycle this card for neuros';
    sell.onclick = async () => {
      const label = foil ? `foil "${card.name}"` : `"${card.name}"`;
      if (insts.length === 1 && !confirm(`Recycle your only ${label} for ⚡${value}?`)) return;
      try {
        const r = await api(`/api/cards/${insts[0].instanceId}/sell`, { method: 'POST' });
        toast(`♻️ recycled ${card.name} for ⚡${r.gained}`);
        handleUnlocks(r);
        renderBinder();
      } catch (err) { toast(err.message, true); }
    };
    actions.appendChild(sell);

    const list = document.createElement('button');
    list.textContent = 'sell 💰';
    list.title = 'List one copy on the market';
    list.onclick = async () => {
      const input = await askPrompt({ title: `List "${card.name}"${foil ? ' (foil)' : ''}`, message: 'Price in neuros', value: value * 2, min: 1 });
      if (input === null) return;
      const price = Math.floor(Number(input));
      if (!price || price < 1) return toast('enter a valid price', true);
      try {
        await api('/api/market', { method: 'POST', body: { instanceId: insts[0].instanceId, price } });
        toast(`💰 listed ${card.name} for ⚡${price}`);
      } catch (err) { toast(err.message, true); }
    };
    actions.appendChild(list);

    const pinned = insts.some((x) => state.showcase.includes(x.instanceId));
    const pin = document.createElement('button');
    pin.textContent = pinned ? 'unpin' : 'pin 📌';
    pin.title = 'Pin to the showcase on your public binder (max 6)';
    pin.onclick = async () => {
      let next = state.showcase.filter((id) => !insts.some((x) => x.instanceId === id));
      if (!pinned) {
        if (state.showcase.length >= 6) return toast('showcase is full — unpin something first (6 max)', true);
        next = [...state.showcase, insts[0].instanceId];
      }
      try {
        const r = await api('/api/showcase', { method: 'POST', body: { instanceIds: next } });
        state.showcase = r.showcase;
        renderBinder();
      } catch (err) { toast(err.message, true); }
    };
    actions.appendChild(pin);

    cell.appendChild(actions);
    grid.appendChild(cell);
  });
  $('#binder-empty').classList.toggle('hidden', entries.length > 0);
}

registerView('binder', renderBinder);
