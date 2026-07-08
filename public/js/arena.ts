// Arena: challenge modal, battle list, and the live battle screen.

import { $, esc, toast, tradeBtn } from './dom.ts';
import { state, cardById } from './state.ts';
import { api, handleUnlocks } from './api.ts';
import { cardEl, statLine, zoomCard } from './cards.ts';
import { nav, registerView, onNav } from './nav.ts';
import { loadCollection } from './binder.ts';
import type { FighterT } from './types.ts';

let battlePoll = null;
const battlePick = new Set();
let battleModalMode = null; // { type: 'challenge', toId, name } | { type: 'accept', battleId, name }

onNav((view) => { if (view !== 'battle') clearInterval(battlePoll); });

async function loadBattles() {
  const { battles, users } = await api('/api/battles');
  state.battles = battles;
  state.battleUsers = users;
  const needsMe = battles.filter((b) =>
    (b.status === 'pending' && b.toId === state.me.id) ||
    (b.status === 'active' && b.state.turn === state.me.id)).length;
  const badge = $('#battle-badge');
  badge.textContent = needsMe;
  badge.classList.toggle('hidden', needsMe === 0);
}

async function openBattleModal(mode) {
  battleModalMode = mode;
  battlePick.clear();
  await loadCollection();
  const byId = cardById();
  $('#battle-modal-title').textContent = mode.type === 'challenge' ? `Challenge ${mode.name}` : `Battle vs ${mode.name} — pick your team`;
  $('#battle-wager-row').classList.toggle('hidden', mode.type !== 'challenge');
  $('#battle-wager').value = 0;
  $('#bteam-count').textContent = '0/3';
  $('#bteam-grid').replaceChildren(...state.collection.map((inst) => {
    const card = byId[inst.cardId];
    const cell = document.createElement('div');
    cell.className = 'pick-cell';
    const el = cardEl(card, { foil: inst.foil, onClick: () => {
      if (battlePick.has(inst.instanceId)) battlePick.delete(inst.instanceId);
      else if (battlePick.size < 3) battlePick.add(inst.instanceId);
      else return toast('a team is exactly 3 cards', true);
      el.classList.toggle('selected', battlePick.has(inst.instanceId));
      $('#bteam-count').textContent = `${battlePick.size}/3`;
    }});
    cell.appendChild(el);
    cell.insertAdjacentHTML('beforeend', statLine(card, inst.foil));
    return cell;
  }));
  $('#battle-modal').classList.remove('hidden');
}
$('#battle-close').addEventListener('click', () => $('#battle-modal').classList.add('hidden'));

$('#battle-send').addEventListener('click', async () => {
  if (battlePick.size !== 3) return toast('pick exactly 3 cards', true);
  try {
    const r = battleModalMode.type === 'challenge'
      ? await api('/api/battles', { method: 'POST', body: { toId: battleModalMode.toId, team: [...battlePick], wager: Number($('#battle-wager').value) || 0 } })
      : await api(`/api/battles/${battleModalMode.battleId}/accept`, { method: 'POST', body: { team: [...battlePick] } });
    $('#battle-modal').classList.add('hidden');
    handleUnlocks(r);
    if (r.battle.status === 'declined') { toast('😤 challenge declined', true); nav('arena'); }
    else if (r.battle.status === 'pending') { toast('⚔️ challenge sent!'); nav('arena'); }
    else openBattle(r.battle.id);
  } catch (err) { toast(err.message, true); }
});

