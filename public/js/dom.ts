// Tiny DOM helpers used by every view: query, escape, toasts, prompt modal.

// DOM helpers return `any` on purpose: the SPA reaches for .value/.src/.dataset
// on hundreds of elements and per-site casts would drown the code. Annotate at
// the use site when it matters.
export const $ = (s: string, el: ParentNode = document): any => el.querySelector(s);
export const $$ = (s: string, el: ParentNode = document): any[] => [...el.querySelectorAll(s)];

export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function toast(msg: string, isError = false): void {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3900);
}

// Small button factory used by the trades/arena/queue action rows.
export function tradeBtn(label, cls, fn) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.onclick = fn;
  return b;
}

// In-page replacement for window.prompt() — some embeds (Electron webviews,
// in-app browsers, etc) don't support the native prompt() dialog at all and
// throw "prompt() is not supported" instead of just no-oping. This renders
// the same request as a small modal and resolves with the entered value, or
// null on cancel — same contract as window.prompt so call sites barely change.
export function askPrompt({ title = 'Enter a value', message = '', value = '', min, max }:
                          { title?: string; message?: string; value?: string | number; min?: number; max?: number } = {}): Promise<string | null> {
  const overlay = $('#prompt-overlay');
  const input = $('#prompt-input');
  $('#prompt-title').textContent = title;
  $('#prompt-message').textContent = message;
  input.value = value;
  if (min != null) input.min = min; else input.removeAttribute('min');
  if (max != null) input.max = max; else input.removeAttribute('max');
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => { input.focus(); input.select(); });

  return new Promise((resolve) => {
    const cleanup = () => {
      overlay.classList.add('hidden');
      $('#prompt-ok').removeEventListener('click', onOk);
      $('#prompt-cancel').removeEventListener('click', onCancel);
      $('#prompt-cancel-x').removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
    };
    const onOk = () => { cleanup(); resolve(input.value); };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      if (e.key === 'Escape') onCancel();
    };
    $('#prompt-ok').addEventListener('click', onOk);
    $('#prompt-cancel').addEventListener('click', onCancel);
    $('#prompt-cancel-x').addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}
