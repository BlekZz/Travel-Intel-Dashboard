const fetch = require('node-fetch');
const quotaTracker = require('./quotaTracker');

const API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const DEFAULT_FORECAST_DAYS = 5;
const FORECAST_SLOTS_PER_DAY = 8;
const MAX_FORECAST_SLOTS = 40;

const DESTINATION_ALIASES = {
    NRT: { query: 'Narita,JP', label: 'Narita' },
    HND: { query: 'Tokyo,JP', label: 'Tokyo' },
    TYO: { query: 'Tokyo,JP', label: 'Tokyo' },
    KIX: { query: 'Osaka,JP', label: 'Osaka' },
    ITM: { query: 'Osaka,JP', label: 'Osaka' },
    NGO: { query: 'Nagoya,JP', label: 'Nagoya' },
    CTS: { query: 'Sapporo,JP', label: 'Sapporo' },
    FUK: { query: 'Fukuoka,JP', label: 'Fukuoka' },
    ICN: { query: 'Seoul,KR', label: 'Seoul' },
    GMP: { query: 'Seoul,KR', label: 'Seoul' },
    PUS: { query: 'Busan,KR', label: 'Busan' },
    HKG: { query: 'Hong Kong,HK', label: 'Hong Kong' },
    MFM: { query: 'Macau,MO', label: 'Macau' },
    BKK: { query: 'Bangkok,TH', label: 'Bangkok' },
    DMK: { query: 'Bangkok,TH', label: 'Bangkok' },
    SIN: { query: 'Singapore,SG', label: 'Singapore' },
    KUL: { query: 'Kuala Lumpur,MY', label: 'Kuala Lumpur' },
    PEN: { query: 'Penang,MY', label: 'Penang' },
    DAD: { query: 'Da Nang,VN', label: 'Da Nang' },
    SGN: { query: 'Ho Chi Minh City,VN', label: 'Ho Chi Minh City' },
    HAN: { query: 'Hanoi,VN', label: 'Hanoi' },
    MNL: { query: 'Manila,PH', label: 'Manila' },
    CEB: { query: 'Cebu,PH', label: 'Cebu' },
    DPS: { query: 'Denpasar,ID', label: 'Denpasar' },
    TPE: { query: 'Taipei,TW', label: 'Taipei' },
    TSA: { query: 'Taipei,TW', label: 'Taipei' },
    KHH: { query: 'Kaohsiung,TW', label: 'Kaohsiung' },
    RMQ: { query: 'Taichung,TW', label: 'Taichung' },
    LAX: { query: 'Los Angeles,US', label: 'Los Angeles' },
    SFO: { query: 'San Francisco,US', label: 'San Francisco' },
    JFK: { query: 'New York,US', label: 'New York' },
    EWR: { query: 'New York,US', label: 'New York' },
    CDG: { query: 'Paris,FR', label: 'Paris' },
    LHR: { query: 'London,GB', label: 'London' }
};

function createEmptyWeatherPayload() {
    return {
        temp: null,
        feelsLike: null,
        condition: null,
        icon: null,
        humidity: null,
        windSpeed: null,
        rainProbability: null
    };
}

function normalizeDestination(destination) {
    const raw = String(destination || '').trim();
    const upper = raw.toUpperCase();

    if (!raw) {
        return {
            raw,
            label: null,
            queries: [],
            resolvedBy: 'empty'
        };
    }

    const alias = DESTINATION_ALIASES[upper];
    if (alias) {
        return {
            raw,
            label: alias.label,
            queries: [alias.query],
            resolvedBy: 'alias'
        };
    }

    const compact = raw.replace(/\s+/g, ' ').trim();
    const queries = [];

    if (/^[A-Z]{3}$/.test(upper)) {
        queries.push(`${upper},TW`, upper);
        return {
            raw,
            label: upper,
            queries,
            resolvedBy: 'iata-fallback'
        };
    }

    queries.push(compact);

    const cityPrefix = compact.split(',')[0].trim();
    if (cityPrefix && cityPrefix !== compact) {
        queries.push(cityPrefix);
    }

    return {
        raw,
        label: cityPrefix || compact,
        queries: [...new Set(queries)],
        resolvedBy: 'passthrough'
    };
}

function normalizeCurrentWeatherPayload(data) {
    return {
        temp: data?.main?.temp ?? null,
        feelsLike: data?.main?.feels_like ?? null,
        condition: data?.weather?.[0]?.main ?? null,
        icon: data?.weather?.[0]?.icon ?? null,
        humidity: data?.main?.humidity ?? null,
        windSpeed: data?.wind?.speed ?? null,
        rainProbability: data?.rain?.['1h'] ?? 0
    };
}

function normalizeForecastItem(item) {
    return {
        temp: item?.main?.temp ?? null,
        feelsLike: item?.main?.feels_like ?? null,
        condition: item?.weather?.[0]?.main ?? null,
        icon: item?.weather?.[0]?.icon ?? null,
        humidity: item?.main?.humidity ?? null,
        windSpeed: item?.wind?.speed ?? null,
        rainProbability: Math.round((item?.pop ?? 0) * 100)
    };
}

async function fetchWeatherEndpoint(endpoint, query, extraParams = {}) {
    const params = new URLSearchParams({
        q: query,
        units: 'metric',
        appid: API_KEY,
        ...extraParams
    });

    quotaTracker.recordProviderCall('openweathermap', {
        route: endpoint,
        mode: 'live',
        status: 'attempt'
    });
    const res = await fetch(`${BASE_URL}/${endpoint}?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
        const error = new Error(data?.message || `Weather API request failed for ${endpoint}`);
        error.status = res.status;
        error.payload = data;
        throw error;
    }

    return data;
}

async function tryWeatherQueries(endpoint, destination, extraParams = {}) {
    const normalized = normalizeDestination(destination);

    if (!API_KEY || normalized.queries.length === 0) {
        return null;
    }

    let lastError = null;

    for (const query of normalized.queries) {
        try {
            const data = await fetchWeatherEndpoint(endpoint, query, extraParams);
            return { data, normalized, query };
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error(`Weather query failed for destination "${destination}"`, {
            endpoint,
            queriesTried: normalized.queries,
            message: lastError.message
        });
    }

    return null;
}

async function getCurrentWeather(city) {
    const result = await tryWeatherQueries('weather', city);
    if (!result) {
        return createEmptyWeatherPayload();
    }

    return normalizeCurrentWeatherPayload(result.data);
}

async function getWeatherForecast(city, days = DEFAULT_FORECAST_DAYS) {
    const requestedDays = Number.isFinite(Number(days)) ? Math.max(1, Number(days)) : DEFAULT_FORECAST_DAYS;
    const cnt = Math.min(MAX_FORECAST_SLOTS, requestedDays * FORECAST_SLOTS_PER_DAY);

    const result = await tryWeatherQueries('forecast', city, { cnt });
    if (!result) {
        return [];
    }

    return Array.isArray(result.data?.list)
        ? result.data.list.map(normalizeForecastItem)
        : [];
}

module.exports = { getCurrentWeather, getWeatherForecast };
