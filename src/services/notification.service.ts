import { api } from 'sdk';
import { pluralizeTurns, pluralizeSeconds } from '../utils/pluralize.js';
import { cleanUsername } from './user.service.js';
import { CommandStatus } from '../utils/constants.js';

export async function sendGameStartNotification(
  chatId: string,
  subscribers: string[],
  isDuel = false
): Promise<void> {
  let subText = '';
  if (!isDuel && subscribers && subscribers.length > 0) {
    const subList = subscribers.map((u) => `@${cleanUsername(u)}`);
    const verb = subList.length === 1 ? 'лови' : 'ловите';
    subText = `\n${subList.join(' ')} - ${verb} Член!`;
  }
  const text = isDuel ? 'Член - дуэль началась!' : `Член - игра началась!${subText}`;
  await api.sendMessage({
    chat_id: chatId,
    text,
  });
}

export async function sendSkipNotifications(
  chatId: string,
  skippedPlayers: Array<{ displayName: string; isExcluded: boolean; nextUserMention?: string }>,
  ignoreNextMention = false
): Promise<void> {
  for (const skipped of skippedPlayers) {
    if (skipped.isExcluded) {
      await api.sendMessage({
        chat_id: chatId,
        text: `Обнаружен натурал - ${skipped.displayName}! Выполнить Приказ 69!`,
      });
      if (skipped.nextUserMention && !ignoreNextMention) {
        await api.sendMessage({
          chat_id: chatId,
          text: `Ход переходит к ${skipped.nextUserMention}.`,
        });
      }
    } else {
      if (skipped.nextUserMention) {
        await api.sendMessage({
          chat_id: chatId,
          text: `${skipped.displayName} - ты обронил Член!\nСледующим ходит ${skipped.nextUserMention}.`,
        });
      }
    }
  }
}

export async function sendGameEndNotification(
  chatId: string,
  status: string,
  winnerName?: string | null,
  turnsCount?: number,
  newRecord?: boolean,
  isDuel = false
): Promise<void> {
  if (status === CommandStatus.SOLE_PLAYER_TIMEOUT) {
    await api.sendMessage({
      chat_id: chatId,
      text: 'Никто не осмелился сыграть с тобой в Член. Игра окончена.',
    });
  } else if (status === CommandStatus.ALL_EXCLUDED) {
    await api.sendMessage({
      chat_id: chatId,
      text: 'Все участники признаны натуралами! Вы расстроили Член. Игра окончена.',
    });
  } else if (status === CommandStatus.SINGLE_PLAYER_WIN || winnerName) {
    const turnStr = pluralizeTurns(turnsCount || 0);
    const recordMsg = newRecord ? ' (Новый рекорд! 🚀)' : '';
    const endTitle = isDuel ? 'Член - дуэль окончена!' : 'Член - игра окончена!';
    const countText = isDuel
      ? `Дуэль длилась ${turnStr}${recordMsg}`
      : `Игра длилась ${turnStr}${recordMsg}`;
    await api.sendMessage({
      chat_id: chatId,
      text: `${endTitle} Победитель - ${winnerName}\n${countText}`,
    });
  }
}

export async function sendDuelInvitation(
  chatId: string,
  initiatorName: string,
  opponentName: string
): Promise<void> {
  await api.sendMessage({
    chat_id: chatId,
    text:
      `${initiatorName} вызывает тебя на дуэль! ${opponentName}, примешь ли ты вызов?\n` +
      `(Чтобы принять - сделай ход, чтобы отказаться - напиши 'нет')`,
  });
}

export async function sendDuelDecline(chatId: string, opponentName: string): Promise<void> {
  await api.sendMessage({
    chat_id: chatId,
    text: `${opponentName} отказался скрещивать Член.`,
  });
}

export async function sendDuelInterference(
  chatId: string,
  replyToMessageId: number
): Promise<void> {
  await api.sendMessage({
    chat_id: chatId,
    text: 'Не мешай мужчинам скрещивать Член!',
    reply_to_message_id: replyToMessageId,
  });
}

export async function sendActiveGameWarning(
  chatId: string,
  replyToMessageId: number
): Promise<void> {
  await api.sendMessage({
    chat_id: chatId,
    text: 'Игра уже идет. Сразитесь в другой раз.',
    reply_to_message_id: replyToMessageId,
  });
}

export async function sendExcludedWarning(chatId: string, replyToMessageId: number): Promise<void> {
  await api.sendMessage({
    chat_id: chatId,
    text: 'Натуралам вход закрыт!',
    reply_to_message_id: replyToMessageId,
  });
}

export async function sendSessionCooldownWarning(
  chatId: string,
  replyToMessageId: number
): Promise<void> {
  await api.sendMessage({
    chat_id: chatId,
    text: 'Дай члену отдохнуть',
    reply_to_message_id: replyToMessageId,
  });
}

export async function sendOutOfTurnWarning(
  chatId: string,
  replyToMessageId: number,
  expectedUserName?: string | null,
  remainingSeconds?: number
): Promise<void> {
  let text = 'Дождись очереди.';
  if (expectedUserName && remainingSeconds !== undefined) {
    text = `Дождись очереди. Сейчас ходит ${expectedUserName} (осталось ${pluralizeSeconds(remainingSeconds)}).`;
  }
  await api.sendMessage({
    chat_id: chatId,
    text,
    reply_to_message_id: replyToMessageId,
  });
}
