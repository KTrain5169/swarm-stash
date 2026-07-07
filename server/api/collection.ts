import { url } from "inspector";
import { defineHandler } from "nitro"
import store from "../../features/db.ts";
import { instOut, publicUser, readSession } from "../utils/index.ts";

export default defineHandler((e) => {
    const targetId = e.url.searchParams.get('user') || readSession(e.req.headers.get('cookie') ?? '')?.id;
    const target = targetId ? store.getUser(targetId) : undefined;
    if (!target) return { error: 'user not found' };
    const cards = store.listByOwner(target.id).map(instOut);
    const showcase = (JSON.parse(target.showcase || '[]') as string[]).filter((id) => {
        const inst = store.getInstance(id);
        return inst && inst.ownerId === target.id; // drop pins for cards that changed hands
    });
    return { user: publicUser(target), cards, showcase };
})
