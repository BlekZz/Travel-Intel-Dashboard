const express = require('express');
const router = express.Router();

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeDateRange(dateRangeRaw, fallbackStart, fallbackEnd) {
  if (!dateRangeRaw) {
    return { start: fallbackStart, end: fallbackEnd };
  }

  try {
    const parsed = typeof dateRangeRaw === 'string' ? JSON.parse(dateRangeRaw) : dateRangeRaw;
    const start = parsed?.start || fallbackStart;
    const end = parsed?.end || fallbackEnd;
    return { start, end };
  } catch {
    return { start: fallbackStart, end: fallbackEnd };
  }
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function getDaysBetween(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

function seasonalOffset(month) {
  const offsets = [0, -300, -450, -200, 150, 550, 900, 1000, 500, 200, -50, 250];
  return offsets[month - 1] || 0;
}

function buildMonthlySeries(origin, destination) {
  const seed = hashString(`${origin}:${destination}:price-history`);
  const basePrice = 9000 + (seed % 2600);
  const currentYear = [];
  const priorYear = [];

  for (let month = 1; month <= 12; month += 1) {
    const variationSeed = hashString(`${origin}:${destination}:month:${month}`);
    const currentAdjustment = (variationSeed % 700) - 350;
    const priorAdjustment = ((variationSeed >>> 3) % 650) - 325;
    const currentPrice = Math.max(6500, basePrice + seasonalOffset(month) + currentAdjustment);
    const priorPrice = Math.max(6200, Math.round(currentPrice * 0.91) + priorAdjustment);

    currentYear.push({ month, avgPrice: currentPrice });
    priorYear.push({ month, avgPrice: priorPrice });
  }

  return { currentYear, priorYear };
}

function buildTrendSeries(origin, destination, range) {
  const daySpan = Math.min(getDaysBetween(range.start, range.end), 365);
  const flightBase = 9800 + (hashString(`${origin}:${destination}:flight-base`) % 2400);
  const hotelBase = 2600 + (hashString(`${origin}:${destination}:hotel-base`) % 1400);
  const trend = [];

  for (let index = 0; index <= daySpan; index += 1) {
    const date = addDays(range.start, index);
    const flightSeed = hashString(`${origin}:${destination}:${date}:flight`);
    const hotelSeed = hashString(`${origin}:${destination}:${date}:hotel`);

    trend.push({
      date,
      avgFlightPrice: Math.max(7000, flightBase + ((index % 7) - 3) * 90 + ((flightSeed % 480) - 240)),
      avgHotelPrice: Math.max(1800, hotelBase + ((index % 5) - 2) * 70 + ((hotelSeed % 320) - 160))
    });
  }

  return trend;
}

router.get('/price-history', async (req, res) => {
  try {
    const { origin = 'TPE', destination = 'NRT' } = req.query;
    const { currentYear, priorYear } = buildMonthlySeries(origin, destination);

    res.json({
      origin,
      destination,
      currentYear,
      priorYear,
      data_confidence: 'medium',
      sources: ['deterministic-sample://price-history-v1']
    });
  } catch (error) {
    console.error('Error in /api/price-history', error);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

router.get('/flight-trend', async (req, res) => {
  try {
    const { origin = 'TPE', destination = 'NRT', dateRange } = req.query;
    const range = normalizeDateRange(dateRange, '2025-08-01', '2025-08-07');
    const trend = buildTrendSeries(origin, destination, range);

    res.json({ trend });
  } catch (error) {
    console.error('Error in /api/flight-trend', error);
    res.status(500).json({ error: 'Failed to fetch flight trend' });
  }
});

module.exports = router;
