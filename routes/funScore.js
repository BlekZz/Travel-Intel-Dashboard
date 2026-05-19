const express = require('express');
const router = express.Router();
const gemini = require('../services/gemini');
const quotaTracker = require('../services/quotaTracker');
const travelInsights = require('../services/travelInsights');

const REQUIRED_DIMENSIONS = ['shopping', 'relaxation', 'luxury', 'food', 'sightseeing', 'value', 'festival'];
const policy = quotaTracker.getUiPolicy('funScore');
const FRESH_CACHE_TTL_MS = 10 * 60 * 1000;
const LAST_KNOWN_GOOD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const freshCache = new Map();
const lastKnownGoodCache = new Map();

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildCacheKey(destination, dates, dimensions) {
  return JSON.stringify({
    destination: String(destination || '').toUpperCase(),
    dates: dates || null,
    dimensions: gemini.normalizeFunScoreDimensions(dimensions)
  });
}

function getCacheEntry(store, key, ttlMs) {
  const entry = store.get(key);
  if (!entry) return null;
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

function attachMeta(payload, meta = {}) {
  return {
    ...payload,
    meta: {
      provider: meta.provider || 'gemini.fun-score',
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

  return Number(fallbackMs || 15000);
}

function observeQuotaFromErrorMessage(message) {
  const text = String(message || '');
  const quotaValueMatch = text.match(/"quotaValue":"(\d+)"/i);
  if (quotaValueMatch) {
    quotaTracker.observeProviderLimit('gemini', 'requestsPerDay', Number(quotaValueMatch[1]));
  }
}

function buildRouteFallback(dimensions, note, meta = {}) {
  return attachMeta(gemini.buildFunScoreFallback(dimensions, {
    note,
    data_confidence: 'low',
    sources: []
  }), meta);
}

function validateDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    return 'Missing dimensions payload';
  }

  const normalized = gemini.normalizeFunScoreDimensions(dimensions);
  const total = REQUIRED_DIMENSIONS.reduce((sum, key) => sum + normalized[key], 0);

  if (total !== 100) {
    return 'Dimensions total must equal 100';
  }

  return null;
}

router.post('/fun-score', async (req, res) => {
  const { destination, dates, dimensions } = req.body || {};
  const cacheKey = buildCacheKey(destination, dates, dimensions);
  const attempts = [];

  if (!destination) {
    return res.status(400).json(buildRouteFallback(dimensions, '缺少目的地，無法計算好玩指數。', {
      provider: 'fun-score.validation',
      fallbackUsed: true,
      sourceTier: 'validation-fallback'
    }));
  }

  const validationError = validateDimensions(dimensions);
  if (validationError) {
    return res.status(400).json(buildRouteFallback(dimensions, validationError, {
      provider: 'fun-score.validation',
      fallbackUsed: true,
      sourceTier: 'validation-fallback'
    }));
  }

  const freshEntry = getCacheEntry(freshCache, cacheKey, FRESH_CACHE_TTL_MS);
  if (freshEntry) {
    return res.json(attachMeta(freshEntry, {
      provider: 'gemini.fun-score',
      cached: true,
      stale: false,
      fallbackUsed: false,
      sourceTier: 'fresh-cache',
      attempts: [{ provider: 'gemini.fun-score', status: 'fresh-cache-hit' }]
    }));
  }

  const cooldown = quotaTracker.checkAndBumpCooldown('fun-score', Number(policy.cooldownMs || 15000));
  if (!cooldown.allowed) {
    const staleEntry = getCacheEntry(lastKnownGoodCache, cacheKey, LAST_KNOWN_GOOD_TTL_MS);
    if (staleEntry) {
      return res.json(attachMeta(staleEntry, {
        provider: 'gemini.fun-score',
        cached: true,
        stale: true,
        fallbackUsed: true,
        sourceTier: 'cooldown-last-known-good',
        retryAfterMs: cooldown.retryAfterMs,
        nextRetryAt: cooldown.nextAllowedAt,
        attempts: [{ provider: 'gemini.fun-score', status: 'cooldown-last-known-good' }]
      }));
    }

    return res.json(buildRouteFallback(dimensions, 'AI 評分暫時進入冷卻時間，稍後會再嘗試一次 live 請求。', {
      provider: 'gemini.fun-score',
      fallbackUsed: true,
      sourceTier: 'cooldown-fallback',
      retryAfterMs: cooldown.retryAfterMs,
      nextRetryAt: cooldown.nextAllowedAt,
      attempts: [{ provider: 'gemini.fun-score', status: 'cooldown-fallback' }]
    }));
  }

  try {
    const context = { destination, dates: dates || null };
    const result = await travelInsights.getTravelInsights({
      includeFunScore: true,
      includeBookingAdvice: false,
      destination,
      dateRange: dates || null,
      dimensions,
      context
    });
    if (result?.funScore) {
      const payload = gemini.normalizeFunScoreResponse(result.funScore, dimensions);
      if (result?.meta?.live) {
        setCacheEntry(freshCache, cacheKey, payload);
        setCacheEntry(lastKnownGoodCache, cacheKey, payload);
      }
      attempts.push({ provider: 'gemini.fun-score', status: result?.meta?.sourceTier || 'ok' });
      return res.json(attachMeta(payload, {
        provider: 'gemini.fun-score',
        cached: Boolean(result?.meta?.cached),
        stale: Boolean(result?.meta?.stale),
        fallbackUsed: !Boolean(result?.meta?.live),
        sourceTier: result?.meta?.sourceTier || 'live',
        attempts
      }));
    }

    attempts.push({
      provider: 'gemini.fun-score',
      status: 'live-failed',
      message: result?.meta?.error || 'unknown-error'
    });
    observeQuotaFromErrorMessage(result?.meta?.error);
    const retryAfterMs = parseRetryAfterMs(result?.meta?.error, policy.fallbackRetryAfterMs || 15000);
    const staleEntry = getCacheEntry(lastKnownGoodCache, cacheKey, LAST_KNOWN_GOOD_TTL_MS);
    if (staleEntry) {
      attempts.push({ provider: 'gemini.fun-score', status: 'last-known-good-ok' });
      return res.json(attachMeta(staleEntry, {
        provider: 'gemini.fun-score',
        cached: true,
        stale: true,
        fallbackUsed: true,
        sourceTier: 'last-known-good',
        retryAfterMs,
        nextRetryAt: new Date(Date.now() + retryAfterMs).toISOString(),
        attempts
      }));
    }

    return res.json(buildRouteFallback(dimensions, 'AI 服務暫時不可用，已回傳保底分析結構。', {
      provider: 'gemini.fun-score',
      fallbackUsed: true,
      sourceTier: 'deterministic-fallback',
      retryAfterMs,
      nextRetryAt: new Date(Date.now() + retryAfterMs).toISOString(),
      attempts
    }));
  } catch (error) {
    console.error('Error in /api/fun-score:', error.message);
    res.status(200).json(buildRouteFallback(dimensions, 'AI 服務暫時不可用，已回傳保底分析結構。', {
      provider: 'gemini.fun-score',
      fallbackUsed: true,
      sourceTier: 'route-fallback',
      retryAfterMs: Number(policy.fallbackRetryAfterMs || 15000),
      nextRetryAt: new Date(Date.now() + Number(policy.fallbackRetryAfterMs || 15000)).toISOString(),
      attempts: [{ provider: 'gemini.fun-score', status: 'route-error', message: error.message }]
    }));
  }
});

module.exports = router;
