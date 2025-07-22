import { defineConfig } from 'tsup';

export default defineConfig([
  // Main build
  {
    entry: {
      index: 'src/index.ts',
      'client/index': 'src/client/index.ts',
      'server/index': 'src/server/index.ts',
      'adapters/index': 'src/adapters/index.ts',
      'react/index': 'src/react/index.ts',
      'nextjs/index': 'src/nextjs/index.ts'
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    treeshake: true,
    minify: false,
    external: ['react', 'socket.io', 'socket.io-client', 'ioredis']
  }
]);
