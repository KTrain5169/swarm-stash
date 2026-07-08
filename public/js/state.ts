// The single shared mutable state object. Views read and write it directly;
// there's no reactivity — a view re-renders itself after changing something.

import type { CardT, InstT } from './types.ts';

export const state: {
  me: any; config: any;
  cards: CardT[]; rarities: Record<string, { weight: number; value: number; label: string }>;
  series: Record<string, { label: string; hue: number; hue2: number }>;
  collection: InstT[]; showcase: string[]; trades: any[]; tradeUsers: Record<string, any>;
  battles: any[]; battleUsers: Record<string, any>; battle: { data: any; users: Record<string, any> } | null;
  view: string; member: { user: any; cards: InstT[] } | null;
} = {
  me: null, config: null,
  cards: [], rarities: {}, series: {},
  collection: [], showcase: [], trades: [], tradeUsers: {},
  battles: [], battleUsers: {}, battle: null,
  view: 'home', member: null,
};

export const cardById = (): Record<string, CardT> => Object.fromEntries(state.cards.map((c) => [c.id, c]));
