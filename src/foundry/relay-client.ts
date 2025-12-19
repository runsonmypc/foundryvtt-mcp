/**
 * @fileoverview Relay API client for FoundryVTT REST API relay server
 *
 * This client communicates with the ThreeHats/foundryvtt-rest-api-relay server
 * to interact with Foundry VTT instances.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';

export interface RelayClientConfig {
  /** Base URL of the relay server */
  relayUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Client ID of the connected Foundry instance */
  clientId: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface RelayClient {
  id: string;
  instanceId: string;
  worldId: string;
  worldTitle: string;
  foundryVersion: string;
  systemId: string;
  systemTitle: string;
  systemVersion: string;
}

export interface ExecuteJsResult<T = unknown> {
  requestId: string;
  clientId: string;
  type: string;
  success: boolean;
  result?: T;
  error?: string;
}

export interface RollResult {
  requestId: string;
  clientId: string;
  type: string;
  success: boolean;
  data: {
    id: string;
    chatMessageCreated: boolean;
    roll: {
      formula: string;
      total: number;
      isCritical: boolean;
      isFumble: boolean;
      dice: Array<{
        faces: number;
        results: Array<{ result: number; active: boolean }>;
      }>;
      timestamp: number;
    };
  };
}

/**
 * Client for communicating with Foundry VTT via the relay server
 */
export class FoundryRelayClient {
  private http: AxiosInstance;
  private config: Required<RelayClientConfig>;

  constructor(config: RelayClientConfig) {
    this.config = {
      timeout: 15000,
      ...config,
    };

    this.http = axios.create({
      baseURL: this.config.relayUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
      },
    });

    logger.info('FoundryRelayClient initialized', {
      relayUrl: this.config.relayUrl,
      clientId: this.config.clientId,
    });
  }

  /**
   * Get list of connected Foundry clients
   */
  async getClients(): Promise<{ total: number; clients: RelayClient[] }> {
    const response = await this.http.get('/clients');
    return response.data;
  }

  /**
   * Execute JavaScript code in the Foundry VTT client
   * This is the most powerful method - can run any Foundry API code
   */
  async executeJs<T = unknown>(script: string): Promise<T> {
    logger.debug('Executing JS in Foundry', { script: script.substring(0, 100) });

    const response = await this.http.post<ExecuteJsResult<T>>(
      `/execute-js?clientId=${this.config.clientId}`,
      { script }
    );

    if (!response.data.success) {
      throw new Error(response.data.error || 'Script execution failed');
    }

    return response.data.result as T;
  }

  /**
   * Roll dice using Foundry's dice system
   */
  async roll(formula: string, flavor?: string): Promise<RollResult['data']['roll']> {
    logger.debug('Rolling dice', { formula, flavor });

    const response = await this.http.post<RollResult>(
      `/roll?clientId=${this.config.clientId}`,
      { formula, flavor }
    );

    if (!response.data.success) {
      throw new Error('Dice roll failed');
    }

    return response.data.data.roll;
  }

  /**
   * Get an entity by UUID
   */
  async getEntity<T = unknown>(uuid: string): Promise<T> {
    const response = await this.http.get(
      `/get?clientId=${this.config.clientId}&uuid=${encodeURIComponent(uuid)}`
    );

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    return response.data.data as T;
  }

  /**
   * Get all actors in the world
   */
  async getActors(): Promise<Array<{ id: string; name: string; type: string }>> {
    return this.executeJs(`
      return game.actors.contents.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type
      }))
    `);
  }

  /**
   * Get an actor by name
   */
  async getActorByName(name: string): Promise<unknown> {
    return this.executeJs(`
      const actor = game.actors.getName("${name.replace(/"/g, '\\"')}");
      if (!actor) return null;
      return {
        id: actor.id,
        name: actor.name,
        type: actor.type,
        system: actor.system,
        items: actor.items.contents.map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
          system: i.system
        })),
        effects: actor.effects.contents.map(e => ({
          id: e.id,
          name: e.name,
          icon: e.icon,
          disabled: e.disabled
        }))
      };
    `);
  }

  /**
   * Get an actor by ID
   */
  async getActorById(id: string): Promise<unknown> {
    return this.executeJs(`
      const actor = game.actors.get("${id}");
      if (!actor) return null;
      return {
        id: actor.id,
        name: actor.name,
        type: actor.type,
        system: actor.system,
        items: actor.items.contents.map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
          system: i.system
        })),
        effects: actor.effects.contents.map(e => ({
          id: e.id,
          name: e.name,
          icon: e.icon,
          disabled: e.disabled
        }))
      };
    `);
  }

  /**
   * Get all scenes in the world
   */
  async getScenes(): Promise<Array<{ id: string; name: string; active: boolean }>> {
    return this.executeJs(`
      return game.scenes.contents.map(s => ({
        id: s.id,
        name: s.name,
        active: s.active
      }))
    `);
  }

  /**
   * Get the current active scene
   */
  async getCurrentScene(): Promise<unknown> {
    return this.executeJs(`
      const scene = game.scenes.active;
      if (!scene) return null;
      return {
        id: scene.id,
        name: scene.name,
        width: scene.width,
        height: scene.height,
        tokens: scene.tokens.contents.map(t => ({
          id: t.id,
          name: t.name,
          actorId: t.actorId,
          x: t.x,
          y: t.y,
          disposition: t.disposition
        }))
      };
    `);
  }

  /**
   * Get combat information
   */
  async getCombat(): Promise<unknown> {
    return this.executeJs(`
      const combat = game.combat;
      if (!combat) return null;
      return {
        id: combat.id,
        round: combat.round,
        turn: combat.turn,
        started: combat.started,
        combatants: combat.combatants.contents.map(c => ({
          id: c.id,
          name: c.name,
          actorId: c.actorId,
          initiative: c.initiative,
          defeated: c.defeated,
          hidden: c.hidden
        }))
      };
    `);
  }

  /**
   * Send a chat message
   */
  async sendChatMessage(content: string, options: { speaker?: string; whisper?: string[] } = {}): Promise<void> {
    const speakerCode = options.speaker
      ? `ChatMessage.getSpeaker({actor: game.actors.getName("${options.speaker.replace(/"/g, '\\"')}")})`
      : 'ChatMessage.getSpeaker()';

    const whisperCode = options.whisper?.length
      ? `[${options.whisper.map(u => `"${u.replace(/"/g, '\\"')}"`).join(',')}]`
      : '[]';

    await this.executeJs(`
      await ChatMessage.create({
        content: "${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}",
        speaker: ${speakerCode},
        whisper: ${whisperCode}
      });
      return true;
    `);
  }

  /**
   * Test connection to the relay and Foundry
   */
  async testConnection(): Promise<boolean> {
    try {
      const clients = await this.getClients();
      const connected = clients.clients.some(c => c.id === this.config.clientId);

      if (!connected) {
        logger.warn('Configured clientId not found in connected clients', {
          configuredId: this.config.clientId,
          availableClients: clients.clients.map(c => c.id),
        });
      }

      return connected;
    } catch (error) {
      logger.error('Connection test failed', { error });
      return false;
    }
  }
}
