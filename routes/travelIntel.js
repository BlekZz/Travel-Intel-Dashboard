const express = require('express');
const router = express.Router();
const gemini = require('../services/gemini');
const quotaTracker = require('../services/quotaTracker');
const travelInsights = require('../services/travelInsights');

const policy = quotaTracker.getUiPolicy('travelIntel');
const ROUTE_KEY = 'travelintel';

function normalizeDateRange(startDateRaw, endDateRaw) {
  const start = typeof startDateRaw === 'string' && startDateRaw.trim() ? startDateRaw.trim() : null;
  const end = typeof endDateRaw === 'string' && endDateRaw.trim() ? endDateRaw.trim() : null;
  return { start, end };
}

function attachMeta(payload, meta = {}) {
  const output = payload && typeof payload === 'object' ? { ...payload } : {};
  delete output._transport;
  return {
    ...output,
    meta: {
      provider: meta.provider || 'gemini.travelintel',
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

router.get('/travelintel', async (req, res) => {
  const origin = String(req.query.origin || 'TPE').toUpperCase();
  const destination = String(req.query.destination || '').toUpperCase();
  const dateRange = normalizeDateRange(req.query.startDate, req.query.endDate);
  const attempts = [];

  if (!destination || !dateRange.start || !dateRange.end) {
    return res.status(400).json(attachMeta(
      gemini.buildTravelIntelFallback({ destination, dateRange }, {
        summary: '缺少旅遊地點或日期區間，無法建立 travelintel 分析。'
      }),
      {
        provider: 'travelintel.validation',
        fallbackUsed: true,
        sourceTier: 'validation-fallback'
      }
    ));
  }

  const cachedResult = travelInsights.peekTravelIntel({
    origin,
    destination,
    dateRange,
    route: 'travelintel'
  });
  if (cachedResult && cachedResult.travelIntel) {
    return res.json(attachMeta(cachedResult.travelIntel, {
      provider: 'gemini.travelintel',
      cached: Boolean(cachedResult.meta.cached),
      stale: Boolean(cachedResult.meta.stale),
      fallbackUsed: Boolean(cachedResult.meta.stale),
      sourceTier: cachedResult.meta.sourceTier,
      attempts: [{ provider: 'gemini.travelintel', status: cachedResult.meta.sourceTier }]
    }));
  }

  const cooldown = quotaTracker.checkAndBumpCooldown(ROUTE_KEY, Number(policy.cooldownMs || 30000));
  if (!cooldown.allowed) {
    return res.json(attachMeta(
      gemini.buildTravelIntelFallback({ destination, dateRange }, {
        summary: 'Travelintel 目前進入冷卻時間，稍後會再嘗試 live 分析。'
      }),
      {
        provider: 'gemini.travelintel',
        fallbackUsed: true,
        sourceTier: 'cooldown-fallback',
        retryAfterMs: cooldown.retryAfterMs,
        nextRetryAt: cooldown.nextAllowedAt,
        attempts: [{ provider: 'gemini.travelintel', status: 'cooldown-fallback' }]
      }
    ));
  }

  try {
    const result = await travelInsights.getTravelIntel({
      origin,
      destination,
      dateRange,
      route: 'travelintel'
    });

    attempts.push({ provider: 'gemini.travelintel', status: result?.meta?.sourceTier || 'unknown' });

    if (result?.travelIntel) {
      const fallbackUsed = result?.meta?.stale || result?.meta?.sourceTier === 'fallback';
      const retryAfterMs = fallbackUsed
        ? parseRetryAfterMs(result?.meta?.error, policy.fallbackRetryAfterMs || 30000)
        : 0;
      if (result?.meta?.error) {
        observeQuotaFromErrorMessage(result.meta.error);
      }

      return res.json(attachMeta(result.travelIntel, {
        provider: 'gemini.travelintel',
        cached: Boolean(result?.meta?.cached),
        stale: Boolean(result?.meta?.stale),
        fallbackUsed,
        sourceTier: result?.meta?.sourceTier || 'live',
        retryAfterMs,
        nextRetryAt: retryAfterMs ? new Date(Date.now() + retryAfterMs).toISOString() : null,
        attempts
      }));
    }

    return res.json(attachMeta(
      gemini.buildTravelIntelFallback({ destination, dateRange }),
      {
        provider: 'gemini.travelintel',
        fallbackUsed: true,
        sourceTier: 'route-fallback',
        retryAfterMs: Number(policy.fallbackRetryAfterMs || 30000),
        nextRetryAt: new Date(Date.now() + Number(policy.fallbackRetryAfterMs || 30000)).toISOString(),
        attempts
      }
    ));
  } catch (error) {
    console.error('Error in /api/travelintel:', error.message);
    observeQuotaFromErrorMessage(error.message);
    return res.status(200).json(attachMeta(
      gemini.buildTravelIntelFallback({ destination, dateRange }),
      {
        provider: 'gemini.travelintel',
        fallbackUsed: true,
        sourceTier: 'route-error',
        retryAfterMs: Number(policy.fallbackRetryAfterMs || 30000),
        nextRetryAt: new Date(Date.now() + Number(policy.fallbackRetryAfterMs || 30000)).toISOString(),
        attempts: [{ provider: 'gemini.travelintel', status: 'route-error', message: error.message }]
      }
    ));
  }
});

module.exports = router;
