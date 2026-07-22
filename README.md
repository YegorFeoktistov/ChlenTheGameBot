# Член: the Game - Telegram Bot

Modern, high-performance Node.js & TypeScript Telegram Bot for group chats running a fun interactive turn-based luck game.

## Game Rules
1. **Starting the Game**: Sending `/chlen` (or writing the word `член` in plain text) starts a new game session and announces: `Член - игра началась!`.
2. **Turns**: When a user submits `/chlen` or sends `член`, they roll for an outcome (a player cannot win on the 1st command starting a session):
   - **90% Probability**: The bot replies with `Член`.
   - **10% Probability**: The bot replies with `Я победил`.
3. **Ending the Game**: When a user rolls `Я победил`, the session ends with: `Член - игра окончена! Победитель - {name}`.
4. **Anti-Spam / Turn Order**:
   - Consecutive moves by the same player are prevented (`Дождись очереди`).
   - Repeat spam attempts are silently ignored.
5. **Leaderboard**: `/chlenboard` displays the scoreboard of wins in the group chat, sorted from highest to lowest.
6. **Longest Session Record**: `/longestchlen` displays the longest completed game session record (number of turns, winner name, date).
7. **Classes System**:
   - `/chlenclasses`: View available game classes (*Членокнижник*, *Членомант*, *Членодин*, *Охотник на Члены*, *Мастер тысячи Членов*).
   - `/becomechlen <1-5>`: Choose your game class.
   - `/whichchlen`: View your assigned class.
8. **Session Cooldown**: 10-second cooldown between games (`Дай члену отдохнуть`).
9. **Subscriptions**: `/chlensub` to subscribe to start notifications, `/chlenunsub` to unsubscribe.

---

## Installation & Setup

### Prerequisites
- Node.js 20+ (tested on Node.js v24.18.0)
- npm 10+
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### Installation
1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Set TELEGRAM_BOT_TOKEN in .env
   ```

3. **Build the Project**:
   ```bash
   npm run build
   ```

---

## Quality Suite & Testing

- **Run Unit Tests (Vitest)**:
  ```bash
  npm test
  ```
- **Check Test Coverage (>80% required)**:
  ```bash
  npm run test:coverage
  ```
- **TypeScript Type Check**:
  ```bash
  npm run typecheck
  ```
- **ESLint & Prettier**:
  ```bash
  npm run lint
  npm run format
  ```

---

## Running the Bot

### Local / Virtual Machine Execution
```bash
npm start
```

### Telegram Serverless Deployment
```bash
npm run deploy
npm run migrate
```
