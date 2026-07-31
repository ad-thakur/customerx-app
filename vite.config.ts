import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { searchPrecedents } from './src/server/precedentSearch.ts'

function precedentsApiPlugin(): Plugin {
  return {
    name: 'precedents-api',
    configureServer(server) {
      server.middlewares.use('/api/precedents', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const query = url.searchParams.get('q')
          if (!query) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing "q" query parameter' }))
            return
          }
          const results = await searchPrecedents(query)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(results))
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (err as Error).message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precedentsApiPlugin()],
})
