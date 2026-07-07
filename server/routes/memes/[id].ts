import path from 'node:path';
import fs from 'node:fs';

import { defineHandler } from 'nitro';
import { IMAGE_TYPES, UPLOAD_DIR } from '../../utils/consts.ts';

export default defineHandler((event) => {
    const file = path.join(UPLOAD_DIR, path.basename(decodeURIComponent(event.context.params!.id)));
    fs.readFile(file, (e, buf) => {
        if (e) {
            return new Response('not found', {
                status: 404
            })
        }
        const type = IMAGE_TYPES.find((t) => file.endsWith(t.ext));
        return new Response(buf, {
            headers: {
                'Content-Type': type ? type.mime : 'application/octet-stream',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'public, max-age=86400, immutable',
            }
        })
    });
})
