/**
 * @fileoverview WFRP 4e specific client for Foundry VTT
 *
 * Extends the relay client with WFRP 4th Edition specific functionality
 * including skill tests, characteristic tests, conditions, advantage, and damage.
 */

import { FoundryRelayClient, RelayClientConfig } from './relay-client.js';
import { logger } from '../utils/logger.js';

// WFRP4e Types
export interface WFRPCharacteristic {
  initial: number;
  advances: number;
  modifier: number;
  bonusMod: number;
  calculationBonusModifier: number;
}

export interface WFRPCharacteristics {
  ws: WFRPCharacteristic;
  bs: WFRPCharacteristic;
  s: WFRPCharacteristic;
  t: WFRPCharacteristic;
  i: WFRPCharacteristic;
  ag: WFRPCharacteristic;
  dex: WFRPCharacteristic;
  int: WFRPCharacteristic;
  wp: WFRPCharacteristic;
  fel: WFRPCharacteristic;
}

export interface WFRPStatus {
  wounds: { value: number; max: number };
  advantage: { value: number; max: number };
  criticalWounds: { value: number; max: number };
  sin: { value: number };
  corruption: { value: number; max: number };
  fate: { value: number };
  fortune: { value: number };
  resilience: { value: number };
  resolve: { value: number };
}

export interface WFRPTestResult {
  roll: number;
  target: number;
  SL: number;
  outcome: 'success' | 'failure';
  description: string;
  critical?: boolean;
  fumble?: boolean;
}

export interface WFRPActorSummary {
  id: string;
  name: string;
  type: string;
  species: string;
  career: string;
  careerLevel: string;
  characteristics: {
    WS: number;
    BS: number;
    S: number;
    T: number;
    I: number;
    Ag: number;
    Dex: number;
    Int: number;
    WP: number;
    Fel: number;
  };
  wounds: { current: number; max: number };
  advantage: number;
  fate: number;
  fortune: number;
  resilience: number;
  resolve: number;
  skills: Array<{ name: string; total: number; advances: number }>;
  talents: string[];
  conditions: Array<{ name: string; value: number }>;
  equippedWeapons: Array<{ name: string; damage: string; qualities: string }>;
  equippedArmor: Array<{ name: string; locations: object; qualities: string }>;
}

export type WFRPCondition =
  | 'ablaze' | 'bleeding' | 'blinded' | 'broken' | 'deafened'
  | 'entangled' | 'fatigued' | 'poisoned' | 'prone' | 'stunned'
  | 'surprised' | 'unconscious';

/**
 * WFRP 4th Edition specific client
 */
export class WFRP4eClient extends FoundryRelayClient {
  constructor(config: RelayClientConfig) {
    super(config);
    logger.info('WFRP4eClient initialized');
  }

  /**
   * Roll a WFRP4e skill test
   */
  async rollSkillTest(
    actorName: string,
    skillName: string,
    options: { modifier?: number; skipDialog?: boolean } = {}
  ): Promise<WFRPTestResult> {
    const modifier = options.modifier ?? 0;
    const skipDialog = options.skipDialog ?? true;

    logger.info('Rolling skill test', { actorName, skillName, modifier });

    const result = await this.executeJs<WFRPTestResult>(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      const skill = actor.items.find(i =>
        i.type === "skill" &&
        i.name.toLowerCase() === "${skillName.toLowerCase().replace(/"/g, '\\"')}"
      );

      if (!skill) throw new Error("Skill '${skillName}' not found on actor");

      const test = await actor.setupSkill(skill, {
        bypass: ${skipDialog},
        absolute: { modifier: ${modifier} }
      });

      await test.roll();

