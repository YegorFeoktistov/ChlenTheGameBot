import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, api } from 'sdk';
import messageHandler from '../src/handlers/message.js';
import type {
  GameSessionRecord,
  WarnedUserRecord,
  QueuePlayerRecord,
  UserRecord,
} from '../src/types/models.js';

let mockGameSessions: Record<string, GameSessionRecord> = {};
let mockWarnedUsers: Record<string, WarnedUserRecord> = {};
let mockQueuePlayers: Record<string, QueuePlayerRecord> = {};
let mockUsers: Record<string, UserRecord> = {};

describe('Message Handler Integration', () => {
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
                  return Object.values(mockUsers);
                }
                if (tbl && tbl.name === 'chat_game_sessions')
                  return Object.values(mockGameSessions);
                if (tbl && tbl.name === 'chat_warned_users') return Object.values(mockWarnedUsers);
                if (tbl && tbl.name === 'chat_queue_players') {
                  return Object.values(mockQueuePlayers);
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

  describe('Keyword Mention & Command Isolation', () => {
    it('starts a new game when keyword "член" or "chlen" is mentioned in plain text and session is inactive', async () => {
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 201,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'эй чуваки тут какой-то член пришел',
      });

      expect(mockGameSessions['chat1']).toBeDefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Член - игра началась!'),
        })
      );
    });

    it('does NOT start a game when a slash command contains keyword "chlen"', async () => {
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 202,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/customcommand_with_chlen_inside',
      });

      expect(mockGameSessions['chat1']).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });

    it('initiates a duel when message mentions "член" or "chlen" and user tag is at the end', async () => {
      await messageHandler({
        message_id: 203,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'эй чуваки сыграем в член @pasha',
      });

      expect(mockGameSessions['chat1']).toBeDefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
      expect(mockGameSessions['chat1'].isDuel).toBe(1); // DUEL initiated!
      expect(mockGameSessions['chat1'].duelInitiatorId).toBe('user1');
      expect(mockGameSessions['chat1'].duelOpponentId).toBe('user2');
    });

    it('does NOT initiate a duel when tag is NOT at the end of the message, starts regular game instead', async () => {
      await messageHandler({
        message_id: 204,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'эй член @pasha привет всем',
      });

      expect(mockGameSessions['chat1']).toBeDefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
      expect(mockGameSessions['chat1'].isDuel || 0).toBe(0); // Regular game, NOT duel!
    });

    it('does NOT process turn or trigger out-of-turn warning when plain text mentions "член" during an active game', async () => {
      // Set active session
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

      // Same user (user1) mentions "член" in plain text
      await messageHandler({
        message_id: 205,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'какой хороший член',
      });

      // Should be ignored during active game (no out-of-turn warning, no turn count increase)
      expect(spy).not.toHaveBeenCalled();
      expect(mockGameSessions['chat1'].sessionMessagesCount).toBe(1);
    });
  });
});
