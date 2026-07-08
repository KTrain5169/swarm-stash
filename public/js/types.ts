// Shared shapes (mirror the server's API responses).

export interface CardT {
  id: string; name: string; series: string; rarity: string;
  emoji?: string; flavor?: string; image?: string;
  combat?: { maxHp: number; atk: number; def: number; spd: number;
             special: { type: string; name: string; desc: string } };
}
export interface InstT { instanceId: string; cardId: string; ownerId: string; obtainedAt: number; foil: boolean }
export interface FighterT {
  cardId: string; name: string; series: string; rarity: string; foil: boolean;
  maxHp: number; atk: number; def: number; spd: number; hp: number; defMod: number;
  basicName: string; special: { type: string; name: string; desc: string };
}
export interface AchievementT { id: string; name: string; emoji: string; desc: string; reward: number }
export interface AuctionT {
  id: string; sellerId: string; sellerName: string; sellerAvatar: string;
  startingBid: number; currentBid: number | null; bidCount: number;
  currentBidderId: string | null; currentBidderName: string | null;
  endsAt: number; createdAt: number; card: InstT;
}
