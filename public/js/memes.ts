// The meme portal: upload form, your submissions, the Meme of the Week vote,
// and the moderator-only review queue. Mirrors routes/memes.ts on the server.

import { $, esc, toast, tradeBtn } from './dom.ts';
import { state } from './state.ts';
import { api, handleUnlocks, refreshCatalog } from './api.ts';
import { nav, registerView } from './nav.ts';
import { refreshMe } from './auth.ts';

// ─── Meme submission portal ──────────────────────────────────────────────────
let memeData = null; // pending upload as data URL

function loadMemeFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return toast('PNG, JPG, GIF or WEBP only', true);
  if (file.size > 5 * 1024 * 1024) return toast('max 5MB — compress that meme', true);
  const reader = new FileReader();
  reader.onload = () => {
    memeData = reader.result;
    const img = $('#drop-preview');
    img.src = memeData;
    img.classList.remove('hidden');
    $('#drop-inner').classList.add('hidden');
    if (!$('#meme-name').value) $('#meme-name').value = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 48);
  };
  reader.readAsDataURL(file);
}

$('#meme-file').addEventListener('change', (e) => loadMemeFile(e.target.files[0]));
const dz = $('#drop-zone');
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragging'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('dragging');
  loadMemeFile(e.dataTransfer.files[0]);
});

$('#submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!memeData) return toast('pick a meme first', true);
  const name = $('#meme-name').value.trim();
  if (!name) return toast('give your meme a name', true);
  const btn = $('#submit-meme-btn');
  btn.disabled = true;
  try {
    const r = await api('/api/memes', { method: 'POST', body: { name, data: memeData } });
    toast(r.status === 'approved' ? `🎉 ${r.note}` : `📨 ${r.note}`);
    handleUnlocks(r);
    memeData = null;
    $('#drop-preview').classList.add('hidden');
    $('#drop-inner').classList.remove('hidden');
    $('#meme-name').value = '';
    $('#meme-file').value = '';
    await refreshCatalog();
    renderMySubmissions();
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
});

async function renderMySubmissions() {
  $('#submit-hint').textContent = state.config.moderation
    ? 'Submissions are reviewed by a moderator. Approved memes are minted as cards — you get 2 copies.'
    : 'No moderator configured: memes are minted instantly and you get 2 copies.';
  const { memes } = await api('/api/memes/mine');
  const holder = $('#my-memes');
  if (!memes.length) { holder.innerHTML = '<p class="empty-note">Nothing yet. Feed the swarm.</p>'; return; }
  holder.replaceChildren(...memes.map((m) => {
    const row = document.createElement('div');
    row.className = 'meme-row';
    row.innerHTML = `
      <img src="/memes/${m.file}" alt="" onerror="this.style.visibility='hidden'">
      <div class="meme-row-info">
        <b>${esc(m.name)}</b>
        <span class="r-${m.rarity}">${m.rarity}</span>
      </div>
      <span class="status-chip status-${m.status === 'approved' ? 'accepted' : m.status === 'rejected' ? 'declined' : 'pending'}">${m.status}</span>`;
    return row;
  }));
}

// ─── Meme of the week vote ───────────────────────────────────────────────────
async function renderVote() {
  const { week, candidates, myVote, lastWinner } = await api('/api/vote');
  $('#vote-week').textContent = week;
  $('#vote-winner').innerHTML = lastWinner
    ? `<div class="vote-winner">👑 <b>${esc(lastWinner.name)}</b> by ${esc(lastWinner.submitterName)} won ${lastWinner.week} — the card is now <span class="r-${lastWinner.rarity}">${lastWinner.rarity}</span>!</div>`
    : '';
  const list = $('#vote-list');
  list.replaceChildren(...candidates.map((m) => {
    const row = document.createElement('div');
    row.className = 'meme-row' + (myVote === m.id ? ' voted' : '');
    row.innerHTML = `
      <img src="/memes/${m.file}" alt="">
      <div class="meme-row-info"><b>${esc(m.name)}</b><span>by ${esc(m.submitterName)} · <span class="r-${m.rarity}">${m.rarity}</span></span></div>
      <span class="vote-count">${m.votes} 🗳️</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn-ghost vote-btn';
    if (m.submitterId === state.me.id) {
      btn.textContent = 'yours';
      btn.disabled = true;
    } else if (myVote === m.id) {
      btn.textContent = 'voted ✓';
      btn.classList.add('active');
    } else {
      btn.textContent = 'vote';
      btn.onclick = async () => {
        try {
          await api('/api/vote', { method: 'POST', body: { memeId: m.id } });
          toast(`🗳️ voted for "${m.name}"`);
          renderVote();
        } catch (err) { toast(err.message, true); }
      };
    }
    row.appendChild(btn);
    return row;
  }));
  $('#vote-empty').classList.toggle('hidden', candidates.length > 0);
}

registerView('submit', () => { renderMySubmissions(); renderVote(); });

// ─── Mod queue ───────────────────────────────────────────────────────────────
async function renderQueue() {
  let memes;
  try { ({ memes } = await api('/api/memes/queue')); }
  catch (err) { toast(err.message, true); return nav('binder'); }
  const list = $('#queue-list');
  list.replaceChildren(...memes.map((m) => {
    const row = document.createElement('div');
    row.className = 'queue-row';
    row.innerHTML = `
      <img class="queue-img" src="/memes/${m.file}" alt="">
      <div class="queue-info">
        <b>${esc(m.name)}</b>
        <span>by ${esc(m.submitterName)} · rolls as <span class="r-${m.rarity}">${m.rarity}</span></span>
        <span class="t-when">${new Date(m.createdAt).toLocaleString()}</span>
      </div>
      <div class="trade-actions"></div>`;
    const actions = $('.trade-actions', row);
    actions.append(
      tradeBtn('Approve ✓', 'btn-primary accept', async () => {
        try { await api(`/api/memes/${m.id}/approve`, { method: 'POST' }); toast(`🎉 "${m.name}" minted as a card`); await refreshCatalog(); renderQueue(); refreshMe(); }
        catch (err) { toast(err.message, true); }
      }),
      tradeBtn('Reject', 'btn-ghost', async () => {
        try { await api(`/api/memes/${m.id}/reject`, { method: 'POST' }); toast('meme rejected'); renderQueue(); refreshMe(); }
        catch (err) { toast(err.message, true); }
      }),
    );
    return row;
  }));
  $('#queue-empty').classList.toggle('hidden', memes.length > 0);
}
registerView('modqueue', renderQueue);
