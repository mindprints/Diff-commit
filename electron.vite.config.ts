import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                external: ['electron-store', 'dotenv']
            }
        }
    },
    preload: {
        build: {
            rollupOptions: {
                external: ['electron-store'],
                output: {
                    format: 'cjs',
                    entryFileNames: '[name].js'
                }
            }
        }
    },
    renderer: {
        root: resolve(__dirname, 'src/renderer'),
        publicDir: resolve(__dirname, 'public'),
        build: {
            outDir: resolve(__dirname, 'out/renderer'),
            rollupOptions: {
                input: resolve(__dirname, 'src/renderer/index.html')
            }
        },
        plugins: [react()]
    }
})
