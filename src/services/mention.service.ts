import { db } from 'sdk';
import { chats } from '../schema.js';
import { eq } from 'sdk/db';
import type { ChatRecord } from '../types/models.js';

export async function getStartOnMention(chatId: string): Promise<number> {
  const rows = (await db.select().from(chats).where(eq(chats.id, chatId)).run()) as ChatRecord[];

  if (rows && rows.length > 0 && rows[0].startOnMention !== undefined) {
    return rows[0].startOnMention;
  }
  return 1; // Default = 1 (start game from keyword mention enabled)
}

export async function setStartOnMention(chatId: string, enabled: number): Promise<void> {
  const existingRows = (await db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId))
    .run()) as ChatRecord[];

  const title = existingRows && existingRows.length > 0 ? existingRows[0].title : 'Chat';

  await db
    .insert(chats)
    .values({
      id: chatId,
      title,
      startOnMention: enabled,
    })
    .onConflictDoUpdate({
      target: chats.id,
      set: { startOnMention: enabled },
    })
    .run();
}
