import { InMemorySearchIndex } from '../search/in-memory-search-index';
import { SearchOptions } from '../types';

describe('InMemorySearchIndex', () => {
  let searchIndex: InMemorySearchIndex;

  beforeEach(() => {
    searchIndex = new InMemorySearchIndex({
      ngramSize: 3,
      searchFields: ['title', 'content', 'tags'],
      caseSensitive: false
    });
  });

  afterEach(async () => {
    await searchIndex.clear();
  });

  describe('add and search', () => {
    it('should add documents and find them via search', async () => {
      const doc1 = {
        title: 'WebSocket Tutorial',
        content: 'Learn how to use WebSockets for real-time communication',
        tags: 'websockets,tutorial,realtime'
      };

      const doc2 = {
        title: 'Chat Application',
        content: 'Build a chat app with WebSockets',
        tags: 'chat,websockets,app'
      };

      await searchIndex.add('doc1', doc1);
      await searchIndex.add('doc2', doc2);

      const results = await searchIndex.search('websocket');
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.score > 0)).toBe(true);
    });

    it('should return results sorted by score', async () => {
      await searchIndex.add('doc1', {
        title: 'WebSocket WebSocket WebSocket',
        content: 'Multiple mentions of the search term'
      });

      await searchIndex.add('doc2', {
        title: 'Single mention',
        content: 'Just one WebSocket here'
      });

      const results = await searchIndex.search('WebSocket');
      
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should respect search options limit', async () => {
      for (let i = 0; i < 10; i++) {
        await searchIndex.add(`doc${i}`, {
          title: `Document ${i}`,
          content: 'Search term appears here'
        });
      }

      const options: SearchOptions = { limit: 5 };
      const results = await searchIndex.search('search', options);
      
      expect(results).toHaveLength(5);
    });

    it('should apply filters correctly', async () => {
      await searchIndex.add('doc1', {
        title: 'WebSocket Tutorial',
        category: 'tutorial',
        content: 'Learn WebSockets'
      });

      await searchIndex.add('doc2', {
        title: 'WebSocket Guide',
        category: 'guide',
        content: 'WebSocket reference'
      });

      const options: SearchOptions = {
        filters: { category: 'tutorial' }
      };
      
      const results = await searchIndex.search('websocket', options);
      
      expect(results).toHaveLength(1);
      expect(results[0].data.category).toBe('tutorial');
    });
  });

  describe('remove', () => {
    it('should remove documents from the index', async () => {
      await searchIndex.add('doc1', {
        title: 'Test Document',
        content: 'This is a test'
      });

      let results = await searchIndex.search('test');
      expect(results).toHaveLength(1);

      await searchIndex.remove('doc1');
      
      results = await searchIndex.search('test');
      expect(results).toHaveLength(0);
    });
  });

  describe('highlights', () => {
    it('should generate highlights for matching terms', async () => {
      await searchIndex.add('doc1', {
        title: 'WebSocket Tutorial',
        content: 'Learn how to use WebSockets'
      });

      const results = await searchIndex.search('websocket');
      
      expect(results[0].highlights).toBeDefined();
      if (results[0].highlights) {
        expect(Object.keys(results[0].highlights).length).toBeGreaterThan(0);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty search query', async () => {
      const results = await searchIndex.search('');
      expect(results).toHaveLength(0);
    });

    it('should handle search with minimal matches', async () => {
      await searchIndex.add('doc1', {
        title: 'Test Document',
        content: 'Some content'
      });

      const results = await searchIndex.search('xyzneverexists');
      expect(results).toHaveLength(0);
    });

    it('should handle pagination with offset', async () => {
      for (let i = 0; i < 10; i++) {
        await searchIndex.add(`doc${i}`, {
          title: `Document ${i}`,
          content: 'Common search term'
        });
      }

      const options: SearchOptions = { limit: 3, offset: 2 };
      const results = await searchIndex.search('search', options);
      
      expect(results).toHaveLength(3);
    });
  });

  describe('utility methods', () => {
    it('should return correct document count', async () => {
      expect(searchIndex.getDocumentCount()).toBe(0);
      
      await searchIndex.add('doc1', { title: 'Test 1' });
      await searchIndex.add('doc2', { title: 'Test 2' });
      
      expect(searchIndex.getDocumentCount()).toBe(2);
    });

    it('should return document by id', async () => {
      const testDoc = { title: 'Test Document', content: 'Test content' };
      await searchIndex.add('doc1', testDoc);
      
      const retrieved = searchIndex.getDocument('doc1');
      expect(retrieved).toEqual(testDoc);
    });

    it('should return undefined for non-existent document', () => {
      const retrieved = searchIndex.getDocument('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });
});
