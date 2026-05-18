const express = require('express');
const router = express.Router();
const amadeus = require('../services/amadeus');
const weather = require('../services/weather');
const gemini = require('../services/gemini');

const DEFAULT_ORIGIN = 'TPE';
const DEFAULT_DESTINATION = 'NRT';
const DEFAULT_DATE_RANGE = Object.freeze({
  start: '2025-08-01',
  end: '2025-08-07'
});
const DEFAULT_FUN_SCORE_DIMENSIONS = Object.freeze({
  shopping: 15,
  relaxation: 15,
  luxury: 10,
  food: 20,
  sightseeing: 20,
  value: 10,
  festival: 10
});

function parseDateRange(rawDateRange) {
  if (!rawDateRange) {
    return { ...DEFAULT_DATE_RANGE };
  }

  try {
    const parsed = typeof rawDateRange === 'string' ? JSON.parse(rawDateRange) : rawDateRange;
    const start = typeof parsed?.start === 'string' && parsed.start.trim() ? parsed.start.trim() : DEFAULT_DATE_RANGE.start;
    const end = typeof parsed?.end === 'string' && parsed.end.trim() ? parsed.end.trim() : DEFAULT_DATE_RANGE.end;
    return { start, end };
  } catch {
    return { ...DEFAULT_DATE_RANGE };
  }
}

function buildHotelSearchParams(destination, dateRange) {
  return {
    hotelIds: `SAMPLE-${String(destination || DEFAULT_DESTINATION).toUpperCase()}`,
    checkInDate: dateRange.start,
    checkOutDate: dateRange.end,
    adults: 1,
    roomQuantity: 1
  };
}

function roundNumber(value, digits = 0) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (digits <= 0) {
    return Math.round(numeric);
  }

  return Number(numeric.toFixed(digits));
}

