const express = require('express');
const router = express.Router();
const gemini = require('../services/gemini');
const quotaTracker = require('../services/quotaTracker');
const travelInsights = require('../services/travelInsights');

const FRESH_CACHE_TTL_MS = Number(process.env.BOOKING_ADVICE_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const LAST_KNOWN_GOOD_TTL_MS = Number(process.env.BOOKING_ADVICE_LAST_KNOWN_GOOD_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const policy = quotaTracker.getUiPolicy('bookingAdvice');
const freshCache = new Map();
const lastKnownGoodCache = new Map();

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeMonth(targetMonthRaw) {
  if (!targetMonthRaw) {
    return '2025-08';
  }

  const match = String(targetMonthRaw).match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return '2025-08';
  }

  const year = match[1];
  const month = String(Math.min(12, Math.max(1, Number.parseInt(match[2], 10)))).padStart(2, '0');
  return `${year}-${month}`;
}

function hasGeminiKey() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim() || String(process.env.GEMINI_API_KEY_SECONDARY || '').trim());
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildCacheKey(origin, destination, targetMonth) {
  return `${String(origin || 'TPE').toUpperCase()}::${String(destination || 'NRT').toUpperCase()}::${targetMonth}`;
}

function getCacheEntry(store, key, ttlMs) {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }

  if ((Date.now() - entry.savedAt) > ttlMs) {
    store.delete(key);
    return null;
  }

  return cloneValue(entry.payload);
}

function setCacheEntry(store, key, payload) {
  store.set(key, {
    savedAt: Date.now(),
    payload: cloneValue(payload)
  });
}

function stripTransport(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const next = { ...payload };
  delete next._transport;
  return next;
}

function attachMeta(payload, meta = {}) {
  return {
    ...stripTransport(payload),
    meta: {
      provider: meta.provider || 'booking-advice',
      generatedAt: meta.generatedAt || new Date().toISOString(),
      cached: Boolean(meta.cached),
      stale: Boolean(meta.stale),
      fallbackUsed: Boolean(meta.fallbackUsed),
      sourceTier: meta.sourceTier || 'unknown',
      retryAfterMs: Number(meta.retryAfterMs || 0),
      nextRetryAt: meta.nextRetryAt || null,
      attempts: Array.isArray(meta.attempts) ? meta.attempts : []
    }
  };
}

function parseRetryAfterMs(message, fallbackMs) {
  const text = String(message || '');
  const secondsMatch = text.match(/retry in\s+([0-9.]+)s/i);
  if (secondsMatch) {
    return Math.max(1000, Math.round(Number(secondsMatch[1]) * 1000));
  }

  const retryDelayMatch = text.match(/"retryDelay":"(\d+)s"/i);
  if (retryDelayMatch) {
    return Math.max(1000, Number(retryDelayMatch[1]) * 1000);
  }

  return Number(fallbackMs || 30000);
}

function observeQuotaFromErrorMessage(message) {
  const text = String(message || '');
  const quotaValueMatch = text.match(/"quotaValue":"(\d+)"/i);
  if (quotaValueMatch) {
    quotaTracker.observeProviderLimit('gemini', 'requestsPerDay', Number(quotaValueMatch[1]));
  }
}

function buildAnalysisContext(origin, destination, targetMonth, fallbackAdvice) {
  return {
    route: {
      origin,
      destination,
      targetMonth
    },
    baseline: {
      currentPriceLevel: fallbackAdvice.currentPriceLevel,
      currentPriceDeviationPct: fallbackAdvice.currentPriceDeviationPct,
      targetPriceTwd: fallbackAdvice.targetPriceTwd
    },
    note: 'Use live web-grounded evidence when available. Treat baseline values as deterministic local fallback, not authoritative market data.'
  };
}

function buildTrendContext(origin, destination, targetMonth) {
  return {
    origin,
    destination,
    targetMonth,
    requestedAt: new Date().toISOString(),
    source: 'route-query-context'
  };
}

