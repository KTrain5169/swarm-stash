// Packs: odds readout, buying a pack, and the tear-open reveal ceremony.

import { $, toast } from './dom.ts';
import { state, cardById } from './state.ts';
import { api, handleUnlocks } from './api.ts';
import { cardEl, zoomCard } from './cards.ts';
import { refreshMe } from './auth.ts';

export function renderOdds() {
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
    const r = await api('/api/packs/open', { method: 'POST' });
    // Don't announce achievements yet — "Heart of the Swarm unlocked!" before
    // the flip spoils what's in the pack. Show the wallet minus the pending
    // achievement rewards, and pay out + toast once every card is revealed.
    const pendingRewards = (r.unlocked || []).reduce((s, a) => s + a.reward, 0);
    if (state.me) {
      state.me.neuros = r.neuros - pendingRewards;
      $('#neuro-count').textContent = state.me.neuros;
    }
    runPackOpening(r.cards, () => handleUnlocks(r));
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
});

// Pokemon-TCG-style opening: rip the pack open by dragging it upward (a
// plain tap still works as a fallback for anyone who doesn't drag) — the
// pack visually splits into two halves that fly apart, same as tearing a
// real foil pack. Pulls then reveal strictly one at a time from a stacked
// deck: only the top card is interactive, the rest wait locked underneath.
// Each reveal slides onto a same-size face-up pile beside (or, on narrow
// screens, below) the deck — same size so the freshly flipped card stays
// readable; once every card has been drawn the pile spreads out into a
// row — the "here's everything you got" beat. Pulls are re-ordered (never
// re-rolled) so the best card in the pack — whatever actually rolled
// server-side — lands last. No instructional text; the grip cursor, drag
// feedback, and pulsing highlight on the live card are the only affordances.
function runPackOpening(pulls, onAllRevealed) {
  const byId = cardById();
  const overlay = $('#pack-overlay');
  const stage = $('#pack-stage');
  overlay.classList.remove('hidden');
  $('#pack-done').classList.add('hidden');
  stage.classList.remove('stacked');

  const wrap = document.createElement('div');
  wrap.className = 'pack-wrap';
  const pack = document.createElement('div');
  pack.className = 'pack';
  pack.innerHTML = '<div class="pack-shine"></div><div class="pack-heart">♥</div><div class="pack-title">NEURO<br>MEME PACK</div>';
  wrap.appendChild(pack);
  stage.replaceChildren(wrap);

  const TEAR_DRAG_PX = 130; // horizontal drag distance across the pack for a full rip
  let dragging = false, torn = false, startX = 0;
  let top = null, bottom = null; // the torn halves — created the moment a drag starts

  const ensureHalves = () => {
    if (top) return;
    pack.style.visibility = 'hidden';
    top = pack.cloneNode(true);
    bottom = pack.cloneNode(true);
    top.className = 'pack pack-half pack-half-top';
    bottom.className = 'pack pack-half pack-half-bottom';
    top.style.visibility = bottom.style.visibility = 'visible';
    top.style.transition = bottom.style.transition = 'none';
    wrap.append(top, bottom);
  };
  const dropHalves = () => {
    if (!top) return;
    top.remove(); bottom.remove();
    top = bottom = null;
    pack.style.visibility = '';
  };

  // Live tear preview: dragging your mouse across the pack peels the two
  // halves apart in real time, tracked straight off the pointer position —
  // not a canned animation that just plays once a threshold is crossed.
  const applyDragVisual = (dx) => {
    ensureHalves();
    const t = Math.min(1, dx / TEAR_DRAG_PX);
    top.style.transform = `translateY(${-t * 44}px) rotate(${-t * 15}deg)`;
    bottom.style.transform = `translateY(${t * 16}px) rotate(${t * 6}deg)`;
    const flash = t > .5 ? (t - .5) * 2 : 0;
    top.style.filter = bottom.style.filter = flash ? `brightness(${1 + flash * 1.5})` : '';
  };
  const springBack = () => {
    if (!top) return;
    top.style.transition = bottom.style.transition = 'transform .35s cubic-bezier(.34,1.56,.64,1), filter .2s';
    top.style.transform = bottom.style.transform = '';
    top.style.filter = bottom.style.filter = '';
    setTimeout(dropHalves, 360);
  };

  pack.addEventListener('pointerdown', (e) => {
    if (torn) return;
    dragging = true;
    startX = e.clientX;
    pack.setPointerCapture(e.pointerId);
    pack.classList.add('gripping');
  });
  pack.addEventListener('pointermove', (e) => {
    if (!dragging || torn) return;
    const dx = Math.abs(e.clientX - startX);
    applyDragVisual(dx);
    if (dx >= TEAR_DRAG_PX) tear();
  });
  const releaseDrag = () => {
    if (!dragging) return;
    dragging = false;
    pack.classList.remove('gripping');
    if (!torn) springBack();
  };
  pack.addEventListener('pointerup', releaseDrag);
  pack.addEventListener('pointercancel', releaseDrag);
  pack.addEventListener('click', tear); // tap-to-open still works without dragging

  function tear() {
    if (torn) return;
    torn = true;
    dragging = false;
    ensureHalves();

    // Finish the rip from wherever the live drag left the halves — fling
    // them the rest of the way apart with a bright flash at the tear line.
    top.style.transition = bottom.style.transition = 'transform .5s cubic-bezier(.5,0,.75,.3), opacity .45s ease-in .15s';
    requestAnimationFrame(() => {
      top.style.transform = 'translateY(-170px) rotate(-22deg)';
      bottom.style.transform = 'translateY(170px) rotate(16deg)';
      top.style.opacity = '0';
      bottom.style.opacity = '0';
    });
    const burst = document.createElement('div');
    burst.className = 'pack-burst';
    wrap.appendChild(burst);
    setTimeout(dealStack, 600);
  }

  function dealStack() {
    stage.replaceChildren();
    stage.classList.add('stacked');
    const pile = document.createElement('div');
    pile.id = 'stack-pile';
    const revealedRow = document.createElement('div');
    revealedRow.id = 'stack-revealed';
    revealedRow.classList.add('mini');
    // revealedRow first in source order → sits to the left of the pile on a
    // normal row layout; the mobile media query flips it below via `order`.
    stage.append(revealedRow, pile);

    // Weakest first, strongest (foils nudge ahead of a same-rarity non-foil)
    // saved for the final reveal.
    const order = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
    const deck = pulls.slice().sort((a, b) => {
      const ca = byId[a.cardId], cb = byId[b.cardId];
      return (order[ca.rarity] + (a.foil ? .5 : 0)) - (order[cb.rarity] + (b.foil ? .5 : 0));
    });

    const flips = deck.map((inst, i) => {
      const card = byId[inst.cardId];
      const flip = document.createElement('div');
      flip.className = `flip-card locked r-${card.rarity}` + (inst.foil ? ' foil-pull' : '');
      flip.style.zIndex = String(deck.length - i);
      flip.style.transform = `translate(${i * 3}px, ${i * -3}px) rotate(${(i % 2 ? 1 : -1) * i * 1.3}deg)`;
      flip.innerHTML = `
        <div class="flip-inner">
          <div class="flip-face flip-back-face">♥</div>
          <div class="flip-face flip-front-face"></div>
        </div>`;
      $('.flip-front-face', flip).appendChild(cardEl(card, { onClick: () => {}, foil: inst.foil }));
      pile.appendChild(flip);
      return { flip, card, inst };
    });

    let next = 0;
    const armNext = () => {
      if (next >= flips.length) { finishReveal(); return; }
      const { flip } = flips[next];
      flip.classList.remove('locked');
      flip.classList.add('next-reveal');
      flip.addEventListener('click', onReveal, { once: true });
    };
    const onReveal = () => {
      const { flip, card, inst } = flips[next];
      const myIndex = next;
      flip.classList.remove('next-reveal');
      flip.classList.add('flipped');
      if (inst.foil) toast(`✦ FOIL ${card.name}! shiny shiny shiny`);
      if (card.rarity === 'legendary') toast(`🌟 LEGENDARY PULL: ${card.name}!!`);
      setTimeout(() => {
        // FLIP: grab where the card sits now (in the pile), re-parent it into
        // the mini stack, then animate away the resulting jump so it visibly
        // slides across into its small spot instead of teleporting there.
        const startRect = flip.getBoundingClientRect();
        flip.style.transform = '';
        flip.style.zIndex = myIndex + 1; // later pulls stack visually on top of the mini pile
        flip.classList.add('settled', 'mini-settled');
        revealedRow.appendChild(flip);
        const endRect = flip.getBoundingClientRect();
        const dx = startRect.left - endRect.left, dy = startRect.top - endRect.top;
        flip.style.transition = 'none';
        flip.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          flip.style.transition = 'transform .45s cubic-bezier(.2,.8,.3,1)';
          flip.style.transform = '';
        });
      }, 680); // let the flip animation land before it slides into the mini pile
      next++;
      armNext();
    };
    const finishReveal = () => {
      $('#pack-done').classList.remove('hidden');
      // now that everything is face-up, achievements can't spoil anything
      if (onAllRevealed) setTimeout(onAllRevealed, 750);
      // Give the last card a beat to land, then keep every card at the same
      // small size — just drop the now-empty pile and re-center the row.
      setTimeout(() => {
        pile.style.display = 'none';
        revealedRow.classList.remove('mini');
        revealedRow.classList.add('spread');
        flips.forEach(({ flip, card, inst }, i) => {
          flip.classList.remove('mini-settled');
          flip.style.zIndex = '';
          flip.style.transform = '';
          flip.style.animationDelay = `${i * 70}ms`;
          flip.classList.add('spread-in');
          flip.style.cursor = 'zoom-in';
          flip.onclick = () => zoomCard(card, inst.foil);
        });
      }, 750);
    };
    armNext();
  }
}
$('#pack-done').addEventListener('click', () => {
  $('#pack-overlay').classList.add('hidden');
  refreshMe();
  toast('♥ cards added to your binder');
});
