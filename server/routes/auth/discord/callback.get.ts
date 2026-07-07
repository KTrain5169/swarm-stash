import { defineHandler } from "nitro";

import { STARTING_NEUROS, STARTER_CARDS } from "../../../../features/catalog.ts";
import store from "../../../../features/db.ts";
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI } from "../../../utils/consts.ts";
import { makeSession, oauthStates, sessionCookie } from "../../../utils/index.ts";

export default defineHandler(async (e) => {
    const state = e.url.searchParams.get('state') ?? '';
    const code = e.url.searchParams.get('code');
    const exp = oauthStates.get(state);
    oauthStates.delete(state);
    if (!code || !exp || exp < Date.now()) {
        return new Response(JSON.stringify({ Location: '/?login=failed' }), { status: 302 })
    }
    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
        });
        if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}`);
        const { access_token } = await tokenRes.json() as { access_token: string };
        const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
        if (!userRes.ok) throw new Error(`user fetch ${userRes.status}`);
        const d = await userRes.json() as { id: string; username: string; global_name?: string; avatar?: string };
        const avatar = d.avatar
            ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(d.id) >> 22n) % 6}.png`;

        let user = store.getUserByDiscord(d.id);
        if (!user) {
            user = store.createUser({ discordId: d.id, name: d.global_name || d.username, avatar, neuros: STARTING_NEUROS });
            for (const c of STARTER_CARDS) store.grantCard(user.id, c);
        } else {
            store.setProfile(user.id, d.global_name || d.username, avatar); // keep profile in sync with Discord
        }
        return new Response(null, {
            status: 302,
            headers: { 'Set-Cookie': sessionCookie(makeSession(user.id)), Location: '/' }
        })
    } catch (e) {
        console.error('OAuth failed:', (e as Error).message);
        return new Response(null, {
            status: 302,
            headers: { Location: '/?login=failed' }
        })
    }
})
