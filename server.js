// server.js — GAE Scout Intelligence Backend v2.0

import 'dotenv/config';
import express          from 'express';
import cors             from 'cors';
import rateLimit        from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

import { logger }          from './logger.js';
import { callClaude }      from './anthropicClient.js';
import { extractJSON }     from './jsonSanitizer.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001;

// ── VALIDATIE API KEY BIJ OPSTARTEN ────────────────────────
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY || !API_KEY.startsWith('sk-ant-')) {
  logger.error('ANTHROPIC_API_KEY ontbreekt of is ongeldig in .env');
  logger.error('Voeg ANTHROPIC_API_KEY=sk-ant-... toe aan je .env bestand');
  process.exit(1);
}

// ── CORS ───────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Voeg altijd localhost toe voor development
['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3001']
  .forEach(o => { if (!allowedOrigins.includes(o)) allowedOrigins.push(o); });

app.use(cors({
  origin: (origin, callback) => {
    // Sta requests zonder origin toe (bv. Postman, curl, of same-origin via Express static)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn('CORS geblokkeerd', { origin });
    callback(new Error(`CORS: origin '${origin}' is niet toegestaan`));
  },
  methods:     ['GET', 'POST'],
  credentials: false,
}));

// ── RATE LIMITING ──────────────────────────────────────────
const limiter = rateLimit({
  windowMs:        15 * 60 * 1000,                             // 15 minuten
  max:             parseInt(process.env.RATE_LIMIT_MAX) || 20, // aanvragen per IP
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => {
    logger.warn('Rate limit bereikt', { ip: req.ip });
    res.status(429).json({
      error: 'Te veel aanvragen. Wacht 15 minuten en probeer opnieuw.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.static(join(__dirname, '..', 'frontend', 'public')));

// Request logging
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, { ip: req.ip, ua: req.get('user-agent')?.slice(0, 60) });
  next();
});

// ── HEALTH CHECK ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:       'ok',
    version:      '2.0.0',
    model:        'claude-sonnet-4-20250514',
    environment:  process.env.NODE_ENV || 'development',
    apiConfigured: true, // key is al gevalideerd bij opstarten
  });
});

// ── SCOUT ENDPOINT ─────────────────────────────────────────
app.post('/api/scout', limiter, async (req, res) => {
  const { naam, positie = '', competitie = '', nummer = 50 } = req.body;

  // Validatie
  if (!naam || typeof naam !== 'string' || naam.trim().length < 2) {
    return res.status(400).json({ error: 'Ongeldige of ontbrekende spelernaam' });
  }

  const cleanNaam       = naam.trim().slice(0, 100);
  const cleanPositie    = (positie   || '').trim().slice(0, 50);
  const cleanCompetitie = (competitie|| '').trim().slice(0, 80);
  const cleanNummer     = parseInt(nummer) || 50;

  logger.info('Scout aanvraag ontvangen', {
    naam: cleanNaam,
    positie: cleanPositie,
    competitie: cleanCompetitie,
    nummer: cleanNummer,
  });

  const startTime = Date.now();

  try {
    // Bouw user message
    const userMessage = buildUserMessage(
      cleanNaam, cleanPositie, cleanCompetitie, cleanNummer
    );

    // Roep Claude aan (met retry en timeout)
    const rawText = await callClaude(API_KEY, SYSTEM_PROMPT, userMessage);

    // Extraheer en valideer JSON
    const { data: rapport, warnings } = extractJSON(rawText);

    const elapsed = Date.now() - startTime;
    logger.info('Rapport succesvol gegenereerd', {
      naam:     rapport.naam,
      nummer:   rapport.nummer,
      elapsed:  `${elapsed}ms`,
      warnings: warnings.length,
    });

    res.json({
      success:  true,
      rapport,
      meta: {
        elapsed,
        warnings: warnings.length ? warnings : undefined,
      },
    });

  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error('Scout aanvraag mislukt', {
      naam:    cleanNaam,
      elapsed: `${elapsed}ms`,
      error:   err.message,
    });

    // Bepaal HTTP status op basis van fouttype
    let status = 500;
    if (err.message.includes('Timeout'))       status = 504;
    if (err.message.includes('Rate limit'))    status = 429;
    if (err.message.includes('API fout 4'))    status = 502;

    res.status(status).json({
      error:   err.message || 'Intern serverfout bij genereren rapport',
      elapsed,
    });
  }
});

// ── 404 HANDLER ────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route niet gevonden: ${req.path}` });
});

// ── FALLBACK: dien frontend voor alle andere routes ────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'frontend', 'public', 'index.html'));
});

// ── GLOBALE ERROR HANDLER ──────────────────────────────────
app.use((err, req, res, next) => {
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  logger.error('Onverwachte serverfout', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Onverwachte serverfout' });
});

// ── GRACEFUL SHUTDOWN ──────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM ontvangen — server stopt');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('SIGINT ontvangen — server stopt');
  process.exit(0);
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info('═══════════════════════════════════════════════');
  logger.info('  GAE Scout Intelligence — Server v2.0');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`  URL:         http://localhost:${PORT}`);
  logger.info(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`  API key:     ✓ geconfigureerd`);
  logger.info(`  CORS:        ${allowedOrigins.join(', ')}`);
  logger.info('═══════════════════════════════════════════════');
});
