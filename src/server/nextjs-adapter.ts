import { NextApiRequest, NextApiResponse } from 'next';
import { Server as HttpServer } from 'http';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import { PlugNPlayWSServer } from './ws-server';
import { WSServerConfig } from '../types';

export interface NextJSWSConfig extends Omit<WSServerConfig, 'port'> {
  path?: string;
}

export class NextJSWebSocketAdapter {
  private wsServer: PlugNPlayWSServer;
  private wss: WebSocketServer | null = null;
  private isInitialized = false;

  constructor(config: NextJSWSConfig) {
    this.wsServer = new PlugNPlayWSServer(config);
  }

  /**
   * Initialize WebSocket server on the Next.js HTTP server
   */
  async initialize(server: HttpServer, path: string = '/api/ws'): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.wss = new WebSocketServer({ 
      noServer: true,
      path 
    });

    // Handle HTTP upgrade requests
    server.on('upgrade', (request, socket, head) => {
      const { pathname } = parse(request.url!);
      
      if (pathname === path) {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // Set up WebSocket connection handling
    this.wss.on('connection', async (ws, request) => {
      // Delegate to the main WebSocket server
      await this.wsServer['handleConnection'](ws);
    });

    this.isInitialized = true;
    console.log(`WebSocket server initialized on path ${path}`);
  }

  /**
   * Get the underlying WebSocket server instance
   */
  getServer(): PlugNPlayWSServer {
    return this.wsServer;
  }

  /**
   * Create Next.js API route handler
   */
  createApiHandler() {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      if (req.method === 'GET') {
        // Provide WebSocket connection information
        res.status(200).json({
          message: 'WebSocket server is running',
          path: '/api/ws',
          activeConnections: await this.wsServer.getActiveSessionCount()
        });
      } else if (req.method === 'POST') {
        // Handle REST API endpoints for WebSocket operations
        const { action, sessionId, message } = req.body;

        switch (action) {
          case 'broadcast':
            await this.wsServer.broadcast(message);
            res.status(200).json({ success: true });
            break;

          case 'sendToSession':
            if (!sessionId) {
              res.status(400).json({ error: 'sessionId is required' });
              return;
            }
            const sent = await this.wsServer.sendToSession(sessionId, message);
            res.status(sent ? 200 : 404).json({ success: sent });
            break;

          case 'getSession':
            if (!sessionId) {
              res.status(400).json({ error: 'sessionId is required' });
              return;
            }
            const session = await this.wsServer.getSession(sessionId);
            res.status(session ? 200 : 404).json({ session });
            break;

          case 'getStats':
            const stats = {
              activeConnections: await this.wsServer.getActiveSessionCount()
            };
            res.status(200).json(stats);
            break;

          default:
            res.status(400).json({ error: 'Invalid action' });
        }
      } else {
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
      }
    };
  }

  /**
   * Close the WebSocket server
   */
  async close(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    await this.wsServer.close();
    this.isInitialized = false;
  }
}

/**
 * Utility function to create a WebSocket server for Next.js
 */
export function createNextJSWebSocketServer(config: NextJSWSConfig): NextJSWebSocketAdapter {
  return new NextJSWebSocketAdapter(config);
}

/**
 * Higher-order function to wrap Next.js API routes with WebSocket support
 */
export function withWebSocket(config: NextJSWSConfig) {
  const adapter = new NextJSWebSocketAdapter(config);
  
  return {
    adapter,
    handler: adapter.createApiHandler(),
    initialize: adapter.initialize.bind(adapter)
  };
}
