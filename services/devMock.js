/**
 * services/devMock.js
 *
 * Two complete ideal response datasets for UI development.
 * Activated via DEV_MOCK=true in .env.
 *
 * Dataset A — Tokyo, August (summer peak, high activity, expensive)
 * Dataset B — Tokyo, January (winter off-peak, great value, cultural highlights)
 *
 * These fixtures match the exact shape of every live API response so the
 * frontend normalization / rendering code exercises all branches.
 */

'use strict';

const NOW = new Date().toISOString();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function buildMeta(overrides = {}) {
  return {
    generatedAt: NOW,
    provider: 'dev_mock',
    cached: false,
    stale: false,
    fallbackUsed: false,
    sourceTier: 'mock',
    ...overrides
  };
}

/** Generate deterministic price trend for N days from a start date */
function buildTrend(startDate, days, flightBase, hotelBase) {
  const trend = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const fVar = Math.round(((i * 31 + 7) % 480) - 240);
    const hVar = Math.round(((i * 17 + 3) % 320) - 160);
    trend.push({
      date,
      avgFlightPrice: Math.max(7000, flightBase + fVar),
      avgHotelPrice: Math.max(1800, hotelBase + hVar)
    });
  }
  return trend;
}

/** Build 12 monthly YOY series */
function buildYoy(basePrice, peakMonths) {
  const currentYear = [];
  const priorYear = [];
  for (let m = 1; m <= 12; m++) {
    const isPeak = peakMonths.includes(m);
    const cur = Math.round(basePrice + (isPeak ? 2200 : 0) + (m % 3) * 150);
    currentYear.push({ month: m, avgPrice: cur });
    priorYear.push({ month: m, avgPrice: Math.round(cur * 0.92 - 100) });
  }
  return { currentYear, priorYear };
}

/** Build 365 heatmap cells for a given year */
function buildHeatmapDays(year, flightBase, peakMonths) {
  const days = [];
  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year}-12-31T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const month = d.getUTCMonth() + 1;
    const isPeak = peakMonths.includes(month);
    const seed = d.getUTCDate() * month;
    const price = Math.round(flightBase + (isPeak ? 2000 : 0) + (seed % 600) - 300);
    const level = price < flightBase - 500 ? 1
      : price < flightBase ? 2
      : price < flightBase + 800 ? 3
      : price < flightBase + 1600 ? 4 : 5;
    days.push({ date, flightPrice: price, priceLevel: level, weatherScore: isPeak ? 60 : 80 });
  }
  return days;
}

/** Build a realistic set of mock flights */
function buildFlights(base, label) {
  return [
    {
      id: `mock-${label}-1`, airline: 'EVA Air', airlineCode: 'BR',
      flightNumber: 'BR-851', type: 'traditional',
      departureTime: '2025-08-01T10:00:00', arrivalTime: '2025-08-01T14:30:00',
      duration: '4h30m', stops: 0, stopCities: [],
      price: base, currency: 'TWD', cabin: 'economy', baggage: '23kg', seatsRemaining: 4
    },
    {
      id: `mock-${label}-2`, airline: 'China Airlines', airlineCode: 'CI',
      flightNumber: 'CI-101', type: 'traditional',
      departureTime: '2025-08-01T08:30:00', arrivalTime: '2025-08-01T13:15:00',
      duration: '4h45m', stops: 0, stopCities: [],
      price: base + 800, currency: 'TWD', cabin: 'economy', baggage: '23kg', seatsRemaining: 7
    },
    {
      id: `mock-${label}-3`, airline: 'Scoot', airlineCode: 'TR',
      flightNumber: 'TR-858', type: 'budget',
      departureTime: '2025-08-01T06:00:00', arrivalTime: '2025-08-01T11:20:00',
      duration: '5h20m', stops: 1, stopCities: ['SIN'],
      price: base - 2400, currency: 'TWD', cabin: 'economy', baggage: null, seatsRemaining: 12
    },
    {
      id: `mock-${label}-4`, airline: 'JAL', airlineCode: 'JL',
      flightNumber: 'JL-098', type: 'traditional',
      departureTime: '2025-08-01T13:00:00', arrivalTime: '2025-08-01T17:35:00',
      duration: '4h35m', stops: 0, stopCities: [],
      price: base + 3200, currency: 'TWD', cabin: 'economy', baggage: '23kg', seatsRemaining: 2
    }
  ];
}

