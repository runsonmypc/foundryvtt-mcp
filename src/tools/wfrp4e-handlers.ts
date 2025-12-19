/**
 * @fileoverview WFRP 4th Edition tool handlers for MCP
 *
 * Implements the handlers for WFRP4e-specific MCP tools using the WFRP4eClient.
 */

import { WFRP4eClient, WFRPCondition } from '../foundry/wfrp4e-client.js';
import { logger } from '../utils/logger.js';

/**
 * Handle WFRP4e tool calls
 */
export async function handleWFRP4eTool(
  client: WFRP4eClient,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  logger.debug('Handling WFRP4e tool', { toolName, args });

  try {
    switch (toolName) {
      case 'wfrp_skill_test': {
        const modifier = args.modifier as number | undefined;
        const options = modifier !== undefined ? { modifier } : {};
        const result = await client.rollSkillTest(
          args.actorName as string,
          args.skillName as string,
          options
        );
        return formatResponse(
          `**${args.actorName}** rolls **${args.skillName}**\n` +
          `Roll: ${result.roll} vs Target: ${result.target}\n` +
          `**${result.description}** (SL: ${result.SL >= 0 ? '+' : ''}${result.SL})\n` +
          `Outcome: ${result.outcome.toUpperCase()}` +
          (result.critical ? ' - CRITICAL!' : '') +
          (result.fumble ? ' - FUMBLE!' : '')
        );
      }

      case 'wfrp_characteristic_test': {
        const modifier = typeof args.modifier === 'number' ? args.modifier : 0;
        const result = await client.rollCharacteristicTest(
          args.actorName as string,
          args.characteristic as string,
          modifier
        );
        const charNames: Record<string, string> = {
          ws: 'Weapon Skill', bs: 'Ballistic Skill', s: 'Strength',
          t: 'Toughness', i: 'Initiative', ag: 'Agility',
          dex: 'Dexterity', int: 'Intelligence', wp: 'Willpower', fel: 'Fellowship'
        };
        return formatResponse(
          `**${args.actorName}** rolls **${charNames[args.characteristic as string] || args.characteristic}**\n` +
          `Roll: ${result.roll} vs Target: ${result.target}\n` +
          `**${result.description}** (SL: ${result.SL >= 0 ? '+' : ''}${result.SL})\n` +
          `Outcome: ${result.outcome.toUpperCase()}`
        );
      }

      case 'wfrp_apply_condition': {
        const value = typeof args.value === 'number' ? args.value : 1;
        await client.applyCondition(
          args.actorName as string,
          args.condition as WFRPCondition,
          value
        );
        return formatResponse(
          `Applied **${args.condition}**${value > 1 ? ` (${value})` : ''} to **${args.actorName}**`
        );
      }

      case 'wfrp_remove_condition': {
        const value = typeof args.value === 'number' ? args.value : 0;
        await client.removeCondition(
          args.actorName as string,
          args.condition as WFRPCondition,
          value
        );
        return formatResponse(
          `Removed **${args.condition}** from **${args.actorName}**`
        );
      }

      case 'wfrp_modify_advantage': {
        const value = typeof args.value === 'number' ? args.value : 1;
        const newValue = await client.modifyAdvantage(
          args.actorName as string,
          args.operation as 'add' | 'remove' | 'set' | 'reset',
          value
        );
        return formatResponse(
          `**${args.actorName}** now has **${newValue}** Advantage`
        );
      }

      case 'wfrp_apply_damage': {
        const options: {
          location?: 'head' | 'lArm' | 'rArm' | 'body' | 'lLeg' | 'rLeg';
          ignoreAP?: boolean;
          ignoreTB?: boolean;
        } = {};
        if (args.location) {
          options.location = args.location as 'head' | 'lArm' | 'rArm' | 'body' | 'lLeg' | 'rLeg';
        }
        if (typeof args.ignoreAP === 'boolean') {
          options.ignoreAP = args.ignoreAP;
        }
        if (typeof args.ignoreTB === 'boolean') {
          options.ignoreTB = args.ignoreTB;
        }
        const result = await client.applyDamage(
          args.actorName as string,
          args.damage as number,
          options
        );
        return formatResponse(
          `**${args.actorName}** takes **${result.woundsDealt}** wounds\n` +
          `Remaining wounds: ${result.remainingWounds}`
        );
      }

      case 'wfrp_modify_wounds': {
        const result = await client.modifyWounds(
          args.actorName as string,
          args.operation as 'heal' | 'damage' | 'set',
          args.value as number
        );
        const opText = args.operation === 'heal' ? 'healed' : args.operation === 'damage' ? 'lost' : 'set to';
        return formatResponse(
          `**${args.actorName}** ${opText} **${args.value}** wounds\n` +
          `Current wounds: ${result.current}/${result.max}`
        );
      }

      case 'wfrp_get_actor_summary': {
        const summary = await client.getActorSummary(args.actorName as string);
        return formatResponse(formatActorSummary(summary));
      }

      case 'wfrp_opposed_test': {
        const options: { attackerModifier?: number; defenderModifier?: number } = {};
        if (typeof args.attackerModifier === 'number') {
          options.attackerModifier = args.attackerModifier;
        }
        if (typeof args.defenderModifier === 'number') {
          options.defenderModifier = args.defenderModifier;
        }
        const result = await client.opposedTest(
          args.attackerName as string,
          args.attackerSkill as string,
          args.defenderName as string,
          args.defenderSkill as string,
          options
        );
        return formatResponse(
          `**Opposed Test**\n\n` +
          `**${args.attackerName}** (${args.attackerSkill}): Roll ${result.attacker.roll} vs ${result.attacker.target} = SL ${result.attacker.SL >= 0 ? '+' : ''}${result.attacker.SL}\n` +
          `**${args.defenderName}** (${args.defenderSkill}): Roll ${result.defender.roll} vs ${result.defender.target} = SL ${result.defender.SL >= 0 ? '+' : ''}${result.defender.SL}\n\n` +
          `**Winner: ${result.winner === 'attacker' ? args.attackerName : args.defenderName}** (Net SL: ${result.netSL >= 0 ? '+' : ''}${result.netSL})`
        );
      }

      case 'wfrp_list_actors': {
        const actors = await client.getActors();
        if (actors.length === 0) {
          return formatResponse('No actors found in this world.');
        }
        const list = actors.map(a => `- **${a.name}** (${a.type})`).join('\n');
        return formatResponse(`**Actors in World:**\n${list}`);
      }

      case 'wfrp_get_actor_skills': {
        const items = await client.getActorItems(args.actorName as string, 'skill') as Array<{
          id: string;
          name: string;
          type: string;
          system: { advances?: { value?: number }; total?: { value?: number } };
        }>;
        const skills = items
          .filter(s => s.system?.advances?.value && s.system.advances.value > 0)
          .map(s => ({
            name: s.name,
            total: s.system?.total?.value || 0,
            advances: s.system?.advances?.value || 0,
          }))
          .sort((a, b) => b.total - a.total);

        if (skills.length === 0) {
          return formatResponse(`**${args.actorName}** has no trained skills.`);
        }

        const list = skills.map(s =>
          `- **${s.name}**: ${s.total} (${s.advances} advances)`
        ).join('\n');
        return formatResponse(`**${args.actorName}'s Skills:**\n${list}`);
      }

      case 'wfrp_get_combat_status': {
        const combat = await client.getCombat();
        if (!combat) {
          return formatResponse('No active combat.');
        }
        const c = combat as {
          round: number;
          turn: number;
          started: boolean;
          combatants: Array<{ name: string; initiative: number; defeated: boolean }>;
        };
        const combatants = c.combatants
          .sort((a, b) => (b.initiative || 0) - (a.initiative || 0))
          .map((cbt, i) => {
            const current = i === c.turn ? '➤ ' : '  ';
            const status = cbt.defeated ? ' (Defeated)' : '';
            return `${current}${cbt.name}: Initiative ${cbt.initiative || '?'}${status}`;
          })
          .join('\n');
        return formatResponse(
          `**Combat Status**\n` +
          `Round: ${c.round} | Started: ${c.started ? 'Yes' : 'No'}\n\n` +
          `**Initiative Order:**\n${combatants}`
        );
      }

      case 'wfrp_send_chat_message': {
        const options: { speaker?: string } = {};
        if (args.speaker) {
          options.speaker = args.speaker as string;
        }
        await client.sendChatMessage(args.content as string, options);
        return formatResponse(`Message sent to chat.`);
      }

      case 'wfrp_execute_script': {
        const result = await client.executeJs(args.script as string);
        return formatResponse(
          `**Script Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
        );
      }

      default:
        throw new Error(`Unknown WFRP4e tool: ${toolName}`);
    }
  } catch (error) {
    logger.error('WFRP4e tool error', { toolName, error });
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
 * Format an actor summary for display
 */
function formatActorSummary(summary: {
  name: string;
  type: string;
  species: string;
  career: string;
  careerLevel: string;
  characteristics: Record<string, number>;
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
}): string {
  const lines: string[] = [];

  lines.push(`# ${summary.name}`);
  lines.push(`**${summary.species || 'Unknown Species'}** | **${summary.career || 'No Career'}** ${summary.careerLevel || ''}`);
  lines.push('');

  // Characteristics
  lines.push('## Characteristics');
  const chars = summary.characteristics;
  lines.push(`| WS | BS | S | T | I | Ag | Dex | Int | WP | Fel |`);
  lines.push(`|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|`);
  lines.push(`| ${chars.WS} | ${chars.BS} | ${chars.S} | ${chars.T} | ${chars.I} | ${chars.Ag} | ${chars.Dex} | ${chars.Int} | ${chars.WP} | ${chars.Fel} |`);
  lines.push('');

  // Status
  lines.push('## Status');
  lines.push(`- **Wounds:** ${summary.wounds.current}/${summary.wounds.max}`);
  lines.push(`- **Advantage:** ${summary.advantage}`);
  lines.push(`- **Fate/Fortune:** ${summary.fate}/${summary.fortune}`);
  lines.push(`- **Resilience/Resolve:** ${summary.resilience}/${summary.resolve}`);
  lines.push('');

  // Conditions
  if (summary.conditions.length > 0) {
    lines.push('## Conditions');
    summary.conditions.forEach(c => {
      lines.push(`- ${c.name}${c.value > 1 ? ` (${c.value})` : ''}`);
    });
    lines.push('');
  }

  // Top Skills
  if (summary.skills.length > 0) {
    lines.push('## Top Skills');
    summary.skills.slice(0, 10).forEach(s => {
      lines.push(`- **${s.name}:** ${s.total}`);
    });
    lines.push('');
  }

  // Talents
  if (summary.talents.length > 0) {
    lines.push('## Talents');
    lines.push(summary.talents.join(', '));
    lines.push('');
  }

  // Equipment
  if (summary.equippedWeapons.length > 0) {
    lines.push('## Equipped Weapons');
    summary.equippedWeapons.forEach(w => {
      lines.push(`- **${w.name}** (Damage: ${w.damage}${w.qualities ? `, ${w.qualities}` : ''})`);
    });
    lines.push('');
  }

  if (summary.equippedArmor.length > 0) {
    lines.push('## Equipped Armor');
    summary.equippedArmor.forEach(a => {
      lines.push(`- **${a.name}**${a.qualities ? ` (${a.qualities})` : ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if a tool name is a WFRP4e tool
 */
export function isWFRP4eTool(toolName: string): boolean {
  return toolName.startsWith('wfrp_');
}
