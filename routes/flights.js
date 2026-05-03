const express = require('express');
const router = express.Router();
const amadeus = require('../services/amadeus');

router.get('/flights', async (req, res) => {
  try {
    const { origin, destination, departureDate, adults, cabin, maxStops, sort } = req.query;
    const flights = await amadeus.searchFlights({ origin, destination, departureDate, adults, cabin, maxStops, sort });
    res.json({ flights });
  } catch (error) {
    console.error("Error in /api/flights", error);
    res.status(500).json({ error: "Failed to fetch flights" });
  }
});

module.exports = router;
