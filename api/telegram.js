const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || "https://barstvbot.vercel.app";
const ADMIN_CONTACT = process.env.ADMIN_CONTACT || "https://t.me/GSagat";

async function telegram(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body)
  });
  return r.json();
}

async function send(chatId, text, reply_markup) {
  return telegram("sendMessage", {chat_id: chatId, text, ...(reply_markup ? {reply_markup} : {})});
}

async function sendCsv(chatId, filename, csv, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("document", new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"}), filename);
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
    method: "POST",
    body: form
  });
  return r.json();
}

const MAIN_MENU = {
  inline_keyboard: [
    [{text:"🧮 Калькуляторы", callback_data:"calc"}],
    [{text:"📊 Таблицы и инструменты", callback_data:"library"}],
    [{text:"🚨 Быстрая диагностика", callback_data:"diagnostic"}],
    [{text:"💬 Обратная связь", callback_data:"feedback"}],
    [{text:"🎁 Бесплатный инструмент", callback_data:"free"}]
  ]
};

const CALC_MENU = {
  inline_keyboard: [
    [{text:"🍸 Food Cost", callback_data:"c_fc"}, {text:"💰 Маржа", callback_data:"c_margin"}],
    [{text:"👥 ФОТ", callback_data:"c_labor"}, {text:"🎯 Точка безубыточности", callback_data:"c_break"}],
    [{text:"📈 Продажи/час", callback_data:"c_saleshour"}],
    [{text:"◀️ Главное меню", callback_data:"home"}]
  ]
};

const LIBRARY_MENU = {
  inline_keyboard: [
    [{text:"📊 Food Cost", callback_data:"t_fc"}],
    [{text:"🍸 Себестоимость коктейля", callback_data:"t_recipe"}],
    [{text:"👥 ФОТ / Labor Cost", callback_data:"t_labor"}],
    [{text:"📈 KPI сотрудника", callback_data:"t_kpi"}],
    [{text:"📋 Чек-лист открытия бара", callback_data:"t_open"}],
    [{text:"🧾 Инвентаризация", callback_data:"t_inventory"}],
    [{text:"◀️ Главное меню", callback_data:"home"}]
  ]
};

function parseNumbers(text) {
  return (text.match(/-?\d+(?:[.,]\d+)?/g) || []).map(x => Number(x.replace(",", ".")));
}

function money(n) {
  return new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0}).format(Math.round(n)) + " ₽";
}

function pct(n) {
  return n.toFixed(1).replace(".", ",") + "%";
}

function calculatorPrompt(type) {
  const prompts = {
    fc: "🧮 FOOD COST\n\nПришли одной строкой два числа:\nвыручка и себестоимость.\n\nНапример: 1000000 300000",
    margin: "💰 МАРЖА\n\nПришли цену продажи и себестоимость.\n\nНапример: 500 140",
    labor: "👥 ФОТ\n\nПришли выручку и фонд оплаты труда.\n\nНапример: 1200000 260000",
    break: "🎯 ТОЧКА БЕЗУБЫТОЧНОСТИ\n\nПришли постоянные расходы и переменные расходы в %.\n\nНапример: 400000 32",
    saleshour: "📈 ПРОДАЖИ / ЧАС\n\nПришли выручку и количество отработанных человеко-часов.\n\nНапример: 900000 720"
  };
  return `${prompts[type]}\n\n⬇️ Ответь на это сообщение цифрами.`;
}

