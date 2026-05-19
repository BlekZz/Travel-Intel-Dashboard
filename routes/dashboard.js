const express = require('express');
const router = express.Router();
const amadeus = require('../services/amadeus');
const weather = require('../services/weather');
const flightSnapshot = require('../services/flights/snapshot');

const DEFAULT_ORIGIN = 'TPE';
const DEFAULT_DESTINATION = 'NRT';
const DEFAULT_DATE_RANGE = Object.freeze({
  start: '2025-08-01',
  end: '2025-08-07'
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
    currentFlightSnapshotResult,
    previousFlightSnapshotResult,
    hotelsResult,
    weatherResult
  ] = await Promise.allSettled([
    flightSnapshot.getFlightSnapshot({
      origin,
      destination,
      departureDate: dateRange.start,
      cabin: 'economy',
      maxStops: '1',
      currency: 'TWD'
    }),
    flightSnapshot.getFlightSnapshot({
      origin,
      destination,
      departureDate: flightSnapshot.addMonths(dateRange.start, -1),
      cabin: 'economy',
      maxStops: '1',
      currency: 'TWD'
    }),
    amadeus.searchHotels(buildHotelSearchParams(destination, dateRange)),
    weather.getCurrentWeather(destination)
  ]);

  const currentFlightSnapshot = currentFlightSnapshotResult.status === 'fulfilled' ? currentFlightSnapshotResult.value : null;
  const previousFlightSnapshot = previousFlightSnapshotResult.status === 'fulfilled' ? previousFlightSnapshotResult.value : null;
  const avgFlightPrice = roundNumber(currentFlightSnapshot?.avgPrice);
  const previousAvgFlightPrice = Number(previousFlightSnapshot?.avgPrice);
  const flightPriceDelta = Number.isFinite(previousAvgFlightPrice) && previousAvgFlightPrice > 0 && avgFlightPrice !== null
    ? roundNumber(((avgFlightPrice - previousAvgFlightPrice) / previousAvgFlightPrice) * 100, 1)
    : null;

  if (currentFlightSnapshotResult.status === 'fulfilled') {
    const flightMeta = currentFlightSnapshot.meta || {};
    if (flightMeta.fallbackUsed || flightMeta.stale || flightMeta.cached) {
      fallbackMessages.push('Flight metrics are aligned to the flight provider snapshot and may be cached, stale, or fallback-backed.');
    }
    sources.push(buildSourceEntry('flights.snapshot', {
      status: 'ok',
      fallback: Boolean(flightMeta.fallbackUsed || flightMeta.stale),
      message: `Flight metrics derived from ${flightMeta.provider || 'unknown'} snapshot.`,
      details: {
        origin,
        destination,
        departureDate: dateRange.start,
        provider: flightMeta.provider,
        cached: Boolean(flightMeta.cached),
        stale: Boolean(flightMeta.stale),
        generatedAt: flightMeta.generatedAt
      }
    }));
  } else {
    fallbackMessages.push('Flight metrics unavailable; returning null-safe dashboard fields.');
    sources.push(buildSourceEntry('flights.snapshot', {
      status: 'error',
      fallback: true,
      message: currentFlightSnapshotResult.reason?.message || 'Flight snapshot aggregation failed.',
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

  res.json({
    avgFlightPrice,
    avgHotelPrice: roundNumber(avgHotelPrice),
    flightPriceDelta,
    hotelPriceDelta: 0,
    weather: weatherSummary,
    meta: {
      origin,
      destination,
      dateRange,
      generatedAt: new Date().toISOString(),
      fallbackMessages,
      partialData: sources.some((entry) => entry.fallback),
      sources,
      travelIntelRefreshKey: JSON.stringify({ destination, dateRange })
    }
  });
});

module.exports = router;
