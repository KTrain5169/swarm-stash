import { defineHandler } from "nitro";
import crypto from 'node:crypto';

import { DISCORD_CLIENT_ID, DISCORD_ENABLED, REDIRECT_URI } from "../../../utils/consts.ts";
import { oauthStates } from "../../../utils/index.ts";

export default defineHandler((e) => {
    if (!DISCORD_ENABLED) return new Response('Discord OAuth is not configured. Set DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET in .env', { status: 400 });
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, Date.now() + 10 * 60e3);
    const auth = new URL('https://discord.com/oauth2/authorize');
    auth.search = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'identify', state }).toString();
    return new Response(null, { status: 302, headers: { Location: auth.href } })
})