// ─────────────────────────────────────────────────────────────
// Dataset A — Tokyo August (summer peak)
// ─────────────────────────────────────────────────────────────

const DATASET_A = {
  label: 'mock-A (Tokyo summer peak)',

  dashboard: {
    avgFlightPrice: 11500,
    avgHotelPrice: 3400,
    flightPriceDelta: 12.3,
    hotelPriceDelta: 8.7,
    weather: {
      avgTemp: 29,
      feelsLike: 33,
      avgHumidity: 76,
      avgRainProbability: 35,
      condition: 'Partly Cloudy',
      icon: '02d',
      windSpeed: 14
    },
    meta: buildMeta({ partialData: false })
  },

  travelintel: {
    destination: 'NRT',
    dateRange: { start: '2025-08-01', end: '2025-08-07' },
    aspects: {
      shopping: {
        level: 'high',
        note: '夏季百貨大減價與期間限定品項密集，購物體驗佳。',
        note_i18n: {
          zh: '夏季百貨大減價與期間限定品項密集，購物體驗佳。',
          en: 'Major department store summer sales and limited-edition items make this an excellent window for shopping.'
        }
      },
      relaxation: {
        level: 'low',
        note: '旺季人潮擁擠，熱浪與高濕度使戶外放鬆困難。',
        note_i18n: {
          zh: '旺季人潮擁擠，熱浪與高濕度使戶外放鬆困難。',
          en: 'Peak-season crowds and high heat/humidity make outdoor relaxation challenging.'
        }
      },
      luxury: {
        level: 'medium',
        note: '高端飯店與餐廳選項穩定，但旺季訂房偏難且溢價明顯。',
        note_i18n: {
          zh: '高端飯店與餐廳選項穩定，但旺季訂房偏難且溢價明顯。',
          en: 'Premium hotels and dining remain available, but occupancy is high and rates reflect peak demand.'
        }
      },
      food: {
        level: 'high',
        note: '夏季令海鮮（鰻魚、涼麵）與期間限定甜點豐富，為美食旅遊的強項時段。',
        note_i18n: {
          zh: '夏季令海鮮（鰻魚、涼麵）與期間限定甜點豐富，為美食旅遊的強項時段。',
          en: 'Seasonal dishes (eel, cold soba, kakigori) and summer-limited desserts are widely available — a strong period for food lovers.'
        }
      },
      sightseeing: {
        level: 'high',
        note: '花火大會、盆踊、夏祭等戶外活動集中，是東京文化活動最豐富的季節。',
        note_i18n: {
          zh: '花火大會、盆踊、夏祭等戶外活動集中，是東京文化活動最豐富的季節。',
          en: 'Fireworks festivals, Obon dances, and summer matsuri make this the most culturally active season in Tokyo.'
        }
      },
      value: {
        level: 'low',
        note: '旺季機票與住宿為全年最貴，預算旅客不建議此時段。',
        note_i18n: {
          zh: '旺季機票與住宿為全年最貴，預算旅客不建議此時段。',
          en: 'Flights and accommodation are at their annual peak — not recommended for budget-conscious travelers.'
        }
      },
      festival: {
        level: 'high',
        note: '隅田川花火大會、阿佐谷七夕等多項大型活動集中於此時段。',
        note_i18n: {
          zh: '隅田川花火大會、阿佐谷七夕等多項大型活動集中於此時段。',
          en: 'Sumida River Fireworks, Asagaya Tanabata, and multiple summer festivals concentrate in this window.'
        }
      }
    },
    summary: '東京夏季活動豐富、氣氛熱鬧，但熱浪與高費用是主要挑戰。',
    summary_i18n: {
      zh: '東京夏季活動豐富、氣氛熱鬧，但熱浪與高費用是主要挑戰。',
      en: 'Tokyo in summer is vibrant and festival-packed, but heat and high costs are the main trade-offs.'
    },
    data_confidence: 'high',
    sources: ['https://www.gotokyo.org/en/tourists/events/', 'https://www.jnto.go.jp/'],
    meta: buildMeta({ sourceTier: 'mock-A' })
  },

  bookingAdvice: {
    currentPriceLevel: 'high',
    currentPriceDeviationPct: 18.5,
    bestBookingWeeksBefore: '8-12',
    targetPriceTwd: 9800,
    confidence: 'medium',
    riskNotes: ['農曆年後至暑假前是最佳購票窗口', '颱風季可能影響航班'],
    riskNotes_i18n: {
      zh: ['農曆年後至暑假前是最佳購票窗口', '颱風季可能影響航班'],
      en: ['Best booking window is post-Lunar-New-Year through late spring', 'Typhoon season may affect flight schedules']
    },
    data_confidence: 'medium',
    sources: ['https://www.aviasales.com/'],
    meta: buildMeta({ sourceTier: 'mock-A' })
  },

  flightTrend: {
    trend: buildTrend('2025-08-01', 6, 11500, 3400),
    meta: buildMeta()
  },

  priceHistory: {
    origin: 'TPE', destination: 'NRT',
    ...buildYoy(9500, [1, 2, 7, 8, 12]),
    data_confidence: 'medium',
    sources: ['mock://price-history-A'],
    meta: buildMeta({ anchorDate: '2025-08-01' })
  },

  heatmap: {
    destination: 'NRT', year: 2025, type: 'outbound',
    days: buildHeatmapDays(2025, 9500, [1, 2, 7, 8, 12]),
    meta: buildMeta()
  },

  flights: {
    flights: buildFlights(11500, 'A'),
    meta: buildMeta()
  }
};

