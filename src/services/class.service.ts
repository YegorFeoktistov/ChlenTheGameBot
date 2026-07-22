import { db } from 'sdk';
import { chatUserStats } from '../schema.js';
import { eq, and } from 'sdk/db';
import { CHLEN_CLASSES } from '../utils/constants.js';
import type { UserStatRecord } from '../types/models.js';

export function getClassesText(): string {
  const lines = ['⚔️ Доступные классы:\n'];
  CHLEN_CLASSES.forEach((cls, i) => {
    lines.push(`${i + 1}. ${cls}`);
  });
  return lines.join('\n');
}

export async function setUserClass(
  chatId: string,
  userId: string,
  displayName: string,
  classIndex: number
): Promise<string | null> {
  if (classIndex < 1 || classIndex > CHLEN_CLASSES.length) {
    return null;
  }

  await db
    .insert(chatUserStats)
    .values({
      chatId,
      userId,
      displayName,
      classIndex,
      wins: 0,
    })
    .onConflictDoUpdate({
      target: [chatUserStats.chatId, chatUserStats.userId],
      set: { classIndex, displayName },
    })
    .run();

  return CHLEN_CLASSES[classIndex - 1];
}

export async function getUserClass(chatId: string, userId: string): Promise<string | null> {
  const rows = (await db
    .select()
    .from(chatUserStats)
    .where(and(eq(chatUserStats.chatId, chatId), eq(chatUserStats.userId, userId)))
    .run()) as UserStatRecord[];

  if (rows && rows.length > 0) {
    const idx = rows[0].classIndex;
    if (idx && idx >= 1 && idx <= CHLEN_CLASSES.length) {
      return CHLEN_CLASSES[idx - 1];
    }
  }
  return null;
}
