# Upstash Redis Integration Guide

## Setup Instructions

### 1. Install Upstash Redis SDK

```bash
npm install @upstash/redis
```

### 2. Get Upstash Credentials

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database
3. Copy your REST URL and Token

### 3. Environment Variables

Create a `.env` file in your project root:

```env
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

### 4. Usage Example

```typescript
import { Redis } from '@upstash/redis';
import { RedisSessionStorage, RedisSearchIndex } from '@plugnplay/websockets';

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Use with WebSocket package
const sessionStorage = new RedisSessionStorage({
  redis: redis as any,
  keyPrefix: 'ws:session:'
});

const searchIndex = new RedisSearchIndex({
  redis: redis as any,
  keyPrefix: 'search:',
  ngramSize: 3
});
```

## Upstash Benefits

- ✅ **Global Edge Locations** - Low latency worldwide
- ✅ **Serverless** - No infrastructure management
- ✅ **Auto-scaling** - Handles traffic spikes automatically
- ✅ **Pay-per-request** - Cost-effective pricing
- ✅ **Built-in monitoring** - Dashboard and alerts
- ✅ **High availability** - Built-in redundancy

## Production Deployment

### Vercel/Netlify
```typescript
// Works great with serverless functions
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
```

### Docker/Traditional Hosting
```typescript
// Also works with traditional deployments
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
```

## Next.js Integration

```typescript
// pages/api/websocket.ts
import { Redis } from '@upstash/redis';
import { withWebSocket, RedisSessionStorage } from '@plugnplay/websockets';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const { handler, initialize } = withWebSocket({
  sessionStorage: new RedisSessionStorage({
    redis: redis as any,
    keyPrefix: 'ws:session:'
  })
});

export default handler;
```

## Performance Notes

- Upstash Redis REST API is optimized for serverless
- Edge locations provide <50ms latency globally
- Automatic connection pooling
- Built-in request deduplication
