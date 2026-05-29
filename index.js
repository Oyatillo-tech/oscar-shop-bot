require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8929579134:AAFZC2OLU8APbkHgRUAIy91pEilvoS-kvT4";
const MINI_APP_URL = process.env.MINI_APP_URL || "https://your-netlify-link.netlify.app";

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Mehmon";

  const message =
    `👋 Xush kelibsiz, ${firstName}!\n\n` +
    `🛒 OSCAR do'koniga xush kelibsiz!\n\n` +
    `✅ Sifatli bo'yoq va qurilish materiallari\n` +
    `🚚 Toshkent bo'ylab yetkazib berish\n` +
    `💳 Naqt va karta orqali to'lov\n\n` +
    `Xarid qilish uchun quyidagi tugmani bosing 👇`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🛍 Do'konga kirish",
            web_app: { url: MINI_APP_URL },
          },
        ],
      ],
    },
  };

  bot.sendMessage(chatId, message, keyboard);
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text && text.startsWith("/start")) return;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🛍 Do'konga kirish",
            web_app: { url: MINI_APP_URL },
          },
        ],
      ],
    },
  };

  bot.sendMessage(chatId, "Do'konga kirish uchun quyidagi tugmani bosing 👇", keyboard);
});

console.log("✅ Oscar Shop Bot ishga tushdi!");