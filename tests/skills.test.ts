import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from 'sdk';
import {
  getUserSkillText,
  recordSkillUsed,
  applyWeaknessToTarget,
  useSkill,
} from '../src/services/skills.service.js';
import {
  getChlenomantCharges,
  addChlenomantCharge,
  resetChlenomantCharges,
} from '../src/services/class.service.js';
import type {
  UserStatRecord,
  SkillUserRecord,
  GameSessionRecord,
  QueuePlayerRecord,
} from '../src/types/models.js';

let mockUserStats: Record<string, UserStatRecord> = {};
let mockSkillUsers: Record<string, SkillUserRecord> = {};
let mockUsers: Record<string, any> = {};
let mockStatusEffects: Record<string, any> = {};
let mockGameSessions: Record<string, GameSessionRecord> = {};
let mockQueuePlayers: Record<string, QueuePlayerRecord> = {};

function activeSession(): void {
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

function setClass(userId: string, classIndex: number, extra: Record<string, unknown> = {}): void {
  mockUserStats[`chat1_${userId}`] = {
    chatId: 'chat1',
    userId,
    wins: 0,
    displayName: 'Test User',
    classIndex,
    chlenomantCharges: 0,
    ...extra,
  } as unknown as UserStatRecord;
}

describe('Skills Service', () => {
  beforeEach(() => {
    mockUserStats = {};
    mockSkillUsers = {};
    mockUsers = {};
    mockStatusEffects = {};
    mockGameSessions = {};
    mockQueuePlayers = {};

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
                  mockUserStats[`${val.chatId}_${val.userId}`] = {
                    ...(mockUserStats[`${val.chatId}_${val.userId}`] || {}),
                    ...updated,
                  } as unknown as UserStatRecord;
                }
                if (tbl && tbl.name === 'chat_skill_users') {
                  mockSkillUsers[`${val.chatId}_${val.userId}`] = val as unknown as SkillUserRecord;
                }
                if (tbl && tbl.name === 'users') {
                  mockUsers[String(val.id)] = { ...val };
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

    vi.spyOn(db, 'update').mockImplementation(
      (tbl: { name?: string }) =>
        ({
          set: (setVal: Record<string, unknown>) => ({
            where: (cond: { conditions?: { b?: string }[]; b?: string }) => ({
              run: async () => {
                if (tbl && tbl.name === 'chat_user_stats') {
                  const conds = cond && cond.conditions ? cond.conditions : cond ? [cond] : [];
                  const chatId = conds[0]?.b;
                  const userId = conds[1]?.b;
                  for (const key of Object.keys(mockUserStats)) {
                    const row = mockUserStats[key];
                    if (row.chatId === chatId && (userId === undefined || row.userId === userId)) {
                      mockUserStats[key] = { ...row, ...setVal } as unknown as UserStatRecord;
                    }
                  }
                }
              },
            }),
          }),
        }) as unknown as ReturnType<typeof db.update>
    );

    vi.spyOn(db, 'delete').mockImplementation(
      (tbl: { name?: string }) =>
        ({
          where: () => ({
            run: async () => {
              if (tbl && tbl.name === 'chat_skill_users') {
                mockSkillUsers = {};
              }
              if (tbl && tbl.name === 'chat_status_effect_users') {
                mockStatusEffects = {};
              }
              if (tbl && tbl.name === 'chat_queue_players') {
                mockQueuePlayers = {};
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
                if (tbl && tbl.name === 'chat_user_stats') return Object.values(mockUserStats);
                if (tbl && tbl.name === 'chat_skill_users') return Object.values(mockSkillUsers);
                if (tbl && tbl.name === 'chat_game_sessions')
                  return Object.values(mockGameSessions);
                if (tbl && tbl.name === 'chat_queue_players')
                  return Object.values(mockQueuePlayers);
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
                if (tbl && tbl.name === 'users') {
                  if (cond && typeof cond === 'object') {
                    const c = cond as { params?: unknown[]; b?: unknown };
                    const param = String(c.params?.[0] ?? c.b ?? '');
                    const byUsername = Object.values(mockUsers).filter((u) => u.username === param);
                    if (byUsername.length > 0) return byUsername;
                    const byId = Object.values(mockUsers).filter((u) => u.id === param);
                    if (byId.length > 0) return byId;
                    return [];
                  }
                  return Object.values(mockUsers);
                }
                return [];
              },
            }),
            run: async () => {
              if (tbl && tbl.name === 'users') return Object.values(mockUsers);
              return [];
            },
          }),
        }) as unknown as ReturnType<typeof db.select>
    );
  });

  it('returns null when user has no class', async () => {
    const res = await getUserSkillText('chat1', 'user1');
    expect(res).toBeNull();
  });

  it('returns skill text when user has a class and no session', async () => {
    setClass('user1', 2);

    const res = await getUserSkillText('chat1', 'user1');
    expect(res).not.toBeNull();
    expect(res!.alreadyUsed).toBe(false);
    expect(res!.skillText).toContain('Членомант');
    expect(res!.skillText).toContain('{');
  });

  it('returns alreadyUsed false when user has not used skill', async () => {
    setClass('user1', 1);

    const res = await getUserSkillText('chat1', 'user1');
    expect(res).not.toBeNull();
    expect(res!.alreadyUsed).toBe(false);
  });

  it('returns alreadyUsed true when user has used skill', async () => {
    setClass('user1', 3);

    mockSkillUsers['chat1_user1'] = {
      chatId: 'chat1',
      userId: 'user1',
    };

    const res = await getUserSkillText('chat1', 'user1');
    expect(res).not.toBeNull();
    expect(res!.alreadyUsed).toBe(true);
  });

  it('records skill used for a user', async () => {
    await recordSkillUsed('chat1', 'user1');
    expect(mockSkillUsers['chat1_user1']).toBeDefined();
  });

  it('returns null for invalid class index', async () => {
    setClass('user1', 99);

    const res = await getUserSkillText('chat1', 'user1');
    expect(res).toBeNull();
  });

  describe('chlenomant charges', () => {
    it('reads, increments and resets charges for a user', async () => {
      setClass('user1', 2);

      expect(await getChlenomantCharges('chat1', 'user1')).toBe(0);

      await addChlenomantCharge('chat1', 'user1');
      await addChlenomantCharge('chat1', 'user1');
      expect(await getChlenomantCharges('chat1', 'user1')).toBe(2);

      await resetChlenomantCharges('chat1', 'user1');
      expect(await getChlenomantCharges('chat1', 'user1')).toBe(0);
    });
  });

  describe('applyWeaknessToTarget', () => {
    beforeEach(() => {
      mockUsers = {};
      mockStatusEffects = {};
    });

    it('applies weakness to target by @username', async () => {
      mockUsers['target1'] = {
        id: 'target1',
        username: 'targetuser',
        firstName: 'Target',
        lastName: null,
      };

      const res = await applyWeaknessToTarget('chat1', 'user1', '@targetuser');
      expect(res.success).toBe(true);
      expect(res.message).toContain('Target');
      expect(res.message).toContain('Членослабость');

      const key = 'chat1_target1_' + 'Членослабость';
      expect(mockStatusEffects[key]).toBeDefined();
      expect(mockStatusEffects[key].count).toBe(1);
    });

    it('rejects bare numeric ID target', async () => {
      const res = await applyWeaknessToTarget('chat1', 'user1', '12345');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Неверная цель');
      expect(mockStatusEffects).toEqual({});
    });

    it('rejects bare name target', async () => {
      const res = await applyWeaknessToTarget('chat1', 'user1', 'targetuser');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Неверная цель');
      expect(mockStatusEffects).toEqual({});
    });

    it('returns usage message when target is empty', async () => {
      const res = await applyWeaknessToTarget('chat1', 'user1', '');
      expect(res.success).toBe(false);
      expect(res.message).toContain('chlenskill');
      expect(res.message).toContain('@username');
      expect(mockStatusEffects).toEqual({});
    });

    it('resolves mixed-case @username via case-insensitive fallback', async () => {
      mockUsers['target1'] = {
        id: 'target1',
        username: 'targetuser',
        firstName: 'Target',
        lastName: null,
      };

      const res = await applyWeaknessToTarget('chat1', 'user1', '@TARGETUSER');
      expect(res.success).toBe(true);
      expect(res.message).toContain('Target');

      const key = 'chat1_target1_Членослабость';
      expect(mockStatusEffects[key]).toBeDefined();
      expect(mockStatusEffects[key].count).toBe(1);
    });

    it('fails when target not found', async () => {
      const res = await applyWeaknessToTarget('chat1', 'user1', '@nonexistent');
      expect(res.success).toBe(false);
      expect(res.message).toBe('Цель не найдена. Укажите @username.');
      expect(mockStatusEffects).toEqual({});
    });

    it('fails when targeting self', async () => {
      mockUsers['user1'] = { id: 'user1', username: 'me', firstName: 'Self', lastName: null };

      const res = await applyWeaknessToTarget('chat1', 'user1', '@me');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Нельзя наложить Членослабость на себя');
      expect(mockStatusEffects).toEqual({});
    });

    it('stacks multiple weakness instances', async () => {
      mockUsers['target3'] = {
        id: 'target3',
        username: 'stackuser',
        firstName: 'Stack',
        lastName: null,
      };

      const res1 = await applyWeaknessToTarget('chat1', 'user1', '@stackuser');
      expect(res1.success).toBe(true);

      const res2 = await applyWeaknessToTarget('chat1', 'user2', '@stackuser');
      expect(res2.success).toBe(true);

      const key = 'chat1_target3_Членослабость';
      expect(mockStatusEffects[key].count).toBe(2);
    });
  });

  describe('useSkill', () => {
    beforeEach(() => {
      mockUsers['user1'] = {
        id: 'user1',
        username: 'yegor',
        firstName: 'Yegor',
        lastName: 'Feoktistov',
      };
    });

    it('rejects when there is no active game', async () => {
      setClass('user1', 2);
      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Нет активной игры');
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('rejects when duel is pending', async () => {
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
      setClass('user1', 2);
      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(false);
      expect(res.message).toContain('дуэль не принята');
    });

    it('rejects when no class is chosen', async () => {
      activeSession();
      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(false);
      expect(res.message).toContain('не выбрал класс');
    });

    it('rejects when skill was already used this game', async () => {
      activeSession();
      setClass('user1', 1);
      mockSkillUsers['chat1_user1'] = { chatId: 'chat1', userId: 'user1' };
      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill @pasha');
      expect(res.success).toBe(false);
      expect(res.message).toContain('уже использовал свою способность');
    });

    it('chlenoknizhnik applies weakness and records cooldown', async () => {
      activeSession();
      setClass('user1', 1);
      mockUsers['target1'] = {
        id: 'target1',
        username: 'pasha',
        firstName: 'Pasha',
        lastName: null,
      };

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill @pasha');
      expect(res.success).toBe(true);
      expect(res.message).toContain('Членослабость');
      expect(mockSkillUsers['chat1_user1']).toBeDefined();
      expect(mockStatusEffects['chat1_target1_Членослабость']).toBeDefined();
    });

    it('chlenoknizhnik does not record cooldown on invalid target', async () => {
      activeSession();
      setClass('user1', 1);

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill @ghost');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Цель не найдена');
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('chlenodin applies buff and records cooldown', async () => {
      activeSession();
      setClass('user1', 3);

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(true);
      expect(res.message).toContain('увеличен в 2 раза');
      expect(mockSkillUsers['chat1_user1']).toBeDefined();
      expect(mockStatusEffects['chat1_user1_Членосила']).toBeDefined();
    });

    it('chlenomant with no charges fails without consuming cooldown', async () => {
      activeSession();
      setClass('user1', 2);

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(false);
      expect(res.message).toBe('Нет членов для поднятия');
      expect(mockSkillUsers['chat1_user1']).toBeUndefined();
    });

    it('chlenomant spends charges and rolls once per charge skipping the queue', async () => {
      activeSession();
      setClass('user1', 2, { chlenomantCharges: 2 });
      vi.spyOn(Math, 'random').mockReturnValue(0.99); // all rolls lose

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(true);
      expect(res.activationMessage).toBe('@yegor поднимает 2 члена');
      expect(res.rolls).toHaveLength(2);
      expect(res.rolls!.every((r) => !r.gameEnded)).toBe(true);
      expect(mockSkillUsers['chat1_user1']).toBeDefined();
      expect(mockUserStats['chat1_user1']?.chlenomantCharges).toBe(0);
    });

    it('chlenomant stops rolling after a win', async () => {
      activeSession();
      setClass('user1', 2, { chlenomantCharges: 3 });
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // first roll wins

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(true);
      expect(res.rolls).toHaveLength(1);
      expect(res.rolls![0].gameEnded).toBe(true);
      expect(res.rolls![0].winnerName).toBe('Yegor Feoktistov');
    });

    it('hunter rolls once per active player and gets blocked', async () => {
      activeSession();
      setClass('user1', 4);
      mockQueuePlayers['chat1_user2'] = {
        chatId: 'chat1',
        userId: 'user2',
        turnOrder: 1,
        skipCount: 0,
        isExcluded: 0,
        lastTurnAt: 12345,
      };
      vi.spyOn(Math, 'random').mockReturnValue(0.99); // all rolls lose

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(true);
      expect(res.activationMessage).toBe('Ваши члены в руках @yegor');
      expect(res.rolls).toHaveLength(1);
      expect(mockSkillUsers['chat1_user1']).toBeDefined();
      expect(mockStatusEffects['chat1_user1_Хватка охотника']).toBeDefined();
      expect(mockStatusEffects['chat1_user1_Хватка охотника'].count).toBe(1);
    });

    it('hunter is not blocked when he wins the game on a captured roll', async () => {
      activeSession();
      setClass('user1', 4);
      mockQueuePlayers['chat1_user2'] = {
        chatId: 'chat1',
        userId: 'user2',
        turnOrder: 1,
        skipCount: 0,
        isExcluded: 0,
        lastTurnAt: 12345,
      };
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // captured roll wins

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(true);
      expect(res.rolls).toHaveLength(1);
      expect(res.rolls![0].gameEnded).toBe(true);
      expect(mockStatusEffects['chat1_user1_Хватка охотника']).toBeUndefined();
    });

    it('master applies rising effect and records cooldown', async () => {
      activeSession();
      setClass('user1', 5);

      const res = await useSkill('chat1', 'user1', 'Yegor Feoktistov', '/chlenskill');
      expect(res.success).toBe(true);
      expect(res.activationMessage).toContain('Член @yegor упал');
      expect(res.activationMessage).toContain('каждый последующий член будет получать +5%');
      expect(mockSkillUsers['chat1_user1']).toBeDefined();
      expect(mockStatusEffects['chat1_user1_Членовосхождение']).toBeDefined();
      expect(mockStatusEffects['chat1_user1_Членовосхождение'].count).toBe(1);
    });
  });
});
