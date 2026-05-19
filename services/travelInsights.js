const gemini = require('./gemini');

const FRESH_TTL_MS = Number(process.env.TRAVEL_INSIGHTS_CACHE_TTL_MS || 10 * 60 * 1000);
const LAST_KNOWN_GOOD_TTL_MS = Number(process.env.TRAVEL_INSIGHTS_LAST_KNOWN_GOOD_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const TRAVEL_INTEL_FRESH_TTL_MS = Number(process.env.TRAVEL_INTEL_CACHE_TTL_MS || 12 * 60 * 60 * 1000);
const TRAVEL_INTEL_LAST_KNOWN_GOOD_TTL_MS = Number(process.env.TRAVEL_INTEL_LAST_KNOWN_GOOD_TTL_MS || 7 * 24 * 60 * 60 * 1000);

const funScoreFreshCache = new Map();
const funScoreLastKnownGoodCache = new Map();
const bookingFreshCache = new Map();
const bookingLastKnownGoodCache = new Map();
const travelIntelFreshCache = new Map();
const travelIntelLastKnownGoodCache = new Map();

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
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

function buildFunScoreKey(options = {}) {
  return JSON.stringify({
    destination: String(options.destination || '').toUpperCase(),
    dateRange: options.dateRange || null,
    dimensions: gemini.normalizeFunScoreDimensions(options.dimensions || {})
  });
}

function buildBookingKey(options = {}) {
  return JSON.stringify({
    origin: String(options.origin || '').toUpperCase(),
    destination: String(options.destination || '').toUpperCase(),
    targetMonth: options.targetMonth || null
  });
}

function buildTravelIntelKey(options = {}) {
  return JSON.stringify({
    origin: String(options.origin || '').toUpperCase(),
    destination: String(options.destination || '').toUpperCase(),
    dateRange: options.dateRange || null
  });
}

async function getTravelInsights(options = {}) {
  const persistFunScore = options.persistFunScore !== false;
  const persistBookingAdvice = options.persistBookingAdvice !== false;
  const funKey = options.includeFunScore ? buildFunScoreKey(options) : null;
  const bookingKey = options.includeBookingAdvice ? buildBookingKey(options) : null;
  const freshFun = funKey ? getCacheEntry(funScoreFreshCache, funKey, FRESH_TTL_MS) : null;
  const freshBooking = bookingKey ? getCacheEntry(bookingFreshCache, bookingKey, FRESH_TTL_MS) : null;

  if ((!options.includeFunScore || freshFun) && (!options.includeBookingAdvice || freshBooking)) {
    return {
      funScore: freshFun || null,
      bookingAdvice: freshBooking || null,
      meta: {
        cached: true,
        stale: false,
        live: false,
        sourceTier: 'fresh-cache'
      }
    };
  }

  const liveResult = await gemini.getTravelInsights({
    context: options.context || {},
    dimensions: options.dimensions || {},
    priceHistory: options.priceHistory || null,
    trendData: options.trendData || null,
    bookingFallback: options.bookingFallback || {}
  });

  const hasRequestedFun = !options.includeFunScore || Boolean(liveResult?.funScore);
  const hasRequestedBooking = !options.includeBookingAdvice || Boolean(liveResult?.bookingAdvice);

  if (liveResult?._transport?.live && hasRequestedFun && hasRequestedBooking) {
    if (persistFunScore && options.includeFunScore && funKey && liveResult.funScore) {
      setCacheEntry(funScoreFreshCache, funKey, liveResult.funScore);
      setCacheEntry(funScoreLastKnownGoodCache, funKey, liveResult.funScore);
    }
    if (persistBookingAdvice && options.includeBookingAdvice && bookingKey && liveResult.bookingAdvice) {
      setCacheEntry(bookingFreshCache, bookingKey, liveResult.bookingAdvice);
      setCacheEntry(bookingLastKnownGoodCache, bookingKey, liveResult.bookingAdvice);
    }

    return {
      funScore: options.includeFunScore ? liveResult.funScore : null,
      bookingAdvice: options.includeBookingAdvice ? liveResult.bookingAdvice : null,
      meta: {
        cached: false,
        stale: false,
        live: true,
        sourceTier: 'live'
      }
    };
  }

  const staleFun = funKey ? getCacheEntry(funScoreLastKnownGoodCache, funKey, LAST_KNOWN_GOOD_TTL_MS) : null;
  const staleBooking = bookingKey ? getCacheEntry(bookingLastKnownGoodCache, bookingKey, LAST_KNOWN_GOOD_TTL_MS) : null;

  if ((!options.includeFunScore || staleFun) && (!options.includeBookingAdvice || staleBooking)) {
    return {
      funScore: staleFun || null,
      bookingAdvice: staleBooking || null,
      meta: {
        cached: true,
        stale: true,
        live: false,
        sourceTier: 'last-known-good',
        error: liveResult?._transport?.error || null
      }
    };
  }

  return {
    funScore: options.includeFunScore ? liveResult.funScore : null,
    bookingAdvice: options.includeBookingAdvice ? liveResult.bookingAdvice : null,
    meta: {
      cached: false,
      stale: false,
      live: false,
      sourceTier: 'fallback',
      error: liveResult?._transport?.error || null
    }
  };
}

async function getTravelIntel(options = {}) {
  const key = buildTravelIntelKey(options);
  const freshEntry = getCacheEntry(travelIntelFreshCache, key, TRAVEL_INTEL_FRESH_TTL_MS);
  if (freshEntry) {
    return {
      travelIntel: freshEntry,
      meta: {
        cached: true,
        stale: false,
        live: false,
        sourceTier: 'fresh-cache'
      }
    };
  }

  const liveResult = await gemini.getTravelIntelAnalysis({
    origin: options.origin || null,
    destination: options.destination || null,
    dateRange: options.dateRange || null,
    route: options.route || 'travelintel'
  });

  if (liveResult?._transport?.live) {
    setCacheEntry(travelIntelFreshCache, key, liveResult);
    setCacheEntry(travelIntelLastKnownGoodCache, key, liveResult);
    return {
      travelIntel: liveResult,
      meta: {
        cached: false,
        stale: false,
        live: true,
        sourceTier: 'live'
      }
    };
  }

  const staleEntry = getCacheEntry(travelIntelLastKnownGoodCache, key, TRAVEL_INTEL_LAST_KNOWN_GOOD_TTL_MS);
  if (staleEntry) {
    return {
      travelIntel: staleEntry,
      meta: {
        cached: true,
        stale: true,
        live: false,
        sourceTier: 'last-known-good',
        error: liveResult?._transport?.error || null
      }
    };
  }

  return {
    travelIntel: liveResult,
    meta: {
      cached: false,
      stale: false,
      live: false,
      sourceTier: 'fallback',
      error: liveResult?._transport?.error || null
    }
  };
}

module.exports = {
  getTravelInsights,
  getTravelIntel,
  peekTravelIntel(options = {}) {
    const key = buildTravelIntelKey(options);
    const freshEntry = getCacheEntry(travelIntelFreshCache, key, TRAVEL_INTEL_FRESH_TTL_MS);
    if (freshEntry) {
      return {
        travelIntel: freshEntry,
        meta: {
          cached: true,
          stale: false,
          live: false,
          sourceTier: 'fresh-cache'
        }
      };
    }

    const staleEntry = getCacheEntry(travelIntelLastKnownGoodCache, key, TRAVEL_INTEL_LAST_KNOWN_GOOD_TTL_MS);
    if (staleEntry) {
      return {
        travelIntel: staleEntry,
        meta: {
          cached: true,
          stale: true,
          live: false,
          sourceTier: 'last-known-good'
        }
      };
    }

    return null;
  }
};
