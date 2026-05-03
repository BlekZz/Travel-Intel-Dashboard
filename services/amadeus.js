let tokenCache = null;
let tokenExpiry = null;

async function getToken() {
  if (tokenCache && tokenExpiry && Date.now() < tokenExpiry) {
    return tokenCache;
  }

  const clientId = process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_API_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[Amadeus API] Keys missing, using mock token");
    return "mock_token";
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);

  try {
    const response = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      throw new Error(`Amadeus token error: ${response.statusText}`);
    }

    const data = await response.json();
    tokenCache = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Buffer of 60 seconds
    return tokenCache;
  } catch (error) {
    console.error("Failed to get Amadeus token", error);
    throw error;
  }
}

async function searchFlights(params) {
  const token = await getToken();
  
  if (token === "mock_token") {
    return [
      {
        id: "mock-1",
        airline: "EVA Air",
        airlineCode: "BR",
        flightNumber: "BR-851",
        type: "traditional",
        departureTime: "2025-08-01T10:00:00",
        arrivalTime: "2025-08-01T14:30:00",
        duration: "4h30m",
        stops: 0,
        stopCities: [],
        price: 12500,
        currency: "TWD",
        cabin: params.cabin || "economy",
        baggage: "23kg",
        seatsRemaining: 4
      }
    ];
  }

  const urlParams = new URLSearchParams({
    originLocationCode: params.origin || 'TPE',
    destinationLocationCode: params.destination || 'NRT',
    departureDate: params.departureDate || '2025-08-01',
    adults: params.adults || 1,
    travelClass: (params.cabin || 'ECONOMY').toUpperCase(),
    max: 10
  });

  try {
    const response = await fetch(`https://test.api.amadeus.com/v2/shopping/flight-offers?${urlParams.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error(`Flight offers error: ${response.statusText}`);
    const data = await response.json();
    
    return data.data.map(offer => {
      const it = offer.itineraries[0];
      const segment = it.segments[0];
      return {
        id: offer.id,
        airline: segment.carrierCode,
        airlineCode: segment.carrierCode,
        flightNumber: `${segment.carrierCode}-${segment.number}`,
        type: "traditional",
        departureTime: segment.departure.at,
        arrivalTime: it.segments[it.segments.length-1].arrival.at,
        duration: it.duration.replace('PT', '').toLowerCase(),
        stops: it.segments.length - 1,
        stopCities: [],
        price: parseFloat(offer.price.total),
        currency: offer.price.currency,
        cabin: offer.travelerPricings[0].fareDetailsBySegment[0].cabin.toLowerCase(),
        baggage: "23kg",
        seatsRemaining: offer.numberOfBookableSeats
      };
    });
  } catch(e) {
    console.error(e);
    return [];
  }
}

async function searchHotels(params) {
  const token = await getToken();
  if (token === "mock_token") {
    return [{ id: "h-1", name: "Mock Hotel", price: 3200 }];
  }

  const urlParams = new URLSearchParams({
    hotelIds: params.hotelIds || 'MCLONGHM', // v3 requires hotelIds, defaulting to a mock ID
    adults: params.adults || 1,
    checkInDate: params.checkInDate || '2025-08-01',
    checkOutDate: params.checkOutDate || '2025-08-07',
    roomQuantity: params.roomQuantity || 1,
    bestRateOnly: true
  });

  try {
    const response = await fetch(`https://test.api.amadeus.com/v3/shopping/hotel-offers?${urlParams.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error(`Hotel offers error: ${response.statusText}`);
    const data = await response.json();
    
    return data.data.map(offer => ({
      id: offer.hotel.hotelId,
      name: offer.hotel.name || "Unknown Hotel",
      price: offer.offers && offer.offers.length > 0 ? parseFloat(offer.offers[0].price.total) : 3200
    }));
  } catch(e) {
    console.error(e);
    return [];
  }
}

async function getPriceMetrics(origin, dest, dateRange) {
  const token = await getToken();
  if (token === "mock_token") {
    return {
        avgFlightPrice: 11500,
        flightPriceDelta: 5.2
    };
  }

  try {
    const response = await fetch(`https://test.api.amadeus.com/v1/analytics/itinerary-price-metrics?originIataCode=${origin}&destinationIataCode=${dest}&departureDate=${dateRange.start}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("Metrics error");
    const data = await response.json();
    const metric = data.data?.[0]?.priceMetrics?.[0];
    return {
        avgFlightPrice: metric ? parseFloat(metric.amount) : 11500,
        flightPriceDelta: 0
    };
  } catch(e) {
    console.error(e);
    return { avgFlightPrice: 11500, flightPriceDelta: 5.2 };
  }
}

module.exports = {
  searchFlights,
  searchHotels,
  getPriceMetrics
};
