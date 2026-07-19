# 🤖 OSCAR — Shop Bot (oscar-shop-bot)

Mijozning Telegram boti. **OSCAR** tizimining uchta repozitoriyasidan biri — mijozlarni ro'yxatdan o'tkazadi, mini-ilovaga yo'naltiradi va buyurtma holati haqida avtomatik xabar beradi.

> 🔗 Bog'liq repolar: [`oscar-ui`](https://github.com/Oyatillo-tech/oscar-ui) (mini-ilova) · [`oscar-admin-bot`](https://github.com/Oyatillo-tech/oscar-admin-bot) (boshqaruv paneli)

## 🚀 Texnologiyalar

Node.js, node-telegram-bot-api, Firebase Admin SDK

## ✨ Asosiy imkoniyatlar

- 👋 `/start` — mijozni ro'yxatdan o'tkazadi, telefon raqamini so'raydi
- 🛍️ "Do'konga kirish" tugmasi orqali mini-ilovani (`oscar-ui`) ochadi
- 🔔 Firestore'dagi `orders` kolleksiyasini kuzatib turadi (`onSnapshot`) — buyurtma holati o'zgarganda (tasdiqlandi / bekor qilindi / yo'lda / yetkazildi) mijozga avtomatik xabar yuboradi

Bu repo ataylab kichik va sodda qilib qurilgan — bitta `index.js` fayl (~190 qator), yagona vazifasi mijoz bilan Telegram orqali muloqotni ta'minlash.

## 🛠️ O'rnatish

```bash
git clone https://github.com/Oyatillo-tech/oscar-shop-bot.git
cd oscar-shop-bot
npm install
```

## ⚙️ Muhit o'zgaruvchilari (.env)

```
TELEGRAM_BOT_TOKEN=
FIREBASE_SERVICE_ACCOUNT_JSON=
MINI_APP_URL=
```

## ▶️ Ishga tushirish

```bash
node index.js
```

## 👤 Muallif

**Oyatillo Obloberdiev**
[LinkedIn](https://www.linkedin.com/in/oyatillo-obloberdiev-14b645294/) | [GitHub](https://github.com/Oyatillo-tech)
