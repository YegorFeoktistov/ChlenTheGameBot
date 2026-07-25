import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from 'sdk';
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
} from '../src/services/notification.service.js';

describe('Notification Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendGameStartNotification', () => {
    it('sends start message without subscribers', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendGameStartNotification('chat1', []);

      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Член - игра началась!',
      });
    });

    it('sends start message with subscribers and sanitizes handles', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendGameStartNotification('chat1', ['@Pasha', 'Yegor']);

      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Член - игра началась!\n@Pasha @Yegor - ловите Член!',
      });
    });

    it('uses singular verb for single subscriber', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendGameStartNotification('chat1', ['Pasha']);

      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Член - игра началась!\n@Pasha - лови Член!',
      });
    });
  });

  describe('sendSkipNotifications', () => {
    it('sends notifications for excluded player with next mention', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendSkipNotifications('chat1', [
        { displayName: 'Pasha', isExcluded: true, nextUserMention: '@Yegor' },
      ]);

      expect(spy).toHaveBeenNthCalledWith(1, {
        chat_id: 'chat1',
        text: 'Обнаружен натурал - Pasha! Выполнить Приказ 69!',
      });
      expect(spy).toHaveBeenNthCalledWith(2, {
        chat_id: 'chat1',
        text: 'Ход переходит к @Yegor.',
      });
    });

    it('sends notifications for excluded player and ignores next mention if flag set', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendSkipNotifications(
        'chat1',
        [{ displayName: 'Pasha', isExcluded: true, nextUserMention: '@Yegor' }],
        true
      );

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Обнаружен натурал - Pasha! Выполнить Приказ 69!',
      });
    });

    it('sends notification for normal skip with next mention', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendSkipNotifications('chat1', [
        { displayName: 'Pasha', isExcluded: false, nextUserMention: '@Yegor' },
      ]);

      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Pasha - ты обронил Член!\nСледующим ходит @Yegor.',
      });
    });

    it('does not send notification for normal skip without next mention', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendSkipNotifications('chat1', [{ displayName: 'Pasha', isExcluded: false }]);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('sendGameEndNotification', () => {
    it('sends end message for sole player timeout', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendGameEndNotification('chat1', 'sole_player_timeout');

      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Никто не осмелился сыграть с тобой в Член. Игра окончена.',
      });
    });

    it('sends end message for all excluded', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendGameEndNotification('chat1', 'all_excluded');

      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Все участники признаны натуралами! Вы расстроили Член. Игра окончена.',
      });
    });

    it('sends win message with regular text', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendGameEndNotification('chat1', 'success', 'Pasha', 5, false);

      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Член - игра окончена! Победитель - Pasha\nИгра длилась 5 ходов',
      });
    });

    it('sends win message with record text', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendGameEndNotification('chat1', 'success', 'Pasha', 12, true);

      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Член - игра окончена! Победитель - Pasha\nИгра длилась 12 ходов (Новый рекорд! 🚀)',
      });
    });
  });

  describe('Duel and Warning helper notifications', () => {
    it('sends duel invitation notification', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendDuelInvitation('chat1', 'Yegor', 'Pasha');
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text:
          `Yegor вызывает тебя на дуэль! Pasha, примешь ли ты вызов?\n` +
          `(Чтобы принять - сделай ход, чтобы отказаться - напиши 'нет')`,
      });
    });

    it('sends duel decline notification', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendDuelDecline('chat1', 'Pasha');
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Pasha отказался скрещивать Член.',
      });
    });

    it('sends duel interference notification', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendDuelInterference('chat1', 101);
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Не мешай мужчинам скрещивать Член!',
        reply_to_message_id: 101,
      });
    });

    it('sends active game warning', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendActiveGameWarning('chat1', 102);
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Игра уже идет. Сразитесь в другой раз.',
        reply_to_message_id: 102,
      });
    });

    it('sends excluded warning', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendExcludedWarning('chat1', 103);
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Натуралам вход закрыт!',
        reply_to_message_id: 103,
      });
    });

    it('sends session cooldown warning', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendSessionCooldownWarning('chat1', 104);
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Дай члену отдохнуть',
        reply_to_message_id: 104,
      });
    });

    it('sends out of turn warning without expected user', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendOutOfTurnWarning('chat1', 105);
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Дождись очереди.',
        reply_to_message_id: 105,
      });
    });

    it('sends out of turn warning with expected user and remaining time', async () => {
      const spy = vi.spyOn(api, 'sendMessage');
      await sendOutOfTurnWarning('chat1', 106, 'Pasha', 15);
      expect(spy).toHaveBeenCalledWith({
        chat_id: 'chat1',
        text: 'Дождись очереди. Сейчас ходит Pasha (осталось 15 секунд).',
        reply_to_message_id: 106,
      });
    });
  });
});
