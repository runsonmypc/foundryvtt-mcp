/**
 * @fileoverview RAG Service for Warhammer lore retrieval
 *
 * Provides high-level operations for searching and retrieving
 * Warhammer Fantasy lore from the ChromaDB database.
 */

import { LoreDatabase, LoreResult, LoreCategory } from './database.js';
import { logger } from '../utils/logger.js';

/**
 * Options for lore search
 */
export interface LoreSearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Filter by lore category */
  category?: LoreCategory;
  /** Minimum relevance score (0-1) */
  minRelevance?: number;
  /** Include summaries in results */
  includeSummary?: boolean;
}

/**
 * Formatted context for LLM consumption
 */
export interface LoreContext {
  /** Formatted text for inclusion in prompts */
  text: string;
  /** Number of sources used */
  sourceCount: number;
  /** Source titles for attribution */
  sources: string[];
}

/**
 * RAG Service for Warhammer lore
 */
export class RAGService {
  private db: LoreDatabase;
  private initialized = false;

  constructor(chromaDbPath: string = './data/chromadb') {
    this.db = new LoreDatabase(chromaDbPath);
  }

  /**
   * Initialize the RAG service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.db.initialize();
      this.initialized = true;
      logger.info('RAG Service initialized');
    } catch (error) {
      logger.error('Failed to initialize RAG Service', { error });
      throw error;
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized && this.db.isInitialized();
  }

  /**
   * Get document count
   */
  async getDocumentCount(): Promise<number> {
    return this.db.count();
  }

  /**
   * Search for lore matching a query
   */
  async search(
    query: string,
    options: LoreSearchOptions = {}
  ): Promise<LoreResult[]> {
    if (!this.initialized) {
      throw new Error('RAG Service not initialized');
    }

    const { limit = 5, category = 'any', minRelevance = 0.3 } = options;

    logger.info('RAG search', { query, category, limit });

    return this.db.search(query, { limit, category, minRelevance });
  }

  /**
   * Get lore by exact title
   */
  async getByTitle(title: string): Promise<LoreResult | null> {
    if (!this.initialized) {
      throw new Error('RAG Service not initialized');
    }

    return this.db.getByTitle(title);
  }

  /**
   * Build context for LLM prompt from search results
   */
  buildContext(results: LoreResult[], maxLength: number = 2000): LoreContext {
    if (results.length === 0) {
      return {
        text: '',
        sourceCount: 0,
        sources: [],
      };
    }

    const sources: string[] = [];
    let contextText = '## Relevant Warhammer Lore\n\n';
    let currentLength = contextText.length;

    for (const result of results) {
      // Format each entry
      const entry = `### ${result.title}\n${result.text}\n\n`;

      // Check if adding this entry would exceed max length
      if (currentLength + entry.length > maxLength) {
        // Try to add a truncated version
        const available = maxLength - currentLength - 50;
        if (available > 200) {
          const truncated = `### ${result.title}\n${result.text.slice(0, available)}...\n\n`;
          contextText += truncated;
          sources.push(result.title);
        }
        break;
      }

      contextText += entry;
      currentLength += entry.length;
      sources.push(result.title);
    }

    return {
      text: contextText,
      sourceCount: sources.length,
      sources,
    };
  }

  /**
   * Search and build context in one call
   */
  async searchWithContext(
    query: string,
    options: LoreSearchOptions & { maxContextLength?: number } = {}
  ): Promise<LoreContext> {
    const { maxContextLength = 2000, ...searchOptions } = options;

    const results = await this.search(query, searchOptions);
    return this.buildContext(results, maxContextLength);
  }

  /**
   * Search for information about a specific entity (character, location, etc.)
   */
  async lookupEntity(
    name: string,
    category?: LoreCategory
  ): Promise<LoreResult | null> {
    // First try exact title match
    const exact = await this.getByTitle(name);
    if (exact) return exact;

    // Fall back to semantic search
    const searchOptions: LoreSearchOptions = { limit: 1 };
    if (category) {
      searchOptions.category = category;
    }
    const results = await this.search(name, searchOptions);
    return results[0] ?? null;
  }

  /**
   * Get lore relevant to a game situation
   */
  async getContextForSituation(
    situation: string,
    entities: string[] = []
  ): Promise<LoreContext> {
    // Build a comprehensive query
    const query = [situation, ...entities].join(' ');

    // Get more results for situations to have richer context
    const results = await this.search(query, { limit: 5, minRelevance: 0.25 });

    return this.buildContext(results, 3000);
  }

  /**
   * Get random lore entry (for inspiration)
   */
  async getRandomLore(category?: LoreCategory): Promise<LoreResult | null> {
    // Use a broad query to get some entries
    const queries = [
      'Empire provinces cities',
      'Chaos gods Warhammer',
      'Sigmar history',
      'Beastmen creatures',
      'Skaven Under-Empire',
    ];

    const randomQuery = queries[Math.floor(Math.random() * queries.length)] ?? 'Empire provinces cities';
    const searchOptions: LoreSearchOptions = { limit: 10 };
    if (category) {
      searchOptions.category = category;
    }
    const results = await this.search(randomQuery, searchOptions);

    if (results.length === 0) return null;
    const randomResult = results[Math.floor(Math.random() * results.length)];
    return randomResult ?? null;
  }
}
