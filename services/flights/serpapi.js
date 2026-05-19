const { normalizeFlightList } = require('./normalize');

const SERPAPI_URL = 'https://serpapi.com/search.json';

function hasCredentials() {
  return Boolean(process.env.SERPAPI_API_KEY);
}

function mapTravelClass(cabin) {
  const normalized = String(cabin || 'economy').toLowerCase();
  if (normalized.includes('premium')) return '2';
  if (normalized.includes('business')) return '3';
  if (normalized.includes('first')) return '4';
  return '1';
}

function buildQuery(params = {}) {
  return {
    engine: 'google_flights',
    api_key: process.env.SERPAPI_API_KEY,
    type: params.returnDate ? '1' : '2',
    departure_id: String(params.origin || 'TPE').toUpperCase(),
    arrival_id: String(params.destination || 'NRT').toUpperCase(),
    outbound_date: params.departureDate || '2025-08-01',
    return_date: params.returnDate || undefined,
    adults: params.adults || '1',
    travel_class: mapTravelClass(params.cabin),
    stops: params.maxStops === '0' || params.maxStops === 0 ? '1' : undefined,
    currency: params.currency || 'TWD',
    hl: params.language || 'zh-tw',
    gl: params.country || 'tw'
  };
}

async function searchFlights(params = {}) {
  if (!hasCredentials()) {
    const error = new Error('SERPAPI_API_KEY is not configured.');
    error.code = 'PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  const query = new URLSearchParams();
  Object.entries(buildQuery(params)).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const response = await fetch(`${SERPAPI_URL}?${query.toString()}`);
  if (!response.ok) {
    const error = new Error(`SerpApi request failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  if (payload?.error) {
    const error = new Error(`SerpApi returned an error: ${payload.error}`);
    error.code = 'PROVIDER_RESPONSE_ERROR';
    throw error;
  }

  const flights = normalizeFlightList(payload, {
    provider: 'serpapi',
    cabin: params.cabin,
    currency: params.currency || payload?.search_parameters?.currency || 'TWD'
  });

  if (flights.length === 0) {
    const error = new Error('SerpApi returned no normalizable flights.');
    error.code = 'PROVIDER_EMPTY';
    throw error;
  }

  return {
    provider: 'serpapi_google_flights',
    flights
  };
}

module.exports = {
  searchFlights
};