function buildDeterministicAdvice(origin, destination, targetMonth) {
  const seed = hashString(`${origin}:${destination}:${targetMonth}:booking-advice`);
  const targetPriceTwd = 8200 + (seed % 4200);
  const deviationRaw = ((seed >>> 4) % 41) - 20;
  const currentPriceDeviationPct = Number((deviationRaw + ((seed % 10) / 10)).toFixed(1));
  const currentPriceLevel = currentPriceDeviationPct >= 12 ? 'high' : currentPriceDeviationPct <= -8 ? 'low' : 'medium';
  const bookingWindows = ['4-6', '5-7', '6-8', '7-9', '8-10'];
  const confidenceLevels = ['medium', 'medium', 'high', 'low'];
  const riskCatalog = [
    '連假需求可能推高短期票價',
    '航空促銷通常集中在出發前 6 至 8 週',
    '熱門時段座位收斂後，價格通常回升',
    '若行程彈性高，平日出發可降低波動風險'
  ];

  return gemini.normalizeBookingAdviceResponse({
    currentPriceLevel,
    currentPriceDeviationPct,
    bestBookingWeeksBefore: bookingWindows[seed % bookingWindows.length],
    targetPriceTwd,
    confidence: confidenceLevels[seed % confidenceLevels.length],
    riskNotes: [
      riskCatalog[seed % riskCatalog.length],
      riskCatalog[(seed >>> 3) % riskCatalog.length]
    ].filter((note, index, array) => array.indexOf(note) === index),
    riskNotes_i18n: {
      zh: [
        riskCatalog[seed % riskCatalog.length],
        riskCatalog[(seed >>> 3) % riskCatalog.length]
      ].filter((note, index, array) => array.indexOf(note) === index),
      en: [
        'Holiday demand can push prices higher in the short term.',
        'Airline promotions often cluster around 6 to 8 weeks before departure.',
        'Once inventory tightens, fares usually rebound.',
        'If your itinerary is flexible, weekday departures can reduce price risk.'
      ].slice(0, 2)
    },
    data_confidence: 'medium',
    sources: ['deterministic-sample://booking-advice-v1']
  }, {
    currentPriceLevel: 'medium',
    data_confidence: 'medium',
    confidence: 'medium'
  });
}

