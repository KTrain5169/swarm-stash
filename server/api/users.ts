import { defineHandler } from "nitro";

import store from "../../features/db.ts";
import { publicUser } from "../utils/index.ts";

export default defineHandler(() => {
    const users = store.listUsers().map(publicUser).sort((a, b) => b.cardCount - a.cardCount);
    return { users }
})
