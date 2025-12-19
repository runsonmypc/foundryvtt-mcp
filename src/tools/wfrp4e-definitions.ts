/**
 * @fileoverview WFRP 4th Edition tool definitions for MCP
 *
 * These tools provide AI assistants with the ability to interact with
 * Warhammer Fantasy Roleplay 4th Edition running on Foundry VTT.
 */

/**
 * WFRP4e character and combat tools
 */
export const wfrp4eTools = [
  {
    name: 'wfrp_skill_test',
    description: `Roll a WFRP 4e skill test for a character. Returns the roll result with Success Levels (SL).

Success Levels determine outcome quality:
- +6 or more: Astounding Success
- +4 to +5: Impressive Success
- +2 to +3: Success
- +1: Marginal Success
- 0 to -1: Marginal Failure
- -2 to -3: Failure
- -4 to -5: Impressive Failure
- -6 or less: Astounding Failure`,
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character to roll for',
        },
        skillName: {
          type: 'string',
          description: "Name of the skill (e.g., 'Athletics', 'Melee (Basic)', 'Stealth (Urban)')",
        },
        modifier: {
          type: 'integer',
          description: 'Modifier to target number (-60 to +60). Use for difficulty or situational mods.',
          default: 0,
        },
      },
      required: ['actorName', 'skillName'],
    },
  },
  {
    name: 'wfrp_characteristic_test',
    description: 'Roll a raw characteristic test (no skill). Use for untrained attempts or pure stat checks.',
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character to roll for',
        },
        characteristic: {
          type: 'string',
          enum: ['ws', 'bs', 's', 't', 'i', 'ag', 'dex', 'int', 'wp', 'fel'],
          description: 'Characteristic abbreviation (ws=Weapon Skill, bs=Ballistic Skill, s=Strength, t=Toughness, i=Initiative, ag=Agility, dex=Dexterity, int=Intelligence, wp=Willpower, fel=Fellowship)',
        },
        modifier: {
          type: 'integer',
          description: 'Modifier to target number',
          default: 0,
        },
      },
      required: ['actorName', 'characteristic'],
    },
  },
  {
    name: 'wfrp_apply_condition',
    description: `Apply a WFRP 4e condition to a character. Conditions have mechanical effects:
- Ablaze: Take 1d10 damage per round, -1 Ag per round until extinguished
- Bleeding: Lose 1 Wound per round until treated
- Blinded: -30 to vision-based tests, opponents get +30 to hit
- Broken: Must flee, -10 to all tests
- Deafened: -30 to hearing-based tests
- Entangled: Cannot move, -30 to tests requiring movement
- Fatigued: -10 to all tests per stack
- Poisoned: -10 to all tests, take damage over time
- Prone: -20 to melee defense, +20 to hit with ranged
- Stunned: Cannot take actions, opponents get +1 Advantage
- Surprised: Cannot act, opponents get +1 Advantage
- Unconscious: Cannot act, automatically hit in melee`,
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character',
        },
        condition: {
          type: 'string',
          enum: ['ablaze', 'bleeding', 'blinded', 'broken', 'deafened',
                 'entangled', 'fatigued', 'poisoned', 'prone', 'stunned',
                 'surprised', 'unconscious'],
          description: 'The condition to apply',
        },
        value: {
          type: 'integer',
          description: 'Condition stacks (for stackable conditions like Bleeding, Fatigued)',
          default: 1,
        },
      },
      required: ['actorName', 'condition'],
    },
  },
  {
    name: 'wfrp_remove_condition',
    description: 'Remove a condition from a character',
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character',
        },
        condition: {
          type: 'string',
          enum: ['ablaze', 'bleeding', 'blinded', 'broken', 'deafened',
                 'entangled', 'fatigued', 'poisoned', 'prone', 'stunned',
                 'surprised', 'unconscious'],
          description: 'The condition to remove',
        },
        value: {
          type: 'integer',
          description: 'Stacks to remove (0 = all)',
          default: 0,
        },
      },
      required: ['actorName', 'condition'],
    },
  },
  {
    name: 'wfrp_modify_advantage',
    description: `Modify a character's Advantage. In WFRP 4e, Advantage represents combat momentum:
- Gain +1 when winning opposed tests, causing conditions, charging, outnumbering
- Lose all when taking damage, becoming surprised, or disengaging
- Add Advantage to all combat tests
- Max Advantage = Initiative Bonus (usually 3-5)`,
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character',
        },
        operation: {
          type: 'string',
          enum: ['add', 'remove', 'set', 'reset'],
          description: 'add/remove value, set to specific value, or reset to 0',
        },
        value: {
          type: 'integer',
          description: 'Value for the operation (ignored for reset)',
          default: 1,
        },
      },
      required: ['actorName', 'operation'],
    },
  },
  {
    name: 'wfrp_apply_damage',
    description: `Apply damage to a character with hit location. WFRP damage is reduced by Toughness Bonus + Armor.

Hit locations affect critical injuries:
- Head: Crits cause blackouts, blindness, death
- Arm: Crits cause drops, fractures, amputations
- Body: Crits cause organ damage, broken ribs
- Leg: Crits cause falls, movement penalties, amputations`,
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character',
        },
        damage: {
          type: 'integer',
          description: 'Raw damage before reduction',
        },
        location: {
          type: 'string',
          enum: ['head', 'lArm', 'rArm', 'body', 'lLeg', 'rLeg'],
          description: 'Hit location (random if not specified)',
        },
        ignoreAP: {
          type: 'boolean',
          description: 'Ignore armor points',
          default: false,
        },
        ignoreTB: {
          type: 'boolean',
          description: 'Ignore toughness bonus',
          default: false,
        },
      },
      required: ['actorName', 'damage'],
    },
  },
  {
    name: 'wfrp_modify_wounds',
    description: 'Heal or damage a character directly (bypassing normal damage calculation)',
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character',
        },
        operation: {
          type: 'string',
          enum: ['heal', 'damage', 'set'],
          description: 'heal = add wounds, damage = remove wounds, set = set to exact value',
        },
        value: {
          type: 'integer',
          description: 'Number of wounds to heal/damage, or exact value to set',
        },
      },
      required: ['actorName', 'operation', 'value'],
    },
  },
  {
    name: 'wfrp_get_actor_summary',
    description: 'Get a comprehensive summary of a WFRP 4e character including characteristics, skills, talents, wounds, conditions, and equipment',
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character',
        },
      },
      required: ['actorName'],
    },
  },
  {
    name: 'wfrp_opposed_test',
    description: 'Initiate an opposed test between two characters (e.g., Melee vs Melee, Charm vs Cool, Stealth vs Perception). The winner is determined by comparing Success Levels.',
    inputSchema: {
      type: 'object',
      properties: {
        attackerName: {
          type: 'string',
          description: 'Name of the attacking/initiating character',
        },
        attackerSkill: {
          type: 'string',
          description: 'Skill used by the attacker',
        },
        defenderName: {
          type: 'string',
          description: 'Name of the defending/opposing character',
        },
        defenderSkill: {
          type: 'string',
          description: 'Skill used by the defender',
        },
        attackerModifier: {
          type: 'integer',
          description: 'Modifier for the attacker',
          default: 0,
        },
        defenderModifier: {
          type: 'integer',
          description: 'Modifier for the defender',
          default: 0,
        },
      },
      required: ['attackerName', 'attackerSkill', 'defenderName', 'defenderSkill'],
    },
  },
  {
    name: 'wfrp_list_actors',
    description: 'List all actors (characters, NPCs, creatures) in the current Foundry world',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wfrp_get_actor_skills',
    description: "Get all skills for a character, showing trained skills with their totals",
    inputSchema: {
      type: 'object',
      properties: {
        actorName: {
          type: 'string',
          description: 'Name of the character',
        },
      },
      required: ['actorName'],
    },
  },
  {
    name: 'wfrp_get_combat_status',
    description: 'Get the current combat status including combatants, initiative order, round number, and whose turn it is',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wfrp_send_chat_message',
    description: 'Send a message to the Foundry VTT chat as the GM or a character',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The message content (supports basic HTML)',
        },
        speaker: {
          type: 'string',
          description: 'Name of the character to speak as (optional, defaults to GM)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'wfrp_execute_script',
    description: 'Execute arbitrary JavaScript in Foundry VTT. Use for advanced operations not covered by other tools. The script should return a value.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript code to execute in Foundry. Must include a return statement.',
        },
      },
      required: ['script'],
    },
  },
];

/**
 * Get all WFRP4e tool definitions
 */
export function getWFRP4eTools() {
  return wfrp4eTools;
}
