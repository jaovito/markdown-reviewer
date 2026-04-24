type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, scope: string, msg: string, extra?: unknown) {
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "debug"
          ? console.debug
          : console.info;
  if (extra !== undefined) fn(`[${scope}] ${msg}`, extra);
  else fn(`[${scope}] ${msg}`);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, extra?: unknown) => emit("debug", scope, msg, extra),
    info: (msg: string, extra?: unknown) => emit("info", scope, msg, extra),
    warn: (msg: string, extra?: unknown) => emit("warn", scope, msg, extra),
    error: (msg: string, extra?: unknown) => emit("error", scope, msg, extra),
  };
}
