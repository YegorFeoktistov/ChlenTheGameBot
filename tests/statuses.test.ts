import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from 'sdk';
import { handleGameCommand } from '../src/services/game.service.js';
import type {
  GameSessionRecord,
  UserStatRecord,
  LongestSessionRecord,
  WarnedUserRecord,
  QueuePlayerRecord,
  StatusEffectUserRecord,
} from '../src/types/models.js';
import { CommandStatus, StatusEffectId, GAME_WIN_CHANCE } from '../src/utils/constants.js';

let mockGameSessions: Record<string, GameSessionRecord> = {};
let mockUserStats: Record<string, UserStatRecord> = {};
let mockLongestSessions: Record<string, LongestSessionRecord> = {};
let mockWarnedUsers: Record<string, WarnedUserRecord> = {};
let mockQueuePlayers: Record<string, QueuePlayerRecord> = {};
let mockStatusEffects: Record<string, StatusEffectUserRecord> = {};

function setMockStatusEffects(
  chatId: string,
  userId: string,
  statusEffectId: string,
  count: number
) {
  const key = `${chatId}_${userId}_${statusEffectId}`;
  mockStatusEffects[key] = { chatId, userId, statusEffectId, count };
}

describe('Status Effects', () => {
  beforeEach(() => {
    mockGameSessions = {};
    mockUserStats = {};
    mockLongestSessions = {};
    mockWarnedUsers = {};
    mockQueuePlayers = {};
    mockStatusEffects = {};

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

    vi.spyOn(db, 'select').mockImplementation(
      () =>
        ({
          from: (tbl: { name?: string }) => ({
            where: (cond?: unknown) => ({
              run: async () => {
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
                    const condStr = JSON.stringify(cond);
                    let filtered = all;
                    if (condStr.includes('chat1')) {
                      filtered = filtered.filter((e) => e.chatId === 'chat1');
                    }
                    const userIdMatch = condStr.includes('user1')
                      ? 'user1'
                      : condStr.includes('user2')
                        ? 'user2'
                        : condStr.includes('user3')
                          ? 'user3'
                          : null;
                    if (userIdMatch) {
                      filtered = filtered.filter((e) => e.userId === userIdMatch);
                    }
                    const effectMatch = [
                      'Хватка охотника',
                      'Членовосхождение',
                      'Членослабость',
                      'Членосила',
                    ].find((id) => condStr.includes(id));
                    if (effectMatch) {
                      filtered = filtered.filter((e) => e.statusEffectId === effectMatch);
                    }
                    return filtered;
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

  describe('win chance with "Членослабость" debuff', () => {
    it('gives 10% win chance with 0 debuffs (base)', async () => {
      const res = await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE / 2);
      expect(res.status).toBe(CommandStatus.SUCCESS);
      expect(res.gameStarted).toBe(true);
      expect(res.gameEnded).toBe(false);
      expect(res.outcome).toBe('Член');
    });

    it('gives 5% win chance with 1 "Членослабость" debuff', async () => {
      // Turn 1 - Pasha starts (always wins on first move)
      const r1 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r1.status).toBe(CommandStatus.SUCCESS);
      expect(r1.gameStarted).toBe(true);
      expect(r1.outcome).toBe('Член');

      setMockStatusEffects('chat1', 'user1', StatusEffectId.WEAKNESS, 1);

      // Turn 2 - User2 joins
      const r2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(r2.status).toBe(CommandStatus.SUCCESS);
      expect(r2.gameEnded).toBe(false);

      // Turn 3 - User1 makes 2nd move with winning roll (with debuff, roll < winChance)
      const r3 = await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE / 2 - 0.0001);
      expect(r3.status).toBe(CommandStatus.SUCCESS);
      expect(r3.gameEnded).toBe(true);
      expect(r3.winnerName).toBe('Pasha');
    });

    it('gives 2.5% win chance with 2 "Членослабость" debuffs', async () => {
      // Turn 1
      const r1 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r1.status).toBe(CommandStatus.SUCCESS);
      expect(r1.gameStarted).toBe(true);
      expect(r1.outcome).toBe('Член');

      setMockStatusEffects('chat1', 'user1', StatusEffectId.WEAKNESS, 2);

      // Turn 2
      const r2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(r2.status).toBe(CommandStatus.SUCCESS);

      // Turn 3 - User1 with 2 debuffs (winChance = win / 4)
      // roll < winChance -> should win
      const r3 = await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE / 4 - 0.0001);
      expect(r3.status).toBe(CommandStatus.SUCCESS);
      expect(r3.gameEnded).toBe(true);
      expect(r3.winnerName).toBe('Pasha');
    });

    it('blocks win when roll exceeds reduced chance', async () => {
      // Turn 1
      const r1 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r1.status).toBe(CommandStatus.SUCCESS);
      expect(r1.gameStarted).toBe(true);

      setMockStatusEffects('chat1', 'user1', StatusEffectId.WEAKNESS, 1);

      // Turn 2
      const r2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(r2.status).toBe(CommandStatus.SUCCESS);

      // Turn 3 - User1 with 1 debuff (winChance = win / 2)
      // roll = winChance is NOT < winChance, so should NOT win
      const r3 = await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE / 2);
      expect(r3.status).toBe(CommandStatus.SUCCESS);
      expect(r3.gameEnded).toBe(false);
      expect(r3.outcome).toBe('Член');
    });

    it('blocks win when roll equals reduced chance', async () => {
      // Turn 1
      const r1 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r1.status).toBe(CommandStatus.SUCCESS);
      expect(r1.gameStarted).toBe(true);

      setMockStatusEffects('chat1', 'user1', StatusEffectId.WEAKNESS, 1);

      // Turn 2
      const r2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(r2.status).toBe(CommandStatus.SUCCESS);

      // Turn 3 - roll = 0.05, winChance = 0.05, roll is NOT < winChance
      const r3 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.05);
      expect(r3.status).toBe(CommandStatus.SUCCESS);
      expect(r3.gameEnded).toBe(false);
      expect(r3.outcome).toBe('Член');
    });

    it('clears status effects on fresh game start', async () => {
      setMockStatusEffects('chat1', 'user1', StatusEffectId.WEAKNESS, 3);

      await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);

      expect(mockStatusEffects).toEqual({});
    });
  });

  describe('win chance with "Членосила" buff', () => {
    it('gives 20% win chance with 1 "Членосила" buff (x2)', async () => {
      // Turn 1 - Pasha starts (always no roll on first move)
      const r1 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r1.status).toBe(CommandStatus.SUCCESS);
      expect(r1.gameStarted).toBe(true);

      setMockStatusEffects('chat1', 'user1', StatusEffectId.BUFF, 1);

      // Turn 2 - User2 joins
      const r2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(r2.status).toBe(CommandStatus.SUCCESS);
      expect(r2.gameEnded).toBe(false);

      // Turn 3 - User1 with buff (winChance = 0.2). roll = 0.11 would NOT win without buff
      const r3 = await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE + 0.01);
      expect(r3.status).toBe(CommandStatus.SUCCESS);
      expect(r3.gameEnded).toBe(true);
      expect(r3.winnerName).toBe('Pasha');
    });

    it('consumes the buff after a single roll', async () => {
      // Turn 1
      const r1 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r1.gameStarted).toBe(true);

      setMockStatusEffects('chat1', 'user1', StatusEffectId.BUFF, 1);

      // Turn 2
      const r2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(r2.gameEnded).toBe(false);

      // Turn 3 - User1 rolls and does NOT win, buff should be consumed
      const r3 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r3.status).toBe(CommandStatus.SUCCESS);
      expect(r3.gameEnded).toBe(false);
      expect(r3.outcome).toBe('Член');

      expect(mockStatusEffects).toEqual({});
    });

    it('buff does not double the win chance on the roll after it was consumed', async () => {
      // Turn 1
      const r1 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r1.gameStarted).toBe(true);

      setMockStatusEffects('chat1', 'user1', StatusEffectId.BUFF, 1);

      // Turn 2
      const r2 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(r2.gameEnded).toBe(false);

      // Turn 3 - User1 rolls and loses, buff consumed
      const r3 = await handleGameCommand('chat1', 'user1', 'Pasha', 0.5);
      expect(r3.gameEnded).toBe(false);

      // Turn 4 - User2 rolls and loses
      const r4 = await handleGameCommand('chat1', 'user2', 'SecondPerson', 0.5);
      expect(r4.gameEnded).toBe(false);

      // Turn 5 - User1 rolls again without buff, roll >= base winChance -> no win
      const r5 = await handleGameCommand('chat1', 'user1', 'Pasha', GAME_WIN_CHANCE + 0.01);
      expect(r5.status).toBe(CommandStatus.SUCCESS);
      expect(r5.gameEnded).toBe(false);
      expect(r5.outcome).toBe('Член');
    });
  });
});
