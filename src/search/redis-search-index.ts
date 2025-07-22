import type { Redis } from 'ioredis';
import { SearchIndex, SearchResult, SearchOptions } from '../types';

export interface RedisSearchIndexConfig {
  redis: Redis;
  keyPrefix?: string;
  ngramSize?: number;
  searchFields?: string[];
  caseSensitive?: boolean;
  maxResults?: number;
}

export class RedisSearchIndex implements SearchIndex {
  private redis: Redis;
  private keyPrefix: string;
  private ngramSize: number;
  private searchFields: string[];
  private caseSensitive: boolean;
  private maxResults: number;

  constructor(config: RedisSearchIndexConfig) {
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix || 'search:';
    this.ngramSize = config.ngramSize || 3;
    this.searchFields = config.searchFields || [];
    this.caseSensitive = config.caseSensitive || false;
    this.maxResults = config.maxResults || 1000;
  }

  private getDocumentKey(id: string): string {
    return `${this.keyPrefix}doc:${id}`;
  }

  private getNgramKey(ngram: string): string {
    return `${this.keyPrefix}ngram:${ngram}`;
  }

  private generateNgrams(text: string): string[] {
    if (!this.caseSensitive) {
      text = text.toLowerCase();
    }
    
    const ngrams: string[] = [];
    const paddedText = `__${text}__`; // Add padding for edge ngrams
    
    for (let i = 0; i <= paddedText.length - this.ngramSize; i++) {
      ngrams.push(paddedText.substring(i, i + this.ngramSize));
    }
    
    return ngrams;
  }

  private extractSearchableText(data: Record<string, any>): string[] {
    const texts: string[] = [];
    
    if (this.searchFields.length === 0) {
      // If no specific fields, search all string values
      for (const value of Object.values(data)) {
        if (typeof value === 'string') {
          texts.push(value);
        }
      }
    } else {
      // Search only specified fields
      for (const field of this.searchFields) {
        const value = data[field];
        if (typeof value === 'string') {
          texts.push(value);
        }
      }
    }
    
    return texts;
  }

  async add(id: string, data: Record<string, any>): Promise<void> {
    // Remove existing document if it exists
    await this.remove(id);
    
    // Store the document
    const documentKey = this.getDocumentKey(id);
    await this.redis.set(documentKey, JSON.stringify(data));
    
    // Extract searchable text and generate ngrams
    const searchableTexts = this.extractSearchableText(data);
    
    const pipeline = this.redis.pipeline();
    
    for (const text of searchableTexts) {
      const ngrams = this.generateNgrams(text);
      
      for (const ngram of ngrams) {
        const ngramKey = this.getNgramKey(ngram);
        pipeline.sadd(ngramKey, id);
      }
    }
    
    await pipeline.exec();
  }

  async remove(id: string): Promise<void> {
    const documentKey = this.getDocumentKey(id);
    const documentData = await this.redis.get(documentKey);
    
    if (!documentData) {
      return;
    }

    try {
      const document = JSON.parse(documentData);
      const searchableTexts = this.extractSearchableText(document);
      
      const pipeline = this.redis.pipeline();
      
      // Remove from ngram indices
      for (const text of searchableTexts) {
        const ngrams = this.generateNgrams(text);
        
        for (const ngram of ngrams) {
          const ngramKey = this.getNgramKey(ngram);
          pipeline.srem(ngramKey, id);
        }
      }
      
      // Remove document
      pipeline.del(documentKey);
      
      await pipeline.exec();
      
      // Clean up empty ngram sets
      await this.cleanupEmptyNgrams(searchableTexts);
      
    } catch (error) {
      console.error('Failed to parse document during removal:', error);
      // Still try to remove the document key
      await this.redis.del(documentKey);
    }
  }

  private async cleanupEmptyNgrams(searchableTexts: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const text of searchableTexts) {
      const ngrams = this.generateNgrams(text);
      
      for (const ngram of ngrams) {
        const ngramKey = this.getNgramKey(ngram);
        // Check if set is empty and delete if so
        const count = await this.redis.scard(ngramKey);
        if (count === 0) {
          pipeline.del(ngramKey);
        }
      }
    }
    
