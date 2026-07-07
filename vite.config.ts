import { defineConfig } from 'vite';
import { nitro } from 'nitro/vite';

const authRoutes: string[] = ["/api/logout", '/api/trades/:id/*']

export default defineConfig({
    plugins: [nitro({
        preset: 'node-server',
        serverDir: './server',
        serverEntry: {
            handler: './server.ts',
            format: 'node'
        },
        handlers: authRoutes.map((route) => ({
            route,
            handler: './server/tools/middleware/session.ts',
            middleware: true,
        }))
    })]
})
