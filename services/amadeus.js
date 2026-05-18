const AMADEUS_BASE_URL = 'https://test.api.amadeus.com';
const TOKEN_ENDPOINT = `${AMADEUS_BASE_URL}/v1/security/oauth2/token`;
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

let tokenCache = null;
let tokenExpiry = null;

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hasAmadeusCredentials() {
  return Boolean(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET);
}

function isTokenValid() {
  return Boolean(tokenCache && tokenExpiry && Date.now() < tokenExpiry);
}

async function getToken() {
  if (isTokenValid()) {
    return tokenCache;
  }

  const clientId = process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_API_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Amadeus token request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  tokenCache = data.access_token;
  tokenExpiry = Date.now() + Math.max(0, (Number(data.expires_in) * 1000) - TOKEN_EXPIRY_BUFFER_MS);
  return tokenCache;
}

async function fetchAmadeusJson(path, params) {
  const token = await getToken();

  if (!token) {
    return null;
  }

  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const url = `${AMADEUS_BASE_URL}${path}?${query.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Amadeus request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function formatDuration(isoDuration = '') {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(isoDuration);
  if (!match) {
    return isoDuration || '0m';
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  if (hours && minutes) {
    return `${hours}h${minutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function normalizeCabin(cabin) {
  return (cabin || 'economy').toLowerCase();
}

function inferFlightType(stops, airlineCode) {
  const budgetCarriers = new Set(['TR', 'Z2', 'JQ', 'AK', 'FD', 'UO']);
  if (budgetCarriers.has(airlineCode)) {
    return 'budget';
  }
  if (stops > 1) {
    return 'regional';
  }
  return 'traditional';
}

function normalizeFlightOffer(offer) {
  const itinerary = offer?.itineraries?.[0];
  const segments = itinerary?.segments || [];
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  const carrierCode = firstSegment?.carrierCode || 'XX';
  const fareDetails = offer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0] || {};
  const priceTotal = Number.parseFloat(offer?.price?.total);
  const stops = Math.max(0, segments.length - 1);

  return {
    id: offer?.id || `flight-${carrierCode}-${firstSegment?.number || '000'}`,
    airline: carrierCode,
    airlineCode: carrierCode,
    flightNumber: `${carrierCode}-${firstSegment?.number || '000'}`,
    type: inferFlightType(stops, carrierCode),
    departureTime: firstSegment?.departure?.at || null,
    arrivalTime: lastSegment?.arrival?.at || null,
    duration: formatDuration(itinerary?.duration),
    stops,
    stopCities: segments.slice(0, -1).map((segment) => segment?.arrival?.iataCode).filter(Boolean),
    price: Number.isFinite(priceTotal) ? priceTotal : 0,
    currency: offer?.price?.currency || 'TWD',
    cabin: normalizeCabin(fareDetails?.cabin),
    baggage: '23kg',
    seatsRemaining: Number(offer?.numberOfBookableSeats || 0)
  };
}

function normalizeHotelOffer(entry) {
  const firstOffer = entry?.offers?.[0];
  const totalPrice = Number.parseFloat(firstOffer?.price?.total);

  return {
    id: entry?.hotel?.hotelId || 'hotel-sample',
    name: entry?.hotel?.name || 'Unknown Hotel',
    price: Number.isFinite(totalPrice) ? totalPrice : 3200
  };
}

function normalizePriceMetricsResponse(data) {
  const metric = data?.data?.[0]?.priceMetrics?.[0];
  const amount = Number.parseFloat(metric?.amount);
  return {
    avgFlightPrice: Number.isFinite(amount) ? amount : 11500,
    flightPriceDelta: 0
  };
}

function buildFlightFallback(params = {}) {
  const origin = params.origin || 'TPE';
  const destination = params.destination || 'NRT';
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
    const seatsRemaining = 2 + ((seed + index) % 7);

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
      seatsRemaining
    };
  });
}

function buildHotelFallback(params = {}) {
  const checkInDate = params.checkInDate || '2025-08-01';
  const checkOutDate = params.checkOutDate || '2025-08-07';
  const hotelIds = params.hotelIds || 'MCLONGHM';
  const seed = hashString(`${hotelIds}:${checkInDate}:${checkOutDate}:hotel`);

  return [
    {
      id: `${hotelIds}-1`,
      name: 'Sample Grand Hotel',
      price: 2800 + (seed % 800)
    },
    {
      id: `${hotelIds}-2`,
      name: 'Sample Central Stay',
      price: 2600 + ((seed >>> 3) % 700)
    }
  ];
}

function buildPriceMetricsFallback(origin = 'TPE', destination = 'NRT', dateRange = {}) {
  const start = dateRange.start || '2025-08-01';
  const seed = hashString(`${origin}:${destination}:${start}:metrics`);

  return {
    avgFlightPrice: 9800 + (seed % 2400),
    flightPriceDelta: Number((((seed % 140) - 70) / 10).toFixed(1))
  };
}

async function searchFlights(params = {}) {
  const requestParams = {
    originLocationCode: params.origin || 'TPE',
    destinationLocationCode: params.destination || 'NRT',
    departureDate: params.departureDate || '2025-08-01',
    adults: params.adults || 1,
    travelClass: (params.cabin || 'ECONOMY').toUpperCase(),
    max: 10
  };

  try {
    if (!hasAmadeusCredentials()) {
      return buildFlightFallback(params);
    }

    const data = await fetchAmadeusJson('/v2/shopping/flight-offers', requestParams);
    return Array.isArray(data?.data) ? data.data.map(normalizeFlightOffer) : buildFlightFallback(params);
  } catch (error) {
    console.error('[Amadeus] searchFlights failed, using fallback.', error);
    return buildFlightFallback(params);
  }
}

async function searchHotels(params = {}) {
  const requestParams = {
    hotelIds: params.hotelIds || 'MCLONGHM',
    adults: params.adults || 1,
    checkInDate: params.checkInDate || '2025-08-01',
    checkOutDate: params.checkOutDate || '2025-08-07',
    roomQuantity: params.roomQuantity || 1,
    bestRateOnly: true
  };

  try {
    if (!hasAmadeusCredentials()) {
      return buildHotelFallback(params);
    }

    const data = await fetchAmadeusJson('/v3/shopping/hotel-offers', requestParams);
    return Array.isArray(data?.data) ? data.data.map(normalizeHotelOffer) : buildHotelFallback(params);
  } catch (error) {
    console.error('[Amadeus] searchHotels failed, using fallback.', error);
    return buildHotelFallback(params);
  }
}

async function getPriceMetrics(origin = 'TPE', dest = 'NRT', dateRange = {}) {
  const requestParams = {
    originIataCode: origin,
    destinationIataCode: dest,
    departureDate: dateRange.start || '2025-08-01'
  };

  try {
    if (!hasAmadeusCredentials()) {
      return buildPriceMetricsFallback(origin, dest, dateRange);
    }

    const data = await fetchAmadeusJson('/v1/analytics/itinerary-price-metrics', requestParams);
    return normalizePriceMetricsResponse(data);
  } catch (error) {
    console.error('[Amadeus] getPriceMetrics failed, using fallback.', error);
    return buildPriceMetricsFallback(origin, dest, dateRange);
  }
}

module.exports = {
  searchFlights,
  searchHotels,
  getPriceMetrics
};
