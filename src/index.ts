import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();

const userHistory = new Map(); // To store user chat history
const suggestionsMap = new Map(); // To map suggestions to their indices
const bot = new Bot(process.env.BOT_TOKEN || "");

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
  console.log(`Received message from ${ctx.chat.id}: ${userMessage}`, userHistory.get(ctx.chat.id));
  const response = await axios.post(
    "https://networthchat.wstf.tech/chat",
    {
      chat_history: userHistory.get(ctx.chat.id) || [],
      message: userMessage,
      isCards: true,
      preferences: {},
      ownCardData: {},
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  const reply = response.data.reply;

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
  chatHistory.push({ role: "bot", content: reply || "" });
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


bot.start();
