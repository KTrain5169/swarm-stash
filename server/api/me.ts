import { defineHandler } from "nitro";
import { publicUser, readSession } from "../utils/index.ts";
import store from "../../features/db.ts";
import { isAdmin } from "../utils/consts.ts";

export default defineHandler((e) => {
    const me = readSession(e.req.headers.get('cookie') ?? '')
    if (!me) return { user: null }
    else return {
        user: {
            ...publicUser(me), neuros: me.neuros,
            dailyReady: Date.now() - me.lastDaily > 20 * 3600e3,
            isAdmin: isAdmin(me),
            modPending: isAdmin(me) ? store.pendingCount() : 0,
        }
    }
})