    await pipeline.exec();
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      limit = 10,
      offset = 0,
      filters = {},
    } = options;

    if (!query.trim()) {
      return [];
    }

    const queryNgrams = this.generateNgrams(query);
    
    if (queryNgrams.length === 0) {
      return [];
    }

    // Get all document IDs that match any ngram
    const ngramKeys = queryNgrams.map(ngram => this.getNgramKey(ngram));
    
    // Use Redis SINTER for intersection or SUNION for union
    // For fuzzy search, we'll use SUNION and score based on matches
    let documentIds: string[] = [];
    
    if (queryNgrams.length === 1) {
      documentIds = await this.redis.smembers(ngramKeys[0]);
    } else {
      // Create a temporary key for the union operation
      const tempKey = `${this.keyPrefix}temp:${Date.now()}:${Math.random()}`;
      
      try {
        await this.redis.sunionstore(tempKey, ...ngramKeys);
        documentIds = await this.redis.smembers(tempKey);
        await this.redis.del(tempKey);
      } catch (error) {
        console.error('Error during search union operation:', error);
        return [];
      }
    }

    if (documentIds.length === 0) {
      return [];
    }

    // Limit the number of documents to process
    if (documentIds.length > this.maxResults) {
      documentIds = documentIds.slice(0, this.maxResults);
    }

    // Calculate scores and apply filters
    const results: SearchResult[] = [];
    
    for (const docId of documentIds) {
      const documentKey = this.getDocumentKey(docId);
      const documentData = await this.redis.get(documentKey);
      
      if (!documentData) continue;
      
      try {
        const document = JSON.parse(documentData);
        
        // Apply filters
        let passesFilters = true;
        for (const [filterKey, filterValue] of Object.entries(filters)) {
          if (document[filterKey] !== filterValue) {
            passesFilters = false;
            break;
          }
        }
        
        if (!passesFilters) continue;
        
        // Calculate score based on ngram matches
        const score = await this.calculateScore(docId, queryNgrams);
        
        results.push({
          id: docId,
          score,
          data: document,
          highlights: this.generateHighlights(document, query),
        });
        
      } catch (error) {
        console.error('Failed to parse document during search:', error);
        continue;
      }
    }

    // Sort by score (descending) and apply pagination
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(offset, offset + limit);
  }

  private async calculateScore(documentId: string, queryNgrams: string[]): Promise<number> {
    let matches = 0;
    
    for (const ngram of queryNgrams) {
      const ngramKey = this.getNgramKey(ngram);
      const isMember = await this.redis.sismember(ngramKey, documentId);
      if (isMember) {
        matches++;
      }
    }
    
    // Normalize score (percentage of query ngrams that matched)
    return matches / queryNgrams.length;
  }

  private generateHighlights(document: Record<string, any>, query: string): Record<string, string[]> {
    const highlights: Record<string, string[]> = {};
    const queryLower = this.caseSensitive ? query : query.toLowerCase();
    
    const searchableTexts = this.extractSearchableText(document);
    const fieldNames = this.searchFields.length > 0 ? this.searchFields : Object.keys(document);
    
    for (let i = 0; i < searchableTexts.length && i < fieldNames.length; i++) {
      const text = searchableTexts[i];
      const fieldName = fieldNames[i];
      const textToSearch = this.caseSensitive ? text : text.toLowerCase();
      
      if (textToSearch.includes(queryLower)) {
        const highlightedText = text.replace(
          new RegExp(query, this.caseSensitive ? 'g' : 'gi'),
          `<mark>$&</mark>`
        );
        highlights[fieldName] = [highlightedText];
      }
    }
    
    return highlights;
  }

  async clear(): Promise<void> {
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Utility methods
  async getDocumentCount(): Promise<number> {
    const pattern = `${this.keyPrefix}doc:*`;
    const keys = await this.redis.keys(pattern);
    return keys.length;
  }

  async getNgramCount(): Promise<number> {
    const pattern = `${this.keyPrefix}ngram:*`;
    const keys = await this.redis.keys(pattern);
    return keys.length;
  }

  async getDocument(id: string): Promise<Record<string, any> | null> {
    const documentKey = this.getDocumentKey(id);
    const data = await this.redis.get(documentKey);
    
    if (!data) {
      return null;
    }
    
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse document:', error);
      return null;
    }
  }
}
