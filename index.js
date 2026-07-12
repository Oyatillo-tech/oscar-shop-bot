// ====================== OSCAR SHOP BOT - TO'LIQ ISHLAYDIGAN VERSIYA ======================
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const admin = require("firebase-admin");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL || "https://oscar1-wheat.vercel.app/";
const SUPPORT_GROUP_ID = process.env.SUPPORT_GROUP_ID; // masalan: -1001234567890

let db;

// ====================== FIREBASE INITIALIZATION ======================
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON topilmadi!");

  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  console.log("✅ Firebase muvaffaqiyatli ulandi!");
} catch (error) {
  console.error("❌ Firebase ulanish xatosi:", error.message);
}

// ====================== BOT ======================
const bot = new TelegramBot(TOKEN, { polling: true });

// Har bir mijoz uchun vaqtinchalik holat (masalan "yordam so'rovi yozyapti")
// Bu RAM'da saqlanadi — server qayta ishga tushsa tozalanadi, bu muammo emas.
const userState = {};

function getWebAppUrl(chatId) {
  return `${MINI_APP_URL}?startapp=${chatId}`;
}

// Doimiy asosiy menyu
const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      ["🛍 Do'konga kirish"],
      ["📦 Buyurtmalarim", "🆘 Yordam"],
      ["👤 Profil"],
    ],
    resize_keyboard: true,
  },
};

function sendMainMenu(chatId, greetingText) {
  bot.sendMessage(chatId, greetingText, mainMenuKeyboard);
}

// ====================== /START ======================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Mehmon";

  let hasPhone = false;
  let phoneAsked = false;

  if (db) {
    try {
      const userDoc = await db.collection("telegram_users").doc(String(chatId)).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        hasPhone = !!data.phone;
        phoneAsked = !!data.phoneAsked;
      }
      await db.collection("telegram_users").doc(String(chatId)).set({
        chatId: chatId,
        firstName: firstName,
        lastName: msg.from.last_name || "",
        username: msg.from.username || "",
        startedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      }, { merge: true });
    } catch (error) {
      console.error("Firestore xato:", error.message);
    }
  }

  if (hasPhone || phoneAsked) {
    // Telefon bor, YOKI oldin so'ralgan va o'tkazib yuborilgan — qayta bezovta qilinmaydi
    sendMainMenu(chatId, `👋 Xush kelibsiz, ${firstName}!\n\n🛒 OSCAR do'koniga xush kelibsiz!`);
  } else {
    bot.sendMessage(chatId,
      `👋 Xush kelibsiz, ${firstName}!\n\n📱 Buyurtma holati haqida xabar olib turishingiz uchun telefon raqamingizni ulashishingizni tavsiya qilamiz:`,
      {
        reply_markup: {
          keyboard: [
            [{ text: "📱 Telefon raqamni ulashish", request_contact: true }],
            ["⏭ Keyinroq"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        }
      }
    );
    if (db) {
      db.collection("telegram_users").doc(String(chatId))
        .set({ phoneAsked: true }, { merge: true })
        .catch(err => console.error("phoneAsked saqlash xato:", err.message));
    }
  }
});

// ====================== TELEFON QABUL QILISH ======================
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const phone = msg.contact.phone_number;
  const normalizedPhone = phone.startsWith("+") ? phone : "+" + phone;

  if (db) {
    try {
      await db.collection("telegram_users").doc(String(chatId)).update({
        phone: normalizedPhone,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      console.log(`✅ Telefon saqlandi: ${chatId} - ${normalizedPhone}`);
    } catch (error) {
      console.error("Telefon saqlash xatosi:", error.message);
    }
  }

  sendMainMenu(chatId, `✅ Rahmat! Telefon raqamingiz saqlandi.\n\nEndi buyurtma holatini kuzatib borishingiz mumkin!`);
});

