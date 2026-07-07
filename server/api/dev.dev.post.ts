import { defineHandler } from "nitro";
import { STARTING_NEUROS, STARTER_CARDS } from "../../features/catalog.ts";
import store from "../../features/db.ts";
import { DEV_LOGIN } from "../utils/consts.ts";
import { sessionCookie, makeSession } from "../utils/index.ts";

export default defineHandler(async (e) => {
    if (!DEV_LOGIN) return new Response('dev login disabled', { status: 403 });
    const { name } = await e.req.json() as any; // what type is this
    const clean = String(name || '').trim().slice(0, 32);
    if (!clean) return new Response('name required', { status: 400 });
    let user = store.getDevUserByName(clean);
    if (!user) {
      user = store.createUser({ name: clean, avatar: `/api/avatar/${encodeURIComponent(clean)}.svg`, neuros: STARTING_NEUROS });
      for (const c of STARTER_CARDS) store.grantCard(user.id, c);
    }
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Set-Cookie': sessionCookie(makeSession(user.id)), 'Content-Type': 'application/json' }
    })
})
