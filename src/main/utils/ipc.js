function ok(data) {
  return { ok: true, data };
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function wrapIpc(channel, handler) {
  return async (_event, ...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error(`[IPC] ${channel} failed:`, error);
      return fail("INTERNAL_ERROR", "Неожиданная ошибка.");
    }
  };
}

module.exports = {
  ok,
  fail,
  wrapIpc,
};
