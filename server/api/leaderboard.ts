import { defineHandler } from "nitro";
import store from "../../features/db.ts";
import { instValue } from "../utils/index.ts";

export default defineHandler(() => {
    // binder value (foils count ×FOIL_MULT) + 100 clout per achievement; bots don't rank
    const board = store.listUsers().filter((u) => !u.bot).map((u) => {
        const insts = store.listByOwner(u.id);
        const value = insts.reduce((s, i) => s + instValue(i), 0);
        const achievements = store.listAchievements(u.id).length;
        return {
            id: u.id, name: u.name, avatar: u.avatar,
            cards: insts.length, unique: new Set(insts.map((i) => i.cardId)).size,
            foils: insts.filter((i) => i.foil).length,
            achievements, score: value + achievements * 100,
        };
    }).sort((a, b) => b.score - a.score);
    return { board };
})
