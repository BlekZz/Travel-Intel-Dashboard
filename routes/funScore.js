const express = require('express');
const router = express.Router();
const gemini = require('../services/gemini');

const REQUIRED_DIMENSIONS = ['shopping', 'relaxation', 'luxury', 'food', 'sightseeing', 'value', 'festival'];

function buildRouteFallback(dimensions, note) {
  return gemini.buildFunScoreFallback(dimensions, {
    note,
    data_confidence: 'low',
    sources: []
  });
}

function validateDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    return 'Missing dimensions payload';
  }

  const normalized = gemini.normalizeFunScoreDimensions(dimensions);
  const total = REQUIRED_DIMENSIONS.reduce((sum, key) => sum + normalized[key], 0);

  if (total !== 100) {
    return 'Dimensions total must equal 100';
  }

  return null;
}

router.post('/fun-score', async (req, res) => {
  const { destination, dates, dimensions } = req.body || {};

  if (!destination) {
    return res.status(400).json(buildRouteFallback(dimensions, '缺少目的地，無法計算好玩指數。'));
  }

  const validationError = validateDimensions(dimensions);
  if (validationError) {
    return res.status(400).json(buildRouteFallback(dimensions, validationError));
  }

  try {
    const context = { destination, dates: dates || null };
    const result = await gemini.computeFunScore(dimensions, context);
    res.json(gemini.normalizeFunScoreResponse(result, dimensions));
  } catch (error) {
    console.error('Error in /api/fun-score:', error.message);
    res.status(200).json(buildRouteFallback(dimensions, 'AI 服務暫時不可用，已回傳保底分析結構。'));
  }
});

module.exports = router;
