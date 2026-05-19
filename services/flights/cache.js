const SHORT_TTL_MS = Number(process.env.FLIGHT_CACHE_TTL_MS || 5 * 60 * 1000);
const LAST_KNOWN_GOOD_TTL_MS = Number(process.env.FLIGHT_LAST_KNOWN_GOOD_TTL_MS || 24 * 60 * 60 * 1000);

const shortTtlCache = new Map();
const lastKnownGoodCache = new Map();

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((accumulator, key) => {
      const nextValue = value[key];
      if (nextValue !== undefined) {
        accumulator[key] = normalizeValue(nextValue);
      }
      return accumulator;
    }, {});
  }

  return value;
}

function buildCacheKey(params = {}) {
  return JSON.stringify(normalizeValue({
    origin: String(params.origin || 'TPE').toUpperCase(),
    destination: String(params.destination || 'NRT').toUpperCase(),
    departureDate: params.departureDate || '',
    returnDate: params.returnDate || '',
    adults: params.adults || '1',
    cabin: params.cabin || 'economy',
    maxStops: params.maxStops ?? '',
    currency: params.currency || 'TWD',
    language: params.language || 'zh-tw',
    country: params.country || 'tw'
  }));
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function getFreshEntry(store, key, ttlMs) {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }

  if ((Date.now() - entry.savedAt) > ttlMs) {
    store.delete(key);
    return null;
  }

  return cloneValue(entry);
}

function getShortTtl(params = {}) {
  return getFreshEntry(shortTtlCache, buildCacheKey(params), SHORT_TTL_MS);
}

function getLastKnownGood(params = {}) {
  return getFreshEntry(lastKnownGoodCache, buildCacheKey(params), LAST_KNOWN_GOOD_TTL_MS);
}

function saveShortTtl(params = {}, payload) {
  shortTtlCache.set(buildCacheKey(params), {
    savedAt: Date.now(),
    payload: cloneValue(payload)
  });
}

function saveLastKnownGood(params = {}, payload) {
  lastKnownGoodCache.set(buildCacheKey(params), {
    savedAt: Date.now(),
    payload: cloneValue(payload)
  });
}

module.exports = {
  buildCacheKey,
  getShortTtl,
  getLastKnownGood,
  saveShortTtl,
  saveLastKnownGood
};
