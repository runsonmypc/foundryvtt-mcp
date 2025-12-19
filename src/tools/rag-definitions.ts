/**
 * @fileoverview RAG tool definitions for MCP
 *
 * These tools provide AI assistants with access to Warhammer Fantasy lore
 * through semantic search over the Lexicanum dataset.
 */

/**
 * RAG tool definitions for Warhammer lore retrieval
 */
export const ragTools = [
  {
    name: 'warhammer_lore_search',
    description: `Search the Warhammer Fantasy knowledge base for lore relevant to a query.
Returns the most relevant entries from the Lexicanum wiki, which contains comprehensive
information about the Warhammer World including:

- Characters: Famous heroes, villains, and historical figures
- Locations: Cities, provinces, kingdoms, and landmarks
- Creatures: Beasts, monsters, and races of the Old World
- Organizations: Guilds, cults, knightly orders, and factions
- Events: Wars, treaties, and historical events
- Deities: Gods and their worship
- Items: Artifacts, weapons, and magical items

Use this tool to:
- Research NPCs, locations, or factions for accurate roleplay
- Find canonical details about Warhammer creatures or places
- Get historical context for campaign events
- Understand the lore behind game mechanics`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - describe what lore you need (e.g., "Altdorf history", "Skaven clans", "Sigmar worship")',
        },
        category: {
          type: 'string',
          enum: ['any', 'character', 'location', 'creature', 'item', 'event', 'organization', 'deity', 'spell', 'general'],
          description: 'Filter results by category (optional)',
          default: 'any',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results (1-10)',
          default: 5,
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'warhammer_lore_lookup',
    description: `Look up a specific Warhammer entity by name.
Use this when you know the exact name of what you're looking for.
Returns detailed information if found in the knowledge base.

Examples:
- "Karl Franz" - Current Emperor of the Empire
- "Altdorf" - Capital city of the Empire
- "Skaven" - The ratmen race
- "Sigmar" - The patron deity of the Empire`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Exact name of the entity to look up',
        },
        category: {
          type: 'string',
          enum: ['any', 'character', 'location', 'creature', 'item', 'event', 'organization', 'deity', 'spell', 'general'],
          description: 'Expected category (helps narrow search)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'warhammer_context',
    description: `Get contextual Warhammer lore for a game situation.
Use this when the AI DM needs background information to enhance roleplay.
Returns formatted lore context that can be used to inform responses.

Provide a description of the current situation and any relevant entity names.
The system will search for and compile relevant lore to help maintain
setting authenticity.`,
    inputSchema: {
      type: 'object',
      properties: {
        situation: {
          type: 'string',
          description: 'Description of the current game situation (e.g., "Players entering a Sigmarite temple in Altdorf")',
        },
        entities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of specific entities involved (NPCs, locations, factions)',
          default: [],
        },
        maxLength: {
          type: 'integer',
          description: 'Maximum context length in characters',
          default: 2000,
        },
      },
      required: ['situation'],
    },
  },
  {
    name: 'warhammer_lore_status',
    description: 'Get the status of the Warhammer lore database including document count and availability.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Get all RAG tool definitions
 */
export function getRAGTools() {
  return ragTools;
}
