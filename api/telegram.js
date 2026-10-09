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
    [{text:"🧮 Food Cost / блюдо", callback_data:"c_fc"}, {text:"🍽 Себестоимость блюда", callback_data:"c_dish"}],
    [{text:"💰 Маржа", callback_data:"c_margin"}, {text:"👥 ФОТ", callback_data:"c_labor"}],
    [{text:"🎯 Точка безубыточности", callback_data:"c_break"}],
    [{text:"📈 Продажи/час", callback_data:"c_saleshour"}],
    [{text:"◀️ Главное меню", callback_data:"home"}]
  ]
};

const LIBRARY_MENU = {
  inline_keyboard: [
    [{text:"📊 Food Cost", callback_data:"t_fc"}],
    [{text:"🍽 Себестоимость блюда", callback_data:"t_recipe"}],
    [{text:"👥 ФОТ / Labor Cost", callback_data:"t_labor"}],
    [{text:"📈 KPI — план/факт", callback_data:"t_kpi"}],
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
    fc: "🧮 FOOD COST / СЕБЕСТОИМОСТЬ\n\nЭто полноценный калькулятор по ТТК.\n\n1️⃣ Первая строка — название блюда или напитка.\n2️⃣ Далее каждый ингредиент:\nИнгредиент | цена за 1 кг или 1 л | количество | единица\n\nПример блюда:\nЦезарь\nКурица | 450 | 120 | г\nСалат | 300 | 80 | г\nСоус | 500 | 40 | г\nСыр | 900 | 20 | г\n\nПример напитка:\nЛимонад Манго\nПюре манго | 650 | 50 | мл\nСироп | 500 | 20 | мл\nСок лимона | 180 | 30 | мл\n\n📌 Бот пересчитает стоимость каждого ингредиента по фактической граммовке/объёму, сложит всё и покажет рекомендуемую цену при Food Cost 30%.",
    dish: "🍽 СЕБЕСТОИМОСТЬ БЛЮДА\n\nПришли данные одним сообщением.\nПервая строка — название блюда.\nДалее каждый ингредиент с новой строки в формате:\nИнгредиент | цена за 1 кг | количество по ТТК в граммах\n\nПример:\nЦезарь\nКурица | 450 | 120\nСалат | 300 | 80\nСоус | 500 | 40\nСыр | 900 | 20",
    margin: "💰 МАРЖА\n\nПришли цену продажи и себестоимость.\n\nНапример: 500 140",
    labor: "👥 ФОТ\n\nПришли выручку и фонд оплаты труда.\n\nНапример: 1200000 260000",
    break: "🎯 ТОЧКА БЕЗУБЫТОЧНОСТИ\n\nПришли постоянные расходы и переменные расходы в %.\n\nНапример: 400000 32",
    saleshour: "📈 ПРОДАЖИ / ЧАС\n\nПришли выручку и количество отработанных человеко-часов.\n\nНапример: 900000 720"
  };
  return `${prompts[type]}\n\n⬇️ Ответь на это сообщение.`;
}

function calcResult(type, nums) {
  if (type === "fc") return "❗ Для Food Cost используй формат блюда/напитка из сообщения выше.";

  if (type === "dish") return "❗ Для расчёта блюда используй формат из сообщения выше.";

  if (nums.length < 2) return "❗ Нужны два числа. Например: 500 140";
  const [a,b] = nums;
  if (a <= 0 || b < 0) return "❗ Проверь значения: первое число должно быть больше 0, второе — неотрицательное.";

  if (type === "margin") {
    if (b >= a) return "❗ Себестоимость должна быть меньше цены продажи.";
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
    if (b <= 0) return "❗ Количество человеко-часов должно быть больше 0.";
    const value = a / b;
    return `📈 ПРОДАЖИ / ЧАС\n\nВыручка: ${money(a)}\nЧеловеко-часы: ${b}\n\nВыручка на 1 человеко-час: ${money(value)}\n\n💡 Используй показатель для сравнения смен и оценки эффективности графика.`;
  }
}

