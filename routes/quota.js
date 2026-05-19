const express = require('express');
const router = express.Router();
const quotaTracker = require('../services/quotaTracker');

router.get('/quota', (req, res) => {
  res.json(quotaTracker.getUsageSnapshot());
});

module.exports = router;
