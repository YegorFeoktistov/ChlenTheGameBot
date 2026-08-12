export enum StatusEffectId {
  WEAKNESS = 'Членослабость',
  BUFF = 'Членосила',
  HUNTER_BLOCK = 'Хватка охотника',
  MASTER_RISING = 'Членовосхождение',
}

export enum ChlenClass {
  CHLENOKNIZHNIK = 'Членокнижник',
  CHLENOMANT = 'Членомант',
  CHLENODIN = 'Членодин',
  OHOTNIK_NA_CHLENI = 'Охотник на Члены',
  MASTER_TISYACHI_CHLENOV = 'Мастер тысячи Членов',
}

export const CHLEN_CLASS_SKILLS: Record<ChlenClass, string> = {
  [ChlenClass.CHLENOKNIZHNIK]:
    'Членокнижник: "Я читаю древний Член!" {Ослабляет цель: шанс победы цели уменьшен в 2 раза}',
  [ChlenClass.CHLENOMANT]:
    'Членомант: "Я поднимаю упавшие Члены!" {Каждое поражение копит заряд; способность бросает член за каждый заряд вне очереди}',
  [ChlenClass.CHLENODIN]:
    'Членодин: "Я сливаюсь с Членом!" {Шанс победы следующего члена увеличен в 2 раза}',
  [ChlenClass.OHOTNIK_NA_CHLENI]:
    'Охотник на Члены: "Я беру ваши Члены в руки!" {Бросок за каждого активного игрока; после — нельзя ходить до конца игры}',
  [ChlenClass.MASTER_TISYACHI_CHLENOV]:
    'Мастер тысячи Членов: "Тысяча Членов в моей власти!" {Шанс следующего члена 0%, каждый последующий бросок +5%}',
};

export const CHLEN_CLASSES: readonly ChlenClass[] = Object.values(ChlenClass);

export enum CommandStatus {
  IGNORED = 'ignored',
  WARNING = 'warning',
  SESSION_COOLDOWN = 'session_cooldown',
  SUCCESS = 'success',
  EXCLUDED = 'excluded',
  TURN_SKIPPED = 'turn_skipped',
  ORDER_69 = 'order_69',
  ALL_EXCLUDED = 'all_excluded',
  SOLE_PLAYER_TIMEOUT = 'sole_player_timeout',
  SINGLE_PLAYER_WIN = 'single_player_win',
  DUEL_INTERFERENCE = 'duel_interference',
  BLOCKED = 'blocked',
}

export enum StrictTurnStatus {
  VALID = 'valid',
  EXCLUDED = 'excluded',
  OUT_OF_TURN_WARNING = 'out_of_turn_warning',
  TURN_SKIPPED = 'turn_skipped',
  ORDER_69 = 'order_69',
  ALL_EXCLUDED = 'all_excluded',
  SOLE_PLAYER_TIMEOUT = 'sole_player_timeout',
  SINGLE_PLAYER_WIN = 'single_player_win',
}

export const GAME_WIN_CHANCE = 0.1;
export const MASTER_CHANCE_PENALTY = 0.1;
export const MASTER_CHANCE_GAIN = 0.05;
export const SESSION_COOLDOWN_SECONDS = 10;
export const TURN_TIMEOUT_SECONDS = 30;
export const TURN_TIMEOUT_MS = 30100;
export const MAX_SKIP_COUNT = 3;

export enum GameCommand {
  START = '/start',
  BOARD = '/chlenboard',
  LONGEST = '/longestchlen',
  CLASSES = '/chlenclasses',
  BECOME_CLASS = '/becomechlen',
  WHICH_CLASS = '/whichchlen',
  SUBSCRIBE = '/chlensub',
  UNSUBSCRIBE = '/chlenunsub',
  SKILL = '/chlenskill',
  QUEUE = '/chlenqueue',
  MENTION = '/chlenmention',
  ABORT = '/abortchlen',
  DUEL = '/chlenduel',
  GAME_CHLEN_SLASH = '/chlen',
  GAME_CHLEN_RU = 'член',
  GAME_CHLEN_EN = 'chlen',
}

export enum DuelDeclineWord {
  RU = 'нет',
  EN_NO = 'no',
  EN_NET = 'net',
}

export const DUEL_DECLINE_WORDS: readonly string[] = Object.values(DuelDeclineWord);
