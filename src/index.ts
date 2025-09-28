import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import axios from "axios";
import http from "http";
import https from "https";
dotenv.config();

const userHistory = new Map(); // To store user chat history
const suggestionsMap = new Map(); // To map suggestions to their indices
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error(
    "Missing BOT_TOKEN. Set it in .env or as an environment variable."
  );
  process.exit(1);
}
const bot = new Bot(token);

// Global error handler so the bot does not crash on runtime errors
bot.catch(async (err) => {
  console.error("BotError", err);
  try {
    await err.ctx.reply(
      "Sorry, something went wrong while processing your request. Please try again."
    );
  } catch {}
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Axios client hardened for flaky networks (disable keep-alive, set timeout)
const axiosClient = axios.create({
  timeout: 15000,
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
  headers: {
    "Content-Type": "application/json",
    Connection: "close",
  },
});

async function fetchRecommendations(payload: any, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await axiosClient.post(
        "https://networthchat.wstf.tech/chat",
        payload
      );
      return response;
    } catch (error: any) {
      console.error(
        `Recommendation API call failed (attempt ${attempt}/${attempts})`,
        error?.code || error?.message
      );
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  return null;
}

// Start command
bot.command("start", async (ctx) => {
  const chatId = ctx.chat.id;
  const username = ctx.chat.username;
  userHistory.set(chatId, []); // Initialize chat history

  await ctx.reply(
    `Welcome to Networth Credit Card Advisor Bot, @${username}!\n\nI can help you find the best credit card based on your spending habits and preferences.\n\nTell me a bit about your spending habits (groceries, dining, travel, or online shopping)?`
  );
});

// Handle user messages
bot.on("message", async (ctx) => {
  const userMessage = ctx.message.text;

  // Text-only guard
  if (!userMessage || typeof userMessage !== "string") {
    await ctx.reply("Please send a text message describing your spending preferences.");
    return;
  }

  console.log(
    `Received message from ${ctx.chat.id}: ${userMessage}`,
    userHistory.get(ctx.chat.id)
  );

  // Call external API with retry + timeout
  const response = await fetchRecommendations({
    chat_history: userHistory.get(ctx.chat.id) || [],
    message: userMessage,
    isCards: true,
    preferences: {},
    ownCardData: {},
  });

  if (!response) {
    await ctx.reply(
      "I'm having trouble reaching the recommendation service right now. Please try again in a moment."
    );
    return;
  }

  const reply = response.data?.reply || {};

  // 1️⃣ Response Text
  if (reply.responseText) {
    await ctx.reply(reply.responseText);
  }
  // console.log("Reply from API:", reply);
  // 2️⃣ Cards (tabular style using Markdown)
  if (reply.cards && reply.cards.length > 0) {
  for (const card of reply.cards) {
    const details = card.details || {};

    // Format details dynamically
    let detailsMessage = "";
    for (const [key, value] of Object.entries(details)) {
      const label =
        key
          // Convert camelCase / PascalCase / snake_case → Proper Case
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^./, (s) => s.toUpperCase());

      detailsMessage += `<b>${label}:</b> ${value || "N/A"}\n`;
    }

    const cardMessage = `
<b>${card.cardName}</b>
Issuer: ${card.issuer}
Network: ${card.network} (${card.networkTier})

${detailsMessage}
    `;

    await ctx.reply(cardMessage.trim(), { parse_mode: "HTML" });
  }
}


  // 3️⃣ Suggestions (Inline Keyboard)
  // if (reply.suggestions && reply.suggestions.length > 0) {
  //   const keyboard = new InlineKeyboard();
  //   reply.suggestions.forEach((s: string, index: number) => {
  //     // Store only index in callback_data
  //     keyboard.text(s, `sugg_${index}`).row();
  //   });

  //   // Save suggestions in chat history so we can retrieve by index later
  //   const chatData = userHistory.get(ctx.chat.id) || [];
  //   chatData.suggestions = reply.suggestions;
  //   userHistory.set(ctx.chat.id, chatData);

  //   await ctx.reply("Would you like to know more?", {
  //     reply_markup: keyboard,
  //   });
  // }

  // Update chat history (keep last 2 messages only for conversation)
  const chatHistory = userHistory.get(ctx.chat.id) || [];
  chatHistory.push({ role: "user", content: userMessage });
  const botContent = typeof reply?.responseText === "string" ? reply.responseText : "";
  chatHistory.push({ role: "bot", content: botContent });
  userHistory.set(ctx.chat.id, chatHistory.slice(-2));
});

// Handle suggestion button clicks
// bot.on("callback_query:data", async (ctx) => {
//   console.log("Callback Query Data:", ctx.callbackQuery.data);
//   const data = ctx.callbackQuery.data;

//   // Safely get chatId
//   const chatId = ctx.chat?.id || ctx.callbackQuery.message?.chat.id;
//   console.log("Callback Query Chat ID:", chatId);
//   if (!chatId) {
//     await ctx.answerCallbackQuery({ text: "Chat not found.", show_alert: true });
//     return;
//   }

//   if (data.startsWith("sugg_")) {
//     const index = parseInt(data.replace("sugg_", ""), 10);
//     const chatData: any = userHistory.get(chatId) || {};
//     const suggestionText =
//       chatData.suggestions && chatData.suggestions[index]
//         ? chatData.suggestions[index]
//         : "Sorry, I lost that option.";
//     console.log(`User selected suggestion: ${suggestionText}`);
//     // 🔄 Re-run flow as if user typed the suggestion
//     ctx.update.message = { text: suggestionText, chat: { id: chatId } } as any;
//     await bot.handleUpdate(ctx.update);
//   }
// });


// Simple health check command to test the external API quickly
bot.command("health", async (ctx) => {
  const res = await fetchRecommendations({
    chat_history: [],
    message: "ping",
    isCards: false,
    preferences: {},
    ownCardData: {},
  }, 1);
  if (res) {
    await ctx.reply("OK: recommendation API reachable.");
  } else {
    await ctx.reply("DOWN: recommendation API not responding.");
  }
});

// Drop any pending updates on restart to reduce conflicts after nodemon restarts
bot.start({ drop_pending_updates: true }).catch((e) => {
  console.error("Failed to start bot", e);
});