      return {
        roll: test.result.roll,
        target: test.result.target,
        SL: test.result.SL,
        outcome: test.result.outcome,
        description: test.result.description,
        critical: test.result.critical,
        fumble: test.result.fumble
      };
    `);

    return result;
  }

  /**
   * Roll a WFRP4e characteristic test
   */
  async rollCharacteristicTest(
    actorName: string,
    characteristic: string,
    modifier: number = 0
  ): Promise<WFRPTestResult> {
    logger.info('Rolling characteristic test', { actorName, characteristic, modifier });

    const result = await this.executeJs<WFRPTestResult>(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      const test = await actor.setupCharacteristic("${characteristic}", {
        bypass: true,
        absolute: { modifier: ${modifier} }
      });

      await test.roll();

      return {
        roll: test.result.roll,
        target: test.result.target,
        SL: test.result.SL,
        outcome: test.result.outcome,
        description: test.result.description,
        critical: test.result.critical,
        fumble: test.result.fumble
      };
    `);

    return result;
  }

  /**
   * Apply a condition to an actor
   */
  async applyCondition(
    actorName: string,
    condition: WFRPCondition,
    value: number = 1
  ): Promise<void> {
    logger.info('Applying condition', { actorName, condition, value });

    await this.executeJs(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      await actor.addCondition("${condition}", ${value});
      return true;
    `);
  }

  /**
   * Remove a condition from an actor
   */
  async removeCondition(
    actorName: string,
    condition: WFRPCondition,
    value: number = 0
  ): Promise<void> {
    logger.info('Removing condition', { actorName, condition, value });

    const removeCode = value === 0
      ? `await actor.removeCondition("${condition}");`
      : `for (let i = 0; i < ${value}; i++) await actor.removeCondition("${condition}");`;

    await this.executeJs(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      ${removeCode}
      return true;
    `);
  }

  /**
   * Modify advantage
   */
  async modifyAdvantage(
    actorName: string,
    operation: 'add' | 'remove' | 'set' | 'reset',
    value: number = 1
  ): Promise<number> {
    logger.info('Modifying advantage', { actorName, operation, value });

    const result = await this.executeJs<number>(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      let newValue;
      const current = actor.system.status.advantage.value;

      switch ("${operation}") {
        case "add":
          newValue = current + ${value};
          break;
        case "remove":
          newValue = Math.max(0, current - ${value});
          break;
        case "set":
          newValue = ${value};
          break;
        case "reset":
          newValue = 0;
          break;
      }

      await actor.update({ "system.status.advantage.value": newValue });
      return newValue;
    `);

    return result;
  }

  /**
   * Apply damage to an actor
   */
  async applyDamage(
    actorName: string,
    damage: number,
    options: {
      location?: 'head' | 'lArm' | 'rArm' | 'body' | 'lLeg' | 'rLeg';
      ignoreAP?: boolean;
      ignoreTB?: boolean;
    } = {}
  ): Promise<{ woundsDealt: number; remainingWounds: number }> {
    logger.info('Applying damage', { actorName, damage, options });

    const result = await this.executeJs<{ woundsDealt: number; remainingWounds: number }>(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      const location = "${options.location || ''}";
      const hitLoc = location || (await game.wfrp4e.tables.rollTable("hitloc")).result;

      const damageArgs = {
        damage: ${damage},
        loc: hitLoc,
        AP: ${options.ignoreAP ? 0 : 'undefined'},
        TB: ${options.ignoreTB ? 0 : 'undefined'}
      };

      const woundsDealt = await actor.applyBasicDamage(damageArgs);

      return {
        woundsDealt,
        remainingWounds: actor.system.status.wounds.value
      };
    `);

    return result;
  }

  /**
   * Get a comprehensive summary of a WFRP4e actor
   */
  async getActorSummary(actorName: string): Promise<WFRPActorSummary> {
    logger.info('Getting actor summary', { actorName });

    const result = await this.executeJs<WFRPActorSummary>(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      const chars = actor.system.characteristics;
      const status = actor.system.status;
      const details = actor.system.details;

      return {
        id: actor.id,
        name: actor.name,
        type: actor.type,
        species: details.species?.value || "Unknown",
        career: details.career?.value || "None",
        careerLevel: details.careerlevel?.value || "",

        characteristics: {
          WS: chars.ws.initial + chars.ws.advances,
          BS: chars.bs.initial + chars.bs.advances,
          S: chars.s.initial + chars.s.advances,
          T: chars.t.initial + chars.t.advances,
          I: chars.i.initial + chars.i.advances,
          Ag: chars.ag.initial + chars.ag.advances,
          Dex: chars.dex.initial + chars.dex.advances,
          Int: chars.int.initial + chars.int.advances,
          WP: chars.wp.initial + chars.wp.advances,
          Fel: chars.fel.initial + chars.fel.advances
        },

        wounds: {
          current: status.wounds.value,
          max: status.wounds.max
        },

        advantage: status.advantage.value,
        fate: status.fate.value,
        fortune: status.fortune.value,
        resilience: status.resilience.value,
        resolve: status.resolve.value,

        skills: actor.items
          .filter(i => i.type === "skill" && i.system.advances.value > 0)
          .map(s => ({
            name: s.name,
            total: s.system.total.value,
            advances: s.system.advances.value
          }))
          .sort((a, b) => b.total - a.total),

        talents: actor.items
          .filter(i => i.type === "talent")
          .map(t => t.name),

        conditions: actor.effects
          .filter(e => e.isCondition)
          .map(c => ({
            name: c.name || c.label,
            value: c.conditionValue || 1
          })),

        equippedWeapons: actor.items
          .filter(i => i.type === "weapon" && i.system.equipped)
          .map(w => ({
            name: w.name,
            damage: w.system.damage?.value || "0",
            qualities: Object.keys(w.system.qualities?.value || {}).join(", ")
          })),

        equippedArmor: actor.items
          .filter(i => i.type === "armour" && i.system.worn)
          .map(a => ({
            name: a.name,
            locations: a.system.AP || {},
            qualities: Object.keys(a.system.qualities?.value || {}).join(", ")
          }))
      };
    `);

    return result;
  }

  /**
   * Perform an opposed test between two actors
   */
  async opposedTest(
    attackerName: string,
    attackerSkill: string,
    defenderName: string,
    defenderSkill: string,
    options: { attackerModifier?: number; defenderModifier?: number } = {}
  ): Promise<{
    attacker: WFRPTestResult;
    defender: WFRPTestResult;
    winner: 'attacker' | 'defender' | 'tie';
    netSL: number;
  }> {
    logger.info('Running opposed test', {
      attackerName,
      attackerSkill,
      defenderName,
      defenderSkill,
    });

    // Roll both tests
    const attackerResult = await this.rollSkillTest(attackerName, attackerSkill,
      options.attackerModifier !== undefined ? { modifier: options.attackerModifier } : {}
    );

    const defenderResult = await this.rollSkillTest(defenderName, defenderSkill,
      options.defenderModifier !== undefined ? { modifier: options.defenderModifier } : {}
    );

    // Calculate winner
    const netSL = attackerResult.SL - defenderResult.SL;
    let winner: 'attacker' | 'defender' | 'tie';

    if (netSL > 0) {
      winner = 'attacker';
    } else if (netSL < 0) {
      winner = 'defender';
    } else {
      // Tie-breaker: higher SL wins, then higher roll
      if (attackerResult.SL > defenderResult.SL) {
        winner = 'attacker';
      } else if (defenderResult.SL > attackerResult.SL) {
        winner = 'defender';
      } else {
        winner = attackerResult.roll > defenderResult.roll ? 'attacker' : 'defender';
      }
    }

    return {
      attacker: attackerResult,
      defender: defenderResult,
      winner,
      netSL,
    };
  }

  /**
   * Get all items of a specific type for an actor
   */
  async getActorItems(
    actorName: string,
    itemType?: 'skill' | 'talent' | 'weapon' | 'armour' | 'trapping' | 'spell' | 'prayer'
  ): Promise<Array<{ id: string; name: string; type: string; system: unknown }>> {
    const typeFilter = itemType ? `&& i.type === "${itemType}"` : '';

    return this.executeJs(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      return actor.items
        .filter(i => true ${typeFilter})
        .map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
          system: i.system
        }));
    `);
  }

  /**
   * Modify wounds on an actor
   */
  async modifyWounds(
    actorName: string,
    operation: 'heal' | 'damage' | 'set',
    value: number
  ): Promise<{ current: number; max: number }> {
    logger.info('Modifying wounds', { actorName, operation, value });

    return this.executeJs(`
      const actor = game.actors.getName("${actorName.replace(/"/g, '\\"')}");
      if (!actor) throw new Error("Actor '${actorName}' not found");

      const current = actor.system.status.wounds.value;
      const max = actor.system.status.wounds.max;
      let newValue;

      switch ("${operation}") {
        case "heal":
          newValue = Math.min(max, current + ${value});
          break;
        case "damage":
          newValue = Math.max(0, current - ${value});
          break;
        case "set":
          newValue = Math.max(0, Math.min(max, ${value}));
          break;
      }

      await actor.update({ "system.status.wounds.value": newValue });
      return { current: newValue, max };
    `);
  }
}
