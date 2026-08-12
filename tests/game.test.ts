import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from 'sdk';
import { handleGameCommand } from '../src/services/game.service.js';
import { recordAutomaticWin } from '../src/services/game_rules.js';
import type {
  GameSessionRecord,
  UserStatRecord,
  LongestSessionRecord,
  WarnedUserRecord,
  QueuePlayerRecord,
  UserRecord,
  StatusEffectUserRecord,
} from '../src/types/models.js';
import {
  CommandStatus,
  GAME_WIN_CHANCE,
  SESSION_COOLDOWN_SECONDS,
  StatusEffectId,
} from '../src/utils/constants.js';

let mockGameSessions: Record<string, GameSessionRecord> = {};
let mockUserStats: Record<string, UserStatRecord> = {};
let mockLongestSessions: Record<string, LongestSessionRecord> = {};
let mockWarnedUsers: Record<string, WarnedUserRecord> = {};
let mockQueuePlayers: Record<string, QueuePlayerRecord> = {};
let mockUsers: Record<string, UserRecord> = {};
let mockStatusEffects: Record<string, StatusEffectUserRecord> = {};

describe('Game Engine Service', () => {
  beforeEach(() => {
    mockGameSessions = {};
    mockUserStats = {};
    mockLongestSessions = {};
    mockWarnedUsers = {};
    mockQueuePlayers = {};
    mockStatusEffects = {};
    mockUsers = {
      user1: {
        id: 'user1',
        firstName: 'Yegor',
        lastName: null,
        username: 'yegor_handle',
        updatedAt: 0,
      },
      user2: {
        id: 'user2',
        firstName: 'SecondPerson',
        lastName: null,
        username: null,
        updatedAt: 0,
      },
    };

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
                if (tbl && tbl.name === 'chat_user_stats') {
                  const updated = { ...val, ...(opts.set || {}) };
                  mockUserStats[`${val.chatId}_${val.userId}`] =
                    updated as unknown as UserStatRecord;
                }
                if (tbl && tbl.name === 'chat_longest_sessions') {
                  const updated = { ...val, ...(opts.set || {}) };
                  mockLongestSessions[val.chatId as string] =
                    updated as unknown as LongestSessionRecord;
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
              if (tbl && tbl.name === 'chat_status_effect_users') {
                mockStatusEffects = {};
              }
            },
          }),
        }) as unknown as ReturnType<typeof db.delete>
    );

    vi.spyOn(db, 'update').mockImplementation(
      (tbl: { name?: string }) =>
        ({
          set: (setVal: Record<string, unknown>) => ({
            where: (cond: any) => ({
              run: async () => {
                if (tbl && tbl.name === 'chat_queue_players') {
                  let insertAfterOrder = 0;
                  if (cond && cond.values && cond.values.length >= 2) {
                    insertAfterOrder = cond.values[1];
                  }
                  for (const key of Object.keys(mockQueuePlayers)) {
                    const p = mockQueuePlayers[key];
                    if (p && p.turnOrder > insertAfterOrder) {
                      p.turnOrder += 1;
                    }
                  }
                }
                if (tbl && tbl.name === 'chat_user_stats') {
                  const conds = cond && cond.conditions ? cond.conditions : cond ? [cond] : [];
                  const chatId = conds[0]?.b;
                  const userId = conds[1]?.b;
                  for (const key of Object.keys(mockUserStats)) {
                    const row = mockUserStats[key];
                    if (row.chatId === chatId && (userId === undefined || row.userId === userId)) {
                      mockUserStats[key] = { ...row, ...setVal } as UserStatRecord;
                    }
                  }
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
                    const condStr = JSON.stringify(cond);
                    if (condStr.includes('user1')) return [mockUsers.user1];
                    if (condStr.includes('user2')) return [mockUsers.user2];
                  }
                  return Object.values(mockUsers);
                }
                if (tbl && tbl.name === 'chat_game_sessions')
                  return Object.values(mockGameSessions);
                if (tbl && tbl.name === 'chat_user_stats') return Object.values(mockUserStats);
                if (tbl && tbl.name === 'chat_longest_sessions')
                  return Object.values(mockLongestSessions);
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
                if (tbl && tbl.name === 'chat_status_effect_users') {
                  const all = Object.values(mockStatusEffects);
                  if (cond && typeof cond === 'object') {
                    const conds = (cond as { conditions?: { b?: string }[] }).conditions || [
                      cond as { b?: string },
                    ];
                    const chatId = conds[0]?.b;
                    const userId = conds[1]?.b;
                    const effectId = conds[2]?.b;
                    return all.filter(
                      (e) =>
                        (chatId === undefined || e.chatId === chatId) &&
                        (userId === undefined || e.userId === userId) &&
                        (effectId === undefined || e.statusEffectId === effectId)
                    );
                  }
                  return all;
                }
                return [];
              },
            }),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );
  });

  it('prevents winning on turn 1 of a new session or on player first move', async () => {
    const res = await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE - 0.0001); // Winning roll
    expect(res.status).toBe(CommandStatus.SUCCESS);
    expect(res.gameStarted).toBe(true);
    expect(res.gameEnded).toBe(false);
    expect(res.outcome).toBe('Член');
  });

  it('warns user on consecutive move and ignores repeat moves', async () => {
    // Turn 1
    await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);

    // Turn 2 by same user -> should get warning
    const warnRes = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
    expect(warnRes.status).toBe(CommandStatus.WARNING);

    // Repeat turn by same user -> ignored
    const ignoreRes = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
    expect(ignoreRes.status).toBe(CommandStatus.IGNORED);
  });

  it('enforces 10-second cooldown between games', async () => {
    // Start game (turn 1 - Pasha 1st move)
    await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
    // Turn 2 by user2 (Yegor 1st move)
    await handleGameCommand('chat1', 'user2', 'Yegor', 0.5);
    // Turn 3 by user1 (Pasha 2nd move with winning roll -> game ends)
    await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE - 0.0001);

    // Attempt to start a new game immediately -> cooldown (if set)
    const res = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
    if (SESSION_COOLDOWN_SECONDS > 0) {
      expect(res.status).toBe(CommandStatus.SESSION_COOLDOWN);
    } else {
      expect(res.status).toBe(CommandStatus.SUCCESS);
    }
  });

  it('updates stats and sets longest record on game win', async () => {
    // Turn 1 (Pasha - 1st move)
    await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
    // Turn 2 (Yegor - 1st move)
    await handleGameCommand('chat1', 'user2', 'Yegor', 0.5);
    // Turn 3 (Pasha - 2nd move - winning roll)
    const winRes = await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE - 0.0001);

    expect(winRes.status).toBe(CommandStatus.SUCCESS);
    expect(winRes.gameEnded).toBe(true);
    expect(winRes.winnerName).toBe('Pasha');
    expect(winRes.turns).toBe(3);
    expect(winRes.newRecord).toBe(true);
  });

  it('correctly handles real multi-player playtest scenario in strict queue mode', async () => {
    // Turn 1: User 1 (Yegor) starts the game
    const res1 = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
    expect(res1.status).toBe(CommandStatus.SUCCESS);
    expect(res1.gameStarted).toBe(true);
    expect(res1.gameEnded).toBe(false);

    // Turn 2: User 2 (SecondPerson) joins game immediately -> MUST BE SUCCESS (VALID JOIN)
    const res2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
    expect(res2.status).toBe(CommandStatus.SUCCESS);
    expect(res2.gameEnded).toBe(false);

    // Turn 3: User 2 tries to make a 2nd consecutive move -> MUST BE WARNING
    const res3 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
    expect(res3.status).toBe(CommandStatus.WARNING);
    expect(res3.expectedUserName).toBe('Yegor');

    // Turn 4: User 1 makes their 2nd move -> MUST BE SUCCESS
    const res4 = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
    expect(res4.status).toBe(CommandStatus.SUCCESS);
    expect(res4.gameEnded).toBe(false);

    // Turn 5: User 2 makes their 2nd move with winning roll -> MUST WIN!
    const res5 = await handleGameCommand(
      'chat1',
      'user2',
      'SecondPerson',
      GAME_WIN_CHANCE - 0.0001
    );
    expect(res5.status).toBe(CommandStatus.SUCCESS);
    expect(res5.gameEnded).toBe(true);
    expect(res5.winnerName).toBe('SecondPerson');
  });

  it('prevents any user from winning on their very first move in non-strict mode', async () => {
    mockGameSessions = {};
    mockQueuePlayers = {};
    mockWarnedUsers = {};

    vi.spyOn(db, 'select').mockImplementation(
      () =>
        ({
          from: (tbl: { name?: string }) => ({
            where: (cond?: unknown) => ({
              run: async () => {
                if (tbl && tbl.name === 'chats')
                  return [{ id: 'chat1', title: 'Chat', queueMode: 0 }];
                if (tbl && tbl.name === 'chat_game_sessions')
                  return Object.values(mockGameSessions);
                if (tbl && tbl.name === 'chat_user_stats') return Object.values(mockUserStats);
                if (tbl && tbl.name === 'chat_longest_sessions')
                  return Object.values(mockLongestSessions);
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
                return [];
              },
            }),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );

    // Turn 1 (Pasha - 1st move)
    await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);

    // Turn 2 (Yegor joins - 1st move with winning roll) -> CANNOT WIN IN NON-STRICT MODE
    const yegorRes1 = await handleGameCommand('chat1', 'user2', 'Yegor', GAME_WIN_CHANCE - 0.0001);
    expect(yegorRes1.status).toBe(CommandStatus.SUCCESS);
    expect(yegorRes1.gameEnded).toBe(false);
    expect(yegorRes1.outcome).toBe('Член');
  });

  it('resets session and clears queue when starting a new game after a timeout', async () => {
    // Start game
    await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
    expect(mockGameSessions['chat1']?.isActive).toBe(1);

    // Force mock abort (simulate timeout aborting session)
    mockGameSessions['chat1'] = {
      chatId: 'chat1',
      isActive: 0,
      lastUserId: null,
      sessionMessagesCount: 0,
      sessionEndedAt: 1000,
      currentTurnStartedAt: null,
    };
    mockQueuePlayers['chat1_user1'] = {
      chatId: 'chat1',
      userId: 'user1',
      turnOrder: 1,
      skipCount: 3,
      isExcluded: 1,
      lastTurnAt: 1000,
    };

    // User 2 joins after cooldown -> Starts a fresh game session cleanly
    const res = await handleGameCommand('chat1', 'user2', 'Yegor', 0.5);
    expect(res.status).toBe(CommandStatus.SUCCESS);
    expect(res.gameStarted).toBe(true);
    // User1 was excluded previously, but starting new game should have cleared the queue
    expect(mockQueuePlayers['chat1_user1']).toBeUndefined();
  });

  it('respects non-strict mode consecutive play block', async () => {
    // Override select for this test to return queueMode = 0 (non-strict)
    vi.spyOn(db, 'select').mockImplementation(
      () =>
        ({
          from: (tbl: { name?: string }) => ({
            where: (cond?: unknown) => ({
              run: async () => {
                if (tbl && tbl.name === 'chats')
                  return [{ id: 'chat1', title: 'Chat', queueMode: 0 }];
                if (tbl && tbl.name === 'chat_game_sessions')
                  return Object.values(mockGameSessions);
                if (tbl && tbl.name === 'chat_user_stats') return Object.values(mockUserStats);
                if (tbl && tbl.name === 'chat_longest_sessions')
                  return Object.values(mockLongestSessions);
                if (tbl && tbl.name === 'chat_warned_users') return Object.values(mockWarnedUsers);
                if (tbl && tbl.name === 'chat_queue_players') {
                  const all = Object.values(mockQueuePlayers);
                  if (cond && typeof cond === 'object') {
                    const condStr = JSON.stringify(cond);
                    if (condStr.includes('user1')) return all.filter((p) => p.userId === 'user1');
                    if (condStr.includes('user2')) return all.filter((p) => p.userId === 'user2');
                  }
                  return all;
                }
                return [];
              },
            }),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );

    // Turn 1: User 1 starts game
    const res1 = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
    expect(res1.status).toBe(CommandStatus.SUCCESS);

    // Turn 2: User 2 plays
    const res2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
    expect(res2.status).toBe(CommandStatus.SUCCESS);

    // Turn 3: User 2 plays again immediately -> warning (spam filter)
    const res3 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
    expect(res3.status).toBe(CommandStatus.WARNING);

    // Turn 4: User 1 plays -> SUCCESS (since it's a different user)
    const res4 = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
    expect(res4.status).toBe(CommandStatus.SUCCESS);
  });

  describe('Skill mechanics', () => {
    it('chlenomant accumulates a charge on every lost roll including the game-starting roll', async () => {
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor',
        classIndex: 2,
        chlenomantCharges: 0,
      };

      // Turn 1: user1 starts the game -> forced loss -> 1 charge
      const startRes = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
      expect(startRes.gameStarted).toBe(true);
      expect(mockUserStats['chat1_user1']?.chlenomantCharges).toBe(1);

      // Turn 2: user2 (no class) loses -> no charge
      await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(mockUserStats['chat1_user1']?.chlenomantCharges).toBe(1);

      // Turn 3: user1 loses again -> 2 charges
      const lossRes = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
      expect(lossRes.gameEnded).toBe(false);
      expect(mockUserStats['chat1_user1']?.chlenomantCharges).toBe(2);
    });

    it('master: next roll has 0% chance, every following roll gains +5% (cumulative)', async () => {
      // Turn 1: user1 starts the game
      await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
      // Turn 2: user2
      await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);

      // Master uses his skill between turns (effect count starts at 1)
      mockStatusEffects['chat1_user1_Членовосхождение'] = {
        chatId: 'chat1',
        userId: 'user1',
        statusEffectId: StatusEffectId.MASTER_RISING,
        count: 1,
      };

      // Turn 3: user1 rolls with winning roll value, but chance is 0% -> loss
      const zeroChanceRes = await handleGameCommand('chat1', 'user1', 'Yegor', 0.0001);
      expect(zeroChanceRes.gameEnded).toBe(false);
      expect(zeroChanceRes.outcome).toBe('Член');
      expect(mockStatusEffects['chat1_user1_Членовосхождение']?.count).toBe(2);

      // Turn 4: user2
      await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);

      // Turn 5: user1 chance is now 5% -> roll 0.03 wins
      const fiveChanceRes = await handleGameCommand('chat1', 'user1', 'Yegor', 0.03);
      expect(fiveChanceRes.gameEnded).toBe(true);
      expect(fiveChanceRes.winnerName).toBe('Yegor');
    });

    it('blocked hunter cannot roll (CommandStatus.BLOCKED)', async () => {
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 1,
        lastUserId: 'user2',
        sessionMessagesCount: 5,
        sessionEndedAt: null,
        currentTurnStartedAt: 12345,
        isDuel: 0,
        duelInitiatorId: null,
        duelOpponentId: null,
        duelIsAccepted: 0,
      };
      mockStatusEffects['chat1_user1_Хватка охотника'] = {
        chatId: 'chat1',
        userId: 'user1',
        statusEffectId: StatusEffectId.HUNTER_BLOCK,
        count: 1,
      };

      const res = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
      expect(res.status).toBe(CommandStatus.BLOCKED);
      expect(mockGameSessions['chat1'].isActive).toBe(1);
    });

    it('bypassQueue rolls skip queue rules and do not update lastUserId', async () => {
      // Turn 1: user1 starts the game
      const startRes = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
      expect(startRes.gameStarted).toBe(true);

      // Bypass rolls by the same user: no warnings, no consecutive-move restriction
      const bypass1 = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5, {
        bypassQueue: true,
      });
      expect(bypass1.status).toBe(CommandStatus.SUCCESS);
      expect(bypass1.outcome).toBe('Член');

      const bypass2 = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5, {
        bypassQueue: true,
      });
      expect(bypass2.status).toBe(CommandStatus.SUCCESS);

      // lastUserId stays unchanged by bypass rolls (user1 was the last normal mover)
      expect(mockGameSessions['chat1'].lastUserId).toBe('user1');
      expect(mockGameSessions['chat1'].sessionMessagesCount).toBe(3);

      // A normal consecutive roll still triggers the usual warning
      const normalRes = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
      expect(normalRes.status).toBe(CommandStatus.WARNING);
    });

    it('charges are reset when a new game starts', async () => {
      mockGameSessions['chat1'] = {
        chatId: 'chat1',
        isActive: 0,
        lastUserId: null,
        sessionMessagesCount: 1,
        sessionEndedAt: 1000,
        currentTurnStartedAt: null,
      };
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 0,
        displayName: 'Yegor',
        classIndex: 2,
        chlenomantCharges: 5,
      };

      const res = await handleGameCommand('chat1', 'user1', 'Yegor', 0.5);
      expect(res.status).toBe(CommandStatus.SUCCESS);
      expect(res.gameStarted).toBe(true);
      // Charges were reset at game start (5 -> 0), then the starting loss added one charge
      expect(mockUserStats['chat1_user1']?.chlenomantCharges).toBe(1);
    });
  });

  describe('recordAutomaticWin helper branch coverage', () => {
    it('handles updating existing user stats and classIndex', async () => {
      mockUserStats['chat1_user1'] = {
        chatId: 'chat1',
        userId: 'user1',
        wins: 5,
        displayName: 'Yegor',
        classIndex: 2,
      };

      const winRes = await recordAutomaticWin('chat1', 'user1', 'Yegor New', 2000, 10);
      expect(winRes.turns).toBe(10);
      expect(mockUserStats['chat1_user1']?.wins).toBe(6);
      expect(mockUserStats['chat1_user1']?.displayName).toBe('Yegor New');
      expect(mockUserStats['chat1_user1']?.classIndex).toBe(2);
    });

    it('does not update longest session if turns count is not larger than existing record', async () => {
      mockLongestSessions['chat1'] = {
        chatId: 'chat1',
        messagesCount: 15,
        winnerId: 'user2',
        winnerDisplayName: 'SecondPerson',
        endedAt: '17.07.2026 11:13',
      };

      const winRes = await recordAutomaticWin('chat1', 'user1', 'Yegor', 2000, 10);
      expect(winRes.newRecord).toBe(false);
      expect(mockLongestSessions['chat1']?.messagesCount).toBe(15);
      expect(mockLongestSessions['chat1']?.winnerId).toBe('user2');
    });

    it('updates longest session if turns count is larger than existing record', async () => {
      mockLongestSessions['chat1'] = {
        chatId: 'chat1',
        messagesCount: 5,
        winnerId: 'user2',
        winnerDisplayName: 'SecondPerson',
        endedAt: '17.07.2026 11:13',
      };

      const winRes = await recordAutomaticWin('chat1', 'user1', 'Yegor', 2000, 10);
      expect(winRes.newRecord).toBe(true);
      expect(mockLongestSessions['chat1']?.messagesCount).toBe(10);
      expect(mockLongestSessions['chat1']?.winnerId).toBe('user1');
    });
  });
});
