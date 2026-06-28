// oscar-shop-bot/index.js
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const admin = require("firebase-admin");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8929579134:AAFZC2OLU8APbkHgRUAIy91pEilvoS-kvT4";
const MINI_APP_URL = process.env.MINI_APP_URL || "https://oscar1-wheat.vercel.app/";

// Firebase sozlash
let db;
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  console.log("FIREBASE_SERVICE_ACCOUNT_JSON mavjudmi:", !!serviceAccountJson);
  console.log("JSON uzunligi:", serviceAccountJson?.length);
  if (!serviceAccountJson) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON topilmadi.");
  const serviceAccount = JSON.parse(serviceAccountJson);
  console.log("Project ID:", serviceAccount.project_id);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  console.log("✅ Firebase ulandi.");
} catch (error) {
  console.error("❌ Firebase xato:", error.message);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// WebApp URL ni startapp bilan qaytarish
function getWebAppUrl(chatId) {
  return `${MINI_APP_URL}?startapp=${chatId}`;
}

// /start — chatId saqlash + telefon so'rash
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Mehmon";

  let existingPhone = null;

  if (db) {
    try {
      const userDoc = await db.collection("telegram_users").doc(String(chatId)).get();
      if (userDoc.exists) {
        existingPhone = userDoc.data().phone || null;
      }
      await db.collection("telegram_users").doc(String(chatId)).set({
        chatId: chatId,
        firstName,
        lastName: msg.from.last_name || "",
        username: msg.from.username || "",
        startedAt: admin.firestore.Timestamp.now(),
      }, { merge: true });
      console.log(`✅ User saqlandi: ${chatId} - ${firstName}`);
    } catch (error) {
      console.error("User saqlashda xato:", error.message);
    }
  }

  const webAppUrl = getWebAppUrl(chatId);

  // Telefon allaqachon saqlangan bo'lsa — do'konni ko'rsatish
  if (existingPhone) {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [[
          { text: "🛍 Do'konga kirish", web_app: { url: webAppUrl } },
        ]],
      },
    };
    bot.sendMessage(chatId,
      `👋 Xush kelibsiz, ${firstName}!\n\n` +
      `🛒 OSCAR do'koniga xush kelibsiz!\n\n` +
      `✅ Sifatli bo'yoq va qurilish materiallari\n` +
      `🚚 Toshkent bo'ylab yetkazib berish\n` +
      `💳 Naqt va karta orqali to'lov\n\n` +
      `Xarid qilish uchun quyidagi tugmani bosing 👇`,
      keyboard
    );
    return;
  }

  // Yangi foydalanuvchi — telefon so'rash
  const message =
    `👋 Xush kelibsiz, ${firstName}!\n\n` +
    `🛒 OSCAR do'koniga xush kelibsiz!\n\n` +
    `✅ Sifatli bo'yoq va qurilish materiallari\n` +
    `🚚 Toshkent bo'ylab yetkazib berish\n` +
    `💳 Naqt va karta orqali to'lov\n\n` +
    `📱 Buyurtma holati haqida xabar olish uchun telefon raqamingizni ulashing:`;

  const keyboard = {
    reply_markup: {
      keyboard: [[
        { text: "📱 Telefon raqamni ulashish", request_contact: true }
      ]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };

  bot.sendMessage(chatId, message, keyboard);
});

// Telefon raqamni qabul qilish
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const phone = msg.contact.phone_number;
  const normalizedPhone = phone.startsWith("+") ? phone : "+" + phone;

  if (db) {
    try {
      await db.collection("telegram_users").doc(String(chatId)).update({
        phone: normalizedPhone,
      });
      console.log(`✅ Telefon saqlandi: ${chatId} - ${normalizedPhone}`);
    } catch (error) {
      console.error("Telefon saqlashda xato:", error.message);
    }
  }

  const webAppUrl = getWebAppUrl(chatId);
  const keyboard = {
    reply_markup: {
      inline_keyboard: [[
        { text: "🛍 Do'konga kirish", web_app: { url: webAppUrl } },
      ]],
    },
  };

  bot.sendMessage(chatId,
    `✅ Rahmat! Telefon raqamingiz saqlandi.\n\nEndi buyurtma berganda sizga xabar yuboramiz! 🔔\n\nXarid qilish uchun quyidagi tugmani bosing 👇`,
    keyboard
  );
});

