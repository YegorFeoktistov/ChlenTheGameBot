import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, api } from 'sdk';
import messageHandler from '../src/handlers/message.js';
import { handleGameCommand } from '../src/services/game.service.js';
import { processTurnTimeout } from '../src/services/timer.service.js';
import type {
  GameSessionRecord,
  WarnedUserRecord,
  UserRecord,
  QueuePlayerRecord,
} from '../src/types/models.js';
import { CommandStatus } from '../src/utils/constants.js';

let mockGameSessions: Record<string, GameSessionRecord> = {};
let mockWarnedUsers: Record<string, WarnedUserRecord> = {};
let mockQueuePlayers: Record<string, QueuePlayerRecord> = {};
let mockUsers: Record<string, UserRecord> = {};

describe('Duel (Дуэль) Feature', () => {
  beforeEach(() => {
    mockGameSessions = {};
    mockWarnedUsers = {};
    mockQueuePlayers = {};
    mockUsers = {
      initiator: {
        id: 'user1',
        firstName: 'Yegor',
        lastName: 'Feoktistov',
        username: 'yegorfv',
        updatedAt: 0,
      },
      opponent: {
        id: 'user2',
        firstName: 'Pasha',
        lastName: 'Durov',
        username: 'pasha',
        updatedAt: 0,
      },
      interferer: {
        id: 'user3',
        firstName: 'Third',
        lastName: 'Party',
        username: 'third',
        updatedAt: 0,
      },
    };

    vi.restoreAllMocks();

    vi.spyOn(db, 'insert').mockImplementation(
      (tbl: { name?: string }) =>
        ({
          values: (val: Record<string, unknown>) => ({
            onConflictDoUpdate: (opts: { set?: Record<string, unknown> }) => ({
              run: async () => {
                if (tbl && tbl.name === 'chat_game_sessions') {
                  const updated = {
                    ...(mockGameSessions[val.chatId as string] || {}),
                    ...val,
                    ...(opts.set || {}),
                  };
                  mockGameSessions[val.chatId as string] = updated as GameSessionRecord;
                }
                if (tbl && tbl.name === 'chat_warned_users') {
                  mockWarnedUsers[`${val.chatId}_${val.userId}`] =
                    val as unknown as WarnedUserRecord;
                }
                if (tbl && tbl.name === 'chat_queue_players') {
                  const key = `${val.chatId}_${val.userId}`;
                  const updated = { ...(mockQueuePlayers[key] || {}), ...val, ...(opts.set || {}) };
                  mockQueuePlayers[key] = updated as QueuePlayerRecord;
                }
              },
            }),
          }),
        }) as unknown as ReturnType<typeof db.insert>
    );

    vi.spyOn(db, 'delete').mockImplementation(
      (tbl: { name?: string }) =>
        ({
          where: () => ({
            run: async () => {
              if (!tbl || tbl.name === 'chat_warned_users') {
                mockWarnedUsers = {};
              }
              if (!tbl || tbl.name === 'chat_queue_players') {
                mockQueuePlayers = {};
              }
            },
          }),
        }) as unknown as ReturnType<typeof db.delete>
    );

    vi.spyOn(db, 'update').mockImplementation(
      (tbl: { name?: string }) =>
        ({
          set: (setVal: Record<string, unknown>) => ({
            where: () => ({
              run: async () => {
                if (tbl && tbl.name === 'chat_game_sessions') {
                  const chatId = 'chat1';
                  mockGameSessions[chatId] = {
                    ...(mockGameSessions[chatId] || {}),
                    ...setVal,
                  } as GameSessionRecord;
                }
              },
            }),
          }),
        }) as unknown as ReturnType<typeof db.update>
    );

    vi.spyOn(db, 'select').mockImplementation(
      () =>
        ({
          from: (tbl: { name?: string }) => ({
            where: (cond?: unknown) => ({
              run: async () => {
                if (tbl && tbl.name === 'users') {
                  const condStr = cond ? JSON.stringify(cond) : '';
                  if (condStr.includes('yegorfv')) return [mockUsers.initiator];
                  if (condStr.includes('pasha')) return [mockUsers.opponent];
                  if (condStr.includes('third')) return [mockUsers.interferer];
                  return Object.values(mockUsers);
                }
                if (tbl && tbl.name === 'chat_game_sessions')
                  return Object.values(mockGameSessions);
                if (tbl && tbl.name === 'chat_warned_users') return Object.values(mockWarnedUsers);
                if (tbl && tbl.name === 'chat_queue_players') {
                  const all = Object.values(mockQueuePlayers);
                  if (cond && typeof cond === 'object') {
                    const condStr = JSON.stringify(cond);
                    if (condStr.includes('user1')) return all.filter((p) => p.userId === 'user1');
                    if (condStr.includes('user2')) return all.filter((p) => p.userId === 'user2');
                    if (condStr.includes('user3')) return all.filter((p) => p.userId === 'user3');
                  }
                  return all;
                }
                if (tbl && tbl.name === 'chats') {
                  return [{ id: 'chat1', title: 'Chat', createdAt: new Date() }];
                }
                return [];
              },
            }),
            run: async () => {
              if (tbl && tbl.name === 'chats') {
                return [{ id: 'chat1', title: 'Chat', createdAt: new Date() }];
              }
              if (tbl && tbl.name === 'chat_game_sessions') return Object.values(mockGameSessions);
              return [];
            },
          }),
        }) as unknown as ReturnType<typeof db.select>
    );
  });

  it('initiates a duel successfully with correct invitation format', async () => {
    const spy = vi.spyOn(api, 'sendMessage');

    await messageHandler({
      message_id: 101,
      date: 12345,
      chat: { id: 'chat1', title: 'Test Chat' },
      from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
      text: '/chlenduel @pasha',
    });

    expect(mockGameSessions['chat1']).toBeDefined();
    expect(mockGameSessions['chat1'].isActive).toBe(1);
    expect(mockGameSessions['chat1'].isDuel).toBe(1);
    expect(mockGameSessions['chat1'].duelInitiatorId).toBe('user1');
    expect(mockGameSessions['chat1'].duelOpponentId).toBe('user2');
    expect(mockGameSessions['chat1'].duelIsAccepted).toBe(0);

    expect(spy).toHaveBeenCalledWith({
      chat_id: 'chat1',
      text: 'Yegor Feoktistov вызывает тебя на дуэль! Pasha Durov, примешь ли ты вызов?',
    });
  });

  it('declines a duel invitation from the opponent and terminates the session', async () => {
    // Manually set up a pending duel session
    mockGameSessions['chat1'] = {
      chatId: 'chat1',
      isActive: 1,
      lastUserId: null,
      sessionMessagesCount: 0,
      sessionEndedAt: null,
      currentTurnStartedAt: 12345,
      isDuel: 1,
      duelInitiatorId: 'user1',
      duelOpponentId: 'user2',
      duelIsAccepted: 0,
    };

    const spy = vi.spyOn(api, 'sendMessage');

    // Attempt to decline from a non-opponent player first -> should be ignored
    await messageHandler({
      message_id: 102,
      date: 12345,
      chat: { id: 'chat1', title: 'Test Chat' },
      from: { id: 'user3', first_name: 'Third', last_name: 'Party', username: 'third' },
      text: 'нет',
    });

    expect(mockGameSessions['chat1'].isActive).toBe(1);
    expect(spy).not.toHaveBeenCalled();

    // Decline from the opponent
    await messageHandler({
      message_id: 103,
      date: 12345,
      chat: { id: 'chat1', title: 'Test Chat' },
      from: { id: 'user2', first_name: 'Pasha', last_name: 'Durov', username: 'pasha' },
      text: 'нет',
    });

    expect(mockGameSessions['chat1'].isActive).toBe(0);
    expect(mockGameSessions['chat1'].isDuel).toBe(0);
    expect(spy).toHaveBeenCalledWith({
      chat_id: 'chat1',
      text: 'Pasha Durov отказался скрещивать Член.',
    });
  });

  it('accepts a duel and registers the opponent first turn', async () => {
    // Manually set up a pending duel session
    mockGameSessions['chat1'] = {
      chatId: 'chat1',
      isActive: 1,
      lastUserId: null,
      sessionMessagesCount: 0,
      sessionEndedAt: null,
      currentTurnStartedAt: 12345,
      isDuel: 1,
      duelInitiatorId: 'user1',
      duelOpponentId: 'user2',
      duelIsAccepted: 0,
    };

    const spy = vi.spyOn(api, 'sendMessage');

    await messageHandler({
      message_id: 104,
      date: 12345,
      chat: { id: 'chat1', title: 'Test Chat' },
      from: { id: 'user2', first_name: 'Pasha', last_name: 'Durov', username: 'pasha' },
      text: 'член',
    });

    expect(mockGameSessions['chat1'].duelIsAccepted).toBe(1);
    expect(mockGameSessions['chat1'].lastUserId).toBe('user2');
    expect(mockQueuePlayers['chat1_user2']).toBeDefined();
    expect(spy).toHaveBeenCalledWith({
      chat_id: 'chat1',
      text: 'Член - игра началась!',
    });
  });

  it('sends interference warnings to third-party players exactly once', async () => {
    // Manually set up an active duel session
    mockGameSessions['chat1'] = {
      chatId: 'chat1',
      isActive: 1,
      lastUserId: 'user2',
      sessionMessagesCount: 1,
      sessionEndedAt: null,
      currentTurnStartedAt: 12345,
      isDuel: 1,
      duelInitiatorId: 'user1',
      duelOpponentId: 'user2',
      duelIsAccepted: 1,
    };

    const spy = vi.spyOn(api, 'sendMessage');

    // First attempt -> warning sent
    await messageHandler({
      message_id: 105,
      date: 12345,
      chat: { id: 'chat1', title: 'Test Chat' },
      from: { id: 'user3', first_name: 'Third', last_name: 'Party', username: 'third' },
      text: 'член',
    });

    expect(spy).toHaveBeenCalledWith({
      chat_id: 'chat1',
      text: 'Не мешай мужчинам скрещивать Член!',
      reply_to_message_id: 105,
    });

    spy.mockClear();

    // Second attempt -> silent ignore
    await messageHandler({
      message_id: 106,
      date: 12345,
      chat: { id: 'chat1', title: 'Test Chat' },
      from: { id: 'user3', first_name: 'Third', last_name: 'Party', username: 'third' },
      text: 'член',
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('warns user about active game when trying to initiate a duel during active match', async () => {
    // Manually set up a normal active game session
    mockGameSessions['chat1'] = {
      chatId: 'chat1',
      isActive: 1,
      lastUserId: 'user1',
      sessionMessagesCount: 1,
      sessionEndedAt: null,
      currentTurnStartedAt: 12345,
      isDuel: 0,
    };

    const spy = vi.spyOn(api, 'sendMessage');

    // Attempt to start a duel
    await messageHandler({
      message_id: 107,
      date: 12345,
      chat: { id: 'chat1', title: 'Test Chat' },
      from: { id: 'user2', first_name: 'Pasha', last_name: 'Durov', username: 'pasha' },
      text: '/chlenduel @yegorfv',
    });

    expect(spy).toHaveBeenCalledWith({
      chat_id: 'chat1',
      text: 'Игра уже идет. Сразитесь в другой раз.',
      reply_to_message_id: 107,
    });

    spy.mockClear();

    // Second attempt from same user -> silent ignore
    await messageHandler({
      message_id: 108,
      date: 12345,
      chat: { id: 'chat1', title: 'Test Chat' },
      from: { id: 'user2', first_name: 'Pasha', last_name: 'Durov', username: 'pasha' },
      text: '/chlenduel @yegorfv',
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('does not allow winning on the first move for both opponent and initiator in a duel', async () => {
    // Manually set up a pending duel session
    mockGameSessions['chat1'] = {
      chatId: 'chat1',
      isActive: 1,
      lastUserId: null,
      sessionMessagesCount: 0,
      sessionEndedAt: null,
      currentTurnStartedAt: 12345,
      isDuel: 1,
      duelInitiatorId: 'user1',
      duelOpponentId: 'user2',
      duelIsAccepted: 0,
    };

    // 1. Opponent Pasha accepts the duel (and makes his first move) with a winning roll
    // Since it is his first turn, it should NOT end the game and outcome must be 'Член'
    const resPasha = await handleGameCommand('chat1', 'user2', 'Pasha Durov', 0.0);
    expect(resPasha.status).toBe(CommandStatus.SUCCESS);
    expect(resPasha.gameEnded).toBe(false);
    expect(resPasha.outcome).toBe('Член');

    // 2. Initiator Yegor makes his first move with a winning roll
    // Since it is his first turn, it should NOT end the game either
    const resYegor = await handleGameCommand('chat1', 'user1', 'Yegor Feoktistov', 0.0);
    expect(resYegor.status).toBe(CommandStatus.SUCCESS);
    expect(resYegor.gameEnded).toBe(false);
    expect(resYegor.outcome).toBe('Член');

    // 3. Opponent Pasha makes his second move with a winning roll -> this CAN win!
    const resPasha2 = await handleGameCommand('chat1', 'user2', 'Pasha Durov', 0.0);
    expect(resPasha2.status).toBe(CommandStatus.SUCCESS);
    expect(resPasha2.gameEnded).toBe(true);
  });

  it('bypasses turn timeout logic during active duel', async () => {
    mockGameSessions['chat1'] = {
      chatId: 'chat1',
      isActive: 1,
      lastUserId: 'user2',
      sessionMessagesCount: 1,
      sessionEndedAt: null,
      currentTurnStartedAt: 12345,
      isDuel: 1,
      duelInitiatorId: 'user1',
      duelOpponentId: 'user2',
      duelIsAccepted: 1,
    };

    const spy = vi.spyOn(api, 'sendMessage');

    // Run timeout processor
    await processTurnTimeout('chat1');

    // Should not output any skip notifications or game end warnings
    expect(spy).not.toHaveBeenCalled();
    expect(mockGameSessions['chat1'].isActive).toBe(1);
  });
});
