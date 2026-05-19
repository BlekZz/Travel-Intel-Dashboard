const express = require('express');
const router = express.Router();
const flightSnapshot = require('../services/flights/snapshot');

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function buildHeatmapDays(destination, year, type, snapshot) {
  const totalDays = isLeapYear(year) ? 366 : 365;
  const startDate = new Date(Date.UTC(year, 0, 1));
  const routeSeed = snapshot?.signature || flightSnapshot.hashString(`${destination}:${year}:${type}:heatmap`);
  const basePrice = Math.round(snapshot?.avgPrice || (7800 + (routeSeed % 4200)));
  const seasonalBands = [1.02, 0.97, 0.93, 0.96, 1.01, 1.08, 1.18, 1.22, 1.07, 1.0, 0.95, 1.04];
  const days = [];

  for (let index = 0; index < totalDays; index += 1) {
    const current = new Date(startDate);
    current.setUTCDate(startDate.getUTCDate() + index);
    const date = current.toISOString().split('T')[0];
    const month = current.getUTCMonth();
    const daySeed = flightSnapshot.hashString(`${destination}:${type}:${routeSeed}:${date}`);
    const weeklyBias = ((index + (type === 'return' ? 2 : 0)) % 7) - 3;
    const price = Math.round(
      basePrice * seasonalBands[month]
      + weeklyBias * 120
      + ((daySeed % 900) - 450)
    );
    const clampedPrice = Math.max(5000, clamped(price, 18500));
    const relativeScore = ((clampedPrice - 5000) / 13500);
    const priceLevel = Math.min(5, Math.max(1, Math.floor(relativeScore * 5) + 1));
    const weatherScore = Math.min(95, Math.max(55, 84 - month * 2 + ((daySeed >>> 5) % 18) - 9));

    days.push({
      date,
      flightPrice: clampedPrice,
      priceLevel,
      weatherScore
    });
  }

  return days;
}

function clamped(value, max) {
  return Math.min(max, Math.max(0, value));
}

router.get('/heatmap', async (req, res) => {
  try {
    const { destination = 'NRT', year, type = 'outbound' } = req.query;
    const targetYear = Number.parseInt(year, 10) || new Date().getUTCFullYear();
    const normalizedType = type === 'return' ? 'return' : 'outbound';
    const anchorDate = `${targetYear}-08-15`;
    const snapshot = await flightSnapshot.getFlightSnapshot({
      origin: 'TPE',
      destination,
      departureDate: anchorDate,
      cabin: 'economy',
      maxStops: '1',
      currency: 'TWD'
    });
    const days = buildHeatmapDays(destination, targetYear, normalizedType, snapshot);

    res.json({
      destination,
      year: targetYear,
      type: normalizedType,
      days,
      meta: {
        generatedAt: snapshot.meta?.generatedAt || new Date().toISOString(),
        provider: snapshot.meta?.provider || 'deterministic_sample',
        cached: Boolean(snapshot.meta?.cached),
        stale: Boolean(snapshot.meta?.stale),
        fallbackUsed: Boolean(snapshot.meta?.fallbackUsed),
        anchorDate
      }
    });
  } catch (error) {
    console.error('Error in /api/heatmap:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
