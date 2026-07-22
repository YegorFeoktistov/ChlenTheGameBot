import { db } from 'sdk';
import {
  chats,
  users,
  chatUserStats,
  chatSubscribers,
  chatLongestSessions,
  chatGameSessions,
} from '../schema.js';

export default async function importData() {
  console.log('Starting data migration from game_state.json...');

  const mainChatId = '-1001550217181';
  const now = new Date();

  // 1. Seed Main Chat
  await db
    .insert(chats)
    .values({
      id: mainChatId,
      title: 'Main Chat',
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: chats.id,
      set: { title: 'Main Chat' },
    })
    .run();

  // 2. Player Data
  const players = [
    { id: '674076620', name: 'Pasha', wins: 23, username: 'sa_pavel', classIndex: 2 },
    { id: '400660239', name: 'Aleh', wins: 13, username: 'escbz', classIndex: 5 },
    { id: '545272225', name: 'Yegor Feoktistov', wins: 33, username: 'yegorfv', classIndex: 5 },
    { id: '498576935', name: '1 2', wins: 13, username: 'elberia', classIndex: 4 },
    { id: '5784636902', name: 'Artem', wins: 2, username: null, classIndex: null },
    { id: '236402956', name: 'Aliaksei Alinouski', wins: 12, username: null, classIndex: 4 },
    { id: '244581546', name: 'Alex', wins: 5, username: null, classIndex: 4 },
    { id: '466567857', name: 'Женя', wins: 6, username: 'borland_95', classIndex: 3 },
  ];

  for (const p of players) {
    // Seed User
    await db
      .insert(users)
      .values({
        id: p.id,
        firstName: p.name,
        lastName: null,
        username: p.username,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { firstName: p.name, username: p.username, updatedAt: now },
      })
      .run();

    // Seed Chat Stats (Leaderboard + Class)
    await db
      .insert(chatUserStats)
      .values({
        chatId: mainChatId,
        userId: p.id,
        wins: p.wins,
        displayName: p.name,
        classIndex: p.classIndex,
      })
      .onConflictDoUpdate({
        target: [chatUserStats.chatId, chatUserStats.userId],
        set: { wins: p.wins, displayName: p.name, classIndex: p.classIndex },
      })
      .run();

    // Seed Subscriber if username exists
    if (p.username) {
      await db
        .insert(chatSubscribers)
        .values({
          chatId: mainChatId,
          userId: p.id,
          username: p.username,
        })
        .onConflictDoUpdate({
          target: [chatSubscribers.chatId, chatSubscribers.userId],
          set: { username: p.username },
        })
        .run();
    }
  }

  // 3. Seed Longest Session Record
  await db
    .insert(chatLongestSessions)
    .values({
      chatId: mainChatId,
      messagesCount: 49,
      winnerId: '674076620',
      winnerDisplayName: 'Pasha',
      endedAt: '17.07.2026 11:13',
    })
    .onConflictDoUpdate({
      target: chatLongestSessions.chatId,
      set: {
        messagesCount: 49,
        winnerId: '674076620',
        winnerDisplayName: 'Pasha',
        endedAt: '17.07.2026 11:13',
      },
    })
    .run();

  // 4. Seed Initial Session State
  await db
    .insert(chatGameSessions)
    .values({
      chatId: mainChatId,
      isActive: 0,
      lastUserId: null,
      sessionMessagesCount: 17,
      sessionEndedAt: 1784658737,
      warnedUserIds: '[]',
    })
    .onConflictDoUpdate({
      target: chatGameSessions.chatId,
      set: {
        isActive: 0,
        lastUserId: null,
        sessionMessagesCount: 17,
        sessionEndedAt: 1784658737,
        warnedUserIds: '[]',
      },
    })
    .run();

  console.log('Migration completed successfully!');
  return { status: 'success', importedPlayers: players.length };
}

// Auto-run if executed standalone
importData().catch(console.error);
