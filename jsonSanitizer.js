// jsonSanitizer.js — Robuuste JSON extractie uit Claude responses

import { logger } from './logger.js';

/**
 * Extraheert en parsed het eerste volledige JSON-object uit een string.
 * Werkt ook als Claude tekst rondom de JSON plaatst.
 *
 * @param {string} raw - Ruwe tekst van Claude
 * @returns {{ data: Object, warnings: string[] }}
 * @throws {Error} als geen valide JSON gevonden wordt
 */
export function extractJSON(raw) {
  const warnings = [];

  if (!raw || typeof raw !== 'string') {
    throw new Error('Lege of ongeldige response van Claude');
  }

  // Stap 1: strip markdown code fences
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Stap 2: zoek eerste { en laatste }
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    logger.warn('Geen JSON-object gevonden in response', {
      preview: cleaned.slice(0, 200),
    });
    throw new Error('Claude gaf geen JSON terug. Probeer opnieuw.');
  }

  if (start > 0) {
    warnings.push(`Tekst voor JSON genegeerd (${start} tekens)`);
  }
  if (end < cleaned.length - 1) {
    warnings.push(`Tekst na JSON genegeerd (${cleaned.length - end - 1} tekens)`);
  }

  const jsonStr = cleaned.slice(start, end + 1);

  // Stap 3: parse
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (parseErr) {
    // Stap 4: probeer veelvoorkomende fouten te fixen
    logger.warn('JSON parse mislukt — probeer auto-repair', { error: parseErr.message });

    const repaired = jsonStr
      .replace(/,\s*}/g, '}')        // trailing commas
      .replace(/,\s*]/g, ']')        // trailing commas in arrays
      .replace(/\n/g, ' ')           // newlines in strings
      .replace(/[\x00-\x1F\x7F]/g, ''); // control chars

    try {
      data = JSON.parse(repaired);
      warnings.push('JSON auto-repaired (trailing commas / control chars)');
    } catch {
      logger.error('JSON parse definitief mislukt', { preview: jsonStr.slice(0, 500) });
      throw new Error(`Ongeldige JSON van Claude: ${parseErr.message}`);
    }
  }

  // Stap 5: valideer minimale vereiste velden
  const required = ['naam', 'voornaam', 'achternaam', 'positie', 'club'];
  const missing  = required.filter(k => !data[k]);
  if (missing.length) {
    warnings.push(`Ontbrekende velden: ${missing.join(', ')}`);
  }

  if (warnings.length) {
    logger.warn('JSON extractie met waarschuwingen', { warnings });
  }

  return { data, warnings };
}
