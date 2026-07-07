// Trading: the propose-trade modal (from a member's binder) and the inbox.

import { $, esc, toast, tradeBtn } from './dom.ts';
import { state, cardById } from './state.ts';
import { api, handleUnlocks } from './api.ts';
import { cardEl } from './cards.ts';
import { nav, registerView } from './nav.ts';
import { loadCollection } from './binder.ts';

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
    const el = cardEl(card, { foil: inst.foil, onClick: () => {
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
    const r = await api('/api/trades', { method: 'POST', body: {
      toId: state.member.user.id,
      offer: [...picks.give], request: [...picks.get],
      message: $('#trade-message').value,
    }});
    $('#trade-modal').classList.add('hidden');
    if (r.trade.status === 'accepted') toast(`🤝 ${state.member.user.name} accepted instantly!`);
    else if (r.trade.status === 'declined') toast(`😤 ${state.member.user.name} declined — offer more value`, true);
    else toast('📨 trade offer sent!');
    handleUnlocks(r);
    nav('trades');
  } catch (err) { toast(err.message, true); }
});

// ─── Trades inbox ────────────────────────────────────────────────────────────
export async function loadTrades() {
  const { trades, users } = await api('/api/trades');
  state.trades = trades;
  state.tradeUsers = users;
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
        holder.appendChild(cardEl(byId[inst.cardId], { foil: inst.foil }));
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
registerView('trades', renderTrades);

async function actTrade(id, action) {
  try {
    const r = await api(`/api/trades/${id}/${action}`, { method: 'POST' });
    toast(action === 'accept' ? '🤝 trade complete! cards swapped.' : `trade ${action}ed`);
    handleUnlocks(r);
    renderTrades();
  } catch (err) { toast(err.message, true); renderTrades(); }
}
