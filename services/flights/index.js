const serpapi = require('./serpapi');
const fli = require('./fli');
const { buildFlightFallback } = require('./normalize');

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

async function searchFlights(params = {}) {
  const attempts = [];
  const providers = [
    ['serpapi_google_flights', serpapi.searchFlights],
    ['fli_google_flights', fli.searchFlights]
  ];

  for (const [providerName, providerFn] of providers) {
    const result = await tryProvider(providerName, providerFn, params, attempts);
    if (result) {
      return {
        flights: result.flights,
        meta: {
          provider: result.provider || providerName,
          fallbackUsed: providerName !== providers[0][0],
          attempts
        }
      };
    }
  }

  return {
    flights: buildFlightFallback(params, 'All live flight providers failed or are not configured.'),
    meta: {
      provider: 'deterministic_sample',
      fallbackUsed: true,
      attempts
    }
  };
}

module.exports = {
  searchFlights
};
