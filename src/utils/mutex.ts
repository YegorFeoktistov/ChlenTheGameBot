export const chatLocks = new Map<string, Promise<void>>();

/**
 * Sequential execution lock (Mutex) per chatId.
 * Guarantees that concurrent messages within the same Telegram chat are processed sequentially FIFO,
 * eliminating race conditions and SQLite lock contention. Automatically cleans up map entries when idle.
 */
export async function withChatLock<T>(chatId: string, fn: () => Promise<T>): Promise<T> {
  const previous = chatLocks.get(chatId) || Promise.resolve();

  let release: () => void;
  const taskPromise = previous.then(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );

  chatLocks.set(chatId, taskPromise);

  try {
    await previous;
    return await fn();
  } finally {
    release!();
    if (chatLocks.get(chatId) === taskPromise) {
      chatLocks.delete(chatId);
    }
  }
}
