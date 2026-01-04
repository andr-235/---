const { MAX_META_LENGTH, ALLOWED_ENCODINGS } = require("../constants");

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function parsePositiveInt(value) {
  const number =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }
  return number;
}

function validateRequiredString(value, fieldName, maxLength) {
  if (typeof value !== "string") {
    return { ok: false, error: `${fieldName} должно быть строкой.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `${fieldName} обязательно.` };
  }
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} превышает максимальную длину.`,
    };
  }
  return { ok: true, value: trimmed };
}

function validateOptionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${fieldName} должно быть строкой.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} превышает максимальную длину.`,
    };
  }
  return { ok: true, value: trimmed };
}

function normalizeCapturedAt(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "capturedAt должно быть строкой." };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      error: "capturedAt должно быть корректной строкой даты.",
    };
  }
  return { ok: true, value: date.toISOString() };
}

function normalizeMetaJson(meta) {
  if (meta === undefined || meta === null) {
    return { ok: true, value: null };
  }
  if (typeof meta === "string") {
    const trimmed = meta.trim();
    if (!trimmed) {
      return { ok: true, value: null };
    }
    if (trimmed.length > MAX_META_LENGTH) {
      return { ok: false, error: "meta превышает допустимый размер." };
    }
    return { ok: true, value: trimmed };
  }
  if (!isPlainObject(meta)) {
    return { ok: false, error: "meta должно быть объектом или строкой." };
  }
  try {
    const json = JSON.stringify(meta);
    if (json.length > MAX_META_LENGTH) {
      return { ok: false, error: "meta превышает допустимый размер." };
    }
    return { ok: true, value: json };
  } catch (error) {
    return {
      ok: false,
      error: "meta должно быть сериализуемым в JSON.",
    };
  }
}

function normalizeFilePayload(file, defaultEncoding) {
  if (file === undefined || file === null) {
    return { ok: true, value: null };
  }
  if (typeof file === "string") {
    return { ok: true, value: { data: file, encoding: defaultEncoding } };
  }
  if (!isPlainObject(file) || typeof file.data !== "string") {
    return { ok: false, error: "Некорректные данные файла." };
  }
  const encoding = file.encoding || defaultEncoding;
  if (!ALLOWED_ENCODINGS.has(encoding)) {
    return { ok: false, error: "Некорректная кодировка файла." };
  }
  return { ok: true, value: { data: file.data, encoding } };
}

module.exports = {
  isPlainObject,
  parsePositiveInt,
  validateRequiredString,
  validateOptionalString,
  normalizeCapturedAt,
  normalizeMetaJson,
  normalizeFilePayload,
};
