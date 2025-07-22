/**
 * Text processing utilities for search functionality
 * Following DRY principle - shared across all adapters
 */

/**
 * Build n-grams from text for fuzzy search
 * @param text - Input text to process
 * @param n - N-gram size (e.g., 3 for trigrams)
 * @returns Array of unique n-grams
 */
export function buildNGrams(text: string, n: number): string[] {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ');
  const ngrams: string[] = [];

  for (const word of words) {
    if (word.length >= n) {
      for (let i = 0; i <= word.length - n; i++) {
        ngrams.push(word.substring(i, i + n));
      }
    }
  }

  return [...new Set(ngrams)];
}

/**
 * Build edge-grams from text for prefix/partial matching
 * @param text - Input text to process
 * @param minGram - Minimum gram length
 * @param maxGram - Maximum gram length
 * @returns Array of unique edge-grams
 */
export function buildEdgeGrams(text: string, minGram: number, maxGram: number): string[] {
  if (minGram > maxGram) {
    return [];
  }

  const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ');
  const edgegrams: string[] = [];

  for (const word of words) {
    for (let len = minGram; len <= Math.min(maxGram, word.length); len++) {
      edgegrams.push(word.substring(0, len));
    }
  }

  return [...new Set(edgegrams)];
}

/**
 * Generate text highlights for search results
 * @param content - Content to highlight
 * @param searchTerms - Terms to highlight
 * @param maxHighlights - Maximum number of highlights (default: 3)
 * @param contextLength - Characters around match (default: 30)
 * @returns Array of highlighted snippets
 */
export function generateHighlights(
  content: string, 
  searchTerms: string[], 
  maxHighlights: number = 3,
  contextLength: number = 30
): string[] {
  const highlights: string[] = [];
  const contentLower = content.toLowerCase();

  for (const term of searchTerms) {
    const termLower = term.toLowerCase();
    let index = contentLower.indexOf(termLower);
    
    while (index !== -1 && highlights.length < maxHighlights) {
      const start = Math.max(0, index - contextLength);
      const end = Math.min(content.length, index + term.length + contextLength);
      const snippet = content.substring(start, end);
      
      const highlightedSnippet = snippet.replace(
        new RegExp(term, 'gi'),
        `<mark>$&</mark>`
      );
      
      highlights.push(
        (start > 0 ? '...' : '') + 
        highlightedSnippet + 
        (end < content.length ? '...' : '')
      );
      
      index = contentLower.indexOf(termLower, index + 1);
    }
  }

  return highlights;
}
