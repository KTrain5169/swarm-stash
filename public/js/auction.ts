// Auction house: live countdowns, bidding, and the start-auction picker.

import { $, $$, esc, toast, askPrompt } from './dom.ts';
import { state, cardById } from './state.ts';
import { api } from './api.ts';
import { cardEl } from './cards.ts';
import { registerView, onNav } from './nav.ts';
import { loadCollection } from './binder.ts';
import type { AuctionT } from './types.ts';

let auctionTickTimer: ReturnType<typeof setInterval> | undefined;

onNav((view) => { if (view !== 'auction') clearInterval(auctionTickTimer); });

// Renders time-left as "3d 4h", "2h 15m", "48s" etc, down to the second so
// the last stretch of a hot auction actually feels like it's ticking down.
function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'ending…';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${sec}s left`;
  return `${sec}s left`;
}

async function renderAuctions() {
  clearInterval(auctionTickTimer);
  const { auctions } = await api('/api/market/auctions') as { auctions: AuctionT[] };
  const byId = cardById();
  const grid = $('#auction-grid');
  grid.replaceChildren(...auctions.map((a, i) => {
    const card = byId[a.card.cardId];
    const mine = a.sellerId === state.me.id;
    const winning = a.currentBidderId === state.me.id;
    const cell = document.createElement('div');
    cell.className = 'card-cell' + (mine ? ' auction-mine' : '') + (winning ? ' auction-winning' : '');
    cell.style.setProperty('--i', String(i));
    cell.appendChild(cardEl(card, { foil: a.card.foil }));

    const info = document.createElement('div');
    info.className = 'auction-info';
    info.innerHTML = `
      <span class="market-seller" title="seller">${esc(a.sellerName)}</span>
      <span class="auction-bid">⚡${a.currentBid ?? a.startingBid}${a.currentBid == null ? ' (starting)' : ''}</span>
      <span>${a.bidCount} bid${a.bidCount === 1 ? '' : 's'}${winning && !mine ? ' · you\'re winning!' : ''}</span>
      <span class="auction-countdown" data-ends="${a.endsAt}"></span>`;
    cell.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const btn = document.createElement('button');
    if (mine) {
      btn.textContent = a.bidCount > 0 ? 'has bids' : 'cancel ✕';
      btn.disabled = a.bidCount > 0;
      btn.onclick = async () => {
        try { await api(`/api/market/auctions/${a.id}/cancel`, { method: 'POST' }); toast('auction cancelled'); renderAuctions(); }
        catch (err) { toast(err.message, true); }
      };
    } else {
      const floor = (a.currentBid ?? a.startingBid - 1) + 1;
      btn.textContent = `bid ≥⚡${floor}`;
      btn.onclick = async () => {
        const input = await askPrompt({ title: `Bid on "${card.name}"${a.card.foil ? ' (foil)' : ''}`, message: `Minimum ⚡${floor}`, value: floor, min: floor });
        if (input === null) return;
        const amount = Math.floor(Number(input));
        if (!amount || amount < floor) return toast(`bid must be at least ⚡${floor}`, true);
        try {
          const r = await api(`/api/market/auctions/${a.id}/bid`, { method: 'POST', body: { amount } });
          toast(`🔨 bid ⚡${amount} on ${card.name}`);
          if (state.me) { state.me.neuros = r.neuros; $('#neuro-count').textContent = r.neuros; }
          renderAuctions();
        } catch (err) { toast(err.message, true); }
      };
    }
    actions.appendChild(btn);
    cell.appendChild(actions);
    return cell;
  }));
  $('#auction-empty').classList.toggle('hidden', auctions.length > 0);

  const tick = () => {
    let anyDue = false;
    Array.from(grid.querySelectorAll('.auction-countdown')).forEach((el: any) => {
      const msLeft = Number(el.dataset.ends) - Date.now();
      el.textContent = fmtCountdown(msLeft);
      el.classList.toggle('ending-soon', msLeft > 0 && msLeft < 5 * 60e3);
      if (msLeft <= 0) anyDue = true;
    });
    if (anyDue) { clearInterval(auctionTickTimer); renderAuctions(); } // an auction just settled — refresh from the server
  };
  tick();
  auctionTickTimer = setInterval(tick, 1000);
}
registerView('auction', renderAuctions);

// ─── Start-auction picker (single-card select) ──────────────────────────────
const auctionPick = new Set<string>(); // capped at 1 — reuses the multi-select Set pattern

$('#start-auction-btn').addEventListener('click', async () => {
  await loadCollection();
  auctionPick.clear();
  $('#apick-count').textContent = '0/1';
  const byId = cardById();
  $('#apick-grid').replaceChildren(...state.collection.map((inst) => {
    const card = byId[inst.cardId];
    const el = cardEl(card, { foil: inst.foil, onClick: () => {
      const wasSelected = auctionPick.has(inst.instanceId);
      auctionPick.clear();
      $$('#apick-grid .tcg-card').forEach((c) => c.classList.remove('selected'));
      if (!wasSelected) { auctionPick.add(inst.instanceId); el.classList.add('selected'); }
      $('#apick-count').textContent = `${auctionPick.size}/1`;
    }});
    return el;
  }));
  $('#auction-start-bid').value = 100;
  $('#auction-duration').value = 24;
  $('#auction-modal').classList.remove('hidden');
});
$('#auction-modal-close').addEventListener('click', () => $('#auction-modal').classList.add('hidden'));

$('#auction-start-send').addEventListener('click', async () => {
  if (auctionPick.size !== 1) return toast('pick a card to auction', true);
  const startingBid = Math.floor(Number($('#auction-start-bid').value));
  const durationHours = Math.floor(Number($('#auction-duration').value));
  if (!startingBid || startingBid < 1) return toast('enter a valid starting bid', true);
  if (!durationHours || durationHours < 1 || durationHours > 168) return toast('duration must be 1–168 hours', true);
  try {
    const [instanceId] = auctionPick;
    await api('/api/market/auctions', { method: 'POST', body: { instanceId, startingBid, durationHours } });
    $('#auction-modal').classList.add('hidden');
    toast(`⏱ auction started — starting bid ⚡${startingBid}`);
    renderAuctions();
  } catch (err) { toast(err.message, true); }
});
