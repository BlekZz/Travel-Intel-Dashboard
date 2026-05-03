const express = require('express');
const router = express.Router();
const amadeus = require('../services/amadeus');
const weather = require('../services/weather');
const gemini = require('../services/gemini');

router.get('/dashboard', async (req, res) => {
  try {
    const { origin = 'TPE', destination = 'NRT', dateRange } = req.query;
    const range = dateRange ? JSON.parse(dateRange) : { start: '2025-08-01', end: '2025-08-07' };
    
    // Call Amadeus API
    const metrics = await amadeus.getPriceMetrics(origin, destination, range);
    const hotels = await amadeus.searchHotels({ hotelIds: 'MCLONGHM', checkInDate: range.start, checkOutDate: range.end });
    
    const avgHotelPrice = hotels.length > 0 ? hotels.reduce((sum, h) => sum + h.price, 0) / hotels.length : 3200;

    // Agent-C Integration: Fetch weather
    const currentW = await weather.getCurrentWeather(destination);
    const weatherData = currentW ? {
      avgTemp: currentW.temp,
      avgHumidity: currentW.humidity,
      avgRainProbability: currentW.rainProbability,
      condition: currentW.condition
    } : {
      avgTemp: 28.5,
      avgHumidity: 72,
      avgRainProbability: 35,
      condition: "Partly Cloudy"
    };

    // Agent-C Integration: Fun Score default/mock
    const funScoreData = {
      overall: 84,
      breakdown: { "shopping": 78, "food": 88 },
      data_confidence: "medium"
    };

    res.json({
      "avgFlightPrice": metrics.avgFlightPrice || 11500,
      "avgHotelPrice": Math.round(avgHotelPrice),
      "flightPriceDelta": metrics.flightPriceDelta || 5.2,
      "hotelPriceDelta": -2.1,
      "weather": weatherData,
      "funScore": funScoreData
    });
  } catch (error) {
    console.error("Error in /api/dashboard", error);
    res.status(500).json({ error: "Failed to fetch dashboard metrics" });
  }
});

module.exports = router;