function calcResult(type, nums) {
  if (nums.length < 2) return "❗ Нужны два числа. Например: 1000000 300000";
  const [a,b] = nums;
  if (a <= 0 || b < 0) return "❗ Проверь значения: первое число должно быть больше 0, второе — неотрицательное.";

  if (type === "fc") {
    const value = b / a * 100;
    const verdict = value <= 30 ? "🟢 Хороший уровень." : value <= 35 ? "🟡 Стоит контролировать." : "🔴 Высокий Food Cost — ищем потери.";
    return `🧮 FOOD COST\n\nВыручка: ${money(a)}\nСебестоимость: ${money(b)}\nFood Cost: ${pct(value)}\n\n${verdict}\n\n🎯 Следующий шаг: проверь рецептуры, списания и закупочные цены.`;
  }
  if (type === "margin") {
    if (a <= 0 || b >= a) return "❗ Себестоимость должна быть меньше цены продажи.";
    const margin = (a-b)/a*100;
    const markup = b ? (a-b)/b*100 : 0;
    return `💰 МАРЖА\n\nЦена: ${money(a)}\nСебестоимость: ${money(b)}\nМаржинальность: ${pct(margin)}\nНаценка: ${pct(markup)}\n\n${margin >= 70 ? "🟢 Хороший запас." : margin >= 60 ? "🟡 Нормально, но есть что улучшать." : "🔴 Маржинальность низкая."}`;
  }
  if (type === "labor") {
    const value = b / a * 100;
    return `👥 LABOR COST\n\nВыручка: ${money(a)}\nФОТ: ${money(b)}\nLabor Cost: ${pct(value)}\n\n${value <= 25 ? "🟢 Контрольный уровень выглядит хорошо." : value <= 30 ? "🟡 Следи за графиками и производительностью." : "🔴 ФОТ заметно давит на экономику."}`;
  }
  if (type === "break") {
    if (b >= 100) return "❗ Переменные расходы должны быть меньше 100%.";
    const revenue = a / (1-b/100);
    return `🎯 ТОЧКА БЕЗУБЫТОЧНОСТИ\n\nПостоянные расходы: ${money(a)}\nПеременные расходы: ${pct(b)}\n\nМинимальная выручка: ${money(revenue)}\n\n📌 Ниже этой выручки бизнес работает в зоне убытка.`;
  }
  if (type === "saleshour") {
    const value = a / b;
    return `📈 ПРОДАЖИ / ЧАС\n\nВыручка: ${money(a)}\nЧеловеко-часы: ${b}\n\nВыручка на 1 человеко-час: ${money(value)}\n\n💡 Используй показатель для сравнения смен и оценки эффективности графика.`;
  }
}

