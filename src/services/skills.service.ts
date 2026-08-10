import { db } from 'sdk';
import { chatUserStats, chatSkillUsers, chatQueuePlayers, chatGameSessions } from '../schema.js';
import { eq, and } from 'sdk/db';
import {
  CHLEN_CLASS_SKILLS,
  ChlenClass,
  StatusEffectId,
  GameCommand,
  SESSION_COOLDOWN_SECONDS,
} from '../utils/constants.js';
import type { SkillUserRecord, QueuePlayerRecord, GameSessionRecord } from '../types/models.js';
import { addStatusEffect } from './statusEffects.service.js';
import { formatDisplayName, getUserByUsername } from './user.service.js';
import { getUserClass, getChlenomantCharges, resetChlenomantCharges } from './class.service.js';
import { handleGameCommand } from './game.service.js';
import type { CommandResult } from './game.service.js';
import { getUserMention } from './queue.service.js';
import { pluralize } from '../utils/pluralize.js';

export async function getUserSkillText(
  chatId: string,
  userId: string
): Promise<{ skillText: string; alreadyUsed: boolean } | null> {
  const userStatsRows = (await db
    .select()
    .from(chatUserStats)
    .where(and(eq(chatUserStats.chatId, chatId), eq(chatUserStats.userId, userId)))
    .run()) as { classIndex: number | null }[];

  const classIndex = userStatsRows[0]?.classIndex;
  const classValues = Object.values(ChlenClass);

  if (!classIndex || classIndex < 1 || classIndex > classValues.length) {
    return null;
  }

  const skillText = CHLEN_CLASS_SKILLS[classValues[classIndex - 1]];

  const skillRows = (await db
    .select()
    .from(chatSkillUsers)
    .where(and(eq(chatSkillUsers.chatId, chatId), eq(chatSkillUsers.userId, userId)))
    .run()) as SkillUserRecord[];

  const alreadyUsed = skillRows && skillRows.length > 0;

  return { skillText, alreadyUsed };
}

export async function recordSkillUsed(chatId: string, userId: string): Promise<void> {
  await db
    .insert(chatSkillUsers)
    .values({ chatId, userId })
    .onConflictDoUpdate({
      target: [chatSkillUsers.chatId, chatSkillUsers.userId],
      set: { chatId, userId },
    })
    .run();
}

export interface TargetResult {
  success: boolean;
  message: string;
}

export async function applyWeaknessToTarget(
  chatId: string,
  userId: string,
  targetText: string
): Promise<TargetResult> {
  if (!targetText) {
    return {
      success: false,
      message: `Укажите @username цели: ${GameCommand.SKILL} @username`,
    };
  }

  if (!targetText.startsWith('@')) {
    return { success: false, message: 'Неверная цель. Нужно указать @username.' };
  }

  const target = await getUserByUsername(targetText);

  if (!target) {
    return { success: false, message: 'Цель не найдена. Укажите @username.' };
  }

  if (target.id === userId) {
    return { success: false, message: 'Нельзя наложить Членослабость на себя!' };
  }

  await addStatusEffect(chatId, target.id, StatusEffectId.WEAKNESS);

  return {
    success: true,
    message: `${formatDisplayName(target.firstName, target.lastName)} получил Членослабость! Шанс победы уменьшен в 2 раза.`,
  };
}

export interface SkillUseResult {
  success: boolean;
  /** Text to send on failure, or the effect message for single-message skills (Членокнижник / Членодин). */
  message?: string;
  /** Lyric activation text for multi-message skills (Членомант / Охотник / Мастер). */
  activationMessage?: string;
  /** Game rolls executed by the skill (Членомант / Охотник). */
  rolls?: CommandResult[];
}

/**
 * Handle /chlenskill: validates game state and dispatches the class-specific skill.
 * The once-per-game cooldown is recorded only when the skill is successfully used.
 */
