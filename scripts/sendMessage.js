'use strict';

// Simple helper to send a Telegram message using BOT_TOKEN from .env
// Usage:
//   node scripts/sendMessage.js <chat_id> "Your message here"

require('dotenv').config();

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error('Missing BOT_TOKEN in environment (.env)');
    process.exit(1);
  }

  const [, , chatIdArg, ...messageParts] = process.argv;
  if (!chatIdArg) {
    console.error('Usage: node scripts/sendMessage.js <chat_id> "Your message"');
    process.exit(1);
  }

  const chatId = Number(chatIdArg);
  if (!Number.isFinite(chatId)) {
    console.error('chat_id must be a number');
    process.exit(1);
  }

  const message = messageParts.length > 0
    ? messageParts.join(' ')
    : 'Hello from programmatic test.';

  const params = new URLSearchParams({
    chat_id: String(chatId),
    text: message,
    parse_mode: 'HTML',
  });

  const url = `https://api.telegram.org/bot${token}/sendMessage?${params.toString()}`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log(text);
    if (!response.ok) process.exit(1);
  } catch (err) {
    console.error('Failed to send message:', err);
    process.exit(1);
  }
}

main();


