/**
 * routes/devMockRouter.js
 *
 * Mounted ONLY when DEV_MOCK=true (before real routes).
 * Returns one of two pre-written ideal datasets without touching
 * any external API (Gemini, SerpApi, fli, OpenWeatherMap).
 *
 * All responses include a `_mock: true` flag and a `X-Dev-Mock` header
 * so the browser DevTools / network panel makes it obvious which layer
 * is responding.
 */

'use strict';

const express = require('express');
const { getDataset, getDatasetLabel } = require('../services/devMock');

const router = express.Router();

function mockJson(res, data) {
  res.setHeader('X-Dev-Mock', 'true');
  res.setHeader('X-Dev-Mock-Dataset', getDatasetLabel());
  res.json({ ...data, _mock: true });
}

// ── GET /api/dashboard ────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  mockJson(res, getDataset().dashboard);
});

// ── GET /api/travelintel ─────────────────────────────────────
router.get('/travelintel', (req, res) => {
  mockJson(res, getDataset().travelintel);
});

// ── GET /api/booking-advice ──────────────────────────────────
router.get('/booking-advice', (req, res) => {
  mockJson(res, getDataset().bookingAdvice);
});

// ── GET /api/flight-trend ─────────────────────────────────────
router.get('/flight-trend', (req, res) => {
  mockJson(res, getDataset().flightTrend);
});

// ── GET /api/price-history ───────────────────────────────────
router.get('/price-history', (req, res) => {
  mockJson(res, getDataset().priceHistory);
});

// ── GET /api/heatmap ─────────────────────────────────────────
router.get('/heatmap', (req, res) => {
  const { destination = 'NRT', year, type = 'outbound' } = req.query;
  const targetYear = Number.parseInt(year, 10) || new Date().getUTCFullYear();
  const normalizedType = type === 'return' ? 'return' : 'outbound';

  const devMock = require('../services/devMock');

  let basePrice = 9500;
  if (destination !== 'NRT') {
    let hash = 0;
    for (let i = 0; i < destination.length; i++) {
      hash += destination.charCodeAt(i);
    }
    basePrice = 7000 + (hash % 5000);
  }

  const shift = normalizedType === 'return' ? -500 : 0;
  const days = devMock.buildHeatmapDays(targetYear, basePrice + shift, [1, 2, 7, 8, 12]);

  mockJson(res, {
    destination,
    year: targetYear,
    type: normalizedType,
    days,
    meta: devMock.buildMeta({ provider: 'dev_mock_heatmap' })
  });
});

// ── GET /api/flights ─────────────────────────────────────────
router.get('/flights', (req, res) => {
  mockJson(res, getDataset().flights);
});

// ── POST /api/fun-score ──────────────────────────────────────
// Fun score is triggered by slider interaction — return a fixed plausible score.
router.post('/fun-score', (req, res) => {
  const ds = getDataset();
  // Derive dimension scores from the travelintel aspects for coherence
  const levelToScore = { high: 82, medium: 60, low: 38 };
  const aspects = ds.travelintel.aspects || {};
  const dimensionScores = Object.fromEntries(
    Object.entries(aspects).map(([key, val]) => [key, levelToScore[val.level] ?? 50])
  );
  const scores = Object.values(dimensionScores);
  const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  mockJson(res, {
    score: overall,
    dimension_scores: dimensionScores,
    strength: Object.entries(dimensionScores).filter(([, v]) => v >= 80).map(([k]) => k).slice(0, 2),
    weakness: Object.entries(dimensionScores).filter(([, v]) => v <= 40).map(([k]) => k).slice(0, 1),
    note: ds.travelintel.summary_i18n?.zh || ds.travelintel.summary,
    data_confidence: ds.travelintel.data_confidence,
    sources: ds.travelintel.sources
  });
});

// ── GET /api/quota ───────────────────────────────────────────
// Always pass through to the real quota route (no API cost, safe to expose).
// This is a no-op here; quota is handled by the real route mounted after.

module.exports = router;