export async function useSkill(
  chatId: string,
  userId: string,
  userDisplayName: string,
  rawText: string
): Promise<SkillUseResult> {
  const nowUnix = Math.floor(Date.now() / 1000);

  // Gate 1: active game session required
  const sessionRows = (await db
    .select()
    .from(chatGameSessions)
    .where(eq(chatGameSessions.chatId, chatId))
    .run()) as GameSessionRecord[];
  const session = sessionRows && sessionRows.length > 0 ? sessionRows[0] : null;

  if (!session || session.isActive !== 1) {
    if (
      session &&
      session.sessionEndedAt != null &&
      nowUnix - session.sessionEndedAt < SESSION_COOLDOWN_SECONDS
    ) {
      return { success: false, message: 'Игра только что закончилась. Дай члену отдохнуть.' };
    }
    return { success: false, message: 'Нет активной игры. Начни игру командой /chlen.' };
  }

  // Gate 2: pending duel blocks the skill
  if (session.isActive === 1 && session.isDuel === 1 && session.duelIsAccepted === 0) {
    return { success: false, message: 'Нельзя использовать способность, пока дуэль не принята.' };
  }

  // Gate 3: class must be chosen
  const skillResult = await getUserSkillText(chatId, userId);
  if (!skillResult) {
    return {
      success: false,
      message: `${userDisplayName} ещё не выбрал класс. Используй ${GameCommand.BECOME_CLASS}, чтобы выбрать класс.`,
    };
  }

  // Gate 4: skill can be used once per game
  if (skillResult.alreadyUsed) {
    return {
      success: false,
      message: `${userDisplayName} уже использовал свою способность в этой игре!`,
    };
  }

  const skillClass = await getUserClass(chatId, userId);

  switch (skillClass) {
    case ChlenClass.CHLENOKNIZHNIK:
      return useChlenoknizhnikSkill(chatId, userId, rawText);
    case ChlenClass.CHLENODIN:
      return useChlenodinSkill(chatId, userId, userDisplayName);
    case ChlenClass.CHLENOMANT:
      return useChlenomantSkill(chatId, userId, userDisplayName);
    case ChlenClass.OHOTNIK_NA_CHLENI:
      return useHunterSkill(chatId, userId, userDisplayName);
    case ChlenClass.MASTER_TISYACHI_CHLENOV:
      return useMasterSkill(chatId, userId);
    default:
      return { success: false, message: 'Неизвестная способность.' };
  }
}

async function useChlenoknizhnikSkill(
  chatId: string,
  userId: string,
  rawText: string
): Promise<SkillUseResult> {
  const targetText = rawText.split(/\s+/).slice(1).join(' ').trim();
  const targetResult = await applyWeaknessToTarget(chatId, userId, targetText);

  if (!targetResult.success) {
    return { success: false, message: targetResult.message };
  }

  await recordSkillUsed(chatId, userId);
  return { success: true, message: targetResult.message };
}

async function useChlenodinSkill(
  chatId: string,
  userId: string,
  userDisplayName: string
): Promise<SkillUseResult> {
  await addStatusEffect(chatId, userId, StatusEffectId.BUFF);
  await recordSkillUsed(chatId, userId);
  return {
    success: true,
    message: `Шанс победы следующего члена ${userDisplayName} увеличен в 2 раза!`,
  };
}

/**
 * Членомант: spends all accumulated losses as instant rolls that skip the queue.
 */
async function useChlenomantSkill(
  chatId: string,
  userId: string,
  userDisplayName: string
): Promise<SkillUseResult> {
  const charges = await getChlenomantCharges(chatId, userId);

  if (charges <= 0) {
    return { success: false, message: 'Нет членов для поднятия' };
  }

  await recordSkillUsed(chatId, userId);
  await resetChlenomantCharges(chatId, userId);

  const rolls: CommandResult[] = [];
  for (let i = 0; i < charges; i++) {
    const res = await handleGameCommand(chatId, userId, userDisplayName, undefined, {
      bypassQueue: true,
    });
    rolls.push(res);
    if (res.gameEnded) {
      break;
    }
  }

  return {
    success: true,
    activationMessage: `${await getUserMention(userId)} поднимает ${pluralize(charges, 'член', 'члена', 'членов')}`,
    rolls,
  };
}

/**
 * Охотник на Члены: rolls once per active player (except himself), then
 * cannot roll until the end of the game.
 */
async function useHunterSkill(
  chatId: string,
  userId: string,
  userDisplayName: string
): Promise<SkillUseResult> {
  const queueRows = (await db
    .select()
    .from(chatQueuePlayers)
    .where(and(eq(chatQueuePlayers.chatId, chatId), eq(chatQueuePlayers.isExcluded, 0)))
    .run()) as QueuePlayerRecord[];

  const capturedPlayers = (queueRows || []).filter((p) => p.userId !== userId);

  await recordSkillUsed(chatId, userId);

  const rolls: CommandResult[] = [];
  for (let i = 0; i < capturedPlayers.length; i++) {
    const res = await handleGameCommand(chatId, userId, userDisplayName, undefined, {
      bypassQueue: true,
    });
    rolls.push(res);
    if (res.gameEnded) {
      break;
    }
  }

  if (!rolls.some((r) => r.gameEnded)) {
    await addStatusEffect(chatId, userId, StatusEffectId.HUNTER_BLOCK);
  }

  return {
    success: true,
    activationMessage: `Ваши члены в руках ${await getUserMention(userId)}`,
    rolls,
  };
}

/**
 * Мастер тысячи Членов: the next roll has 0% win chance, every following
 * roll gains +5% (cumulative) until the end of the game.
 */
async function useMasterSkill(chatId: string, userId: string): Promise<SkillUseResult> {
  await addStatusEffect(chatId, userId, StatusEffectId.MASTER_RISING);
  await recordSkillUsed(chatId, userId);
  return {
    success: true,
    activationMessage: `Член ${await getUserMention(userId)} упал, но только для того, чтобы подняться с новой силой (Шанс следующего члена равен 0%, каждый последующий член будет получать +5%)`,
  };
}