async function renderArena() {
  await loadBattles();
  const list = $('#battle-list');
  list.replaceChildren(...state.battles.map((b) => {
    const incoming = b.toId === state.me.id;
    const other = state.battleUsers[incoming ? b.fromId : b.toId] || { name: '???', avatar: '' };
    const chip = b.status === 'done' ? (b.winnerId === state.me.id ? 'accepted' : 'declined')
      : b.status === 'active' ? 'pending' : b.status;
    const label = b.status === 'done' ? (b.winnerId === state.me.id ? 'won 🏆' : 'lost 💀')
      : b.status === 'active' ? (b.state.turn === state.me.id ? 'your turn!' : 'their turn') : b.status;
    const row = document.createElement('div');
    row.className = 'trade-row';
    row.innerHTML = `
      <div class="trade-row-head">
        <img src="${other.avatar}" alt="">
        <span class="t-who">${incoming ? `${esc(other.name)} → you` : `you → ${esc(other.name)}`}${other.bot ? ' <span class="bot-tag">SWARM BOT</span>' : ''}</span>
        ${b.wager ? `<span class="t-when">wager ⚡${b.wager}</span>` : ''}
        <span class="t-when">${new Date(b.createdAt).toLocaleString()}</span>
        <span class="status-chip status-${chip}">${label}</span>
      </div>
      <div class="trade-actions"></div>`;
    const actions = $('.trade-actions', row);
    if (b.status === 'pending' && incoming) {
      actions.append(
        tradeBtn('Accept ⚔️', 'btn-primary accept', () => openBattleModal({ type: 'accept', battleId: b.id, name: other.name })),
        tradeBtn('Decline', 'btn-ghost', () => actBattle(b.id, 'decline')),
      );
    } else if (b.status === 'pending') {
      actions.append(tradeBtn('Cancel challenge', 'btn-ghost', () => actBattle(b.id, 'cancel')));
    } else if (b.status === 'active') {
      actions.append(tradeBtn(b.state.turn === state.me.id ? 'Fight! ⚔️' : 'Spectate 👀', 'btn-primary', () => openBattle(b.id)));
    } else if (b.status === 'done') {
      actions.append(tradeBtn('View log', 'btn-ghost', () => openBattle(b.id)));
    }
    return row;
  }));
  $('#battles-empty').classList.toggle('hidden', state.battles.length > 0);
}
registerView('arena', renderArena);

async function actBattle(id, action) {
  try {
    await api(`/api/battles/${id}/${action}`, { method: 'POST' });
    toast(action === 'decline' ? 'challenge declined' : 'challenge cancelled');
    renderArena();
  } catch (err) { toast(err.message, true); renderArena(); }
}

async function openBattle(id) {
  clearInterval(battlePoll);
  try {
    const { battle, users } = await api(`/api/battles/${id}`);
    state.battle = { data: battle, users };
    nav('battle');
    renderBattleScreen();
    if (battle.status === 'active') battlePoll = setInterval(refreshBattle, 2500);
  } catch (err) { toast(err.message, true); }
}

async function refreshBattle() {
  if (state.view !== 'battle' || !state.battle) return clearInterval(battlePoll);
  try {
    const { battle, users } = await api(`/api/battles/${state.battle.data.id}`);
    const changed = battle.status !== state.battle.data.status
      || JSON.stringify(battle.state) !== JSON.stringify(state.battle.data.state);
    state.battle = { data: battle, users };
    if (changed) renderBattleScreen();
    if (battle.status !== 'active') clearInterval(battlePoll);
  } catch { /* transient network hiccup — next poll retries */ }
}

function fighterEl(f: FighterT, { active, onClick }: { active?: boolean; onClick?: () => void } = {}) {
  const byId = cardById();
  const wrap = document.createElement('div');
  wrap.className = 'fighter' + (active ? ' active-fighter' : '') + (f.hp <= 0 ? ' fainted' : '');
  const card = byId[f.cardId];
  wrap.appendChild(cardEl(card, { foil: f.foil, onClick: onClick || (() => zoomCard(card, f.foil)) }));
  const pct = Math.round(f.hp / f.maxHp * 100);
  wrap.insertAdjacentHTML('beforeend', `
    <div class="hp-bar"><div class="hp-fill ${pct < 25 ? 'hp-low' : pct < 55 ? 'hp-mid' : ''}" style="width:${pct}%"></div></div>
    <div class="fighter-stats">♥${f.hp}/${f.maxHp} · ⚔${f.atk} 🛡${f.def} ⚡${f.spd}</div>`);
  return wrap;
}

