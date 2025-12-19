/**
 * @fileoverview RAG tool handlers for MCP
 *
 * Implements the handlers for Warhammer lore retrieval tools.
 */

import { RAGService, LoreCategory } from '../rag/index.js';
import { logger } from '../utils/logger.js';

/**
 * Handle RAG tool calls
 */
export async function handleRAGTool(
  ragService: RAGService,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  logger.debug('Handling RAG tool', { toolName, args });

  try {
    switch (toolName) {
      case 'warhammer_lore_search': {
        const query = args.query as string;
        const category = (args.category as LoreCategory) || 'any';
        const limit = Math.min(Math.max((args.limit as number) || 5, 1), 10);

        const results = await ragService.search(query, { limit, category });

        if (results.length === 0) {
          return formatResponse(
            `No lore found for: "${query}"\n\n` +
            `Try:\n` +
            `- Using different keywords\n` +
            `- Removing category filters\n` +
            `- Checking spelling of proper nouns`
          );
        }

        const formatted = results.map((r, i) =>
          `### ${i + 1}. ${r.title} (${r.type})\n` +
          `**Relevance:** ${Math.round(r.relevance * 100)}%\n\n` +
          `${r.text.slice(0, 500)}${r.text.length > 500 ? '...' : ''}`
        ).join('\n\n---\n\n');

        return formatResponse(
          `## Warhammer Lore Search Results\n` +
          `*Query: "${query}"${category !== 'any' ? ` | Category: ${category}` : ''}*\n\n` +
          formatted
        );
      }

      case 'warhammer_lore_lookup': {
        const name = args.name as string;
        const category = args.category as LoreCategory | undefined;

        const result = await ragService.lookupEntity(name, category);

        if (!result) {
          return formatResponse(
            `Entity not found: "${name}"\n\n` +
            `This entity may not exist in the Lexicanum database, or you may need to try:\n` +
            `- A different spelling or variation of the name\n` +
            `- Using warhammer_lore_search for a broader search`
          );
        }

        return formatResponse(
          `## ${result.title}\n` +
          `**Type:** ${result.type}\n` +
          `**Relevance:** ${Math.round(result.relevance * 100)}%\n\n` +
          result.text +
          (result.url ? `\n\n*Source: ${result.url}*` : '')
        );
      }

      case 'warhammer_context': {
        const situation = args.situation as string;
        const entities = (args.entities as string[]) || [];
        const maxLength = (args.maxLength as number) || 2000;

        const context = await ragService.getContextForSituation(situation, entities);

        if (context.sourceCount === 0) {
          return formatResponse(
            `No relevant lore found for this situation.\n\n` +
            `Consider using warhammer_lore_search with specific keywords from the situation.`
          );
        }

        return formatResponse(
          context.text +
          `\n---\n*Sources: ${context.sources.join(', ')}*`
        );
      }

      case 'warhammer_lore_status': {
        const isReady = ragService.isReady();

        if (!isReady) {
          return formatResponse(
            `## Warhammer Lore Database Status\n\n` +
            `**Status:** Not Available\n\n` +
            `The lore database is not initialized. This could mean:\n` +
            `- ChromaDB is not running\n` +
            `- The Lexicanum dataset hasn't been ingested\n` +
            `- Configuration is missing\n\n` +
            `Run the ingestion script to populate the database:\n` +
            `\`npx tsx scripts/ingest-lexicanum.ts\``
          );
        }

        const count = await ragService.getDocumentCount();

        return formatResponse(
          `## Warhammer Lore Database Status\n\n` +
          `**Status:** Online\n` +
          `**Documents:** ${count.toLocaleString()}\n\n` +
          `The Warhammer lore database is ready for queries.\n\n` +
          `Available tools:\n` +
          `- \`warhammer_lore_search\` - Semantic search for lore\n` +
          `- \`warhammer_lore_lookup\` - Look up specific entities\n` +
          `- \`warhammer_context\` - Get context for game situations`
        );
      }

      default:
        throw new Error(`Unknown RAG tool: ${toolName}`);
    }
  } catch (error) {
    logger.error('RAG tool error', { toolName, error });
    const message = error instanceof Error ? error.message : String(error);
    return formatResponse(`**Error:** ${message}`);
  }
}

/**
 * Format a response for MCP
 */
function formatResponse(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Check if a tool name is a RAG tool
 */
export function isRAGTool(toolName: string): boolean {
  return toolName.startsWith('warhammer_');
}
