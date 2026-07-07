import { defineMiddleware } from "nitro";
import { readSession } from "../../utils/index.ts";

export default defineMiddleware((e, next) => {
    const cookie = e.req.headers.get('cookie');
    if (!cookie || !readSession(cookie)) {
        return new Response('Unauthorized');
    }
    return next();
})