function renderBattleScreen() {
  const { data: b, users } = state.battle;
  const oppId = b.fromId === state.me.id ? b.toId : b.fromId;
  const opp = users[oppId] || { name: '???', avatar: '' };
  const myTurn = b.status === 'active' && b.state.turn === state.me.id;
  $('#battle-head').innerHTML = `
    <img src="${opp.avatar}" alt="">
    <div><h2>vs ${esc(opp.name)}${b.wager ? ` · pot ⚡${b.wager * 2}` : ''}</h2>
    <div class="u-stats">${
      b.status === 'active' ? (myTurn ? '🔥 your turn!' : `waiting for ${esc(opp.name)}…`)
      : b.status === 'done' ? (b.winnerId === state.me.id ? 'VICTORY 🏆' : 'defeat 💀')
      : b.status}</div></div>`;

  const renderSide = (sel, uid, mine) => {
    const el = $(sel);
    el.replaceChildren();
    const team = b.state.teams[uid];
    if (!team) { el.innerHTML = '<p class="empty-note">team hidden until the challenge is accepted</p>'; return; }
    const act = b.state.active[uid];
    el.appendChild(fighterEl(team[act], { active: true }));
    const bench = document.createElement('div');
    bench.className = 'bench';
    const foeActive = b.state.teams[oppId] && b.state.teams[oppId][b.state.active[oppId]];
    team.forEach((f, i) => {
      if (i === act) return;
      const canSwap = mine && myTurn && f.hp > 0;
      const fe = fighterEl(f, canSwap ? { onClick: () => battleMove({ type: 'swap', index: i }) } : {});
      if (canSwap) {
        fe.classList.add('swappable');
        if (foeActive) {
          const deal = seriesMultClient(f.series, foeActive.series);
          const take = seriesMultClient(foeActive.series, f.series);
          fe.insertAdjacentHTML('beforeend',
            `<div class="swap-detail">deals ×${deal} · takes ×${take} vs ${esc(foeActive.name)}</div>`);
        }
      }
      bench.appendChild(fe);
    });
    el.appendChild(bench);
  };
  renderSide('#foe-side', oppId, false);
  renderSide('#my-side', state.me.id, true);

  const controls = $('#battle-controls');
  controls.replaceChildren();
  if (b.status === 'active') {
    const meF = b.state.teams[state.me.id][b.state.active[state.me.id]];
    const foeF = b.state.teams[oppId][b.state.active[oppId]];
    const atk = moveButton(meF, 0, foeF, myTurn);
    const spc = moveButton(meF, 1, foeF, myTurn);
    controls.append(atk, spc, tradeBtn('forfeit 🏳️', 'btn-ghost', () => {
      if (confirm('Forfeit this battle? The pot goes to your opponent.')) battleMove({ type: 'forfeit' });
    }));
    if (myTurn) controls.insertAdjacentHTML('beforeend', '<span class="hint">…or click a benched card to swap it in (uses your turn)</span>');
  }
  $('#battle-log').replaceChildren(...b.state.log.slice().reverse().map((l) => {
    const d = document.createElement('div');
    d.textContent = l;
    return d;
  }));
}

// Mirrors the server's series-advantage cycle so the UI can predict damage
function seriesMultClient(attacker, defender) {
  const cyc = state.config.battle.cycle;
  const next = (s) => cyc[(cyc.indexOf(s) + 1) % cyc.length];
  if (next(attacker) === defender) return 1.3;
  if (next(defender) === attacker) return 0.75;
  return 1;
}

// A move button that spells out what the move will do to the current target,
// using the exact damage formula the server rolls (±10% variance).
function moveButton(f, moveIdx, target, myTurn) {
  const type = moveIdx === 1 ? f.special.type : 'basic';
  const name = moveIdx === 1 ? `${f.special.name} ✨` : `${f.basicName} ⚔`;
  const mv = state.config.battle.moves[type] || { power: 0, acc: 1, healRatio: 0 };
  const parts = [];

  if (type === 'heal') {
    const heal = Math.min(Math.round(f.maxHp * mv.healRatio), f.maxHp - f.hp);
    parts.push(heal > 0 ? `heals you ${heal} HP` : 'already at full HP');
  } else {
    const mult = seriesMultClient(f.series, target.series);
    const base = mv.power * (f.atk / Math.max(1, target.def * target.defMod)) * mult;
    const lo = Math.max(1, Math.round(base * 0.9)), hi = Math.max(1, Math.round(base * 1.1));
    parts.push(`${lo}–${hi} dmg to ${target.name}`);
    if (mult > 1) parts.push('super effective!');
    else if (mult < 1) parts.push('resisted');
    if (mv.acc < 1) parts.push(`${Math.round(mv.acc * 100)}% to hit`);
    if (type === 'drain') parts.push('heals you half of it');
    if (type === 'break') parts.push(`then −20% DEF${target.defMod < 1 ? ` (now ${Math.round(target.defMod * 100)}%)` : ''}`);
  }

  const btn = document.createElement('button');
  btn.className = 'btn-primary move-btn';
  btn.disabled = !myTurn;
  btn.innerHTML = `<b>${esc(name)}</b><span class="move-detail">${esc(parts.join(' · '))}</span>`;
  btn.onclick = () => battleMove({ type: 'attack', move: moveIdx });
  return btn;
}

async function battleMove(body) {
  try {
    const r = await api(`/api/battles/${state.battle.data.id}/move`, { method: 'POST', body });
    state.battle.data = r.battle;
    handleUnlocks(r);
    renderBattleScreen();
    if (r.battle.status !== 'active') clearInterval(battlePoll);
  } catch (err) { toast(err.message, true); refreshBattle(); }
}

$('#challenge-btn').addEventListener('click', () =>
  openBattleModal({ type: 'challenge', toId: state.member.user.id, name: state.member.user.name }));
