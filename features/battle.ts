// Swarm Stash — battle engine ("Buh-ttles")
// Pokémon-style turn-based combat: teams of 3, one active fighter each,
// alternating turns. Stats and the special move derive deterministically
// from the card id hash — same trick as meme rarity — so every copy of a
// card fights identically. Foils get +10% on everything.

import crypto from 'node:crypto';
import type { Card, Rarity, SeriesId } from './catalog.ts';

export type MoveType = 'basic' | 'heavy' | 'drain' | 'break' | 'heal';
export type SpecialType = Exclude<MoveType, 'basic'>;

export interface MoveSpec { power: number; acc: number; healRatio: number }
export interface Special { type: SpecialType; name: string; desc: string }

export interface CombatStats {
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  special: Special;
}

// Battle-state fighter snapshot (stats frozen at battle start)
export interface Fighter extends CombatStats {
  cardId: string;
  name: string;
  series: SeriesId;
  rarity: Rarity;
  emoji: string;
  foil: boolean;
  hp: number;
  defMod: number; // DEF multiplier, shredded by 'break' (floor 0.5)
  basicName: string;
}

export interface BattleState {
  teams: Record<string, Fighter[] | null>; // opponent team is null while pending
  active: Record<string, number>;
  turn: string | null;
  log: string[];
}

// series advantage cycle: each series hits the next one for 1.3×, and is
// resisted (0.75×) by the previous one. meme closes the loop back to neuro.
export const CYCLE: SeriesId[] = ['neuro', 'evil', 'duo', 'vedal', 'collab', 'meme'];
const nextIn = (s: SeriesId): SeriesId => CYCLE[(CYCLE.indexOf(s) + 1) % CYCLE.length]!;
export function seriesMult(attacker: SeriesId, defender: SeriesId): number {
  if (nextIn(attacker) === defender) return 1.3;
  if (nextIn(defender) === attacker) return 0.75;
  return 1;
}

const RARITY_BONUS: Record<Rarity, number> = { common: 0, uncommon: 2, rare: 4, epic: 7, legendary: 10 };

const BASIC_NAMES: Record<SeriesId, string> = {
  neuro: 'buh Blast', evil: 'Raspy Cackle', duo: 'Twin Strike',
  vedal: 'Tutel Toss', collab: 'Collab Chaos', meme: 'Meme Slam',
};

// move mechanics, keyed by type — served to the client so the UI can
// explain moves and predict damage with the same numbers the engine uses
export const MOVES: Record<MoveType, MoveSpec> = {
  basic: { power: 22, acc: 1,    healRatio: 0 },
  heavy: { power: 40, acc: 0.75, healRatio: 0 },   // 25% whiff chance
  drain: { power: 18, acc: 1,    healRatio: 0 },   // + heals half the damage dealt
  break: { power: 16, acc: 1,    healRatio: 0 },   // + target DEF −20% (floor 50%)
  heal:  { power: 0,  acc: 1,    healRatio: 0.3 }, // heals 30% of max HP
};

// the "perk" — one special move per card, chosen by hash
export const SPECIALS: Special[] = [
  { type: 'heavy', name: 'All In',       desc: 'Big damage, 75% accuracy' },
  { type: 'drain', name: 'Heart Steal',  desc: 'Damage + heal half of it' },
  { type: 'break', name: 'Filter Break', desc: 'Damage + shreds enemy DEF 20%' },
  { type: 'heal',  name: 'Cookie Break', desc: 'No damage, heal 30% max HP' },
];

// Deterministic combat sheet for a card (all copies identical; foil +10%)
export function statsFor(card: Card, foil = false): CombatStats {
  const h = crypto.createHash('sha1').update(card.id).digest();
  const b = RARITY_BONUS[card.rarity] ?? 0;
  const f = foil ? 1.1 : 1;
  return {
    maxHp: Math.round((70 + h[0]! % 45 + b * 8) * f),
    atk:   Math.round((22 + h[1]! % 18 + b * 4) * f),
    def:   Math.round((16 + h[2]! % 14 + b * 3) * f),
    spd:   Math.round((10 + h[3]! % 30 + b * 2) * f),
    special: SPECIALS[h[4]! % SPECIALS.length]!,
  };
}

export function fighter(card: Card, foil: boolean): Fighter {
  const s = statsFor(card, foil);
  return {
    cardId: card.id, name: card.name, series: card.series, rarity: card.rarity,
    emoji: card.emoji || '🖼️', foil: Boolean(foil),
    ...s, hp: s.maxHp, defMod: 1,
    basicName: BASIC_NAMES[card.series] || 'Meme Slam',
  };
}

export const alive = (team: Fighter[]): Fighter[] => team.filter((f) => f.hp > 0);
export const activeF = (state: BattleState, uid: string): Fighter =>
  state.teams[uid]![state.active[uid]!]!;

export function log(state: BattleState, msg: string): void {
  state.log.push(msg);
  if (state.log.length > 60) state.log.shift();
}

// Executes one attack (moveIdx 0 = basic, 1 = special). Mutates state.
// Returns true if the defender's whole team is down.
export function attack(state: BattleState, attackerId: string, defenderId: string, moveIdx: number): boolean {
  const a = activeF(state, attackerId);
  const d = activeF(state, defenderId);
  const special = moveIdx === 1;
  const moveName = special ? a.special.name : a.basicName;

  const mv = MOVES[special ? a.special.type : 'basic'];

  if (special && a.special.type === 'heal') {
    const heal = Math.round(a.maxHp * mv.healRatio);
    a.hp = Math.min(a.maxHp, a.hp + heal);
    log(state, `${a.name} uses ${moveName} and heals ${heal} HP 🍪`);
    return false;
  }

  const power = mv.power;
  if (Math.random() > mv.acc) {
    log(state, `${a.name} goes ${moveName}… and whiffs completely 💨`);
    return false;
  }

  const mult = seriesMult(a.series, d.series);
  const dmg = Math.max(1, Math.round(power * (a.atk / Math.max(1, d.def * d.defMod)) * mult * (0.9 + Math.random() * 0.2)));
  d.hp = Math.max(0, d.hp - dmg);
  const eff = mult > 1 ? ' It’s super effective!' : mult < 1 ? ' It’s not very effective…' : '';
  log(state, `${a.name} uses ${moveName} for ${dmg} damage.${eff}`);

  if (special && a.special.type === 'drain') {
    const heal = Math.ceil(dmg / 2);
    a.hp = Math.min(a.maxHp, a.hp + heal);
    log(state, `${a.name} siphons ${heal} HP 🖤`);
  }
  if (special && a.special.type === 'break') {
    d.defMod = Math.max(0.5, d.defMod - 0.2);
    log(state, `${d.name}'s DEF is shredded!`);
  }

  if (d.hp === 0) {
    log(state, `${d.name} is down! 💀`);
    const team = state.teams[defenderId]!;
    const next = team.findIndex((f) => f.hp > 0);
    if (next === -1) return true;
    state.active[defenderId] = next;
    log(state, `${team[next]!.name} steps up!`);
  }
  return false;
}

// Simple bot brain: heal when hurt, mix specials in, otherwise jab.
export function botPickMove(state: BattleState, botId: string): number {
  const me = activeF(state, botId);
  if (me.special.type === 'heal' && me.hp < me.maxHp * 0.45) return 1;
  if (me.special.type === 'heavy' || me.special.type === 'drain' || me.special.type === 'break') {
    return Math.random() < 0.45 ? 1 : 0;
  }
  return 0;
}
