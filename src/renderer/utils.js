import { statusLabels, MAX_URL_DISPLAY_LENGTH } from "./constants.js";

export function formatDate(value) {
  if (!value) return "Неизвестно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Неизвестно";
  return date.toISOString().slice(0, 10);
}

export function formatStatus(value) {
  if (!value) return "Неизвестно";
  const normalized = String(value).trim().toLowerCase();
  return statusLabels[normalized] || "Неизвестно";
}

export function formatBytes(value) {
  if (!value || Number.isNaN(value)) return "-";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function normalizeId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }
  return number;
}

export function createRafScheduler(callback) {
  let rafId = null;
  return () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      callback();
    });
  };
}

export function createValueScheduler(callback) {
  let latestValue = "";
  const schedule = createRafScheduler(() => {
    callback(latestValue);
  });
  return (value) => {
    latestValue = value;
    schedule();
  };
}

export function createTimedFeedback(element, timeoutMs) {
  let timer = null;
  const clear = () => {
    if (!element) return;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    element.hidden = true;
    element.textContent = "";
    element.removeAttribute("data-tone");
  };
  const set = (tone, message) => {
    if (!element) return;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    element.textContent = message;
    element.dataset.tone = tone;
    element.hidden = false;
    timer = window.setTimeout(() => {
      clear();
    }, timeoutMs);
  };
  return { clear, set };
}

export function createTimedNotice(container, textElement, timeoutMs) {
  let timer = null;
  const hide = () => {
    if (!container || !textElement) {
      return;
    }
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    textElement.textContent = "";
    container.hidden = true;
  };
  const show = (message) => {
    if (!container || !textElement) {
      return;
    }
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    textElement.textContent = message;
    container.hidden = false;
    timer = window.setTimeout(() => {
      hide();
    }, timeoutMs);
  };
  return { show, hide };
}

export function createDetailRow(labelText, valueText) {
  const item = document.createElement("div");
  item.className = "detail-row";

  const label = document.createElement("span");
  label.textContent = labelText;

  const value = document.createElement("span");
  value.textContent = valueText ?? "Неизвестно";

  item.append(label, value);
  return item;
}

export function createActionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tiny-btn";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

export function getArtifactTypeLabel(type) {
  if (type === "document") return "Документ";
  if (type === "evidence") return "Доказательство";
  if (type === "message") return "Сообщение";
  return "Прочее";
}

export function resolveArtifactType(artifact) {
  const source = (artifact.source || "").toLowerCase();
  if (source.includes("doc") || source.includes("pdf")) return "document";
  if (source.includes("evidence") || source.includes("proof")) return "evidence";
  if (source.includes("message") || source.includes("chat")) return "message";
  if (source.includes("html")) return "document";
  return "other";
}

export function formatUrlForDisplay(url) {
  if (!url) return "about:blank";
  const text = String(url);
  if (text.length <= MAX_URL_DISPLAY_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_URL_DISPLAY_LENGTH - 3)}...`;
}
