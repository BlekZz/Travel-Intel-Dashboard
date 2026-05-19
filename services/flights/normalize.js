function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeCabin(cabin) {
  return String(cabin || 'economy').toLowerCase().replace(/_/g, '-');
}

function inferFlightType(stops, airlineCode) {
  const budgetCarriers = new Set(['TR', 'Z2', 'JQ', 'AK', 'FD', 'UO', 'GK']);
  if (budgetCarriers.has(String(airlineCode || '').toUpperCase())) {
    return 'budget';
  }
  if (Number(stops) > 1) {
    return 'regional';
  }
  return 'traditional';
}

function normalizeDuration(minutesOrText) {
  if (minutesOrText === null || minutesOrText === undefined || minutesOrText === '') {
    return '0m';
  }

  if (typeof minutesOrText === 'number' && Number.isFinite(minutesOrText)) {
    const hours = Math.floor(minutesOrText / 60);
    const minutes = minutesOrText % 60;
    if (hours && minutes) {
      return `${hours}h${minutes}m`;
    }
    if (hours) {
      return `${hours}h`;
    }
    return `${minutes}m`;
  }

  return String(minutesOrText);
}

function normalizePrice(rawPrice) {
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) {
    return rawPrice;
  }

  const numeric = Number.parseFloat(String(rawPrice || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeStops(rawStops, segments) {
  if (typeof rawStops === 'number' && Number.isFinite(rawStops)) {
    return Math.max(0, rawStops);
  }

  if (Array.isArray(segments)) {
    return Math.max(0, segments.length - 1);
  }

  const text = String(rawStops || '').toLowerCase();
  if (text.includes('nonstop') || text.includes('direct')) {
    return 0;
  }

  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function getSegmentAirport(segment, key) {
  const value = segment?.[key];
  if (typeof value === 'string') {
    return value;
  }
  return value?.id || value?.iata || value?.iataCode || value?.airport || null;
}

function getSegmentTime(segment, key) {
  const value = segment?.[key];
  if (typeof value === 'string') {
    return value;
  }
  return value?.time || value?.at || value?.datetime || null;
}

function normalizeProviderFlight(flight, options = {}) {
  const segments = Array.isArray(flight?.flights)
    ? flight.flights
    : (Array.isArray(flight?.segments) ? flight.segments : []);
  const firstSegment = segments[0] || flight || {};
  const lastSegment = segments[segments.length - 1] || flight || {};
  const airlineCode = (
    firstSegment?.airline_code
    || firstSegment?.airlineCode
    || firstSegment?.carrier
    || firstSegment?.carrierCode
    || flight?.airlineCode
    || 'XX'
  ).toUpperCase();
  const airline = (
    firstSegment?.airline
    || flight?.airline
    || flight?.airlines?.[0]
    || airlineCode
  );
  const flightNumber = (
    firstSegment?.flight_number
    || firstSegment?.flightNumber
    || firstSegment?.number
    || flight?.flight_number
    || flight?.flightNumber
    || '000'
  );
  const stops = normalizeStops(flight?.stops, segments);

  return {
    id: String(flight?.id || flight?.token || `${options.provider || 'provider'}-${airlineCode}-${flightNumber}`),
    airline,
    airlineCode,
    flightNumber: String(flightNumber).includes('-') ? String(flightNumber) : `${airlineCode}-${flightNumber}`,
    type: inferFlightType(stops, airlineCode),
    departureTime: getSegmentTime(firstSegment, 'departure_airport') || getSegmentTime(firstSegment, 'departure') || flight?.departureTime || null,
    arrivalTime: getSegmentTime(lastSegment, 'arrival_airport') || getSegmentTime(lastSegment, 'arrival') || flight?.arrivalTime || null,
    duration: normalizeDuration(flight?.total_duration || flight?.duration || firstSegment?.duration),
    stops,
    stopCities: segments.slice(0, -1)
      .map((segment) => getSegmentAirport(segment, 'arrival_airport') || getSegmentAirport(segment, 'arrival'))
      .filter(Boolean),
    price: normalizePrice(flight?.price || flight?.price_amount || flight?.amount),
    currency: options.currency || flight?.currency || 'TWD',
    cabin: normalizeCabin(options.cabin || flight?.cabin || flight?.travel_class),
    baggage: flight?.baggage || flight?.bags || 'unknown',
    seatsRemaining: flight?.seatsRemaining ?? flight?.seats_remaining ?? null
  };
}

function normalizeFlightList(payload, options = {}) {
  const candidates = []
    .concat(Array.isArray(payload?.best_flights) ? payload.best_flights : [])
    .concat(Array.isArray(payload?.other_flights) ? payload.other_flights : [])
    .concat(Array.isArray(payload?.flights) ? payload.flights : [])
    .concat(Array.isArray(payload?.data) ? payload.data : [])
    .concat(Array.isArray(payload?.results) ? payload.results : []);

  return candidates
    .map((flight) => normalizeProviderFlight(flight, options))
    .filter((flight) => flight.departureTime || flight.arrivalTime || flight.price > 0);
}

function buildFlightFallback(params = {}, reason = 'No live provider returned flights.') {
  const origin = String(params.origin || 'TPE').toUpperCase();
  const destination = String(params.destination || 'NRT').toUpperCase();
  const departureDate = params.departureDate || '2025-08-01';
  const cabin = normalizeCabin(params.cabin);
  const seed = hashString(`${origin}:${destination}:${departureDate}:${cabin}:flight`);
  const airlineCatalog = [
    { airline: 'EVA Air', airlineCode: 'BR', type: 'traditional' },
    { airline: 'China Airlines', airlineCode: 'CI', type: 'traditional' },
    { airline: 'Jetstar Japan', airlineCode: 'GK', type: 'budget' }
  ];

  return airlineCatalog.map((carrier, index) => {
    const offsetHours = 7 + index * 3;
    const departureTime = `${departureDate}T${String(offsetHours).padStart(2, '0')}:00:00`;
    const stops = carrier.type === 'budget' ? 1 : 0;
    const price = 9200 + (seed % 2600) + index * 950;

    return {
      id: `sample-flight-${index + 1}`,
      airline: carrier.airline,
      airlineCode: carrier.airlineCode,
      flightNumber: `${carrier.airlineCode}-${800 + index * 13}`,
      type: carrier.type,
      departureTime,
      arrivalTime: `${departureDate}T${String(offsetHours + 4 + stops).padStart(2, '0')}:30:00`,
      duration: stops ? '6h30m' : '4h30m',
      stops,
      stopCities: stops ? ['KIX'] : [],
      price,
      currency: 'TWD',
      cabin,
      baggage: carrier.type === 'budget' ? '7kg' : '23kg',
      seatsRemaining: 2 + ((seed + index) % 7),
      providerWarning: reason
    };
  });
}

module.exports = {
  buildFlightFallback,
  normalizeFlightList
};
