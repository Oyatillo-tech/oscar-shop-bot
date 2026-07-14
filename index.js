// ====================== OSCAR SHOP BOT — TUZATILGAN VERSIYA ======================
// Tuzatilgan xatolar:
// 1. supportThreads e'lon qilinmagan edi -> ReferenceError -> butun process o'lardi
// 2. uncaughtException/unhandledRejection himoyasi qo'shildi (bot endi "jim o'lmaydi")
// 3. Orders listener'da userInfo/SUPPORT_GROUP_ID copy-paste xatosi -> endi mijozga to'g'ri xabar boradi
// 4. /start dagi hasPhone/phoneAsked mantiqi tuzatildi (Firestore'dan real o'qiladi)
// 5. contact handler .update() o'rniga .set(merge) -> hujjat bo'lmasa ham telefon saqlanadi
// 6. chatId doim String sifatida saqlanadi (schema bir xillashtirildi)

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const admin = require("firebase-admin");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL || "https://oscar1-wheat.vercel.app/";
const SUPPORT_GROUP_ID = process.env.SUPPORT_GROUP_ID;

// ====================== PROCESS HIMOYASI (MUHIM!) ======================
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

// ====================== FIREBASE ======================
let db;
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

bot.on("polling_error", (err) => {
  // 409 Conflict = shu token bilan boshqa process ham polling qilyapti!
  console.error("Polling xatosi:", err.message);
});

const userState = {};
const supportThreads = {}; // ⬅️ BU YO'Q EDI — asosiy crash sababi

function getWebAppUrl(chatId) {
  // Eslatma: web_app tugmasida ?startapp ishlamaydi, shuning uchun oddiy
  // query param sifatida beramiz. MiniApp buni URLSearchParams orqali yoki
  // Telegram.WebApp.initDataUnsafe.user.id dan olishi kerak.
  return `${MINI_APP_URL}?chatId=${chatId}`;
}

const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [["🛍 Do'konga kirish"], ["🆘 Yordam"]],
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
      const ref = db.collection("telegram_users").doc(String(chatId));
      const userDoc = await ref.get();

      if (userDoc.exists) {
        const data = userDoc.data();
        hasPhone = !!data.phone;          // ⬅️ endi real qiymat o'qiladi
        phoneAsked = data.phoneAsked === true;
      }

      // User ma'lumotini saqlash/yangilash.
      // MUHIM: phoneAsked bu yerda YOZILMAYDI — faqat telefon so'ralganda yoziladi.
      // startedAt faqat birinchi marta yoziladi (har /start da yangilanmasin).
      const payload = {
        chatId: String(chatId),
        firstName,
        lastName: msg.from.last_name || "",
        username: msg.from.username || "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (!userDoc.exists) {
        payload.startedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      await ref.set(payload, { merge: true });
      console.log(`✅ User saqlandi: ${chatId} | phone: ${hasPhone}`);
    } catch (error) {
      console.error("Firestore xato:", error.message);
    }
  }

  if (hasPhone || phoneAsked) {
    sendMainMenu(chatId, `👋 Xush kelibsiz, ${firstName}!\n\n🛒 OSCAR do'koniga xush kelibsiz!`);
  } else {
    bot.sendMessage(
      chatId,
      `👋 Xush kelibsiz, ${firstName}!\n\n📱 Buyurtma holati haqida xabar olib turishingiz uchun telefon raqamingizni ulashishingizni tavsiya qilamiz:`,
      {
        reply_markup: {
          keyboard: [
            [{ text: "📱 Telefon raqamni ulashish", request_contact: true }],
            ["⏭ Keyinroq"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
    if (db) {
      db.collection("telegram_users")
        .doc(String(chatId))
        .set({ phoneAsked: true }, { merge: true })
        .catch((err) => console.error("phoneAsked saqlash xato:", err.message));
    }
  }
});

// ====================== TELEFON QABUL QILISH ======================
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;

  // Xavfsizlik: faqat o'zining kontaktini qabul qilamiz
  if (msg.contact.user_id && msg.contact.user_id !== msg.from.id) {
    bot.sendMessage(chatId, "❗️ Iltimos, o'zingizning raqamingizni ulashing.");
    return;
  }

  const phone = msg.contact.phone_number;
  const normalizedPhone = phone.startsWith("+") ? phone : "+" + phone;

  if (db) {
    try {
      // .update() emas .set(merge) — hujjat bo'lmasa ham ishlaydi
      await db.collection("telegram_users").doc(String(chatId)).set(
        {
          chatId: String(chatId),
          phone: normalizedPhone,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(`✅ Telefon saqlandi: ${chatId} - ${normalizedPhone}`);
    } catch (error) {
      console.error("Telefon saqlash xatosi:", error.message);
    }
  }

  sendMainMenu(chatId, `✅ Rahmat! Telefon raqamingiz saqlandi.\n\nEndi buyurtma holatini kuzatib borishingiz mumkin!`);
});

// ====================== "KEYINROQ" ======================
bot.onText(/⏭ Keyinroq/, (msg) => {
  sendMainMenu(msg.chat.id, "Xo'p, istasangiz keyinroq telefon qo'shishingiz mumkin.");
});

// ====================== "DO'KONGA KIRISH" ======================
bot.onText(/🛍 Do'konga kirish/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Do'konga kirish uchun quyidagi tugmani bosing 👇", {
    reply_markup: {
      inline_keyboard: [[{ text: "🛍 Do'konga kirish", web_app: { url: getWebAppUrl(chatId) } }]],
    },
  });
});