function calcDishResult(text) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (lines.length < 2) {
    return "❗ Нужно минимум 2 строки: название блюда/напитка и хотя бы один ингредиент.";
  }

  const dishName = lines[0];
  const ingredients = [];

  for (const line of lines.slice(1)) {
    const parts = line.split("|").map(x => x.trim());
    if (parts.length < 4) {
      return `❗ Не удалось разобрать строку: "${line}"\n\nФормат:\nИнгредиент | цена за 1 кг/1 л | количество | г/мл`;
    }

    const name = parts[0] || "Ингредиент";
    const pricePerUnit = Number((parts[1] || "").replace(",", ".").replace(/\s/g, ""));
    const quantity = Number((parts[2] || "").replace(",", ".").replace(/\s/g, ""));
    const unit = parts[3].toLowerCase().replace(".", "");

    if (!["г", "гр", "грамм", "граммы", "мл", "миллилитр", "миллилитры"].includes(unit)) {
      return `❗ Для "${name}" укажи единицу только "г" или "мл".`;
    }
    if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return `❗ Проверь строку: "${line}" — цена и количество должны быть больше 0.`;
    }

    const normalizedUnit = unit.startsWith("м") ? "мл" : "г";
    const cost = pricePerUnit * quantity / 1000;
    ingredients.push({name, pricePerUnit, quantity, unit: normalizedUnit, cost});
  }

  const total = ingredients.reduce((sum, x) => sum + x.cost, 0);
  const targetFoodCost = 30;
  const recommendedPrice = total / (targetFoodCost / 100);
  const rows = ingredients
    .map((x, i) => `${i + 1}. ${x.name} — ${x.quantity} ${x.unit} × ${money(x.pricePerUnit)}/${x.unit === "г" ? "кг" : "л"} = ${money(x.cost)}`)
    .join("\n");

  return `🧮 FOOD COST / СЕБЕСТОИМОСТЬ\n\n🍽 ${dishName}\n\n${rows}\n\n━━━━━━━━━━━━━━\n💵 Себестоимость: ${money(total)}\n🎯 Целевой Food Cost: ${pct(targetFoodCost)}\n💰 Рекомендуемая цена: ${money(recommendedPrice)}\n\n📌 Расчёт выполнен по фактическому количеству каждого ингредиента из ТТК.`;
}
function template(type) {
  if (type === "fc") return {
    name:"BAR_ACADEMY_Food_Cost.csv",
    caption:"🧮 Food Cost продукта — закупочная цена и рекомендуемая продажная цена",
    csv:[
      "BAR ACADEMY — FOOD COST ПРОДУКТА","","",
      "Продукт","Закупочная цена","Целевой Food Cost","Рекомендуемая продажная цена",
      "Лосось","1200","30%","=B4/C4"
    ].join("\n")
  };
  if (type === "recipe") return {
    name:"BAR_ACADEMY_Dish_Cost.csv",
    caption:"🍽 Себестоимость блюда — шаблон расчёта по ТТК",
    csv:[
      "BAR ACADEMY — СЕБЕСТОИМОСТЬ БЛЮДА","","",
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
    caption:"📈 KPI сотрудника — план → факт → выполнение → баллы → итоговая оценка",
    csv:[
      "BAR ACADEMY — KPI СОТРУДНИКА","","","","","","","","",
      "Как пользоваться: внеси сотрудника, период, план и факт. Таблица покажет выполнение KPI и итоговый балл.","","","","","","","","",
      "Сотрудник","Период","Показатель","План","Факт","Выполнение %","Вес %","Баллы","Комментарий",
      "Бармен 1","Октябрь","Выручка","300000","315000","=IF(D4=0,0,E4/D4*100)","40","=MIN(F4,100)*G4/100","Больше = лучше",
      "Бармен 1","Октябрь","Средний чек","1800","1950","=IF(D5=0,0,E5/D5*100)","20","=MIN(F5,100)*G5/100","Больше = лучше",
      "Бармен 1","Октябрь","Food Cost %","30","28","=IF(E6=0,0,D6/E6*100)","20","=MIN(F6,100)*G6/100","Меньше = лучше",
      "Бармен 1","Октябрь","Ошибки / рекламации","5","2","=IF(E7=0,0,D7/E7*100)","20","=MIN(F7,100)*G7/100","Меньше = лучше",
      "","","","","","ИТОГО KPI","","=SUM(H4:H7)","Максимум 100 баллов",
      "","","","","","ИТОГОВАЯ ОЦЕНКА","","=IF(H8>=90,\\\"A — отлично\\\",IF(H8>=75,\\\"B — хорошо\\\",IF(H8>=60,\\\"C — требует внимания\\\",\\\"D — критично\\\")))",""
    ].join("\\n")
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
    return res.status(200).json({
      ok: true,
      service: "Barstvbot",
      telegramTokenConfigured: Boolean(TELEGRAM_TOKEN),
      webhookHandler: true
    });
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
        await send(chatId, calculatorPrompt(type), {force_reply:true, input_field_placeholder:type === "fc" ? "Название продукта и цена" : type === "dish" ? "Название блюда + ингредиенты" : "Введите данные"});
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

    if (replyText.includes("🧮 FOOD COST / СЕБЕСТОИМОСТЬ")) {
      await send(chatId, calcDishResult(text));
      return res.status(200).json({ok:true});
    }
    if (replyText.includes("🍽 СЕБЕСТОИМОСТЬ БЛЮДА")) {
      await send(chatId, calcDishResult(text));
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