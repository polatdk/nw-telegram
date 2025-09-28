import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import axios from "axios";
import http from "http";
import https from "https";
dotenv.config();

// Minimal Node interop without @types/node
declare const require: any;
const fs: any = require("fs");
const path: any = require("path");

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

// ------------------------------
// Lightweight JSON persistence
// ------------------------------
type FavoriteCard = any;
type FeedbackEntry = { likes: number; dislikes: number };
type PersistedState = {
  favorites: Record<string, FavoriteCard[]>;
  feedback: Record<string, Record<string, FeedbackEntry>>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error("Failed to ensure data directory", e);
  }
}

function loadState(): PersistedState {
  ensureDataDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      return {
        favorites: parsed.favorites || {},
        feedback: parsed.feedback || {},
      } as PersistedState;
    }
  } catch (e) {
    console.error("Failed to load state file", e);
  }
  return { favorites: {}, feedback: {} };
}

function saveState(state: PersistedState) {
  try {
    ensureDataDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save state file", e);
  }
}

const botState: PersistedState = loadState();
const lastCardsByChat = new Map<number, any[]>();

function toCardSlug(card: any): string {
  const issuer = (card?.issuer || "").toString();
  const name = (card?.cardName || "").toString();
  return `${issuer}|${name}`;
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
  // 2️⃣ Cards (tabular style using Markdown) + inline actions
  if (reply.cards && reply.cards.length > 0) {
  const collectedCards: any[] = [];
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

    const thisIndex = collectedCards.length;
    collectedCards.push(card);
    const keyboard = new InlineKeyboard()
      .text("⭐ Save", `fav_save_${thisIndex}`)
      .text("👍", `fb_like_${thisIndex}`)
      .text("👎", `fb_dislike_${thisIndex}`);

    await ctx.reply(cardMessage.trim(), { parse_mode: "HTML", reply_markup: keyboard });
  }
  lastCardsByChat.set(ctx.chat.id, collectedCards);
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

// Handle inline button clicks (favorites and feedback)
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatIdSafe = ctx.chat?.id || ctx.callbackQuery.message?.chat.id;
  if (!chatIdSafe) {
    await ctx.answerCallbackQuery({ text: "Chat not found.", show_alert: true });
    return;
  }
  const chatIdStr = String(chatIdSafe);
  const lastCards = lastCardsByChat.get(Number(chatIdSafe)) || [];
  const parseIndex = (prefix: string) => parseInt(data.replace(prefix, ""), 10);

  try {
    if (data.startsWith("fav_save_")) {
      const idx = parseIndex("fav_save_");
      const card = lastCards[idx];
      if (!card) {
        await ctx.answerCallbackQuery({ text: "Card not found.", show_alert: true });
        return;
      }
      const list = botState.favorites[chatIdStr] || [];
      const slug = toCardSlug(card);
      const exists = list.some((c: any) => toCardSlug(c) === slug);
      if (!exists) {
        list.push(card);
        botState.favorites[chatIdStr] = list;
        saveState(botState);
      }
      await ctx.answerCallbackQuery({ text: exists ? "Already in favorites" : "Saved to favorites" });
      return;
    }

    if (data.startsWith("fb_like_") || data.startsWith("fb_dislike_")) {
      const idx = data.startsWith("fb_like_") ? parseIndex("fb_like_") : parseIndex("fb_dislike_");
      const card = lastCards[idx];
      if (!card) {
        await ctx.answerCallbackQuery({ text: "Card not found.", show_alert: true });
        return;
      }
      const slug = toCardSlug(card);
      botState.feedback[chatIdStr] = botState.feedback[chatIdStr] || {};
      const entry = botState.feedback[chatIdStr][slug] || { likes: 0, dislikes: 0 };
      if (data.startsWith("fb_like_")) entry.likes += 1; else entry.dislikes += 1;
      botState.feedback[chatIdStr][slug] = entry;
      saveState(botState);
      await ctx.answerCallbackQuery({ text: "Thanks for the feedback!" });
      return;
    }

    if (data.startsWith("fav_remove_")) {
      const idx = parseIndex("fav_remove_");
      const list = botState.favorites[chatIdStr] || [];
      if (idx >= 0 && idx < list.length) {
        list.splice(idx, 1);
        botState.favorites[chatIdStr] = list;
        saveState(botState);

        if (ctx.callbackQuery.message) {
          if (list.length === 0) {
            await ctx.editMessageText("You have no saved favorites.");
          } else {
            const newText = `<b>Your saved cards:</b>\n\n` + list
              .map((c: any, i: number) => `${i + 1}. ${c.cardName} — ${c.issuer} (${c.network})`)
              .join("\n");
            const kb = new InlineKeyboard();
            list.forEach((_: any, i: number) => kb.text(`🗑 Remove ${i + 1}`, `fav_remove_${i}`).row());
            await ctx.editMessageText(newText, { parse_mode: "HTML", reply_markup: kb });
          }
        }
        await ctx.answerCallbackQuery({ text: "Removed" });
      } else {
        await ctx.answerCallbackQuery({ text: "Not found" });
      }
      return;
    }
  } catch (e) {
    console.error("Callback handler error", e);
    try { await ctx.answerCallbackQuery({ text: "Something went wrong", show_alert: true }); } catch {}
  }
});

// List favorites
bot.command("favorites", async (ctx) => {
  const chatIdStr = String(ctx.chat.id);
  const list = botState.favorites[chatIdStr] || [];
  if (list.length === 0) {
    await ctx.reply("You have no saved favorites yet. Tap ⭐ Save on a card to add it.");
    return;
  }
  const text = `<b>Your saved cards:</b>\n\n` + list
    .map((c: any, i: number) => `${i + 1}. ${c.cardName} — ${c.issuer} (${c.network})`)
    .join("\n");
  const kb = new InlineKeyboard();
  list.forEach((_: any, i: number) => kb.text(`🗑 Remove ${i + 1}`, `fav_remove_${i}`).row());
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
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
