// Base search functionality shared across all adapters

import {
  SearchQuery,
  SearchResponse,
  SearchResult,
} from '../types';
import { buildNGrams, buildEdgeGrams, generateHighlights } from '../utils/text-processing';

export interface SearchConfig {
  ngramSize: number;
  minEdgegram: number;
  maxEdgegram: number;
  exactMatchBoost: number;
  ngramWeight: number;
  edgegramWeight: number;
  minScore: number;
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  ngramSize: 3,
  minEdgegram: 2,
  maxEdgegram: 10,
  exactMatchBoost: 100,
  ngramWeight: 0.5,
  edgegramWeight: 1.0,
  minScore: 0.1,
};

export interface DocumentData {
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base class providing common search functionality
 * This eliminates duplication across different adapter implementations
 */
export abstract class BaseSearchAdapter {
  protected searchConfig: SearchConfig;

  constructor(searchConfig: Partial<SearchConfig> = {}) {
    this.searchConfig = { ...DEFAULT_SEARCH_CONFIG, ...searchConfig };
  }

  /**
   * Generate search terms for indexing a document
   */
  protected generateSearchTerms(content: string): {
    ngrams: string[];
    edgegrams: string[];
  } {
    const ngrams = buildNGrams(content, this.searchConfig.ngramSize);
    const edgegrams = buildEdgeGrams(
      content,
      this.searchConfig.minEdgegram,
      this.searchConfig.maxEdgegram
    );

    return { ngrams, edgegrams };
  }

  /**
   * Calculate relevance score for a document based on search terms
   */
  protected calculateRelevanceScore(
    documentContent: string,
    searchTerms: string[],
    ngramMatches: number,
    edgegramMatches: number
  ): number {
    let score = 0;

    // Exact word matches get the highest boost
    const contentLower = documentContent.toLowerCase();
    const words = contentLower.split(/\s+/);

    for (const term of searchTerms) {
      if (words.includes(term.toLowerCase())) {
        score += this.searchConfig.exactMatchBoost;
      }
    }

    // Add n-gram and edge-gram scores
    score += ngramMatches * this.searchConfig.ngramWeight;
    score += edgegramMatches * this.searchConfig.edgegramWeight;

    return score;
  }

  /**
   * Process search results: score, sort, and paginate
   */
  protected processSearchResults(
    query: SearchQuery,
    searchTerms: string[],
    documentScores: Map<string, { score: number; data: DocumentData }>,
    startTime: number
  ): SearchResponse {
    // Filter out documents with very low scores
    const filteredResults: SearchResult[] = [];

    for (const [docId, { score, data }] of documentScores.entries()) {
      if (score < this.searchConfig.minScore) continue;

      // Generate highlights
      const highlights = generateHighlights(data.content, searchTerms);

      filteredResults.push({
        id: docId,
        score,
        data: { content: data.content, ...data.metadata },
        highlights,
      });
    }

    // Sort by score (descending)
    filteredResults.sort((a, b) => b.score - a.score);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 10;
    const paginatedResults = filteredResults.slice(offset, offset + limit);

    return {
      query: query.query,
      results: paginatedResults,
      total: filteredResults.length,
      took: Date.now() - startTime,
      hasMore: offset + limit < filteredResults.length,
    };
  }

  /**
   * Validate and normalize search query
   */
  protected normalizeSearchQuery(query: SearchQuery): {
    searchTerms: string[];
    isValid: boolean;
  } {
    const searchTerms = query.query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 0);

    return {
      searchTerms,
      isValid: searchTerms.length > 0,
    };
  }

  /**
   * Create empty search response for invalid queries
   */
  protected createEmptyResponse(query: SearchQuery, startTime: number): SearchResponse {
    return {
      query: query.query,
      results: [],
      total: 0,
      took: Date.now() - startTime,
      hasMore: false,
    };
  }
}
