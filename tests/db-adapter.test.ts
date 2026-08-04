import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { db, sql, eq, table, text, integer } from '../src/adapters/db.js';
import { runMigrations } from '../src/adapters/migrations.js';

// Mutable ref so db.ts (which dereferences `sqlite` lazily inside run()) sees the
// freshly-created in-memory Database on every call, and not a stale/closed instance.
const sqliteRef = vi.hoisted(() => ({ db: null as unknown as Database.Database }));

vi.mock('../src/adapters/sqlite.js', () => ({
  get sqlite() {
    return sqliteRef.db;
  },
}));

// Table descriptors built with the REAL db.js builders (NOT src/schema.ts,
// which imports the mocked sdk/db). They map onto the migrated tables.
const chatUserStats = table('chat_user_stats', {
  chatId: text('chat_id'),
  userId: text('user_id'),
  wins: integer('wins'),
  displayName: text('display_name'),
  classIndex: integer('class_index'),
});

const chatStatusEffectUsers = table('chat_status_effect_users', {
  chatId: text('chat_id'),
  userId: text('user_id'),
  statusEffectId: text('status_effect_id'),
  count: integer('count'),
});

describe('DB Adapter executeUpsert regression', () => {
  let memoryDb: Database.Database;

  beforeEach(() => {
    memoryDb = new Database(':memory:');
    runMigrations(memoryDb);
    sqliteRef.db = memoryDb;
  });

  afterEach(() => {
    memoryDb.close();
    sqliteRef.db = null as unknown as Database.Database;
  });

  it('plain insert + select roundtrip', async () => {
    await db
      .insert(chatUserStats)
      .values({ chatId: 'c1', userId: 'u1', wins: 5, displayName: 'Alpha', classIndex: 1 })
      .run();

    const rows = (await db
      .select()
      .from(chatUserStats)
      .where(eq(chatUserStats.chatId, 'c1'))
      .run()) as Record<string, unknown>[];

    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      chatId: 'c1',
      userId: 'u1',
      wins: 5,
      displayName: 'Alpha',
      classIndex: 1,
    });
  });

  it('CRITICAL: onConflictDoUpdate inlines sql fragment in SET (count stacks)', async () => {
    const target = [
      chatStatusEffectUsers.chatId,
      chatStatusEffectUsers.userId,
      chatStatusEffectUsers.statusEffectId,
    ];

    await db
      .insert(chatStatusEffectUsers)
      .values({ chatId: 'c1', userId: 'u1', statusEffectId: 'weak', count: 1 })
      .onConflictDoUpdate({ target, set: { count: sql`count + 1` } })
      .run();

    await db
      .insert(chatStatusEffectUsers)
      .values({ chatId: 'c1', userId: 'u1', statusEffectId: 'weak', count: 1 })
      .onConflictDoUpdate({ target, set: { count: sql`count + 1` } })
      .run();

    const rows = (await db.select().from(chatStatusEffectUsers).run()) as {
      count: number;
    }[];
    expect(rows.length).toBe(1);
    expect(rows[0].count).toBe(2);
  });

  it('update with a sql expression', async () => {
    await db
      .insert(chatUserStats)
      .values({ chatId: 'c1', userId: 'u1', wins: 1, displayName: 'Alpha', classIndex: 1 })
      .run();

    await db
      .update(chatUserStats)
      .set({ wins: sql`wins + 10` })
      .where(eq(chatUserStats.chatId, 'c1'))
      .run();

    const rows = (await db.select().from(chatUserStats).run()) as { wins: number }[];
    expect(rows.length).toBe(1);
    expect(rows[0].wins).toBe(11);
  });

  it('delete removes the row', async () => {
    await db
      .insert(chatUserStats)
      .values({ chatId: 'c1', userId: 'u1', wins: 1, displayName: 'Alpha', classIndex: 1 })
      .run();

    await db.delete(chatUserStats).where(eq(chatUserStats.chatId, 'c1')).run();

    const rows = await db.select().from(chatUserStats).run();
    expect(rows.length).toBe(0);
  });
});
