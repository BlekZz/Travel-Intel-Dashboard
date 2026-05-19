const serpapi = require('./serpapi');
const fli = require('./fli');
const { buildFlightFallback } = require('./normalize');
const cache = require('./cache');

function shouldTryNextProvider(error) {
  if (!error) return true;
  if (error.code === 'PROVIDER_NOT_CONFIGURED') return true;
  if (error.code === 'PROVIDER_DISABLED') return true;
  if (error.code === 'PROVIDER_EMPTY') return true;
  if (error.code === 'PROVIDER_RESPONSE_ERROR') return true;
  if (error.code === 'ETIMEDOUT') return true;
  if (error.code === 'ENOENT') return true;
  if (error.cause?.code === 'EACCES') return true;
  if (error.cause?.code === 'ENOTFOUND') return true;
  if (error.cause?.code === 'ECONNREFUSED') return true;
  if (error.cause?.code === 'ECONNRESET') return true;
  if (error.name === 'TypeError' && /fetch failed/i.test(error.message || '')) return true;
  if (error.killed || error.signal === 'SIGTERM') return true;
  if (Number(error.status) === 400) return true;
  if (Number(error.status) === 429) return true;
  return Number(error.status) >= 500;
}

async function tryProvider(providerName, providerFn, params, attempts) {
  try {
    const result = await providerFn(params);
    attempts.push({
      provider: providerName,
      status: 'ok',
      message: `Returned ${result.flights.length} flights.`
    });
    return result;
  } catch (error) {
    attempts.push({
      provider: providerName,
      status: 'error',
      message: error.message
    });

    if (!shouldTryNextProvider(error)) {
      throw error;
    }

    return null;
  }
}

function withMeta(result, overrides = {}) {
  return {
    flights: result.flights,
    meta: {
      provider: result.meta?.provider || 'unknown',
      fallbackUsed: Boolean(result.meta?.fallbackUsed),
      attempts: Array.isArray(result.meta?.attempts) ? result.meta.attempts : [],
      generatedAt: result.meta?.generatedAt || new Date().toISOString(),
      cached: Boolean(result.meta?.cached),
      stale: Boolean(result.meta?.stale),
      ...overrides
    }
  };
}

async function searchFlights(params = {}) {
  const cached = cache.getShortTtl(params);
  if (cached) {
    return withMeta(cached.payload, {
      ...cached.payload.meta,
      cached: true,
      stale: false
    });
  }

  const attempts = [];
  const providers = [
    ['serpapi_google_flights', serpapi.searchFlights],
    ['fli_google_flights', fli.searchFlights]
  ];

  for (const [providerName, providerFn] of providers) {
    const result = await tryProvider(providerName, providerFn, params, attempts);
    if (result) {
      const payload = {
        flights: result.flights,
        meta: {
          provider: result.provider || providerName,
          fallbackUsed: providerName !== providers[0][0],
          attempts,
          generatedAt: new Date().toISOString(),
          cached: false,
          stale: false
        }
      };

      cache.saveShortTtl(params, payload);
      cache.saveLastKnownGood(params, payload);
      return payload;
    }
  }

  const lastKnownGood = cache.getLastKnownGood(params);
  if (lastKnownGood) {
    return withMeta(lastKnownGood.payload, {
      ...lastKnownGood.payload.meta,
      fallbackUsed: true,
      cached: true,
      stale: true,
      provider: `${lastKnownGood.payload.meta?.provider || 'cached'}_last_known_good`,
      attempts: [
        ...attempts,
        {
          provider: 'last_known_good_cache',
          status: 'ok',
          message: 'Returned last known good cached flights.'
        }
      ]
    });
  }

  const payload = {
    flights: buildFlightFallback(params, 'All live flight providers failed or are not configured.'),
    meta: {
      provider: 'deterministic_sample',
      fallbackUsed: true,
      attempts,
      generatedAt: new Date().toISOString(),
      cached: false,
      stale: false
    }
  };

  return payload;
}

module.exports = {
  searchFlights
};