// ====================== "KEYINROQ" BOSILGANDA ======================
bot.onText(/⏭ Keyinroq/, (msg) => {
  const chatId = msg.chat.id;
  sendMainMenu(chatId, "Xo'p, istasangiz keyinroq \"👤 Profil\" bo'limidan telefon qo'shishingiz mumkin.");
});

// ====================== "DO'KONGA KIRISH" ======================
bot.onText(/🛍 Do'konga kirish/, (msg) => {
  const chatId = msg.chat.id;
  const webAppUrl = getWebAppUrl(chatId);
  bot.sendMessage(chatId, "Do'konga kirish uchun quyidagi tugmani bosing 👇", {
    reply_markup: {
      inline_keyboard: [[{ text: "🛍 Do'konga kirish", web_app: { url: webAppUrl } }]]
    }
  });
});

// ====================== "BUYURTMALARIM" ======================
bot.onText(/📦 Buyurtmalarim/, async (msg) => {
  const chatId = msg.chat.id;
  if (!db) { bot.sendMessage(chatId, "❌ Vaqtincha ma'lumot olib bo'lmadi."); return; }

  try {
    const snapshot = await db.collection("orders")
      .where("telegramChatId", "==", chatId)
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.empty) {
      bot.sendMessage(chatId, "Sizda hali buyurtmalar yo'q. 🛍 Do'konga kirib, birinchi buyurtmangizni bering!");
      return;
    }

    const statusLabels = {
      pending: "🕓 Kutilmoqda",
      confirmed: "✅ Tasdiqlandi",
      cancelled: "❌ Bekor qilindi",
      on_the_way: "🚚 Yo'lda",
      delivered: "🎉 Yetkazildi",
    };

    let text = `📦 Sizning buyurtmalaringiz (${snapshot.size} ta):\n\n`;
    snapshot.docs.forEach((doc, i) => {
      const o = doc.data();
      const label = statusLabels[o.status] || o.status || "Noma'lum";
      const date = o.createdAt && o.createdAt.toDate
        ? o.createdAt.toDate().toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "—";
      const total = o.totalUZS ? `${Number(o.totalUZS).toLocaleString("uz-UZ")} so'm` : "—"; text += `${i + 1}. 🆔 ${doc.id.substring(0, 8)}...\n   ${label}\n   🗓 ${date}\n   💰 ${total}\n\n`;
    });

    // Telegram xabar 4096 belgidan oshsa bo'linadi
    const chunks = text.match(/[\s\S]{1,3800}/g) || [text];
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk);
    }
  } catch (error) {
    console.error("Buyurtmalarni olishda xato:", error.message);
    bot.sendMessage(chatId, "❌ Buyurtmalarni olishda xato yuz berdi. Birozdan keyin qayta urinib ko'ring.");
  }
});

// ====================== "YORDAM" ======================
bot.onText(/🆘 Yordam/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { step: "awaiting_support_message" };
  bot.sendMessage(chatId, "✍️ Savolingizni yoki muammoingizni yozing — operatorlarimiz tez orada javob berishadi.");
});