// ─────────────────────────────────────────────────────────────
// Dataset B — Tokyo January (winter off-peak, great value)
// ─────────────────────────────────────────────────────────────

const DATASET_B = {
  label: 'mock-B (Tokyo winter off-peak)',

  dashboard: {
    avgFlightPrice: 8900,
    avgHotelPrice: 2600,
    flightPriceDelta: -11.2,
    hotelPriceDelta: -7.5,
    weather: {
      avgTemp: 6,
      feelsLike: 3,
      avgHumidity: 42,
      avgRainProbability: 12,
      condition: 'Clear',
      icon: '01d',
      windSpeed: 22
    },
    meta: buildMeta({ partialData: false })
  },

  travelintel: {
    destination: 'NRT',
    dateRange: { start: '2026-01-10', end: '2026-01-16' },
    aspects: {
      shopping: {
        level: 'high',
        note: '一月初賣（福袋）與冬季折扣季使購物超值，是購物旅遊的黃金時段。',
        note_i18n: {
          zh: '一月初賣（福袋）與冬季折扣季使購物超值，是購物旅遊的黃金時段。',
          en: "January \"Hatsuuri\" lucky bags and winter clearance sales offer exceptional value — a golden window for shoppers."
        }
      },
      relaxation: {
        level: 'medium',
        note: '人潮較少，步調悠閒，但低溫可能影響長時間戶外活動的舒適度。',
        note_i18n: {
          zh: '人潮較少，步調悠閒，但低溫可能影響長時間戶外活動的舒適度。',
          en: 'Fewer tourists and a slower pace feel relaxed, though the cold limits extended outdoor activity.'
        }
      },
      luxury: {
        level: 'high',
        note: '淡季飯店價格大幅下降，奢華住宿以折扣價入住是此時段的最大優勢之一。',
        note_i18n: {
          zh: '淡季飯店價格大幅下降，奢華住宿以折扣價入住是此時段的最大優勢之一。',
          en: 'Off-peak hotel rates drop significantly — booking luxury accommodations at reduced prices is one of the strongest advantages of this window.'
        }
      },
      food: {
        level: 'medium',
        note: '冬季火鍋（もつ鍋）、蟹料理、熱甜酒等暖身美食是亮點，但選擇廣度不如旺季。',
        note_i18n: {
          zh: '冬季火鍋（もつ鍋）、蟹料理、熱甜酒等暖身美食是亮點，但選擇廣度不如旺季。',
          en: 'Winter hotpot, crab cuisine, and warm amazake are highlights, though the breadth of seasonal options is narrower than peak periods.'
        }
      },
      sightseeing: {
        level: 'high',
        note: '初詣（新年參拜）人潮集中於元旦，一月中旬後景點反而清幽，觀光品質高。',
        note_i18n: {
          zh: '初詣（新年參拜）人潮集中於元旦，一月中旬後景點反而清幽，觀光品質高。',
          en: 'Hatsumode crowds peak on New Year\'s Day; by mid-January, major sights are refreshingly uncrowded and enjoyable.'
        }
      },
      value: {
        level: 'high',
        note: '機票、住宿均為全年低點，加上初賣特價，整體旅費具有顯著競爭力。',
        note_i18n: {
          zh: '機票、住宿均為全年低點，加上初賣特價，整體旅費具有顯著競爭力。',
          en: 'Flights and hotels at annual lows, combined with post-New Year sales, make total trip costs highly competitive.'
        }
      },
      festival: {
        level: 'low',
        note: '初詣過後的一月中下旬節慶活動較少，主要慶典集中於春節前後。',
        note_i18n: {
          zh: '初詣過後的一月中下旬節慶活動較少，主要慶典集中於春節前後。',
          en: 'After Hatsumode, mid-to-late January is relatively quiet for festivals; the next major cycle begins around Lunar New Year.'
        }
      }
    },
    summary: '一月中旬的東京：人少、住宿超值、購物划算，適合想深度體驗日本冬日的旅客。',
    summary_i18n: {
      zh: '一月中旬的東京：人少、住宿超值、購物划算，適合想深度體驗日本冬日的旅客。',
      en: 'Mid-January Tokyo rewards travelers seeking a quieter, more affordable experience — particularly strong for shopping and luxury value.'
    },
    data_confidence: 'high',
    sources: ['https://www.gotokyo.org/en/', 'https://www.jnto.go.jp/'],
    meta: buildMeta({ sourceTier: 'mock-B' })
  },

  bookingAdvice: {
    currentPriceLevel: 'low',
    currentPriceDeviationPct: -12.0,
    bestBookingWeeksBefore: '4-6',
    targetPriceTwd: 8500,
    confidence: 'medium',
    riskNotes: ['農曆年前後短暫漲價，請避開春節前後一周', '元旦假期需提前訂房'],
    riskNotes_i18n: {
      zh: ['農曆年前後短暫漲價，請避開春節前後一周', '元旦假期需提前訂房'],
      en: ['Brief price spike around Lunar New Year — avoid the week before/after', 'Book hotels early for the New Year public holiday period']
    },
    data_confidence: 'medium',
    sources: ['https://www.aviasales.com/'],
    meta: buildMeta({ sourceTier: 'mock-B' })
  },

  flightTrend: {
    trend: buildTrend('2026-01-10', 6, 8900, 2600),
    meta: buildMeta()
  },

  priceHistory: {
    origin: 'TPE', destination: 'NRT',
    ...buildYoy(9500, [1, 2, 7, 8, 12]),
    data_confidence: 'medium',
    sources: ['mock://price-history-B'],
    meta: buildMeta({ anchorDate: '2026-01-10' })
  },

  heatmap: {
    destination: 'NRT', year: 2026, type: 'outbound',
    days: buildHeatmapDays(2026, 9500, [1, 2, 7, 8, 12]),
    meta: buildMeta()
  },

  flights: {
    flights: buildFlights(8900, 'B'),
    meta: buildMeta()
  }
};

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

const DATASETS = [DATASET_A, DATASET_B];

/**
 * Pick a dataset for this server session (random once, fixed per process).
 * This ensures a single page-load sees consistent data across all endpoints.
 */
const SESSION_DATASET = DATASETS[Math.floor(Math.random() * DATASETS.length)];

function isDevMock() {
  return String(process.env.DEV_MOCK || '').trim().toLowerCase() === 'true';
}

function getDataset() {
  return SESSION_DATASET;
}

function getDatasetLabel() {
  return SESSION_DATASET.label;
}

module.exports = { isDevMock, getDataset, getDatasetLabel, DATASET_A, DATASET_B, buildHeatmapDays, buildMeta };
