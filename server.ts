import 'dotenv/config'
import { createServer } from 'node:http'
import { parse } from 'node:url'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { registerSocketHandlers } from './src/lib/multiplayer/socket-handler'

const port = parseInt(process.env.PORT ?? '3000', 10)
const dev = process.env.NODE_ENV !== 'production'

const app = next({ dev, port })
const handle = app.getRequestHandler()

void app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const io = new SocketIOServer(httpServer, {
    path: '/ws/socket.io',
    cors: { origin: '*', methods: ['GET', 'POST'] },
  })

  registerSocketHandlers(io)

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
