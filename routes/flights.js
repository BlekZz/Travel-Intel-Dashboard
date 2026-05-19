const express = require('express');
const router = express.Router();
const flightsService = require('../services/flights');

function normalizeSort(sort) {
  const normalized = String(sort || 'price').toLowerCase();
  return ['price', 'departuretime', 'arrivaltime', 'duration', 'stops', 'airline'].includes(normalized)
    ? normalized
    : 'price';
}

function parseDurationMinutes(duration) {
  const match = /^(\d+h)?(?:(\d+)m)?$/i.exec(String(duration || '').trim());
  if (!match) return Number.MAX_SAFE_INTEGER;

  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  return (hours * 60) + minutes;
}

function sortFlights(flights, sort) {
  const sortKey = normalizeSort(sort);
  const getters = {
    price: (flight) => Number(flight.price) || Number.MAX_SAFE_INTEGER,
    departuretime: (flight) => Date.parse(flight.departureTime) || Number.MAX_SAFE_INTEGER,
    arrivaltime: (flight) => Date.parse(flight.arrivalTime) || Number.MAX_SAFE_INTEGER,
    duration: (flight) => parseDurationMinutes(flight.duration),
    stops: (flight) => Number(flight.stops) || 0,
    airline: (flight) => String(flight.airline || flight.airlineCode || '').toLowerCase()
  };

  return [...flights].sort((a, b) => {
    const aValue = getters[sortKey](a);
    const bValue = getters[sortKey](b);
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
  });
}

function filterFlights(flights, maxStops) {
  if (maxStops === undefined || maxStops === null || maxStops === '') {
    return flights;
  }

  const limit = Number(maxStops);
  if (!Number.isFinite(limit)) {
    return flights;
  }

  return flights.filter((flight) => Number(flight.stops || 0) <= limit);
}

router.get('/flights', async (req, res) => {
  try {
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      adults,
      cabin,
      maxStops,
      sort,
      currency,
      language,
      country
    } = req.query;
    const result = await flightsService.searchFlights({
      origin,
      destination,
      departureDate,
      returnDate,
      adults,
      cabin,
      maxStops,
      sort,
      currency,
      language,
      country
    });

    res.json({
      ...result,
      flights: sortFlights(filterFlights(result.flights || [], maxStops), sort)
    });
  } catch (error) {
    console.error("Error in /api/flights", error);
    res.status(500).json({ error: "Failed to fetch flights" });
  }
});

module.exports = router;
