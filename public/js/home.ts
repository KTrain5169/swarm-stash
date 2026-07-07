// The logged-out home view: holographic hero cards + the ambient chat ticker.

import { $, esc } from './dom.ts';
import { cardById } from './state.ts';
import { cardEl, zoomCard } from './cards.ts';

// Cards get a cursor-tracked holographic tilt. The key fix over a plain CSS
// :hover effect: transform + shine position are driven from JS so pointerleave
// can explicitly animate both back to their resting state — no stuck tilt,
// no shine frozen mid-sweep.
function attachHoloTilt(el) {
  const cs = getComputedStyle(el);
  const rot = (cs.getPropertyValue('--base-rot') || '0deg').trim();
  const ty = (cs.getPropertyValue('--base-y') || '0px').trim();
  const base = `rotate(${rot}) translateY(${ty})`;
  el.dataset.baseTransform = base;

  const reset = () => {
    // force a reflow so the browser commits the transition change before the
    // transform change lands in the same tick — otherwise it can jump straight
    // to the resting position instead of easing into it.
    void el.offsetWidth;
    el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1), --holo-o .6s ease-out';
    el.style.transform = base;
    el.style.setProperty('--holo-o', '0');
  };
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const tiltX = (py - .5) * -16;
    const tiltY = (px - .5) * 16;
    el.style.transition = 'transform .06s linear';
    el.style.transform = `${base} rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.06)`;
    el.style.setProperty('--holo-x', `${px * 100}%`);
    el.style.setProperty('--holo-y', `${py * 100}%`);
    el.style.setProperty('--holo-o', '1');
  });
  el.addEventListener('pointerleave', reset);
  el.addEventListener('pointercancel', reset);
  reset();
}

export function renderHeroCards() {
  const showcase = ['gymbag', 'buh', 'evil-takeover', 'tutel'];
  const byId = cardById();
  const els = showcase.map((id) => cardEl(byId[id], { onClick: () => zoomCard(byId[id]) }));
  $('#hero-cards').replaceChildren(...els);
  els.forEach(attachHoloTilt);
}

// ─── Hero chat ticker (ambient flavor, not real data) ───────────────────────
export function renderChatTicker() {
  const lines = [
    ['sw4rm_unit', 'opened a legendary?? shut UP'],
    ['crumbboi', 'trade check, need a gymbag pls'],
    ['anon4021', 'buh core is undefeated fr'],
    ['neuro_enjoyer', 'dad would be so proud of this pull'],
    ['filian_fan', 'recycling my 40th common again lol'],
    ['vedal_stan', 'i just want ONE (1) buh card'],
    ['chatbot9000', 'is the evil theme lore accurate'],
    ['swarm_bot', 'new pack drop in 3... 2...'],
    ['tutel_truther', 'binder 61% complete, let him cook'],
    ['gymbag_god', 'holo pulled, screenshot it, never delete'],
  ];
  const rows = lines.map(([who, msg]) => `<div><span class="who">${esc(who)}:</span> ${esc(msg)}</div>`).join('');
  $('#chat-ticker').innerHTML = `<div class="ticker-track">${rows}${rows}</div>`;
}
