// Theme (Neuro ↔ Evil corruption toggle) + the floating hearts backdrop.

import { $, toast } from './dom.ts';

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
