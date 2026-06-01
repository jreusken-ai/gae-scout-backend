// anthropicClient.js — Veilige Anthropic API wrapper met retry, timeout en web search

import axios from 'axios';
import { logger } from './logger.js';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const MODEL          = 'claude-3-haiku-20240307';
const TIMEOUT_MS     = 60_000; // 60 seconden
const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 2_000;

// Retryable HTTP status codes
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Stuurt een request naar de Anthropic messages API.
 * Herprobeert automatisch bij rate limits en tijdelijke fouten.
 *
 * @param {string}   apiKey
 * @param {string}   system
 * @param {string}   userMessage
 * @param {number}   maxTokens
 * @returns {Promise<string>} — ruwe tekst uit de Claude response
 */
export async function callClaude(apiKey, system, userMessage, maxTokens = 4000) {
  const headers = {
    'Content-Type':    'application/json',
    'x-api-key':       apiKey,
    'anthropic-version': '2023-06-01',
  };

  const body = {
    model:      MODEL,
    max_tokens: maxTokens,
    system,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
      },
    ],
    messages: [
      { role: 'user', content: userMessage },
    ],
  };

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Claude API aanroep`, { attempt, model: MODEL });

      const response = await axios.post(`${ANTHROPIC_BASE}/messages`, body, {
        headers,
        timeout: TIMEOUT_MS,
      });

      const content = response.data?.content;
      if (!Array.isArray(content)) {
        throw new Error('Onverwachte response structuur van Anthropic API');
      }

      // Verzamel alle text blocks — Claude kan meerdere text blokken teruggeven
      // na tool_use (web_search) blokken
      const textBlocks = content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      if (!textBlocks) {
        throw new Error('Claude gaf geen text terug in de response');
      }

      logger.info('Claude API response ontvangen', {
        blocks:    content.length,
        textLen:   textBlocks.length,
        stopReason: response.data?.stop_reason,
        usage:     response.data?.usage,
      });

      return textBlocks;

    } catch (err) {
      lastError = err;

      // Axios HTTP error
      if (err.response) {
        const status = err.response.status;
        const errBody = err.response.data;

        logger.warn(`Anthropic API HTTP fout`, {
          attempt,
          status,
          error: errBody?.error?.message || JSON.stringify(errBody),
        });

        // Niet retryable (bv 400 bad request, 401 unauthorized)
        if (!RETRYABLE.has(status)) {
          throw new Error(
            `Anthropic API fout ${status}: ${errBody?.error?.message || 'Onbekende fout'}`
          );
        }

        // Rate limit — respecteer Retry-After header indien aanwezig
        const retryAfter = err.response.headers?.['retry-after'];
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY_MS * attempt;

        logger.info(`Wacht ${delay}ms voor retry`, { attempt, status });
        await sleep(delay);
        continue;
      }

      // Timeout
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        logger.warn(`Timeout op poging ${attempt}`, { timeout: TIMEOUT_MS });
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`Timeout: Claude reageerde niet binnen ${TIMEOUT_MS / 1000} seconden`);
      }

      // Netwerk fout
      if (err.request) {
        logger.warn(`Netwerk fout op poging ${attempt}`, { message: err.message });
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error('Kan Anthropic API niet bereiken. Controleer je internetverbinding.');
      }

      // Andere fout — niet retryable
      throw err;
    }
  }

  throw lastError || new Error('Alle retry pogingen mislukt');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
