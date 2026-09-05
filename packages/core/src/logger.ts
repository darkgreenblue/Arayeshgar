import pino from "pino";

/**
 * Structured JSON logger. Every log line should carry tenant_id / booking_id / platform where
 * relevant so a non-technical operator can paste a line and we can trace it.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "arayeshgar" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "*.token",
      "*.botToken",
      "*.password",
      "*.passwordHash",
      "telegramBotToken",
      "baleBotToken",
    ],
    censor: "[redacted]",
  },
});

export type Logger = typeof logger;
