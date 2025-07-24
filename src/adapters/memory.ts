// Memory adapter for development and testing

import {
  IAdapter,
  SessionMetadata,
  SearchQuery,
  SearchResponse,
} from '../types';
import { BaseSearchAdapter, SearchConfig, DocumentData } from './base-search';

export interface MemoryAdapterConfig {
  searchConfig?: Partial<SearchConfig>;
  maxDocuments?: number;
  sessionCleanupInterval?: number; // hours
}

/**
 * In-memory adapter for development and testing
 * Not suitable for production use with multiple server instances
 */
export class MemoryAdapter extends BaseSearchAdapter implements IAdapter {
  private sessions = new Map<string, SessionMetadata>();
  private documents = new Map<string, DocumentData>();
  private documentAccessOrder = new Map<string, number>(); // Track access order for LRU
  private ngramIndex = new Map<string, Set<string>>(); // ngram -> document IDs
  private edgegramIndex = new Map<string, Set<string>>(); // edgegram -> document IDs
  private maxDocuments: number;
  private sessionCleanupHours: number;
  private accessCounter = 0; // Monotonic counter for access order

  constructor(config: MemoryAdapterConfig = {}) {
    super(config.searchConfig);
    this.maxDocuments = config.maxDocuments || 10000;
    this.sessionCleanupHours = config.sessionCleanupInterval || 24; // hours
  }

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
    // Remove old index entries for this document
    await this.removeFromIndex(id);

    // Check document limit and remove LRU documents if necessary
    while (this.documents.size >= this.maxDocuments) {
      const lruDocumentId = this.findLRUDocument();
      if (lruDocumentId) {
        await this.removeDocument(lruDocumentId);
      } else {
        break; // Shouldn't happen, but prevent infinite loop
      }
    }

    // Store document and update access order
    this.documents.set(id, { content, ...(metadata && { metadata }) });
    this.documentAccessOrder.set(id, ++this.accessCounter);

    // Generate search terms using base class
    const { ngrams, edgegrams } = this.generateSearchTerms(content);

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

  /**
   * Find the least recently used document for eviction
   */
  private findLRUDocument(): string | undefined {
    let lruId: string | undefined;
    let lruAccessTime = Infinity;

    for (const [docId, accessTime] of this.documentAccessOrder.entries()) {
      if (accessTime < lruAccessTime) {
        lruAccessTime = accessTime;
        lruId = docId;
      }
    }

    return lruId;
  }

  /**
   * Update access time for a document (for LRU tracking)
   */
  private updateDocumentAccess(id: string): void {
    if (this.documents.has(id)) {
      this.documentAccessOrder.set(id, ++this.accessCounter);
    }
  }

  async removeDocument(id: string): Promise<void> {
    // Remove from document store
    this.documents.delete(id);
    this.documentAccessOrder.delete(id);

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
    const { searchTerms, isValid } = this.normalizeSearchQuery(query);
    
    if (!isValid) {
      return this.createEmptyResponse(query, startTime);
    }

    // Find matching documents using both n-grams and edge-grams
    const documentScores = new Map<string, { score: number; data: DocumentData }>();

    for (const term of searchTerms) {
      // Generate search terms for this query term
      const { ngrams, edgegrams } = this.generateSearchTerms(term);

      // Score based on n-gram matches
      for (const ngram of ngrams) {
        const matchingDocs = this.ngramIndex.get(ngram);
        if (matchingDocs) {
          for (const docId of matchingDocs) {
            if (!documentScores.has(docId)) {
              const doc = this.documents.get(docId);
              if (doc) {
                documentScores.set(docId, { score: 0, data: doc });
              }
            }
            // Increment score for each n-gram match
            const current = documentScores.get(docId);
            if (current) {
              current.score += this.searchConfig.ngramWeight;
            }
          }
        }
      }

      // Score based on edge-gram matches
      for (const edgegram of edgegrams) {
        const matchingDocs = this.edgegramIndex.get(edgegram);
        if (matchingDocs) {
          for (const docId of matchingDocs) {
            if (!documentScores.has(docId)) {
              const doc = this.documents.get(docId);
              if (doc) {
                documentScores.set(docId, { score: 0, data: doc });
              }
            }
            // Increment score for each edge-gram match
            const current = documentScores.get(docId);
            if (current) {
              current.score += this.searchConfig.edgegramWeight;
            }
          }
        }
      }
    }

    // Calculate final relevance scores using base class method
    for (const [docId, scoreData] of documentScores.entries()) {
      // Update access time for LRU tracking
      this.updateDocumentAccess(docId);
      
      const finalScore = this.calculateRelevanceScore(
        scoreData.data.content,
        searchTerms,
        scoreData.score, // Use actual calculated match score
        0 // No additional boost for memory adapter
      );
      
      documentScores.set(docId, { ...scoreData, score: finalScore });
    }

    return this.processSearchResults(query, searchTerms, documentScores, startTime);
  }

  async cleanup(): Promise<void> {
    // Remove sessions older than configured interval
    const cutoffTime = new Date(Date.now() - this.sessionCleanupHours * 60 * 60 * 1000);
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastSeenAt < cutoffTime) {
        this.sessions.delete(sessionId);
      }
    }
  }

  async disconnect(): Promise<void> {
    // Clear all data
    this.sessions.clear();
    this.documents.clear();
    this.documentAccessOrder.clear();
    this.ngramIndex.clear();
    this.edgegramIndex.clear();
    this.accessCounter = 0;
  }
}
