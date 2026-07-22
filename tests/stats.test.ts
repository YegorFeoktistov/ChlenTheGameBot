import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from 'sdk';
import { getLeaderboardText, getLongestSessionText } from '../src/services/stats.service.js';
import type { UserStatRecord, LongestSessionRecord } from '../src/types/models.js';

let mockStats: UserStatRecord[] = [];
let mockLongest: LongestSessionRecord[] = [];

describe('Stats Service', () => {
  beforeEach(() => {
    mockStats = [];
    mockLongest = [];

    vi.spyOn(db, 'select').mockImplementation(
      () =>
        ({
          from: (tbl: { name?: string }) => ({
            where: () => ({
              orderBy: () => ({
                run: async () => mockStats.sort((a, b) => b.wins - a.wins),
              }),
              run: async () => {
                if (tbl && tbl.name === 'chat_longest_sessions') return mockLongest;
                return mockStats.sort((a, b) => b.wins - a.wins);
              },
            }),
            run: async () => mockStats.sort((a, b) => b.wins - a.wins),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );
  });

  it('returns fallback text when leaderboard is empty', async () => {
    const text = await getLeaderboardText('chat1');
    expect(text).toContain('🏆 В этом чате еще нет победителей!');
  });

  it('formats leaderboard rows with correct Russian pluralization', async () => {
    mockStats = [
      { chatId: 'c1', userId: 'u1', displayName: 'Yegor Feoktistov', wins: 3, classIndex: 1 },
      { chatId: 'c1', userId: 'u2', displayName: '@Pasha', wins: 1, classIndex: 2 },
      { chatId: 'c1', userId: 'u3', displayName: '', wins: 2, classIndex: null },
    ];
    const text = await getLeaderboardText('chat1');
    expect(text).toContain('1. Yegor Feoktistov — 3 победы');
    expect(text).toContain('2. Игрок — 2 победы');
    expect(text).toContain('3. Pasha — 1 победа'); // Stripped leading @
  });

  it('returns fallback text when longest session record is missing', async () => {
    const text = await getLongestSessionText('chat1');
    expect(text).toContain('🏆 В этом чате еще не было завершенных игр!');
  });

  it('formats longest session record text correctly with @ username stripping', async () => {
    mockLongest = [
      {
        messagesCount: 15,
        winnerDisplayName: '@Pasha',
        endedAt: '22.07.2026 02:00',
      },
    ];
    const text = await getLongestSessionText('chat1');
    expect(text).toContain('💬 Количество ходов: 15 ходов');
    expect(text).toContain('👑 Победитель: Pasha');
    expect(text).toContain('📅 Дата окончания: 22.07.2026 02:00');
  });
});
