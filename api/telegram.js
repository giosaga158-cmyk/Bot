const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

async function telegram(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify(body)
  });
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ok:true, service:"Barstvbot", telegramTokenConfigured:Boolean(TELEGRAM_TOKEN)});
  if (!TELEGRAM_TOKEN) return res.status(500).json({ok:false,error:"TELEGRAM_BOT_TOKEN is not configured"});
  if (WEBHOOK_SECRET && req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) return res.status(401).json({ok:false});

  try {
    let update = req.body || {};
    if (typeof update === "string") {
      try { update = JSON.parse(update); } catch { update = {}; }
    }
    const callback = update.callback_query;

    if (callback) {
      const chatId = callback.message?.chat?.id;
      const data = callback.data;
      await telegram("answerCallbackQuery", {callback_query_id: callback.id});

      if (data === "free") {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: `🎁 Бесплатный инструмент BAR ACADEMY\n\nСебестоимость + Food Cost — практический инструмент для контроля показателей бара и ресторана.\n\n👇 Открой бесплатный инструмент:\n${process.env.APP_URL || `https://${req.headers.host}`}/free-tool`
        });
      } else if (data === "catalog") {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "📊 BAR ACADEMY\n\n• Себестоимость / Food Cost\n• ФОТ / Labor Cost\n• KPI\n• Графики смен\n• Тесты сотрудников\n• Финансовые показатели\n\n🎁 Первый инструмент — бесплатно."
        });
      } else if (data === "help") {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "💬 Напиши свой вопрос одним сообщением — я помогу определить нужный инструмент BAR ACADEMY."
        });
      }
      return res.status(200).json({ok:true});
    }

    const message = update.message;
    if (!message?.chat) return res.status(200).json({ok:true});

    const chatId = message.chat.id;
    const text = (message.text || "").trim();

    if (text === "/start" || text === "/help") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "👋 Добро пожаловать в BAR ACADEMY!\n\n📊 Практические инструменты для управления баром и рестораном.\n\nВыбери действие:",
        reply_markup: {
          inline_keyboard: [
            [{text:"🎁 Получить бесплатный инструмент", callback_data:"free"}],
            [{text:"📊 Инструменты BAR ACADEMY", callback_data:"catalog"}],
            [{text:"💬 Задать вопрос", callback_data:"help"}]
          ]
        }
      });
      return res.status(200).json({ok:true});
    }

    if (text) {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "📌 Я помогу с инструментами BAR ACADEMY.\n\nНажми /start и выбери нужный раздел 👇"
      });
    }

    return res.status(200).json({ok:true});
  } catch (e) {
    console.error(e);
    return res.status(500).json({ok:false});
  }
}