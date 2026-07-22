import { describe, it, expect } from 'vitest';
import { withChatLock, chatLocks } from '../src/utils/mutex.js';

describe('Chat Mutex Lock', () => {
  it('executes tasks sequentially per chatId and cleans up map entries when idle', async () => {
    const executionOrder: string[] = [];

    const task1 = withChatLock('chat1', async () => {
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push('task1');
    });

    const task2 = withChatLock('chat1', async () => {
      executionOrder.push('task2');
    });

    await Promise.all([task1, task2]);

    expect(executionOrder).toEqual(['task1', 'task2']);
    expect(chatLocks.has('chat1')).toBe(false);
    expect(chatLocks.size).toBe(0);
  });

  it('executes tasks in different chats concurrently and cleans up all locks', async () => {
    const executionOrder: string[] = [];

    const taskChat1 = withChatLock('chat1', async () => {
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push('chat1');
    });

    const taskChat2 = withChatLock('chat2', async () => {
      executionOrder.push('chat2');
    });

    await Promise.all([taskChat1, taskChat2]);

    expect(executionOrder).toEqual(['chat2', 'chat1']);
    expect(chatLocks.size).toBe(0);
  });
});
