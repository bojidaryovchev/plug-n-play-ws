// Memory adapter for development and testing

import {
  IAdapter,
  SessionMetadata,
  SearchQuery,
  SearchResponse,
  SearchResult,
} from '../types';
import { buildNGrams, buildEdgeGrams, generateHighlights } from '../utils/text-processing';

/**
 * In-memory adapter for development and testing
 * Not suitable for production use with multiple server instances
 */
export class MemoryAdapter implements IAdapter {
  private sessions = new Map<string, SessionMetadata>();
  private documents = new Map<string, { content: string; metadata?: Record<string, unknown> }>();
  private ngramIndex = new Map<string, Set<string>>(); // ngram -> document IDs
  private edgegramIndex = new Map<string, Set<string>>(); // edgegram -> document IDs

  async setSession(sessionId: string, metadata: SessionMetadata): Promise<void> {
    this.sessions.set(sessionId, { ...metadata });
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getAllSessions(): Promise<SessionMetadata[]> {
    return Array.from(this.sessions.values()).map(session => ({ ...session }));
  }

  async updateLastSeen(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeenAt = new Date();
    }
  }

  async indexDocument(
    id: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Remove old index entries for this document (but keep document data)
    await this.removeFromIndex(id);

    // Store document
    this.documents.set(id, { content, ...(metadata && { metadata }) });

    // Build n-grams and edge-grams
    const ngrams = buildNGrams(content, 3);
    const edgegrams = buildEdgeGrams(content, 2, 10);

    // Index n-grams
    for (const ngram of ngrams) {
      if (!this.ngramIndex.has(ngram)) {
        this.ngramIndex.set(ngram, new Set());
      }
      this.ngramIndex.get(ngram)!.add(id);
    }

    // Index edge-grams
    for (const edgegram of edgegrams) {
      if (!this.edgegramIndex.has(edgegram)) {
        this.edgegramIndex.set(edgegram, new Set());
      }
      this.edgegramIndex.get(edgegram)!.add(id);
    }
  }

  async removeDocument(id: string): Promise<void> {
    // Remove from document store
    this.documents.delete(id);

    // Remove from indexes
    await this.removeFromIndex(id);
  }

  private async removeFromIndex(id: string): Promise<void> {
    // Remove from all index entries
    for (const [ngram, docIds] of this.ngramIndex.entries()) {
      docIds.delete(id);
      if (docIds.size === 0) {
        this.ngramIndex.delete(ngram);
      }
    }

    for (const [edgegram, docIds] of this.edgegramIndex.entries()) {
      docIds.delete(id);
      if (docIds.size === 0) {
        this.edgegramIndex.delete(edgegram);
      }
    }
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    const searchTerms = query.query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length === 0) {
      return {
        query: query.query,
        results: [],
        total: 0,
        took: Date.now() - startTime,
        hasMore: false,
      };
    }

    // Find matching documents using both n-grams and edge-grams
    const documentScores = new Map<string, number>();

    for (const term of searchTerms) {
      // First, check for exact word matches (highest priority)
      for (const [docId, doc] of this.documents.entries()) {
        const contentLower = doc.content.toLowerCase();
        const words = contentLower.split(/\s+/);
        
        if (words.includes(term)) {
          // Exact word match gets highest score
          documentScores.set(docId, (documentScores.get(docId) || 0) + 100);
        }
      }

      // Then use n-grams and edge-grams for fuzzy matching
      const termNgrams = buildNGrams(term, 3);
      const termEdgegrams = buildEdgeGrams(term, 2, 10);

      // Score based on n-gram matches (lower weight)
      for (const ngram of termNgrams) {
        const matchingDocs = this.ngramIndex.get(ngram);
        if (matchingDocs) {
          for (const docId of matchingDocs) {
            documentScores.set(docId, (documentScores.get(docId) || 0) + 0.5);
          }
        }
      }

      // Score based on edge-gram matches (medium weight for prefix matches)
      for (const edgegram of termEdgegrams) {
        const matchingDocs = this.edgegramIndex.get(edgegram);
        if (matchingDocs) {
          for (const docId of matchingDocs) {
            const boost = edgegram.length / 10; // Longer matches get higher score
            documentScores.set(docId, (documentScores.get(docId) || 0) + boost);
          }
        }
      }
    }

    // Convert to results array and sort by score
    const allResults: SearchResult[] = [];
    for (const [docId, score] of documentScores.entries()) {
      // Filter out documents with very low scores (likely irrelevant matches)
      if (score < 10) continue;
      
      const doc = this.documents.get(docId);
      if (doc) {
        // Generate highlights
        const highlights = generateHighlights(doc.content, searchTerms);
        
        allResults.push({
          id: docId,
          score,
          data: { content: doc.content, ...doc.metadata },
          highlights,
        });
      }
    }

    // Sort by score (descending)
    allResults.sort((a, b) => b.score - a.score);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 10;
    const paginatedResults = allResults.slice(offset, offset + limit);

    return {
      query: query.query,
      results: paginatedResults,
      total: allResults.length,
      took: Date.now() - startTime,
      hasMore: offset + limit < allResults.length,
    };
  }

  async cleanup(): Promise<void> {
    // Remove sessions older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastSeenAt < oneDayAgo) {
        this.sessions.delete(sessionId);
      }
    }
  }

  async disconnect(): Promise<void> {
    // Clear all data
    this.sessions.clear();
    this.documents.clear();
    this.ngramIndex.clear();
    this.edgegramIndex.clear();
  }
}
