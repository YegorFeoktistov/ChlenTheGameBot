import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from 'sdk';
import {
  formatDisplayName,
  ensureUserAndChat,
  subscribeUser,
  unsubscribeUser,
  getSubscribers,
} from '../src/services/user.service.js';
import type { UserRecord, ChatRecord, SubscriberRecord } from '../src/types/models.js';

let mockUsers: Record<string, UserRecord> = {};
let mockChats: Record<string, ChatRecord> = {};
let mockSubscribers: Record<string, SubscriberRecord> = {};

describe('User Service Helpers', () => {
  beforeEach(() => {
    mockUsers = {};
    mockChats = {};
    mockSubscribers = {};

    vi.spyOn(db, 'insert').mockImplementation(
      (tbl: { name?: string }) =>
        ({
          values: (val: Record<string, unknown>) => ({
            onConflictDoUpdate: () => ({
              run: async () => {
                if (tbl && tbl.name === 'users')
                  mockUsers[val.id as string] = val as unknown as UserRecord;
                if (tbl && tbl.name === 'chats')
                  mockChats[val.id as string] = val as unknown as ChatRecord;
                if (tbl && tbl.name === 'chat_subscribers')
                  mockSubscribers[`${val.chatId as string}_${val.userId as string}`] =
                    val as unknown as SubscriberRecord;
              },
            }),
          }),
        }) as unknown as ReturnType<typeof db.insert>
    );

    vi.spyOn(db, 'delete').mockImplementation(
      () =>
        ({
          where: () => ({
            run: async () => {
              mockSubscribers = {};
            },
          }),
        }) as unknown as ReturnType<typeof db.delete>
    );

    vi.spyOn(db, 'select').mockImplementation(
      () =>
        ({
          from: () => ({
            where: () => ({
              run: async () => Object.values(mockSubscribers),
            }),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );
  });

  it('formats display name with first name only', () => {
    expect(formatDisplayName('Pasha')).toBe('Pasha');
  });

  it('formats display name with first and last name', () => {
    expect(formatDisplayName('Yegor', 'Feoktistov')).toBe('Yegor Feoktistov');
  });

  it('strips leading @ from usernames', () => {
    expect(formatDisplayName('@yegorfv')).toBe('yegorfv');
  });

  it('upserts user and chat with fallback titles when missing', async () => {
    await ensureUserAndChat('chat1', undefined, 'user1', 'Pasha', null, undefined);
    expect(mockChats['chat1'].title).toBe('Chat');
    expect(mockUsers['user1'].firstName).toBe('Pasha');
  });

  it('subscribes, lists, and unsubscribes users correctly', async () => {
    await subscribeUser('chat1', 'user1', '@yegorfv');
    let subs = await getSubscribers('chat1');
    expect(subs).toContain('yegorfv');

    await unsubscribeUser('chat1', 'user1');
    subs = await getSubscribers('chat1');
    expect(subs).toHaveLength(0);
  });
});
