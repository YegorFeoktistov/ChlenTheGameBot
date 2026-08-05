import { db } from 'sdk';
import { chatUserStats, chatSkillUsers } from '../schema.js';
import { eq, and } from 'sdk/db';
import { CHLEN_CLASS_SKILLS, ChlenClass, StatusEffectId, GameCommand } from '../utils/constants.js';
import type { SkillUserRecord } from '../types/models.js';
import { addStatusEffect } from './statusEffects.service.js';
import { formatDisplayName, getUserByUsername } from './user.service.js';

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
