import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, api } from 'sdk';
import messageHandler from '../src/handlers/message.js';
import type {
  GameSessionRecord,
  WarnedUserRecord,
  QueuePlayerRecord,
  UserRecord,
  UserStatRecord,
  SkillUserRecord,
  StatusEffectUserRecord,
} from '../src/types/models.js';

let mockGameSessions: Record<string, GameSessionRecord> = {};
let mockWarnedUsers: Record<string, WarnedUserRecord> = {};
let mockQueuePlayers: Record<string, QueuePlayerRecord> = {};
let mockUsers: Record<string, UserRecord> = {};
let mockUserStats: Record<string, UserStatRecord> = {};
let mockSkillUsers: Record<string, SkillUserRecord> = {};
let mockStatusEffects: Record<string, StatusEffectUserRecord> = {};
let mockChats: Record<string, { id: string; title: string; startOnMention?: number }> = {};

describe('Message Handler Integration', () => {
  beforeEach(() => {
    mockGameSessions = {};
    mockWarnedUsers = {};
    mockQueuePlayers = {};
    mockUserStats = {};
    mockSkillUsers = {};
    mockStatusEffects = {};
    mockChats = {};
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
                if (tbl && tbl.name === 'chat_user_stats') {
                  const updated = { ...val, ...(opts.set || {}) };
                  mockUserStats[`${val.chatId}_${val.userId}`] =
                    updated as unknown as UserStatRecord;
                }
                if (tbl && tbl.name === 'chat_skill_users') {
                  mockSkillUsers[`${val.chatId}_${val.userId}`] = val as unknown as SkillUserRecord;
                }
                if (tbl && tbl.name === 'chat_status_effect_users') {
                  const key = `${String(val.chatId)}_${String(val.userId)}_${String(val.statusEffectId)}`;
                  if (mockStatusEffects[key]) {
                    mockStatusEffects[key].count += 1;
                  } else {
                    mockStatusEffects[key] = {
                      chatId: String(val.chatId),
                      userId: String(val.userId),
                      statusEffectId: String(val.statusEffectId),
                      count: 1,
                    };
                  }
                }
                if (tbl && tbl.name === 'chats') {
                  mockChats[String(val.id)] = {
                    ...(mockChats[String(val.id)] || {}),
                    ...val,
                    ...(opts.set || {}),
                  } as unknown as { id: string; title: string; startOnMention?: number };
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
                  if (cond && typeof cond === 'object') {
                    const c = cond as { params?: unknown[]; b?: unknown };
                    const username = String(c.params?.[0] ?? c.b ?? '');
                    return Object.values(mockUsers).filter((u) => u.username === username);
                  }
                  return Object.values(mockUsers);
                }
                if (tbl && tbl.name === 'chat_game_sessions')
                  return Object.values(mockGameSessions);
                if (tbl && tbl.name === 'chat_warned_users') return Object.values(mockWarnedUsers);
                if (tbl && tbl.name === 'chat_queue_players') {
                  return Object.values(mockQueuePlayers);
                }
                if (tbl && tbl.name === 'chat_user_stats') return Object.values(mockUserStats);
                if (tbl && tbl.name === 'chat_skill_users') return Object.values(mockSkillUsers);
                if (tbl && tbl.name === 'chat_status_effect_users')
                  return Object.values(mockStatusEffects);
                if (tbl && tbl.name === 'chats') {
                  const chat = mockChats['chat1'];
                  if (chat) return [chat];
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
              if (tbl && tbl.name === 'users') return Object.values(mockUsers);
              return [];
            },
          }),
        }) as unknown as ReturnType<typeof db.select>
    );
  });

  describe('Keyword Mention & Command Isolation', () => {
    it('starts a new game when keyword "член" or "chlen" is mentioned in plain text and session is inactive', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 1 };
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
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 1 };
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
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 1 };
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
      // Set active session with mention-start enabled
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 1 };
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

    it('processes an exact keyword as a turn during an active game in any mode', async () => {
      // Set active session with mention-start disabled
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 1,
        lastUserId: null,
        sessionMessagesCount: 1,
        sessionEndedAt: null,
        currentTurnStartedAt: 12345,
        isDuel: 0,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 215,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'член',
      });

      // Turn should be processed (messages count increased), no warning sent
      expect(spy).not.toHaveBeenCalled();
      expect(mockGameSessions['chat1'].sessionMessagesCount).toBe(2);
    });

    it('does NOT process first-word keyword during an active game, only exact match', async () => {
      // Set active session with mention-start enabled
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 1 };
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 1,
        lastUserId: null,
        sessionMessagesCount: 1,
        sessionEndedAt: null,
        currentTurnStartedAt: 12345,
        isDuel: 0,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 216,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'член привет',
      });

      // Ignored during active game, even though the first word is the keyword
      expect(spy).not.toHaveBeenCalled();
      expect(mockGameSessions['chat1'].sessionMessagesCount).toBe(1);
    });

    it('does NOT start a game when keyword mention is disabled via /chlenmention 0', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 206,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'эй чуваки тут какой-то член пришел',
      });

      expect(mockGameSessions['chat1']).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });

    it('still starts a game via explicit /chlen command when keyword mention is disabled', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };

      await messageHandler({
        message_id: 207,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlen',
      });

      expect(mockGameSessions['chat1']).toBeDefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
    });

    it('does NOT initiate a duel from keyword mention when disabled', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 208,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'эй чуваки сыграем в член @pasha',
      });

      expect(mockGameSessions['chat1']).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });

    it('starts a game from keyword mention when explicitly enabled', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 1 };

      await messageHandler({
        message_id: 209,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'эй чуваки тут какой-то член пришел',
      });

      expect(mockGameSessions['chat1']).toBeDefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
    });

    it('starts a game with exact keyword when mention-start is disabled', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };

      await messageHandler({
        message_id: 210,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'член',
      });

      expect(mockGameSessions['chat1']).toBeDefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
    });

    it('starts a game with exact keyword case-insensitively when mention-start is disabled', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };

      await messageHandler({
        message_id: 211,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'Chlen',
      });

      expect(mockGameSessions['chat1']).toBeDefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
    });

    it('starts a game with exact keyword ignoring surrounding whitespace when mention-start is disabled', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };

      await messageHandler({
        message_id: 212,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '  член  ',
      });

      expect(mockGameSessions['chat1']).toBeDefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
    });

    it('does NOT start a game when mention-start is disabled and keyword has other characters', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 213,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'член привет',
      });

      expect(mockGameSessions['chat1']).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });

    it('does NOT initiate a duel when mention-start is disabled and keyword has a tag', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 214,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: 'член @pasha',
      });

      expect(mockGameSessions['chat1']).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Mention Start Toggle Command /chlenmention', () => {
    it('shows current state as disabled by default', async () => {
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 400,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenmention',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: 'Старт по упоминанию выключен',
        })
      );
    });

    it('shows current state as disabled when startOnMention is 0', async () => {
      mockChats['chat1'] = { id: 'chat1', title: 'Chat', startOnMention: 0 };
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 401,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenmention',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: 'Старт по упоминанию выключен',
        })
      );
    });

    it('enables mention start with /chlenmention 1', async () => {
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 402,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenmention 1',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: 'Включен старт по упоминанию',
        })
      );
      expect(mockChats['chat1'].startOnMention).toBe(1);
    });

    it('disables mention start with /chlenmention 0', async () => {
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 403,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenmention 0',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: 'Выключен старт по упоминанию',
        })
      );
      expect(mockChats['chat1'].startOnMention).toBe(0);
    });

    it('rejects invalid param', async () => {
      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 404,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenmention 2',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Укажите режим'),
        })
      );
      expect(mockChats['chat1'].startOnMention).toBeUndefined();
    });
  });

  describe('Skill Command /chlenskill', () => {
    function activeSession() {
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 1,
        lastUserId: null,
        sessionMessagesCount: 1,
        sessionEndedAt: null,
        currentTurnStartedAt: 12345,
        isDuel: 0,
        duelInitiatorId: null,
        duelOpponentId: null,
        duelIsAccepted: 0,
      };
    }

    it('Chlenoknizhnik applies weakness to valid @pasha during active game', async () => {
      activeSession();
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 300,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill @pasha',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('получил Членослабость'),
          reply_to_message_id: 300,
        })
      );
      expect(mockSkillUsers['chat1_user1']).toBeDefined();
      expect(mockStatusEffects['chat1_user2_Членослабость']).toBeDefined();
      expect(mockStatusEffects['chat1_user2_Членослабость'].count).toBe(1);
      expect(mockGameSessions['chat1'].isActive).toBe(1);
      expect(mockGameSessions['chat1'].sessionEndedAt).toBeNull();
    });

    it('rejects bare name pasha with no effect and no cooldown', async () => {
      activeSession();
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 301,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill pasha',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Неверная цель'),
        })
      );
      expect(mockStatusEffects).toEqual({});
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('rejects bare numeric ID 12345 with no effect and no cooldown', async () => {
      activeSession();
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 302,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill 12345',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Неверная цель'),
        })
      );
      expect(mockStatusEffects).toEqual({});
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('rejects unknown @ghost with no effect and no cooldown', async () => {
      activeSession();
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 303,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill @ghost',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Цель не найдена'),
        })
      );
      expect(mockStatusEffects).toEqual({});
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('rejects self-cast @yegorfv with no effect and no cooldown', async () => {
      activeSession();
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 304,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill @yegorfv',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Нельзя наложить Членослабость на себя!'),
        })
      );
      expect(mockStatusEffects).toEqual({});
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('sends M1 when there is no active game', async () => {
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 305,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill @pasha',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Нет активной игры'),
        })
      );
      expect(mockStatusEffects).toEqual({});
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('gate ordering: expired session wins over cooldown flag -> M1', async () => {
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 0,
        lastUserId: null,
        sessionMessagesCount: 1,
        sessionEndedAt: 0,
        currentTurnStartedAt: null,
        isDuel: 0,
        duelInitiatorId: null,
        duelOpponentId: null,
        duelIsAccepted: 0,
      };
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };
      mockSkillUsers['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 306,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill @pasha',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Нет активной игры'),
        })
      );
      expect(spy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('уже использовал свою способность'),
        })
      );
      expect(spy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Игра только что закончилась'),
        })
      );
      expect(mockStatusEffects).toEqual({});
    });

    it('sends M11 during the 10-second post-game cooldown window', async () => {
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 0,
        lastUserId: null,
        sessionMessagesCount: 1,
        sessionEndedAt: Math.floor(Date.now() / 1000),
        currentTurnStartedAt: null,
        isDuel: 0,
        duelInitiatorId: null,
        duelOpponentId: null,
        duelIsAccepted: 0,
      };
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 307,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill @pasha',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Игра только что закончилась. Дай члену отдохнуть.'),
        })
      );
      expect(mockStatusEffects).toEqual({});
    });

    it('pending duel blocks the skill -> M2, nothing applied, no cooldown', async () => {
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 1,
        lastUserId: null,
        sessionMessagesCount: 1,
        sessionEndedAt: null,
        currentTurnStartedAt: 12345,
        isDuel: 1,
        duelInitiatorId: 'user1',
        duelOpponentId: 'user2',
        duelIsAccepted: 0,
      };
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 308,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill @pasha',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Нельзя использовать способность, пока дуэль не принята.'),
        })
      );
      expect(mockStatusEffects).toEqual({});
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
      expect(mockGameSessions['chat1'].isActive).toBe(1);
      expect(mockGameSessions['chat1'].duelIsAccepted).toBe(0);
    });

    it('generic class + inactive session -> M1, recordSkillUsed NOT called', async () => {
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 0,
        lastUserId: null,
        sessionMessagesCount: 1,
        sessionEndedAt: 0,
        currentTurnStartedAt: null,
        isDuel: 0,
        duelInitiatorId: null,
        duelOpponentId: null,
        duelIsAccepted: 0,
      };
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 2,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 309,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('Нет активной игры'),
        })
      );
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('generic class + active session -> M10, skill recorded', async () => {
      activeSession();
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 2,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 310,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('использует способность: Членомант'),
        })
      );
      expect(mockSkillUsers['chat1_user1']).toBeDefined();
    });

    it('Chlenodin applies "Членосила" buff to himself during active game', async () => {
      activeSession();
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 3,
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 312,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining(
            'Шанс победы следующего члена Yegor Feoktistov увеличен в 2 раза!'
          ),
          reply_to_message_id: 312,
        })
      );
      expect(mockSkillUsers['chat1_user1']).toBeDefined();
      expect(mockStatusEffects['chat1_user1_Членосила']).toBeDefined();
      expect(mockStatusEffects['chat1_user1_Членосила'].count).toBe(1);
      expect(mockGameSessions['chat1'].isActive).toBe(1);
      expect(mockGameSessions['chat1'].sessionEndedAt).toBeNull();
    });

    it('already used during active game -> M4, no effect written', async () => {
      activeSession();
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor Feoktistov',
        classIndex: 1,
      };
      mockSkillUsers['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
      };

      const spy = vi.spyOn(api, 'sendMessage');

      await messageHandler({
        message_id: 311,
        date: 12345,
        chat: { id: 'chat1', title: 'Test Chat' },
        from: { id: 'user1', first_name: 'Yegor', last_name: 'Feoktistov', username: 'yegorfv' },
        text: '/chlenskill @pasha',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: 'chat1',
          text: expect.stringContaining('уже использовал свою способность в этой игре!'),
        })
      );
      expect(mockStatusEffects).toEqual({});
    });
  });
});
