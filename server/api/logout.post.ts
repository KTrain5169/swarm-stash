import { defineHandler } from "nitro";

export default defineHandler(() => {
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Set-Cookie': 'sess=; Path=/; Max-Age=0', 'Content-Type': 'application/json' }
    })
})
