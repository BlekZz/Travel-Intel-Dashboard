const express = require('express');
const router = express.Router();
const gemini = require('../services/gemini');

router.get('/booking-advice', async (req, res) => {
    try {
        const { origin, destination, targetMonth } = req.query;
        
        // Here we mock the integration part where Agent-B data would normally come from
        const mockPriceHistory = { origin, destination, targetMonth, historicalAvg: 12000 };
        const mockTrendData = { recentPrices: [11500, 11800, 12200, 12500] };
        
        const result = await gemini.getBookingAdvice(mockPriceHistory, mockTrendData);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/booking-advice:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
