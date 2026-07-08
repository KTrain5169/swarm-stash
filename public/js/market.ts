// Market: fixed-price buy-now listings. (Auctions live in auction.ts.)

import { $, esc, toast } from './dom.ts';
import { state, cardById } from './state.ts';
import { api, handleUnlocks } from './api.ts';
import { cardEl } from './cards.ts';
import { registerView } from './nav.ts';

async function renderBuyNow() {
  const { listings } = await api('/api/market');
  const byId = cardById();
  const grid = $('#market-grid');
  grid.replaceChildren(...listings.map((l, i) => {
    const card = byId[l.card.cardId];
    const cell = document.createElement('div');
    cell.className = 'card-cell';
    cell.style.setProperty('--i', String(i));
    cell.appendChild(cardEl(card, { foil: l.card.foil }));
    const mine = l.sellerId === state.me.id;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.innerHTML = `<span class="market-seller" title="seller">${esc(l.sellerName)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = mine ? 'delist ✕' : `buy · ⚡${l.price}`;
    btn.onclick = async () => {
      try {
        if (mine) {
          await api(`/api/market/${l.id}/cancel`, { method: 'POST' });
          toast('listing cancelled');
        } else {
          if (!confirm(`Buy ${card.name}${l.card.foil ? ' (foil)' : ''} from ${l.sellerName} for ⚡${l.price}?`)) return;
          const r = await api(`/api/market/${l.id}/buy`, { method: 'POST' });
          toast(`💰 bought ${card.name}!`);
          handleUnlocks(r);
        }
        renderBuyNow();
      } catch (err) { toast(err.message, true); renderBuyNow(); }
    };
    actions.appendChild(btn);
    cell.appendChild(actions);
    return cell;
  }));
  $('#market-empty').classList.toggle('hidden', listings.length > 0);
}
registerView('market', renderBuyNow);
