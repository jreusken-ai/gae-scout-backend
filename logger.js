// logger.js — Gestructureerde console logging met timestamps en levels

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const MIN_LEVEL = process.env.NODE_ENV === 'production' ? LEVELS.INFO : LEVELS.DEBUG;

function format(level, message, meta = {}) {
  const ts = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `[${ts}] [${level.padEnd(5)}] ${message}${metaStr}`;
}

export const logger = {
  debug: (msg, meta) => {
    if (LEVELS.DEBUG >= MIN_LEVEL) console.debug(format('DEBUG', msg, meta));
  },
  info: (msg, meta) => {
    if (LEVELS.INFO >= MIN_LEVEL) console.info(format('INFO', msg, meta));
  },
  warn: (msg, meta) => {
    if (LEVELS.WARN >= MIN_LEVEL) console.warn(format('WARN', msg, meta));
  },
  error: (msg, meta) => {
    if (LEVELS.ERROR >= MIN_LEVEL) console.error(format('ERROR', msg, meta));
  },
};