function template(type) {
  if (type === "fc") return {
    name:"BAR_ACADEMY_Food_Cost.csv",
    caption:"📊 Food Cost — базовый рабочий шаблон BAR ACADEMY",
    csv:[
      "BAR ACADEMY — FOOD COST","","",
      "Показатель","Значение","Комментарий",
      "Выручка","1000000","Введите фактическую выручку",
      "Себестоимость","300000","Введите себестоимость",
      "Food Cost %","=B5/B4*100","Формула"
    ].join("\n")
  };
  if (type === "recipe") return {
    name:"BAR_ACADEMY_Cocktail_Cost.csv",
    caption:"🍸 Себестоимость коктейля — шаблон расчёта",
    csv:[
      "BAR ACADEMY — СЕБЕСТОИМОСТЬ КОКТЕЙЛЯ","","",
      "Ингредиент","Количество","Цена за единицу","Стоимость",
      "Алкоголь","","","=B4*C4",
      "Миксер","","","=B5*C5",
      "Сироп","","","=B6*C6",
      "Гарниш","","","=B7*C7",
      "ИТОГО","","","=SUM(D4:D7)"
    ].join("\n")
  };
  if (type === "labor") return {
    name:"BAR_ACADEMY_Labor_Cost.csv",
    caption:"👥 Labor Cost — шаблон контроля ФОТ",
    csv:[
      "BAR ACADEMY — LABOR COST","","",
      "Показатель","Значение","Комментарий",
      "Выручка","1200000","",
      "ФОТ","260000","",
      "Labor Cost %","=B5/B4*100",""
    ].join("\n")
  };
  if (type === "kpi") return {
    name:"BAR_ACADEMY_KPI.csv",
    caption:"📈 KPI сотрудника — базовый шаблон",
    csv:[
      "Сотрудник","Выручка","Часы","Выручка/час","KPI",
      "Бармен 1","300000","160","=B2/C2","",
      "Бармен 2","350000","176","=B3/C3",""
    ].join("\n")
  };
  if (type === "open") return {
    name:"BAR_ACADEMY_Opening_Checklist.csv",
    caption:"📋 Чек-лист открытия бара",
    csv:[
      "BAR ACADEMY — ЧЕК-ЛИСТ ОТКРЫТИЯ БАРА",
      "Пункт","Статус",
      "Свет и оборудование","",
      "Холодильники и температура","",
      "Лёд и вода","",
      "Заготовки","",
      "Алкоголь и миксеры","",
      "Посуда и инвентарь","",
      "Касса / POS","",
      "Чистота рабочей зоны","",
      "Гарниши","",
      "Стоп-лист проверен",""
    ].join("\n")
  };
  return {
    name:"BAR_ACADEMY_Inventory.csv",
    caption:"🧾 Инвентаризация — базовый шаблон",
    csv:[
      "BAR ACADEMY — ИНВЕНТАРИЗАЦИЯ",
      "Категория","Позиция","Остаток","Ед.","Цена","Сумма",
      "Алкоголь","","","","","=C3*E3",
      "Миксеры","","","","","=C4*E4",
      "Сиропы","","","","","=C5*E5",
      "Гарниши","","","","","=C6*E6"
    ].join("\n")
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    if (!TELEGRAM_TOKEN) return res.status(500).json({ok:false, service:"Barstvbot", telegramTokenConfigured:false});
    try {
      const me = await telegram("getMe", {});
      return res.status(me.ok ? 200 : 500).json({
        ok:me.ok, service:"Barstvbot", telegramTokenConfigured:true,
        telegramTokenValid:me.ok, bot:me.result?.username || null
      });
    } catch {
      return res.status(500).json({ok:false, service:"Barstvbot", telegramTokenConfigured:true, telegramTokenValid:false});
    }
  }

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

      if (data === "home") {
        await send(chatId, "🍸 BAR ACADEMY\n\nРабочие инструменты для управления баром и рестораном.\n\nВыбери раздел:", MAIN_MENU);
      } else if (data === "calc") {
        await send(chatId, "🧮 КАЛЬКУЛЯТОРЫ\n\nВыбирай показатель — бот попросит нужные цифры и сразу даст расчёт.", CALC_MENU);
      } else if (data === "library") {
        await send(chatId, "📚 БИБЛИОТЕКА BAR ACADEMY\n\nГотовые таблицы и чек-листы. Файл формируется прямо в чате.", LIBRARY_MENU);
      } else if (data === "diagnostic") {
        await send(chatId, "🚨 БЫСТРАЯ ДИАГНОСТИКА\n\nПришли одной строкой 4 показателя:\nвыручка / Food Cost % / ФОТ % / списания %\n\nНапример: 1500000 34 29 3");
      } else if (data === "feedback") {
        await send(chatId, `💬 ОБРАТНАЯ СВЯЗЬ\n\nЕсли нашёл ошибку, нужен новый калькулятор или хочешь предложить инструмент — напиши мне напрямую:\n\n${ADMIN_CONTACT}\n\n📌 В сообщении укажи: «BAR ACADEMY» + что именно нужно улучшить.`);
      } else if (data === "free") {
        await send(chatId, `🎁 БЕСПЛАТНЫЙ ИНСТРУМЕНТ\n\nFood Cost + себестоимость — первый рабочий инструмент BAR ACADEMY.\n\nОткрой:\n${APP_URL}/free-tool`);
      } else if (data.startsWith("c_")) {
        const type = data.slice(2);
        await send(chatId, calculatorPrompt(type), {force_reply:true, input_field_placeholder:"Например: 1000000 300000"});
      } else if (data.startsWith("t_")) {
        const t = template(data.slice(2));
        const result = await sendCsv(chatId, t.name, t.csv, t.caption);
        if (!result.ok) await send(chatId, "⚠️ Не удалось отправить файл. Попробуй ещё раз через минуту.");
      }
      return res.status(200).json({ok:true});
    }

    const message = update.message;
    if (!message?.chat) return res.status(200).json({ok:true});

    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const replyText = message.reply_to_message?.text || "";

    if (replyText.includes("🧮 FOOD COST")) {
      await send(chatId, calcResult("fc", parseNumbers(text)));
      return res.status(200).json({ok:true});
    }
    if (replyText.includes("💰 МАРЖА")) {
      await send(chatId, calcResult("margin", parseNumbers(text)));
      return res.status(200).json({ok:true});
    }
    if (replyText.includes("👥 ФОТ")) {
      await send(chatId, calcResult("labor", parseNumbers(text)));
      return res.status(200).json({ok:true});
    }
    if (replyText.includes("🎯 ТОЧКА БЕЗУБЫТОЧНОСТИ")) {
      await send(chatId, calcResult("break", parseNumbers(text)));
      return res.status(200).json({ok:true});
    }
    if (replyText.includes("📈 ПРОДАЖИ / ЧАС")) {
      await send(chatId, calcResult("saleshour", parseNumbers(text)));
      return res.status(200).json({ok:true});
    }

    if (text === "/start" || text.startsWith("/start@") || text === "/help" || text.startsWith("/help@")) {
      await send(chatId, "👋 BAR ACADEMY\n\n📊 Практические инструменты для управления баром и рестораном.\n\n🧮 Калькуляторы\n📚 Библиотека таблиц\n🚨 Диагностика\n💬 Обратная связь\n\nВыбери действие:", MAIN_MENU);
      return res.status(200).json({ok:true});
    }

    if (text === "/calc") {
      await send(chatId, "🧮 КАЛЬКУЛЯТОРЫ", CALC_MENU);
      return res.status(200).json({ok:true});
    }
    if (text === "/library") {
      await send(chatId, "📚 БИБЛИОТЕКА", LIBRARY_MENU);
      return res.status(200).json({ok:true});
    }
    if (text === "/diagnostic") {
      await send(chatId, "🚨 БЫСТРАЯ ДИАГНОСТИКА\n\nПришли: выручка / Food Cost % / ФОТ % / списания %\n\nНапример: 1500000 34 29 3");
      return res.status(200).json({ok:true});
    }
    if (text === "/feedback") {
      await send(chatId, `💬 Обратная связь: ${ADMIN_CONTACT}`);
      return res.status(200).json({ok:true});
    }

    if (text && !text.startsWith("/")) {
      const nums = parseNumbers(text);
      if (nums.length === 4) {
        const [revenue, fc, labor, waste] = nums;
        const alerts = [];
        if (fc > 35) alerts.push(`🔴 Food Cost ${pct(fc)} — высокий`);
        else if (fc > 30) alerts.push(`🟡 Food Cost ${pct(fc)} — под контролем`);
        else alerts.push(`🟢 Food Cost ${pct(fc)} — хорошо`);
        if (labor > 30) alerts.push(`🔴 ФОТ ${pct(labor)} — высокий`);
        else if (labor > 25) alerts.push(`🟡 ФОТ ${pct(labor)} — требует внимания`);
        else alerts.push(`🟢 ФОТ ${pct(labor)} — хорошо`);
        if (waste > 3) alerts.push(`🔴 Списания ${pct(waste)} — высокий уровень`);
        else alerts.push(`🟢 Списания ${pct(waste)} — в контроле`);
        await send(chatId, `🚨 ДИАГНОСТИКА\n\nВыручка: ${money(revenue)}\n\n${alerts.join("\n")}\n\n🎯 Первый показатель для проверки: ${fc > 35 ? "Food Cost" : labor > 30 ? "ФОТ" : waste > 3 ? "списания" : "маржинальность"}.`);
        return res.status(200).json({ok:true});
      }
      await send(chatId, "📌 Я готов считать и подбирать инструменты.\n\nНажми /start и выбери раздел 👇");
    }

    return res.status(200).json({ok:true});
  } catch (e) {
    console.error(e);
    return res.status(500).json({ok:false});
  }
}