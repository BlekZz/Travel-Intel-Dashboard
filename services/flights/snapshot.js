const flightsService = require('./index');

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toIsoDate(value, fallback = '2025-08-15') {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : fallback;
}

function addDays(dateString, days) {
  const date = new Date(`${toIsoDate(dateString)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateString, months) {
  const date = new Date(`${toIsoDate(dateString)}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function average(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (numeric.length === 0) {
    return null;
  }
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function buildSignature(prices = [], meta = {}) {
  const slice = prices.slice(0, 8).map((value) => Math.round(Number(value) || 0)).join(',');
  return hashString([
    meta.provider || 'unknown',
    meta.generatedAt || '',
    slice
  ].join('|'));
}

async function getFlightSnapshot(params = {}) {
  const searchParams = {
    origin: String(params.origin || 'TPE').toUpperCase(),
    destination: String(params.destination || 'NRT').toUpperCase(),
    departureDate: toIsoDate(params.departureDate),
    adults: String(params.adults || '1'),
    cabin: params.cabin || 'economy',
    maxStops: params.maxStops ?? '1',
    currency: params.currency || 'TWD',
    language: params.language || 'zh-tw',
    country: params.country || 'tw'
  };

  const result = await flightsService.searchFlights(searchParams);
  const prices = Array.isArray(result.flights)
    ? result.flights.map((flight) => Number(flight.price)).filter(Number.isFinite)
    : [];

  return {
    query: searchParams,
    flights: result.flights || [],
    avgPrice: average(prices),
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    signature: buildSignature(prices, result.meta),
    meta: result.meta || {}
  };
}

module.exports = {
  addDays,
  addMonths,
  getFlightSnapshot,
  hashString,
  toIsoDate
};
