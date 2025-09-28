## Networth Credit Card Advisor – Telegram Bot

A Telegram bot built with `grammy` that helps users discover suitable credit cards based on their preferences. It calls an external recommendations API and returns results in rich, readable messages.

### Features
- **/start**: Greets the user and kicks off the flow
- **/favorites**: List and manage saved cards (⭐ via inline buttons)
- **Feedback**: Inline 👍/👎 on each card; signals persisted locally
- **/health**: Simple reachability check for the recommendations API
- Robust API calling with retries and timeouts
- Helper script to send ad‑hoc messages via Bot API

### Prerequisites
- Node.js 18+ (recommended)
- A Telegram Bot token from `@BotFather`

### Setup
1) Install dependencies

```bash
npm install
```

2) Create a `.env` file with your bot token

```bash
BOT_TOKEN=123456789:YOUR_TELEGRAM_BOT_TOKEN
```

### Run the bot
- Development (hot reload):

```bash
npm run dev
```

- Start directly:

```bash
npm start
```

The bot registers handlers and starts polling with `drop_pending_updates: true`.

### Commands
- `/start` – Welcomes the user and asks about spending preferences
- `/favorites` – Shows saved cards with remove buttons
- `/health` – Pings the recommendation service and replies with status

### Send a message via script
There is a small helper for quickly sending a message using the Bot API.

```bash
node scripts/sendMessage.js <chat_id> "Your message here"
```

Notes:
- Requires `BOT_TOKEN` in `.env`
- `chat_id` must be numeric (a user or group chat ID)

### Project structure
```
src/            # Bot implementation (TypeScript)
scripts/        # Utilities (e.g., sendMessage.js)
data/           # Local JSON persistence (state.json) for favorites/feedback
```

### Environment variables
- `BOT_TOKEN` – Telegram bot token

### Data persistence
- Favorites and feedback are stored in `data/state.json`. This is a lightweight, file‑based store that survives restarts. Delete the file to reset all saved state.

### Troubleshooting
- Missing token: ensure `BOT_TOKEN` is present in `.env`
- Network issues: the client retries transient failures; try `/health` to check reachability

### License
ISC


