import { api, db } from 'sdk';
import {
  formatDisplayName,
  ensureUserAndChat,
  subscribeUser,
  unsubscribeUser,
  getSubscribers,
  getUserByUsername,
} from '../services/user.service.js';
import {
  handleGameCommand,
  abortGameSession,
  initiateDuelSession,
  terminateGameSession,
} from '../services/game.service.js';
import { getLeaderboardText, getLongestSessionText } from '../services/stats.service.js';
import { getClassesText, setUserClass, getUserClass } from '../services/class.service.js';
import {
  getUserSkillText,
  recordSkillUsed,
  applyWeaknessToTarget,
} from '../services/skills.service.js';
import { getQueueMode, setQueueMode } from '../services/queue.service.js';
import {
  sendGameStartNotification,
  sendSkipNotifications,
  sendGameEndNotification,
  sendDuelInvitation,
  sendDuelDecline,
  sendDuelInterference,
  sendActiveGameWarning,
  sendExcludedWarning,
  sendSessionCooldownWarning,
  sendOutOfTurnWarning,
} from '../services/notification.service.js';
import { chatGameSessions, chatWarnedUsers } from '../schema.js';
import { eq, and } from 'sdk/db';
import {
  CommandStatus,
  ChlenClass,
  GameCommand,
  DUEL_DECLINE_WORDS,
  SESSION_COOLDOWN_SECONDS,
} from '../utils/constants.js';
import { withChatLock } from '../utils/mutex.js';
import type { TelegramMessage } from '../types/sdk.d.js';
import type { GameSessionRecord, WarnedUserRecord } from '../types/models.js';

