import { defineHandler } from "nitro";

import { MOVES, CYCLE } from '../../features/battle.ts'
import { PACK_COST, PACK_SIZE, DAILY_NEUROS, FOIL_CHANCE, FOIL_MULT } from "../../features/catalog.ts";
import { DISCORD_ENABLED, DEV_LOGIN, MODERATION } from "../utils/consts.ts";

export default defineHandler(() => {
    return {
        discord: DISCORD_ENABLED, devLogin: DEV_LOGIN,
        packCost: PACK_COST, packSize: PACK_SIZE, daily: DAILY_NEUROS,
        moderation: MODERATION, foilChance: FOIL_CHANCE, foilMult: FOIL_MULT,
        battle: { moves: MOVES, cycle: CYCLE },
    }
})
