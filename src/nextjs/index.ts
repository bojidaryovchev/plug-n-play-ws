// Next.js API route wrapper for WebSocket server

import { NextRequest, NextResponse } from 'next/server';
import { PlugNPlayServer } from '../server';
import type { ServerConfig, EventMap } from '../types';

export interface NextJSWSConfig extends Omit<ServerConfig, 'port'> {
  corsOrigin?: string | string[] | boolean;
  enableHealthCheck?: boolean;
}

/**
 * Creates a Next.js API route handler for WebSocket functionality
 * This is primarily for health checks and configuration endpoints
 * The actual WebSocket server should be started separately
 */
export function createNextJSHandler<T extends Record<string, unknown> = EventMap>(
  server: PlugNPlayServer<T>,
  config: NextJSWSConfig = {}
) {
  return async function handler(request: NextRequest) {
    // Handle CORS
    const corsOrigin = config.corsOrigin;
    let corsOriginValue: string;
    
    if (typeof corsOrigin === 'boolean') {
      corsOriginValue = corsOrigin ? '*' : 'null';
    } else if (Array.isArray(corsOrigin)) {
      corsOriginValue = corsOrigin.join(', ');
    } else {
      corsOriginValue = corsOrigin || '*';
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOriginValue,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 200, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // Health check endpoint
      if (pathname.endsWith('/health') && config.enableHealthCheck !== false) {
        const stats = server.getStats();
        return NextResponse.json(
          {
            status: 'healthy',
            uptime: stats.uptime,
            connections: stats.connectedClients,
            timestamp: new Date().toISOString(),
          },
          { headers: corsHeaders }
        );
      }

      // Stats endpoint
      if (pathname.endsWith('/stats')) {
        const stats = server.getStats();
        const sessions = await server.getActiveSessions();
        
        return NextResponse.json(
          {
            ...stats,
            sessions: sessions.length,
            sessionDetails: sessions.map(s => ({
              id: s.id,
              userId: s.userId,
              connectedAt: s.connectedAt,
              lastSeenAt: s.lastSeenAt,
            })),
          },
          { headers: corsHeaders }
        );
      }

      // Search endpoint (REST fallback)
      if (pathname.endsWith('/search') && request.method === 'POST') {
        const body = await request.json() as {
          query: string;
          limit?: number;
          offset?: number;
          filters?: Record<string, unknown>;
        };

        const results = await server.search({
          query: body.query,
          limit: body.limit || 10,
          offset: body.offset || 0,
          ...(body.filters && { filters: body.filters }),
          streaming: false,
        });

        return NextResponse.json(results, { headers: corsHeaders });
      }

      // Index content endpoint
      if (pathname.endsWith('/index') && request.method === 'POST') {
        const body = await request.json() as {
          id: string;
          content: string;
          metadata?: Record<string, unknown>;
        };

        await server.indexContent(body.id, body.content, body.metadata);

        return NextResponse.json(
          { success: true, indexed: body.id },
          { headers: corsHeaders }
        );
      }

      // Remove content endpoint
      if (pathname.endsWith('/index') && request.method === 'DELETE') {
        const body = await request.json() as { id: string };

        await server.removeContent(body.id);

        return NextResponse.json(
          { success: true, removed: body.id },
          { headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { error: 'Not Found' },
        { status: 404, headers: corsHeaders }
      );

    } catch (error) {
      console.error('Next.js WebSocket handler error:', error);
      
      return NextResponse.json(
        { 
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500, headers: corsHeaders }
      );
    }
  };
}

/**
 * Utility function to start a WebSocket server alongside Next.js
 * Call this in your Next.js startup (e.g., in instrumentation.ts)
 */
export async function startWebSocketServer<T extends Record<string, unknown> = EventMap>(
  config: ServerConfig = {}
): Promise<PlugNPlayServer<T>> {
  const server = new PlugNPlayServer<T>(config);
  
  const port = config.port || 3001;
  await server.listen(port);
  
  console.log(`WebSocket server started on port ${port}`);
  
  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('Shutting down WebSocket server...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  return server;
}

/**
 * Example Next.js route handler implementation
 * Save this as app/api/ws/route.ts or pages/api/ws.ts
 */
export function createExampleRoute() {
  // This would typically be initialized once and reused
  const server = new PlugNPlayServer({
    port: 3001,
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // Start the server (you might want to do this elsewhere)
  server.listen().catch(console.error);

  const handler = createNextJSHandler(server, {
    corsOrigin: true,
    enableHealthCheck: true,
  });

  return {
    GET: handler,
    POST: handler,
    DELETE: handler,
    OPTIONS: handler,
  };
}