router.get('/booking-advice', async (req, res) => {
  try {
    const origin = req.query.origin || 'TPE';
    const destination = req.query.destination || 'NRT';
    const targetMonth = normalizeMonth(req.query.targetMonth);
    const cacheKey = buildCacheKey(origin, destination, targetMonth);
    const fallback = buildDeterministicAdvice(origin, destination, targetMonth);
    const attempts = [];
    const freshEntry = getCacheEntry(freshCache, cacheKey, FRESH_CACHE_TTL_MS);

    if (freshEntry) {
      return res.json(attachMeta(freshEntry, {
        provider: 'gemini.booking-advice',
        cached: true,
        stale: false,
        fallbackUsed: false,
        sourceTier: 'fresh-cache',
        attempts: [{ provider: 'gemini.booking-advice', status: 'fresh-cache-hit' }]
      }));
    }

    const cooldown = quotaTracker.checkAndBumpCooldown('booking-advice', Number(policy.cooldownMs || 30000));
    if (!cooldown.allowed) {
      const staleEntry = getCacheEntry(lastKnownGoodCache, cacheKey, LAST_KNOWN_GOOD_TTL_MS);
      if (staleEntry) {
        return res.json(attachMeta(staleEntry, {
          provider: 'gemini.booking-advice',
          cached: true,
          stale: true,
          fallbackUsed: true,
          sourceTier: 'cooldown-last-known-good',
          retryAfterMs: cooldown.retryAfterMs,
          nextRetryAt: cooldown.nextAllowedAt,
          attempts: [{ provider: 'gemini.booking-advice', status: 'cooldown-last-known-good' }]
        }));
      }

      return res.json(attachMeta(fallback, {
        provider: 'booking-advice.deterministic-sample',
        cached: false,
        stale: false,
        fallbackUsed: true,
        sourceTier: 'cooldown-deterministic-sample',
        retryAfterMs: cooldown.retryAfterMs,
        nextRetryAt: cooldown.nextAllowedAt,
        attempts: [{ provider: 'gemini.booking-advice', status: 'cooldown-deterministic-sample' }]
      }));
    }

    if (!hasGeminiKey()) {
      const staleEntry = getCacheEntry(lastKnownGoodCache, cacheKey, LAST_KNOWN_GOOD_TTL_MS);
      if (staleEntry) {
        return res.json(attachMeta(staleEntry, {
          provider: 'gemini.booking-advice',
          cached: true,
          stale: true,
          fallbackUsed: true,
          sourceTier: 'last-known-good',
          attempts: [{ provider: 'gemini.booking-advice', status: 'missing-key' }]
        }));
      }

      return res.json(attachMeta(fallback, {
        provider: 'booking-advice.deterministic-sample',
        cached: false,
        stale: false,
        fallbackUsed: true,
        sourceTier: 'deterministic-sample',
        attempts: [{ provider: 'gemini.booking-advice', status: 'missing-key' }]
      }));
    }

    const result = await travelInsights.getTravelInsights({
      includeFunScore: false,
      includeBookingAdvice: true,
      origin,
      destination,
      targetMonth,
      context: buildAnalysisContext(origin, destination, targetMonth, fallback),
      trendData: buildTrendContext(origin, destination, targetMonth),
      bookingFallback: fallback
    });
    if (result?.bookingAdvice) {
      const livePayload = stripTransport(result.bookingAdvice);
      if (result?.meta?.live) {
        setCacheEntry(freshCache, cacheKey, livePayload);
        setCacheEntry(lastKnownGoodCache, cacheKey, livePayload);
      }
      attempts.push({ provider: 'gemini.booking-advice', status: result?.meta?.sourceTier || 'ok' });
      return res.json(attachMeta(livePayload, {
        provider: 'gemini.booking-advice',
        cached: Boolean(result?.meta?.cached),
        stale: Boolean(result?.meta?.stale),
        fallbackUsed: !Boolean(result?.meta?.live),
        sourceTier: result?.meta?.sourceTier || 'live',
        attempts
      }));
    }

    attempts.push({
      provider: 'gemini.booking-advice',
      status: 'live-failed',
      message: result?.meta?.error || 'unknown-error'
    });
    observeQuotaFromErrorMessage(result?.meta?.error);
    const retryAfterMs = parseRetryAfterMs(result?.meta?.error, policy.fallbackRetryAfterMs || 30000);

    const staleEntry = getCacheEntry(lastKnownGoodCache, cacheKey, LAST_KNOWN_GOOD_TTL_MS);
    if (staleEntry) {
      attempts.push({ provider: 'gemini.booking-advice', status: 'last-known-good-ok' });
      return res.json(attachMeta(staleEntry, {
        provider: 'gemini.booking-advice',
        cached: true,
        stale: true,
        fallbackUsed: true,
        sourceTier: 'last-known-good',
        retryAfterMs,
        nextRetryAt: new Date(Date.now() + retryAfterMs).toISOString(),
        attempts
      }));
    }

    attempts.push({ provider: 'booking-advice.deterministic-sample', status: 'deterministic-sample-ok' });
    return res.json(attachMeta(fallback, {
      provider: 'booking-advice.deterministic-sample',
      cached: false,
      stale: false,
      fallbackUsed: true,
      sourceTier: 'deterministic-sample',
      retryAfterMs,
      nextRetryAt: new Date(Date.now() + retryAfterMs).toISOString(),
      attempts
    }));
  } catch (error) {
    console.error('Error in /api/booking-advice:', error.message);
    res.status(200).json(attachMeta(gemini.normalizeBookingAdviceResponse({}, {
      currentPriceLevel: 'medium',
      currentPriceDeviationPct: null,
      bestBookingWeeksBefore: null,
      targetPriceTwd: null,
      confidence: 'low',
      riskNotes: ['目前無法產生購票建議，請稍後再試。'],
      riskNotes_i18n: {
        zh: ['目前無法產生購票建議，請稍後再試。'],
        en: ['Booking advice is temporarily unavailable. Please try again later.']
      },
      data_confidence: 'low',
      sources: []
    }), {
      provider: 'booking-advice.route-fallback',
      cached: false,
      stale: false,
      fallbackUsed: true,
      sourceTier: 'route-fallback',
      attempts: [{ provider: 'booking-advice.route-fallback', status: 'route-error', message: error.message }]
    }));
  }
});

module.exports = router;