// Boshqa xabarlar
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (text && text.startsWith("/start")) return;
  if (msg.contact) return;

  const webAppUrl = getWebAppUrl(chatId);
  const keyboard = {
    reply_markup: {
      inline_keyboard: [[
        { text: "🛍 Do'konga kirish", web_app: { url: webAppUrl } },
      ]],
    },
  };

  bot.sendMessage(chatId, "Do'konga kirish uchun quyidagi tugmani bosing 👇", keyboard);
});

// Orders listener — status o'zgarganda mijozga xabar yuborish
if (db) {
  console.log("🔔 Orders listener faol...");

  db.collection("orders").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "modified") {
        const orderData = change.doc.data();
        const orderId = change.doc.id;
        const status = orderData.status;

        if (!["confirmed", "cancelled", "on_the_way", "delivered"].includes(status)) return;

        // 1. Buyurtmadagi telegramChatId ni tekshir
        let chatId = orderData.telegramChatId || null;

        // 2. Agar yo'q bo'lsa — telefon raqami bo'yicha qidirish
        if (!chatId) {
          try {
            const customerPhone = orderData.customerPhone?.replace(/\s/g, "");
            const usersSnap = await db.collection("telegram_users").get();
            usersSnap.docs.forEach((doc) => {
              const userData = doc.data();
              const userPhone = userData.phone?.replace(/\s/g, "");
              if (userPhone && customerPhone && userPhone === customerPhone) {
                chatId = userData.chatId;
              }
            });
          } catch (e) {
            console.error("Users qidirishda xato:", e.message);
          }
        }

        if (!chatId) {
          console.log(`⚠️ ChatId topilmadi: ${orderId}`);
          return;
        }

        let message = "";
        if (status === "confirmed") {
          message =
            `✅ Buyurtmangiz tasdiqlandi!\n\n` +
            `🆔 Buyurtma: ${orderId.substring(0, 8)}...\n` +
            `💰 Summa: ${(orderData.totalUZS || 0).toLocaleString("uz-UZ")} so'm\n\n` +
            `Tez orada siz bilan bog'lanamiz! 🙏`;
        } else if (status === "cancelled") {
          message =
            `❌ Buyurtmangiz bekor qilindi.\n\n` +
            `🆔 Buyurtma: ${orderId.substring(0, 8)}...\n\n` +
            `Savollar bo'lsa, biz bilan bog'laning.`;
        } else if (status === "on_the_way") {
          message =
            `🚚 Buyurtmangiz yo'lga chiqdi!\n\n` +
            `🆔 Buyurtma: ${orderId.substring(0, 8)}...\n\n` +
            `Kuryer tez orada yetib keladi! 📦`;
        } else if (status === "delivered") {
          message =
            `🎉 Buyurtmangiz yetib keldi!\n\n` +
            `🆔 Buyurtma: ${orderId.substring(0, 8)}...\n\n` +
            `Xaridingiz uchun rahmat! ❤️\n` +
            `Yana kelishingizni kutamiz 🛒`;
        }

        if (message) {
          try {
            await bot.sendMessage(chatId, message);
            console.log(`✅ Notification yuborildi: ${chatId} - ${status}`);
          } catch (e) {
            console.error(`❌ Notification xatosi: ${e.message}`);
          }

          // Firestore notifications ga yozish
          try {
            const notifData = {
              title: status === "confirmed" ? "✅ Buyurtma tasdiqlandi" :
                status === "cancelled" ? "❌ Buyurtma bekor qilindi" :
                  status === "on_the_way" ? "🚚 Buyurtma yo'lda" :
                    "🎉 Buyurtma yetib keldi",
              message: message,
              type: "order_status",
              isActive: true,
              read: false,
              telegramChatId: chatId,
              orderId: orderId,
              createdAt: admin.firestore.Timestamp.now(),
            };
            await db.collection("notifications").add(notifData);
            console.log(`✅ Firestore notification saqlandi`);
          } catch (e) {
            console.error(`❌ Firestore notification xatosi: ${e.message}`);
          }
        }
      }
    });
  });
}

console.log("✅ Oscar Shop Bot ishga tushdi!");
