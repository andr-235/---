export const quickLinks = [
  { id: "vk", label: "ВК", url: "https://vk.com" },
  { id: "ok", label: "Одноклассники", url: "https://ok.ru" },
  { id: "telegram", label: "Telegram", url: "https://web.telegram.org" },
  { id: "whatsapp", label: "WhatsApp", url: "https://web.whatsapp.com" },
  { id: "max", label: "Max", url: "https://web.max.ru/" },
  {
    id: "news",
    label: "Новости",
    url: "https://news.google.com/topstories?hl=ru&gl=RU&ceid=RU:ru",
  },
];

export const statusLabels = {
  open: "Открыто",
  closed: "Закрыто",
  paused: "Пауза",
  archived: "Архив",
};

export const DEFAULT_URL = "https://vk.com";
export const MAX_URL_DISPLAY_LENGTH = 140;
export const MAX_ARTICLE_TEXT_LENGTH = 1000;
export const FEEDBACK_TIMEOUTS = {
  artifact: 6000,
  report: 8000,
  browserNotice: 8000,
  settings: 8000,
};
