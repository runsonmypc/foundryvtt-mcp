/**
 * @fileoverview ChromaDB wrapper for Warhammer lore storage and retrieval
 *
 * Provides vector search capabilities for the Lexicanum dataset using
 * local embeddings with @xenova/transformers.
 */

import { ChromaClient, Collection, IncludeEnum } from 'chromadb';
import { pipeline } from '@xenova/transformers';
import { logger } from '../utils/logger.js';

// Embedder type (any since @xenova/transformers types are complex)
type Embedder = (text: string, options?: { pooling?: string; normalize?: boolean }) => Promise<{ data: Float32Array }>;

// Singleton embedder instance
let embedder: Embedder | null = null;

/**
 * Get or create the embedding model
 */
async function getEmbedder(): Promise<Embedder> {
  if (!embedder) {
    logger.info('Loading embedding model (Xenova/all-MiniLM-L6-v2)...');
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    embedder = pipe as unknown as Embedder;
    logger.info('Embedding model loaded');
  }
  return embedder;
}

/**
 * Generate embedding for text
 */
async function embed(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const result = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data as Float32Array);
}

/**
 * Document to be stored in the lore database
 */
export interface LoreDocument {
  id: string;
  text: string;
  metadata: {
    title: string;
    type: string;
    aliases?: string[];
    tags?: string[];
    url?: string;
  };
}

/**
 * Search result from the lore database
 */
export interface LoreResult {
  text: string;
  title: string;
  type: string;
  relevance: number;
  url?: string | undefined;
}

/**
 * Categories of Warhammer lore
 */
export type LoreCategory =
  | 'any'
  | 'character'
  | 'location'
  | 'creature'
  | 'item'
  | 'event'
  | 'organization'
  | 'deity'
  | 'spell'
  | 'general';

/**
 * Lore database using ChromaDB for vector storage
 */
export class LoreDatabase {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private initialized = false;

  constructor(private persistPath: string = './data/chromadb') {
    // ChromaDB client - use HTTP if URL provided, otherwise use default
    if (persistPath.startsWith('http')) {
      this.client = new ChromaClient({ path: persistPath });
    } else {
      // Use default ChromaDB client (connects to localhost:8000 or uses ephemeral)
      this.client = new ChromaClient();
    }
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('Initializing ChromaDB connection...');

      this.collection = await this.client.getOrCreateCollection({
        name: 'warhammer_lore',
        metadata: { 'hnsw:space': 'cosine' },
      });

      const count = await this.collection.count();
      logger.info(`ChromaDB initialized. Collection has ${count} documents.`);
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize ChromaDB', { error });
      throw error;
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get document count
   */
  async count(): Promise<number> {
    if (!this.collection) return 0;
    return this.collection.count();
  }

  /**
   * Add documents to the database
   */
  async addDocuments(documents: LoreDocument[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    if (documents.length === 0) return;

    logger.debug(`Adding ${documents.length} documents to ChromaDB`);

    // Generate embeddings for all documents
    const embeddings: number[][] = [];
    for (const doc of documents) {
      const embedding = await embed(doc.text);
      embeddings.push(embedding);
    }

    await this.collection.add({
      ids: documents.map(d => d.id),
      embeddings,
      documents: documents.map(d => d.text),
      metadatas: documents.map(d => ({
        title: d.metadata.title,
        type: d.metadata.type,
        aliases: d.metadata.aliases?.join('|') || '',
        tags: d.metadata.tags?.join('|') || '',
        url: d.metadata.url || '',
      })),
    });
  }

  /**
   * Search for lore matching a query
   */
  async search(
    query: string,
    options: {
      limit?: number;
      category?: LoreCategory;
      minRelevance?: number;
    } = {}
  ): Promise<LoreResult[]> {
    if (!this.collection) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const { limit = 5, category = 'any', minRelevance = 0.3 } = options;

    logger.debug('Searching lore database', { query, category, limit });

    // Generate query embedding
    const queryEmbedding = await embed(query);

    // Build where clause for category filtering
    const whereClause =
      category && category !== 'any' ? { type: category } : undefined;

    const queryOptions: {
      queryEmbeddings: number[][];
      nResults: number;
      include: IncludeEnum[];
      where?: { type: string };
    } = {
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      include: [IncludeEnum.documents, IncludeEnum.metadatas, IncludeEnum.distances],
    };

    if (category && category !== 'any') {
      queryOptions.where = { type: category };
    }

    const results = await this.collection.query(queryOptions);

    // Transform results
    const loreResults: LoreResult[] = [];

    if (results.documents?.[0]) {
      for (let i = 0; i < results.documents[0].length; i++) {
        const doc = results.documents[0][i];
        const meta = results.metadatas?.[0]?.[i] as Record<string, unknown> | null;
        const distance = results.distances?.[0]?.[i] || 0;

        // Convert distance to relevance (cosine distance to similarity)
        const relevance = 1 - distance;

        if (relevance >= minRelevance) {
          loreResults.push({
            text: doc || '',
            title: (meta?.title as string) || 'Unknown',
            type: (meta?.type as string) || 'general',
            relevance,
            url: (meta?.url as string) || undefined,
          });
        }
      }
    }

    logger.debug(`Found ${loreResults.length} relevant lore entries`);
    return loreResults;
  }

  /**
   * Search by exact title match
   */
  async getByTitle(title: string): Promise<LoreResult | null> {
    if (!this.collection) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const results = await this.collection.get({
      where: { title: title },
      include: [IncludeEnum.documents, IncludeEnum.metadatas],
    });

    if (results.documents?.[0]) {
      const meta = results.metadatas?.[0] as Record<string, unknown> | null;
      return {
        text: results.documents[0] as string,
        title: (meta?.title as string) || title,
        type: (meta?.type as string) || 'general',
        relevance: 1.0,
        url: (meta?.url as string) || undefined,
      };
    }

    return null;
  }

  /**
   * Delete all documents from the collection
   */
  async clear(): Promise<void> {
    if (!this.collection) return;

    try {
      await this.client.deleteCollection({ name: 'warhammer_lore' });
      this.collection = await this.client.getOrCreateCollection({
        name: 'warhammer_lore',
        metadata: { 'hnsw:space': 'cosine' },
      });
      logger.info('ChromaDB collection cleared');
    } catch (error) {
      logger.error('Failed to clear ChromaDB collection', { error });
      throw error;
    }
  }
}
