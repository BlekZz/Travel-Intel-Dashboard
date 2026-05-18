const express = require('express');
const router = express.Router();
const gemini = require('../services/gemini');

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeMonth(targetMonthRaw) {
  if (!targetMonthRaw) {
    return '2025-08';
  }

  const match = String(targetMonthRaw).match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return '2025-08';
  }

  const year = match[1];
  const month = String(Math.min(12, Math.max(1, Number.parseInt(match[2], 10)))).padStart(2, '0');
  return `${year}-${month}`;
}

function buildDeterministicAdvice(origin, destination, targetMonth) {
  const seed = hashString(`${origin}:${destination}:${targetMonth}:booking-advice`);
  const targetPriceTwd = 8200 + (seed % 4200);
  const deviationRaw = ((seed >>> 4) % 41) - 20;
  const currentPriceDeviationPct = Number((deviationRaw + ((seed % 10) / 10)).toFixed(1));
  const currentPriceLevel = currentPriceDeviationPct >= 12 ? 'high' : currentPriceDeviationPct <= -8 ? 'low' : 'medium';
  const bookingWindows = ['4-6', '5-7', '6-8', '7-9', '8-10'];
  const confidenceLevels = ['medium', 'medium', 'high', 'low'];
  const riskCatalog = [
    '連假需求可能推高短期票價',
    '航空促銷通常集中在出發前 6 至 8 週',
    '熱門時段座位收斂後，價格通常回升',
    '若行程彈性高，平日出發可降低波動風險'
  ];

  return gemini.normalizeBookingAdviceResponse({
    currentPriceLevel,
    currentPriceDeviationPct,
    bestBookingWeeksBefore: bookingWindows[seed % bookingWindows.length],
    targetPriceTwd,
    confidence: confidenceLevels[seed % confidenceLevels.length],
    riskNotes: [
      riskCatalog[seed % riskCatalog.length],
      riskCatalog[(seed >>> 3) % riskCatalog.length]
    ].filter((note, index, array) => array.indexOf(note) === index),
    data_confidence: 'medium',
    sources: ['deterministic-sample://booking-advice-v1']
  }, {
    currentPriceLevel: 'medium',
    data_confidence: 'medium',
    confidence: 'medium'
  });
}

router.get('/booking-advice', async (req, res) => {
  try {
    const origin = req.query.origin || 'TPE';
    const destination = req.query.destination || 'NRT';
    const targetMonth = normalizeMonth(req.query.targetMonth);

    // Wave 1 policy: this route remains deterministic sample driven.
    // Gemini service owns live AI contract normalization, but this route does not invoke it yet.
    const result = buildDeterministicAdvice(origin, destination, targetMonth);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/booking-advice:', error.message);
    res.status(200).json(gemini.normalizeBookingAdviceResponse({}, {
      currentPriceLevel: 'medium',
      currentPriceDeviationPct: null,
      bestBookingWeeksBefore: null,
      targetPriceTwd: null,
      confidence: 'low',
      riskNotes: ['目前無法產生購票建議，請稍後再試。'],
      data_confidence: 'low',
      sources: []
    }));
  }
});

module.exports = router;
