import { defineHandler } from "nitro";

import { allCards } from "../utils/consts.ts";
import { statsFor } from "../../features/battle.ts";
import { RARITIES, SERIES } from "../../features/catalog.ts";

export default defineHandler(() => {
    const cards = allCards().map((c) => ({ ...c, combat: statsFor(c) }));
    return { cards, rarities: RARITIES, series: SERIES }
})