export default async function (message: TelegramMessage) {
  if (!message || !message.chat || !message.from || !message.text) {
    return;
  }

  const chatId = String(message.chat.id);
  const chatTitle = message.chat.title || message.chat.first_name || 'Chat';
  const userId = String(message.from.id);
  const firstName = message.from.first_name || 'Игрок';
  const lastName = message.from.last_name || null;
  const username = message.from.username || null;
  const rawText = message.text.trim();
  const lowerText = rawText.toLowerCase();

  const userDisplayName = formatDisplayName(firstName, lastName);

  // Ensure user and chat exist in database
  await ensureUserAndChat(chatId, chatTitle, userId, firstName, lastName, username);

  // Retrieve current session to check for duel state
  const sessionRows = (await db
    .select()
    .from(chatGameSessions)
    .where(eq(chatGameSessions.chatId, chatId))
    .run()) as GameSessionRecord[];
  const session = sessionRows && sessionRows.length > 0 ? sessionRows[0] : null;

  // Handle duel decline/refusal words from opponent
  if (session && session.isActive === 1 && session.isDuel === 1 && session.duelIsAccepted === 0) {
    if (userId === session.duelOpponentId) {
      const cleanText = lowerText.replace(/\s+/g, '');
      if (DUEL_DECLINE_WORDS.includes(cleanText)) {
        const opponentDisplayName = formatDisplayName(firstName, lastName);
        await withChatLock(chatId, async () => {
          await terminateGameSession(chatId);
        });
        await sendDuelDecline(chatId, opponentDisplayName);
        return;
      }
    }
  }

  // 1. Command /start
  if (lowerText.startsWith(GameCommand.START)) {
    await api.sendMessage({
      chat_id: chatId,
      text:
        `Член - игра началась!\n\n` +
        `Отправь команду ${GameCommand.GAME_CHLEN_SLASH} (или напиши "${GameCommand.GAME_CHLEN_RU}" / "${GameCommand.GAME_CHLEN_EN}") в групповом чате, чтобы испытать удачу. ` +
        'Каждый ход дает тебе 10% шанс выиграть. Но помни: ты не можешь ходить дважды подряд!\n\n' +
        'Доступные команды:\n' +
        `${GameCommand.BOARD} - посмотреть таблицу лидеров\n` +
        `${GameCommand.LONGEST} - посмотреть статистику самой долгой игры\n` +
        `${GameCommand.CLASSES} - посмотреть классы в игре\n` +
        `${GameCommand.BECOME_CLASS} - выбрать класс\n` +
        `${GameCommand.WHICH_CLASS} - посмотреть свой класс\n` +
        `${GameCommand.SKILL} - использовать способность класса\n` +
        `${GameCommand.QUEUE} - переключить режим очередности (строгий/нестрогий)\n` +
        `${GameCommand.SUBSCRIBE} - подписаться на уведомления о старте\n` +
        `${GameCommand.UNSUBSCRIBE} - отписаться от уведомлений о старте\n` +
        `${GameCommand.DUEL} @username - бросить вызов на дуэль (игра для 2 игроков по нестрогой очереди)`,
    });
    return;
  }

  // 2. Command /chlenboard
  if (lowerText.startsWith(GameCommand.BOARD)) {
    const text = await getLeaderboardText(chatId);
    await api.sendMessage({ chat_id: chatId, text });
    return;
  }

  // 3. Command /longestchlen
  if (lowerText.startsWith(GameCommand.LONGEST)) {
    const text = await getLongestSessionText(chatId);
    await api.sendMessage({ chat_id: chatId, text });
    return;
  }

  // 4. Command /chlenclasses
  if (lowerText.startsWith(GameCommand.CLASSES)) {
    const text = getClassesText();
    await api.sendMessage({ chat_id: chatId, text });
    return;
  }

  // 5. Command /becomechlen
  if (lowerText.startsWith(GameCommand.BECOME_CLASS)) {
    const parts = rawText.split(/\s+/);
    if (parts.length < 2) {
      await api.sendMessage({
        chat_id: chatId,
        text: `Укажите индекс класса: ${GameCommand.BECOME_CLASS} 1`,
      });
      return;
    }
    const idx = parseInt(parts[1], 10);
    if (isNaN(idx)) {
      await api.sendMessage({ chat_id: chatId, text: 'Индекс должен быть числом.' });
      return;
    }
    const assignedClass = await setUserClass(chatId, userId, userDisplayName, idx);
    if (!assignedClass) {
      await api.sendMessage({ chat_id: chatId, text: 'Неверный индекс. Доступные классы: 1-5' });
    } else {
      await api.sendMessage({ chat_id: chatId, text: `${userDisplayName} стал ${assignedClass}!` });
    }
    return;
  }

  // 6. Command /whichchlen
  if (lowerText.startsWith(GameCommand.WHICH_CLASS)) {
    const cls = await getUserClass(chatId, userId);
    if (cls) {
      await api.sendMessage({ chat_id: chatId, text: `${userDisplayName} — ${cls}!` });
    } else {
      await api.sendMessage({ chat_id: chatId, text: `${userDisplayName} ещё не выбрал класс.` });
    }
    return;
  }

  // 7. Command /chlensub
  if (lowerText.startsWith(GameCommand.SUBSCRIBE)) {
    if (!username) {
      await api.sendMessage({
        chat_id: chatId,
        text: 'Для подписки на уведомления необходимо установить никнейм (username) в настройках Телеграма.',
      });
      return;
    }
    await subscribeUser(chatId, userId, username);
    await api.sendMessage({
      chat_id: chatId,
      text: `${userDisplayName} подписался на Член. Уважаемый мужчина!`,
    });
    return;
  }

  // 8. Command /chlenunsub
  if (lowerText.startsWith(GameCommand.UNSUBSCRIBE)) {
    await unsubscribeUser(chatId, userId);
    await api.sendMessage({
      chat_id: chatId,
      text: `${userDisplayName} отписался от Члена. Ты что натурал?`,
    });
    return;
  }

  // 9. Command /chlenskill
  if (lowerText.startsWith(GameCommand.SKILL)) {
    await withChatLock(chatId, async () => {
      const sessionRows = (await db
        .select()
        .from(chatGameSessions)
        .where(eq(chatGameSessions.chatId, chatId))
        .run()) as GameSessionRecord[];
      const session = sessionRows && sessionRows.length > 0 ? sessionRows[0] : null;

      // Gate 1: active game session required
      if (!session || session.isActive !== 1) {
        if (
          session &&
          session.sessionEndedAt != null &&
          Math.floor(Date.now() / 1000) - session.sessionEndedAt < SESSION_COOLDOWN_SECONDS
        ) {
          await api.sendMessage({
            chat_id: chatId,
            text: 'Игра только что закончилась. Дай члену отдохнуть.',
            reply_to_message_id: message.message_id,
          });
          return;
        }
        await api.sendMessage({
          chat_id: chatId,
          text: 'Нет активной игры. Начни игру командой /chlen.',
          reply_to_message_id: message.message_id,
        });
        return;
      }

      // Gate 2: pending duel blocks the skill
      if (session.isActive === 1 && session.isDuel === 1 && session.duelIsAccepted === 0) {
        await api.sendMessage({
          chat_id: chatId,
          text: 'Нельзя использовать способность, пока дуэль не принята.',
          reply_to_message_id: message.message_id,
        });
        return;
      }

      // Class check
      const skillResult = await getUserSkillText(chatId, userId);
      if (!skillResult) {
        await api.sendMessage({
          chat_id: chatId,
          text: `${userDisplayName} ещё не выбрал класс. Используй ${GameCommand.BECOME_CLASS}, чтобы выбрать класс.`,
          reply_to_message_id: message.message_id,
        });
        return;
      }

      // Cooldown check
      if (skillResult.alreadyUsed) {
        await api.sendMessage({
          chat_id: chatId,
          text: `${userDisplayName} уже использовал свою способность в этой игре!`,
          reply_to_message_id: message.message_id,
        });
        return;
      }

      // Determine class before recording skill usage
      const skillClass = await getUserClass(chatId, userId);

      if (skillClass === ChlenClass.CHLENOKNIZHNIK) {
        const targetText = rawText.split(/\s+/).slice(1).join(' ').trim();
        const targetResult = await applyWeaknessToTarget(chatId, userId, targetText);
        if (!targetResult.success) {
          await api.sendMessage({
            chat_id: chatId,
            text: targetResult.message,
            reply_to_message_id: message.message_id,
          });
          return;
        }
        await recordSkillUsed(chatId, userId);
        await api.sendMessage({
          chat_id: chatId,
          text: targetResult.message,
          reply_to_message_id: message.message_id,
        });
        return;
      }

      await recordSkillUsed(chatId, userId);
      await api.sendMessage({
        chat_id: chatId,
        text: `${userDisplayName} использует способность: ${skillResult.skillText}`,
        reply_to_message_id: message.message_id,
      });
      return;
    });
    return;
  }

  // 10. Command /chlenqueue
  if (lowerText.startsWith(GameCommand.QUEUE)) {
    await withChatLock(chatId, async () => {
      const parts = rawText.split(/\s+/);
      const hasParam = parts.length > 1;

      // Check if session is active
      const sessionRows = (await db
        .select()
        .from(chatGameSessions)
        .where(eq(chatGameSessions.chatId, chatId))
        .run()) as { isActive?: number }[];

      const isSessionActive =
        sessionRows && sessionRows.length > 0 && sessionRows[0].isActive === 1;

      if (hasParam) {
        const modeParam = parseInt(parts[1], 10);
        if (isSessionActive && (modeParam === 0 || modeParam === 1)) {
          await api.sendMessage({
            chat_id: chatId,
            text: 'Не мешай Члену работать!',
          });
          return;
        }

        if (modeParam === 1) {
          await setQueueMode(chatId, 1);
          await api.sendMessage({ chat_id: chatId, text: 'Включен строгий Член' });
        } else if (modeParam === 0) {
          await setQueueMode(chatId, 0);
          await api.sendMessage({ chat_id: chatId, text: 'Включен нестрогий Член' });
        } else {
          await api.sendMessage({
            chat_id: chatId,
            text: `Укажите режим: ${GameCommand.QUEUE} 1 (строгий) или ${GameCommand.QUEUE} 0 (нестрогий)`,
          });
        }
      } else {
        const currentMode = await getQueueMode(chatId);
        const modeText = currentMode === 1 ? 'Строгий Член' : 'Нестрогий Член';
        await api.sendMessage({ chat_id: chatId, text: modeText });
      }
    });
    return;
  }

  // 11. Command /abortchlen
  if (lowerText.startsWith(GameCommand.ABORT)) {
    await withChatLock(chatId, async () => {
      const { wasActive } = await abortGameSession(chatId);
      if (wasActive) {
        await api.sendMessage({ chat_id: chatId, text: 'Вы оборвали Член. Игра окончена.' });
      } else {
        await api.sendMessage({ chat_id: chatId, text: 'Нет активного Члена.' });
      }
    });
    return;
  }

  // 12. Command /chlen OR plain text "член" / "chlen" / /chlenduel
  const parts = rawText.split(/\s+/);
  const firstPart = parts[0].toLowerCase().split('@')[0];
  const lastPart = parts[parts.length - 1];

  const isChlenOrDuelCommand =
    firstPart === GameCommand.GAME_CHLEN_SLASH ||
    firstPart === GameCommand.GAME_CHLEN_RU ||
    firstPart === GameCommand.GAME_CHLEN_EN ||
    firstPart === GameCommand.DUEL;

  const isChlenInside =
    !rawText.startsWith('/') &&
    [GameCommand.GAME_CHLEN_RU, GameCommand.GAME_CHLEN_EN].some((chlen) =>
      lowerText.includes(chlen)
    );

  const isDuelInitiationCmd = firstPart === GameCommand.DUEL;
  const hasOpponentTagAtEnd = parts.length > 1 && lastPart.startsWith('@');
  const hasChlenKeyword = isChlenOrDuelCommand || isChlenInside;

  const isDuelAttempt = isDuelInitiationCmd || (hasChlenKeyword && hasOpponentTagAtEnd);
  const canStartGameFromMention = isChlenInside && !(session && session.isActive === 1);

  if (isChlenOrDuelCommand || isDuelAttempt || canStartGameFromMention) {
    if (isDuelAttempt) {
      const hasOpponentParam = parts.length > 1 && lastPart.trim().length > 0;
      if (!hasOpponentParam) {
        await api.sendMessage({
          chat_id: chatId,
          text: `Укажите юзернейм оппонента: ${GameCommand.DUEL} @username`,
          reply_to_message_id: message.message_id,
        });
        return;
      }

      const opponentUsernameClean = lastPart.replace(/^@+/, '');

      // Check if session is already active (either normal game or duel)
      if (session && session.isActive === 1) {
        // Interference / Active game warning (exactly once per user per session)
        await withChatLock(chatId, async () => {
          const warnedRows = (await db
            .select()
            .from(chatWarnedUsers)
            .where(and(eq(chatWarnedUsers.chatId, chatId), eq(chatWarnedUsers.userId, userId)))
            .run()) as WarnedUserRecord[];
          const isWarned = warnedRows && warnedRows.length > 0;
          if (!isWarned || process.env.REPL_MODE === 'true') {
            await db
              .insert(chatWarnedUsers)
              .values({ chatId, userId })
              .onConflictDoUpdate({
                target: [chatWarnedUsers.chatId, chatWarnedUsers.userId],
                set: { chatId, userId },
              })
              .run();
            await sendActiveGameWarning(chatId, message.message_id);
          }
        });
        return;
      }

      // Find the opponent
      const opponent = await getUserByUsername(opponentUsernameClean);
      if (!opponent) {
        await api.sendMessage({
          chat_id: chatId,
          text: `Пользователь @${opponentUsernameClean} не найден. Ему нужно написать любое сообщение боту в этом чате, чтобы зарегистрироваться.`,
          reply_to_message_id: message.message_id,
        });
        return;
      }

      if (opponent.id === userId) {
        await api.sendMessage({
          chat_id: chatId,
          text: 'Вы не можете вызвать на дуэль самого себя.',
          reply_to_message_id: message.message_id,
        });
        return;
      }

      const opponentDisplayName = formatDisplayName(opponent.firstName, opponent.lastName);

      await withChatLock(chatId, async () => {
        await initiateDuelSession(chatId, userId, opponent.id);
      });

      await sendDuelInvitation(chatId, userDisplayName, opponentDisplayName);
      return;
    }

    const res = await withChatLock(chatId, () =>
      handleGameCommand(chatId, userId, userDisplayName)
    );

    // Notify the chat about any skipped/excluded players
    if (res.skippedPlayers && res.skippedPlayers.length > 0) {
      await sendSkipNotifications(
        chatId,
        res.skippedPlayers,
        res.status === CommandStatus.ALL_EXCLUDED || res.status === CommandStatus.SINGLE_PLAYER_WIN
      );
    }

    if (res.status === CommandStatus.EXCLUDED) {
      await sendExcludedWarning(chatId, message.message_id);
      return;
    }

    if (res.status === CommandStatus.SOLE_PLAYER_TIMEOUT) {
      await sendGameEndNotification(chatId, res.status);
      return;
    }

    if (res.status === CommandStatus.SINGLE_PLAYER_WIN) {
      await sendGameEndNotification(
        chatId,
        res.status,
        res.winnerName,
        res.turns,
        res.newRecord,
        res.isDuel
      );
      return;
    }

    if (res.status === CommandStatus.ALL_EXCLUDED) {
      await sendGameEndNotification(chatId, res.status);
      return;
    }

    if (res.status === CommandStatus.IGNORED) {
      return;
    }

    if (res.status === CommandStatus.DUEL_INTERFERENCE) {
      await sendDuelInterference(chatId, message.message_id);
      return;
    }

    if (res.status === CommandStatus.WARNING) {
      await sendOutOfTurnWarning(
        chatId,
        message.message_id,
        res.expectedUserName,
        res.remainingSeconds
      );
      return;
    }

    if (res.status === CommandStatus.SESSION_COOLDOWN) {
      await sendSessionCooldownWarning(chatId, message.message_id);
      return;
    }

    if (res.status === CommandStatus.SUCCESS) {
      if (res.gameStarted) {
        const subs = await getSubscribers(chatId);
        await sendGameStartNotification(chatId, subs, res.isDuel);
      }

      const isCommand = rawText.startsWith('/');
      if (res.outcome === 'Я победил' || isCommand) {
        await api.sendMessage({
          chat_id: chatId,
          text: res.outcome || 'Член',
          reply_to_message_id: message.message_id,
        });
      }

      if (res.gameEnded) {
        await sendGameEndNotification(
          chatId,
          CommandStatus.SINGLE_PLAYER_WIN,
          res.winnerName,
          res.turns,
          res.newRecord,
          res.isDuel
        );
      }
    }
  }
}
