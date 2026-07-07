import { defineHandler } from "nitro";
import { avatarSVG } from "../../utils/index.ts";

export default defineHandler((e) => {
    return new Response(avatarSVG(decodeURIComponent(e.context.params!.user)), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }
    })
})
