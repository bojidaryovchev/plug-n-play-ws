import { SearchIndex, SearchResult, SearchOptions } from '../types';

export interface InMemorySearchIndexConfig {
  ngramSize?: number;
  searchFields?: string[];
  caseSensitive?: boolean;
}

export class InMemorySearchIndex implements SearchIndex {
  private documents: Map<string, Record<string, any>> = new Map();
  private ngramIndex: Map<string, Set<string>> = new Map();
  private ngramSize: number;
  private searchFields: string[];
  private caseSensitive: boolean;

  constructor(config: InMemorySearchIndexConfig = {}) {
    this.ngramSize = config.ngramSize || 3;
    this.searchFields = config.searchFields || [];
    this.caseSensitive = config.caseSensitive || false;
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
    this.documents.set(id, { ...data });
    
    // Extract searchable text and generate ngrams
    const searchableTexts = this.extractSearchableText(data);
    
    for (const text of searchableTexts) {
      const ngrams = this.generateNgrams(text);
      
      for (const ngram of ngrams) {
        if (!this.ngramIndex.has(ngram)) {
          this.ngramIndex.set(ngram, new Set());
        }
        this.ngramIndex.get(ngram)!.add(id);
      }
    }
  }

  async remove(id: string): Promise<void> {
    const document = this.documents.get(id);
    if (!document) {
      return;
    }

    // Remove from ngram index
    const searchableTexts = this.extractSearchableText(document);
    
    for (const text of searchableTexts) {
      const ngrams = this.generateNgrams(text);
      
      for (const ngram of ngrams) {
        const documentSet = this.ngramIndex.get(ngram);
        if (documentSet) {
          documentSet.delete(id);
          if (documentSet.size === 0) {
            this.ngramIndex.delete(ngram);
          }
        }
      }
    }

    // Remove document
    this.documents.delete(id);
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      limit = 10,
      offset = 0,
      filters = {},
      fuzzy = true,
    } = options;

    if (!query.trim()) {
      return [];
    }

    const queryNgrams = this.generateNgrams(query);
    const documentScores: Map<string, number> = new Map();

    // Calculate scores based on ngram matches
    for (const ngram of queryNgrams) {
      const documentIds = this.ngramIndex.get(ngram);
      if (documentIds) {
        for (const docId of documentIds) {
          const currentScore = documentScores.get(docId) || 0;
          documentScores.set(docId, currentScore + 1);
        }
      }
    }

    // Convert to results and apply filters
    let results: SearchResult[] = [];
    
    for (const [docId, score] of documentScores.entries()) {
      const document = this.documents.get(docId);
      if (!document) continue;

      // Apply filters
      let passesFilters = true;
      for (const [filterKey, filterValue] of Object.entries(filters)) {
        if (document[filterKey] !== filterValue) {
          passesFilters = false;
          break;
        }
      }

      if (passesFilters) {
        // Normalize score (percentage of query ngrams that matched)
        const normalizedScore = score / queryNgrams.length;
        
        results.push({
          id: docId,
          score: normalizedScore,
          data: { ...document },
          highlights: this.generateHighlights(document, query),
        });
      }
    }

    // Sort by score (descending) and apply pagination
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(offset, offset + limit);
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
    this.documents.clear();
    this.ngramIndex.clear();
  }

  // Utility methods
  getDocumentCount(): number {
    return this.documents.size;
  }

  getNgramCount(): number {
    return this.ngramIndex.size;
  }

  getDocument(id: string): Record<string, any> | undefined {
    const doc = this.documents.get(id);
    return doc ? { ...doc } : undefined;
  }
}
