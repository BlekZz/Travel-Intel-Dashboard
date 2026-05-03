const express = require('express');
const router = express.Router();
const amadeus = require('../services/amadeus');

router.get('/price-history', async (req, res) => {
  try {
    const { origin = "TPE", destination = "NRT" } = req.query;
    const metrics = await amadeus.getPriceMetrics(origin, destination, { start: '2025-01-01' });

    const currentYearMock = Array.from({length: 12}, (_, i) => ({ month: i + 1, avgPrice: (metrics.avgFlightPrice || 11000) + Math.random() * 2000 - 1000 }));
    const priorYearMock = Array.from({length: 12}, (_, i) => ({ month: i + 1, avgPrice: ((metrics.avgFlightPrice || 11000) * 0.9) + Math.random() * 2000 - 1000 }));

    res.json({
      "origin": origin,
      "destination": destination,
      "currentYear": currentYearMock,
      "priorYear": priorYearMock,
      "data_confidence": "medium",
      "sources": []
    });
  } catch (error) {
    console.error("Error in /api/price-history", error);
    res.status(500).json({ error: "Failed to fetch price history" });
  }
});

router.get('/flight-trend', async (req, res) => {
  try {
    const { origin = "TPE", destination = "NRT", dateRange } = req.query;
    const range = dateRange ? JSON.parse(dateRange) : { start: '2025-08-01', end: '2025-08-07' };

    const metrics = await amadeus.getPriceMetrics(origin, destination, range);
    const hotels = await amadeus.searchHotels({ hotelIds: 'MCLONGHM', checkInDate: range.start, checkOutDate: range.end });
    const avgHotelPrice = hotels.length > 0 ? hotels[0].price : 3200;

    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    const trendMock = [];
    for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        trendMock.push({
            "date": d.toISOString().split('T')[0],
            "avgFlightPrice": (metrics.avgFlightPrice || 11500) + Math.random() * 1000 - 500,
            "avgHotelPrice": avgHotelPrice + Math.random() * 500 - 250
        });
    }

    res.json({
      "trend": trendMock
    });
  } catch (error) {
    console.error("Error in /api/flight-trend", error);
    res.status(500).json({ error: "Failed to fetch flight trend" });
  }
});

module.exports = router;