// ====================== "YORDAM" ======================
bot.onText(/🆘 Yordam/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { step: "awaiting_support_message" };
  bot.sendMessage(chatId, "✍️ Savolingizni yoki muammoingizni yozing — operatorlarimiz tez orada javob berishadi.");
});

// ====================== YAGONA MESSAGE HANDLER ======================
// (Oldin ikkita alohida handler bor edi — bitta qilib birlashtirildi)
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // --- Support guruhdan operator javobi ---
  if (SUPPORT_GROUP_ID && String(chatId) === String(SUPPORT_GROUP_ID)) {
    if (msg.reply_to_message && text) {
      const customerChatId = supportThreads[msg.reply_to_message.message_id];
      if (customerChatId) {
        try {
          await bot.sendMessage(customerChatId, `💬 Operator javobi:\n\n${text}`);
          await bot.sendMessage(SUPPORT_GROUP_ID, "✅ Javob mijozga yuborildi.", {
            reply_to_message_id: msg.message_id,
          });
        } catch (error) {
          console.error("Mijozga javob yuborishda xato:", error.message);
          await bot.sendMessage(
            SUPPORT_GROUP_ID,
            `❌ Mijozga yuborib bo'lmadi: ${error.message}`,
            { reply_to_message_id: msg.message_id }
          );
        }
      } else {
        await bot.sendMessage(
          SUPPORT_GROUP_ID,
          "⚠️ Bu xabar qaysi mijozga tegishli ekanini topa olmadim (ehtimol bot qayta ishga tushirilgan).",
          { reply_to_message_id: msg.message_id }
        );
      }
    }
    return;
  }

  // --- Filtrlash ---
  if (!text || msg.contact) return;
  if (text.startsWith("/start")) return;
  if (["🛍 Do'konga kirish", "🆘 Yordam", "⏭ Keyinroq"].includes(text)) return;

  // --- Yordam so'rovi ---
  const state = userState[chatId];
  if (state && state.step === "awaiting_support_message") {
    delete userState[chatId];

    if (SUPPORT_GROUP_ID) {
      const userInfo =
        `🆘 Yangi murojaat\n\n👤 ${msg.from.first_name || ""} ${msg.from.last_name || ""}\n` +
        `🔗 @${msg.from.username || "username yo'q"}\n🆔 Chat ID: ${chatId}\n\n💬 Xabar:\n${text}`;
      try {
        const sentMsg = await bot.sendMessage(SUPPORT_GROUP_ID, userInfo);
        supportThreads[sentMsg.message_id] = chatId;
        bot.sendMessage(chatId, "✅ Xabaringiz operatorlarga yuborildi. Tez orada javob berishadi!", mainMenuKeyboard);
      } catch (error) {
        console.error("Guruhga yuborishda xato:", error.message);
        bot.sendMessage(chatId, "❌ Xabar yuborishda xato. Birozdan keyin qayta urinib ko'ring.", mainMenuKeyboard);
      }
    } else {
      bot.sendMessage(chatId, "⚠️ Yordam bo'limi hozircha sozlanmagan.", mainMenuKeyboard);
    }
    return;
  }

  // --- Default: do'kon tugmasi ---
  bot.sendMessage(chatId, "Do'konga kirish uchun quyidagi tugmani bosing 👇", {
    reply_markup: {
      inline_keyboard: [[{ text: "🛍 Do'konga kirish", web_app: { url: getWebAppUrl(chatId) } }]],
    },
  });
});

// ====================== BUYURTMA STATUSI O'ZGARGANDA ======================
if (db) {
  console.log("🔔 Orders listener faol...");

  db.collection("orders").onSnapshot(
    (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== "modified") return;

        const orderData = change.doc.data();
        const orderId = change.doc.id;
        const status = orderData.status;

        if (!["confirmed", "cancelled", "on_the_way", "delivered"].includes(status)) return;

        let chatId = orderData.telegramChatId;

        // Fallback: telefon orqali qidirish (where bilan — butun kolleksiyani o'qimasdan)
        if (!chatId && orderData.customerPhone && db) {
          try {
            const normalized = orderData.customerPhone.replace(/\s/g, "");
            const usersSnap = await db
              .collection("telegram_users")
              .where("phone", "==", normalized)
              .limit(1)
              .get();
            if (!usersSnap.empty) chatId = usersSnap.docs[0].data().chatId;
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
            // ⬅️ TUZATILDI: oldin bu yerda userInfo (mavjud emas) SUPPORT_GROUP ga yuborilardi
            await bot.sendMessage(chatId, message);
            console.log(`✅ Status xabari yuborildi: ${chatId} - ${status}`);
          } catch (e) {
            console.error(`Xabar yuborishda xato: ${e.message}`);
          }
        }
      });
    },
    (error) => console.error("❌ Orders listener xatosi:", error)
  );
}

console.log("✅ Oscar Shop Bot muvaffaqiyatli ishga tushdi!");