// ====================== "PROFIL" ======================
bot.onText(/👤 Profil/, async (msg) => {
  const chatId = msg.chat.id;
  if (!db) { bot.sendMessage(chatId, "❌ Vaqtincha ma'lumot olib bo'lmadi."); return; }
  try {
    const userDoc = await db.collection("telegram_users").doc(String(chatId)).get();
    const data = userDoc.exists ? userDoc.data() : {};
    if (data.phone) {
      bot.sendMessage(chatId, `👤 Profilingiz:\n\n📱 Telefon: ${data.phone}`);
    } else {
      bot.sendMessage(chatId, "👤 Sizda hali telefon raqami saqlanmagan.", {
        reply_markup: {
          keyboard: [[{ text: "📱 Telefon raqamni ulashish", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        }
      });
    }
  } catch (error) {
    console.error("Profil olishda xato:", error.message);
    bot.sendMessage(chatId, "❌ Profilni olishda xato yuz berdi. Birozdan keyin qayta urinib ko'ring.");
  }
});

// ====================== BOSHQA XABARLAR ======================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || msg.contact) return;
  if (text.startsWith("/start")) return;
  if (["🛍 Do'konga kirish", "📦 Buyurtmalarim", "🆘 Yordam", "👤 Profil", "⏭ Keyinroq"].includes(text)) return;

  // Agar mijoz "Yordam" bosgandan keyin xabar yozayotgan bo'lsa — guruhga forward qilamiz
  const state = userState[chatId];
  if (state && state.step === "awaiting_support_message") {
    delete userState[chatId];

    if (SUPPORT_GROUP_ID) {
      const userInfo = `🆘 Yangi murojaat\n\n👤 ${msg.from.first_name || ""} ${msg.from.last_name || ""}\n` +
        `🔗 @${msg.from.username || "username yo'q"}\n🆔 Chat ID: ${chatId}\n\n💬 Xabar:\n${text}`;
      try {
        await bot.sendMessage(SUPPORT_GROUP_ID, userInfo);
        bot.sendMessage(chatId, "✅ Xabaringiz operatorlarga yuborildi. Tez orada javob berishadi!", mainMenuKeyboard);
      } catch (error) {
        console.error("Guruhga yuborishda xato:", error.message);
        bot.sendMessage(chatId, "❌ Xabar yuborishda xato. Birozdan keyin qayta urinib ko'ring.", mainMenuKeyboard);
      }
    } else {
      bot.sendMessage(chatId, "⚠️ Yordam bo'limi hozircha sozlanmagan. Iltimos keyinroq urinib ko'ring.", mainMenuKeyboard);
    }
    return;
  }

  const webAppUrl = getWebAppUrl(chatId);
  bot.sendMessage(chatId, "Do'konga kirish uchun quyidagi tugmani bosing 👇", {
    reply_markup: {
      inline_keyboard: [[{ text: "🛍 Do'konga kirish", web_app: { url: webAppUrl } }]]
    }
  });
});

// ====================== BUYURTMA STATUSI O'ZGARGANDA XABAR YUBORISH ======================
if (db) {
  console.log("🔔 Orders listener faol...");

  db.collection("orders").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "modified") {
        const orderData = change.doc.data();
        const orderId = change.doc.id;
        const status = orderData.status;

        if (!["confirmed", "cancelled", "on_the_way", "delivered"].includes(status)) return;

        let chatId = orderData.telegramChatId;

        if (!chatId && orderData.customerPhone) {
          try {
            const usersSnap = await db.collection("telegram_users").get();
            usersSnap.docs.forEach(doc => {
              const user = doc.data();
              if (user.phone && user.phone.replace(/\s/g, "") === orderData.customerPhone.replace(/\s/g, "")) {
                chatId = user.chatId;
              }
            });
          } catch (e) {
            console.error("Users qidirish xatosi:", e.message);
          }
        }

        if (!chatId) return;

        let message = "";
        if (status === "confirmed") message = `✅ Buyurtmangiz tasdiqlandi! 🆔 ${orderId.substring(0, 8)}...`;
        else if (status === "cancelled") message = `❌ Buyurtmangiz bekor qilindi. 🆔 ${orderId.substring(0, 8)}...`;
        else if (status === "on_the_way") message = `🚚 Buyurtmangiz yo'lga chiqdi! 📦`;
        else if (status === "delivered") message = `🎉 Buyurtmangiz yetkazildi! Rahmat! ❤️`;

        if (message) {
          try {
            await bot.sendMessage(chatId, message);
            console.log(`✅ Xabar yuborildi: ${chatId} - ${status}`);
          } catch (e) {
            console.error(`Xabar yuborishda xato: ${e.message}`);
          }
        }
      }
    });
  });
}

console.log("✅ Oscar Shop Bot muvaffaqiyatli ishga tushdi!");