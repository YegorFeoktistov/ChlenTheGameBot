import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from 'sdk';
import { getClassesText, setUserClass, getUserClass } from '../src/services/class.service.js';
import { CHLEN_CLASSES } from '../src/utils/constants.js';
import type { UserStatRecord } from '../src/types/models.js';

let mockUserStats: Record<string, UserStatRecord> = {};

describe('Class Service', () => {
  beforeEach(() => {
    mockUserStats = {};

    vi.spyOn(db, 'insert').mockImplementation(
      () =>
        ({
          values: (val: UserStatRecord) => ({
            onConflictDoUpdate: () => ({
              run: async () => {
                mockUserStats[`${val.chatId}_${val.userId}`] = val;
              },
            }),
          }),
        }) as unknown as ReturnType<typeof db.insert>
    );

    vi.spyOn(db, 'select').mockImplementation(
      () =>
        ({
          from: () => ({
            where: () => ({
              run: async () => Object.values(mockUserStats),
            }),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );
  });

  it('formats classes list text correctly', () => {
    const text = getClassesText();
    expect(text).toContain('⚔️ Доступные классы:');
    CHLEN_CLASSES.forEach((cls) => {
      expect(text).toContain(cls);
    });
  });

  it('rejects invalid class index', async () => {
    const res = await setUserClass('chat1', 'user1', 'Name', 99);
    expect(res).toBeNull();
  });

  it('sets and retrieves valid user class', async () => {
    const assigned = await setUserClass('chat1', 'user1', 'Name', 2);
    expect(assigned).toBe('Членомант');

    const retrieved = await getUserClass('chat1', 'user1');
    expect(retrieved).toBe('Членомант');
  });
});