function average(values) {
  const numericValues = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (numericValues.length === 0) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function hasAnyWeatherValue(payload) {
  return Boolean(
    payload
    && [payload.temp, payload.humidity, payload.rainProbability, payload.condition]
      .some((value) => value !== null && value !== undefined && value !== '')
  );
}

function normalizeWeatherSummary(currentWeather) {
  return {
    avgTemp: roundNumber(currentWeather?.temp, 1),
    avgHumidity: roundNumber(currentWeather?.humidity),
    avgRainProbability: roundNumber(currentWeather?.rainProbability),
    condition: currentWeather?.condition ?? null
  };
}

function normalizeFunScoreSummary(funScorePayload) {
  return {
    overall: roundNumber(funScorePayload?.score),
    breakdown: funScorePayload?.dimension_scores || {},
    data_confidence: funScorePayload?.data_confidence || 'low'
  };
}

function buildSourceEntry(provider, options = {}) {
  return {
    provider,
    status: options.status || 'ok',
    fallback: Boolean(options.fallback),
    message: options.message || null,
    timestamp: new Date().toISOString(),
    details: options.details || {}
  };
}

router.get('/dashboard', async (req, res) => {
  const origin = String(req.query.origin || DEFAULT_ORIGIN).toUpperCase();
  const destination = String(req.query.destination || DEFAULT_DESTINATION).toUpperCase();
  const dateRange = parseDateRange(req.query.dateRange);

  const sources = [];
  const fallbackMessages = [];

  const [
    metricsResult,
    hotelsResult,
    weatherResult,
    funScoreResult
  ] = await Promise.allSettled([
    amadeus.getPriceMetrics(origin, destination, dateRange),
    amadeus.searchHotels(buildHotelSearchParams(destination, dateRange)),
    weather.getCurrentWeather(destination),
    gemini.computeFunScore(DEFAULT_FUN_SCORE_DIMENSIONS, {
      destination,
      origin,
      dateRange,
      surface: 'dashboard-summary'
    })
  ]);

  const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : null;
  if (metricsResult.status === 'fulfilled') {
    const metricsFallback = !process.env.AMADEUS_API_KEY || !process.env.AMADEUS_API_SECRET;
    if (metricsFallback) {
      fallbackMessages.push('Flight metrics are using service fallback because Amadeus credentials are unavailable.');
    }
    sources.push(buildSourceEntry('amadeus.priceMetrics', {
      status: 'ok',
      fallback: metricsFallback,
      message: metricsFallback ? 'Service fallback payload in use.' : 'Live service payload returned.',
      details: { origin, destination, dateRange }
    }));
  } else {
    fallbackMessages.push('Flight metrics unavailable; returning null-safe dashboard fields.');
    sources.push(buildSourceEntry('amadeus.priceMetrics', {
      status: 'error',
      fallback: true,
      message: metricsResult.reason?.message || 'Price metrics aggregation failed.',
      details: { origin, destination, dateRange }
    }));
  }

  const hotels = hotelsResult.status === 'fulfilled' && Array.isArray(hotelsResult.value)
    ? hotelsResult.value
    : [];
  const avgHotelPrice = average(hotels.map((hotel) => hotel?.price));
  const hotelsFallback = !process.env.AMADEUS_API_KEY || !process.env.AMADEUS_API_SECRET || avgHotelPrice === null;
  if (hotelsResult.status === 'fulfilled') {
    if (hotelsFallback) {
      fallbackMessages.push('Hotel pricing is using fallback or partial aggregation data.');
    }
    sources.push(buildSourceEntry('amadeus.hotels', {
      status: avgHotelPrice === null ? 'partial' : 'ok',
      fallback: hotelsFallback,
      message: avgHotelPrice === null
        ? 'Hotel search returned no numeric prices; avgHotelPrice is null.'
        : (hotelsFallback ? 'Service fallback payload in use.' : 'Live service payload returned.'),
      details: {
        destination,
        dateRange,
        hotelCount: hotels.length
      }
    }));
  } else {
    fallbackMessages.push('Hotel pricing unavailable; avgHotelPrice and hotelPriceDelta are returning neutral fallback values.');
    sources.push(buildSourceEntry('amadeus.hotels', {
      status: 'error',
      fallback: true,
      message: hotelsResult.reason?.message || 'Hotel aggregation failed.',
      details: { destination, dateRange }
    }));
  }

  const currentWeather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const weatherSummary = normalizeWeatherSummary(currentWeather);
  const weatherFallback = weatherResult.status !== 'fulfilled' || !hasAnyWeatherValue(currentWeather);
  if (weatherResult.status === 'fulfilled') {
    if (weatherFallback) {
      fallbackMessages.push('Weather data is unavailable or empty; dashboard weather is null-safe.');
    }
    sources.push(buildSourceEntry('openweathermap.currentWeather', {
      status: weatherFallback ? 'partial' : 'ok',
      fallback: weatherFallback,
      message: weatherFallback ? 'Weather service returned an empty/null-filled payload.' : 'Live weather payload returned.',
      details: { destination }
    }));
  } else {
    fallbackMessages.push('Weather lookup failed; dashboard weather is null-safe.');
    sources.push(buildSourceEntry('openweathermap.currentWeather', {
      status: 'error',
      fallback: true,
      message: weatherResult.reason?.message || 'Weather aggregation failed.',
      details: { destination }
    }));
  }

  const funScorePayload = funScoreResult.status === 'fulfilled'
    ? funScoreResult.value
    : gemini.buildFunScoreFallback(DEFAULT_FUN_SCORE_DIMENSIONS, {
        note: 'Dashboard aggregation fell back to a contract-safe fun score payload.',
        data_confidence: 'low'
      });
  const funScoreFallback = funScoreResult.status !== 'fulfilled' || !process.env.GEMINI_API_KEY || funScorePayload?.data_confidence === 'low';
  if (funScoreFallback) {
    fallbackMessages.push('Fun score is using contract-safe fallback or low-confidence AI output.');
  }
  sources.push(buildSourceEntry('gemini.funScore', {
    status: funScoreResult.status === 'fulfilled' ? 'ok' : 'error',
    fallback: funScoreFallback,
    message: funScoreResult.status === 'fulfilled'
      ? (funScoreFallback ? 'Fallback or low-confidence fun score payload in use.' : 'Live Gemini payload returned.')
      : (funScoreResult.reason?.message || 'Fun score aggregation failed.'),
    details: {
      destination,
      confidence: funScorePayload?.data_confidence || 'low'
    }
  }));

  const responsePayload = {
    avgFlightPrice: roundNumber(metrics?.avgFlightPrice),
    avgHotelPrice: roundNumber(avgHotelPrice),
    flightPriceDelta: roundNumber(metrics?.flightPriceDelta, 1),
    hotelPriceDelta: 0,
    weather: weatherSummary,
    funScore: normalizeFunScoreSummary(funScorePayload),
    meta: {
      origin,
      destination,
      dateRange,
      generatedAt: new Date().toISOString(),
      fallbackMessages,
      partialData: sources.some((entry) => entry.fallback),
      sources
    }
  };

  if (avgHotelPrice === null) {
    responsePayload.hotelPriceDelta = 0;
  }

  res.json(responsePayload);
});

module.exports = router;
