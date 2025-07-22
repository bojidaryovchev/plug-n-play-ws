// Example: Next.js API route with WebSocket support
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as HttpServer } from 'http';
import { 
  withWebSocket, 
  InMemorySessionStorage,
  InMemorySearchIndex 
} from '@plugnplay/websockets';

// Create storage and search index
const sessionStorage = new InMemorySessionStorage();
const searchIndex = new InMemorySearchIndex({
  searchFields: ['name', 'description', 'category'],
});

// Sample product data
const products = [
  {
    id: '1',
    name: 'Wireless Headphones',
    description: 'High-quality wireless headphones with noise cancellation',
    category: 'Electronics',
    price: 199.99
  },
  {
    id: '2',
    name: 'Gaming Mouse',
    description: 'Professional gaming mouse with RGB lighting',
    category: 'Electronics',
    price: 79.99
  },
  {
    id: '3',
    name: 'Coffee Maker',
    description: 'Automatic coffee maker with programmable timer',
    category: 'Kitchen',
    price: 129.99
  }
];

// Initialize search index with products
products.forEach(async (product) => {
  await searchIndex.add(product.id, product);
});

// Create WebSocket configuration
const { adapter, handler, initialize } = withWebSocket({
  sessionStorage,
  searchIndex,
  heartbeatInterval: 30000,
  sessionTimeout: 300000,
  
  onConnect: async (session) => {
    console.log(`New client connected: ${session.id}`);
    
    // Send initial data
    await adapter.getServer().sendToSession(session.id, {
      type: 'init',
      products: products
    });
  },
  
  onMessage: async (session, message) => {
    const { type, data } = message.data as any;
    
    switch (type) {
      case 'product_update':
        // Broadcast product updates to all clients
        await adapter.getServer().broadcast({
          type: 'product_updated',
          product: data
        });
        break;
        
      case 'user_action':
        // Track user actions
        await adapter.getServer().updateSessionMetadata(session.id, {
          lastAction: data.action,
          actionTimestamp: Date.now()
        });
        break;
    }
  }
});

// Initialize WebSocket server (call this once when your Next.js server starts)
let isInitialized = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize WebSocket server on first request
  if (!isInitialized && req.socket?.server) {
    await initialize(req.socket.server as HttpServer, '/api/websocket');
    isInitialized = true;
  }
  
  // Handle REST API requests
  return handler(req, res);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}
