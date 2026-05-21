/**
 * services/devMock.js
 *
 * Multiple complete response datasets for UI development and QA.
 * Activated via DEV_MOCK=true in .env.
 *
 * Dataset A — Tokyo, August (summer peak, high activity, expensive)
 * Dataset B — Tokyo, January (winter off-peak, great value, cultural highlights)
 * Dataset C — long-content premium scenario
 * Dataset D — partial/fallback scenario
 * Dataset E — sparse / empty-state scenario
 * Dataset F — controlled endpoint error scenario
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

function buildLongContentFlights(base, label) {
  return [
    {
      id: `mock-${label}-1`,
      airline: 'STARLUX Airlines Premium Regional Connector',
      airlineCode: 'JX',
      flightNumber: 'JX-808',
      type: 'traditional',
      departureTime: '2025-11-14T05:45:00',
      arrivalTime: '2025-11-14T10:55:00',
      duration: '5h10m',
      stops: 1,
      stopCities: ['FUK'],
      price: base + 2400,
      currency: 'TWD',
      cabin: 'premium economy',
      baggage: '30kg',
      seatsRemaining: 2
    },
    {
      id: `mock-${label}-2`,
      airline: 'Japan Airlines Codeshare Extended Service',
      airlineCode: 'JL',
      flightNumber: 'JL-096',
      type: 'traditional',
      departureTime: '2025-11-14T09:20:00',
      arrivalTime: '2025-11-14T14:45:00',
      duration: '5h25m',
      stops: 0,
      stopCities: [],
      price: base + 3600,
      currency: 'TWD',
      cabin: 'business',
      baggage: '32kg x2',
      seatsRemaining: 1
    },
    {
      id: `mock-${label}-3`,
      airline: 'Peach Aviation Super Saver Long Label',
      airlineCode: 'MM',
      flightNumber: 'MM-028',
      type: 'budget',
      departureTime: '2025-11-14T23:10:00',
      arrivalTime: '2025-11-15T07:05:00',
      duration: '7h55m',
      stops: 2,
      stopCities: ['KIX', 'NGO'],
      price: base - 1800,
      currency: 'TWD',
      cabin: 'economy',
      baggage: '7kg',
      seatsRemaining: 9
    },
    {
      id: `mock-${label}-4`,
      airline: 'ANA Haneda Luxury Midday Service',
      airlineCode: 'NH',
      flightNumber: 'NH-852',
      type: 'traditional',
      departureTime: '2025-11-14T12:40:00',
      arrivalTime: '2025-11-14T17:25:00',
      duration: '4h45m',
      stops: 0,
      stopCities: [],
      price: base + 4200,
      currency: 'TWD',
      cabin: 'business',
      baggage: '32kg x2',
      seatsRemaining: 3
    },
    {
      id: `mock-${label}-5`,
      airline: 'Cathay Pacific via Hong Kong',
      airlineCode: 'CX',
      flightNumber: 'CX-451',
      type: 'regional',
      departureTime: '2025-11-14T07:10:00',
      arrivalTime: '2025-11-14T16:35:00',
      duration: '9h25m',
      stops: 1,
      stopCities: ['HKG'],
      price: base + 900,
      currency: 'TWD',
      cabin: 'economy',
      baggage: '25kg',
      seatsRemaining: 5
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

const DATASET_C = {
  id: 'mock-c',
  label: 'mock-C (Kyoto autumn premium, long content)',

  dashboard: {
    avgFlightPrice: 14200,
    avgHotelPrice: 4900,
    flightPriceDelta: 9.4,
    hotelPriceDelta: 16.8,
    weather: {
      avgTemp: 17,
      feelsLike: 16,
      avgHumidity: 58,
      avgRainProbability: 18,
      condition: 'Clear to Partly Cloudy',
      icon: '02d',
      windSpeed: 9
    },
    meta: buildMeta({ partialData: false, sourceTier: 'mock-C' })
  },

  travelintel: {
    destination: 'KIX',
    dateRange: { start: '2025-11-14', end: '2025-11-20' },
    aspects: {
      shopping: { level: 'medium', note: 'Designer outlets and seasonal craft pop-ups are strong, but this window is more experience-led than discount-led.', note_i18n: { zh: '設計師 outlet 與秋季手作快閃不錯，但這段更偏體驗導向，不是以折扣為核心。', en: 'Designer outlets and seasonal craft pop-ups are strong, but this window is more experience-led than discount-led.' } },
      relaxation: { level: 'high', note: 'Cool weather, temple gardens, and slower off-peak weekday pacing make this a comfortable decompression trip.', note_i18n: { zh: '天氣涼爽、寺院庭園與平日較慢的節奏，讓這段旅程很適合放鬆。', en: 'Cool weather, temple gardens, and slower off-peak weekday pacing make this a comfortable decompression trip.' } },
      luxury: { level: 'high', note: 'Ryokan, kaiseki, and heritage hotels are at their most photogenic, but premium pricing is structurally high during foliage season.', note_i18n: { zh: '旅館、懷石與歷史飯店在紅葉季最有氛圍，但高端價格也會明顯墊高。', en: 'Ryokan, kaiseki, and heritage hotels are at their most photogenic, but premium pricing is structurally high during foliage season.' } },
      food: { level: 'high', note: 'Autumn crab, yudofu, wagashi, and kaiseki make this one of the most editorially rich food windows.', note_i18n: { zh: '秋蟹、湯豆腐、和菓子與懷石，讓這段成為很適合美食主題旅行的時窗。', en: 'Autumn crab, yudofu, wagashi, and kaiseki make this one of the most editorially rich food windows.' } },
      sightseeing: { level: 'high', note: 'Foliage-driven temple routes, garden illumination, and classic day-trip arcs all perform strongly in this period.', note_i18n: { zh: '紅葉寺院路線、庭園夜間點燈與經典近郊行程，在這段時間的表現都很強。', en: 'Foliage-driven temple routes, garden illumination, and classic day-trip arcs all perform strongly in this period.' } },
      value: { level: 'low', note: 'This is a premium-demand window; value weakens once accommodation and late booking premiums are included.', note_i18n: { zh: '這段本質上是高溢價檔期，一旦把住宿與晚訂溢價算進去，性價比就偏弱。', en: 'This is a premium-demand window; value weakens once accommodation and late booking premiums are included.' } },
      festival: { level: 'medium', note: 'The cultural atmosphere is strong, but this is more about seasonal scenery than dense marquee festivals.', note_i18n: { zh: '文化氛圍很強，但這段比較偏季節景觀，不是大型慶典密集期。', en: 'The cultural atmosphere is strong, but this is more about seasonal scenery than dense marquee festivals.' } }
    },
    summary: '京都秋季高級旅遊情境：景色與住宿體驗極強，但價格、晚訂壓力與長文案內容都適合作為 UI 壓力測試。這組資料刻意包含較長句子與較多字數，用來驗證卡片、badge、列表與 modal 在窄視窗下不會破版。',
    summary_i18n: {
      zh: '京都秋季高級旅遊情境：景色與住宿體驗極強，但價格、晚訂壓力與長文案內容都適合作為 UI 壓力測試。這組資料刻意包含較長句子與較多字數，用來驗證卡片、badge、列表與 modal 在窄視窗下不會破版。',
      en: 'Autumn Kyoto premium scenario: beautiful, expensive, and intentionally verbose so cards, badges, lists, and modals can be stress-tested against long-copy wrapping in narrow viewports.'
    },
    data_confidence: 'high',
    sources: ['https://kyoto.travel/en', 'https://www.japan.travel/en/'],
    meta: buildMeta({ sourceTier: 'mock-C' })
  },

  bookingAdvice: {
    currentPriceLevel: 'high',
    currentPriceDeviationPct: 21.4,
    bestBookingWeeksBefore: '10-14',
    targetPriceTwd: 11800,
    confidence: 'medium',
    riskNotes: ['紅葉季住宿晚訂溢價極高', '熱門區域旅館可能需提早數月預訂', '週末價格與平日價差擴大'],
    riskNotes_i18n: {
      zh: ['紅葉季住宿晚訂溢價極高', '熱門區域旅館可能需提早數月預訂', '週末價格與平日價差擴大'],
      en: ['Late-booking hotel premiums are severe during foliage season', 'Ryokan in high-demand areas may require booking months ahead', 'Weekend vs weekday price gaps widen noticeably']
    },
    data_confidence: 'medium',
    sources: ['mock://booking-advice-C'],
    meta: buildMeta({ sourceTier: 'mock-C' })
  },

  flightTrend: {
    trend: buildTrend('2025-11-14', 14, 14200, 4900),
    meta: buildMeta({ sourceTier: 'mock-C' })
  },

  priceHistory: {
    origin: 'TPE',
    destination: 'KIX',
    ...buildYoy(11200, [4, 5, 10, 11]),
    data_confidence: 'medium',
    sources: ['mock://price-history-C'],
    meta: buildMeta({ anchorDate: '2025-11-14', sourceTier: 'mock-C' })
  },

  heatmap: {
    destination: 'KIX',
    year: 2025,
    type: 'outbound',
    days: buildHeatmapDays(2025, 11200, [4, 5, 10, 11]),
    meta: buildMeta({ sourceTier: 'mock-C' })
  },

  flights: {
    flights: buildLongContentFlights(14200, 'C'),
    meta: buildMeta({ sourceTier: 'mock-C' })
  }
};

const DATASET_D = {
  id: 'mock-d',
  label: 'mock-D (Osaka rainy partial fallback)',

  dashboard: {
    avgFlightPrice: 10400,
    avgHotelPrice: 2850,
    flightPriceDelta: 2.2,
    hotelPriceDelta: -1.7,
    weather: {
      avgTemp: 23,
      feelsLike: 25,
      avgHumidity: 88,
      avgRainProbability: 76,
      condition: 'Rain Showers',
      icon: '09d',
      windSpeed: 19
    },
    meta: buildMeta({ partialData: true, fallbackUsed: true, sourceTier: 'mock-D-partial' })
  },

  travelintel: {
    destination: 'KIX',
    dateRange: { start: '2025-06-12', end: '2025-06-17' },
    aspects: {
      shopping: { level: 'medium', note: 'Indoor retail remains fine, but weather reduces the practical radius of exploration.', note_i18n: { zh: '室內購物仍可行，但天氣會縮小實際活動半徑。', en: 'Indoor retail remains fine, but weather reduces the practical radius of exploration.' } },
      relaxation: { level: 'medium', note: 'Rain and humidity reduce outdoor comfort, though slower pacing can still feel restorative.', note_i18n: { zh: '降雨與濕度降低戶外舒適度，但慢節奏仍有放鬆感。', en: 'Rain and humidity reduce outdoor comfort, though slower pacing can still feel restorative.' } },
      luxury: { level: 'medium', note: 'Hotels are available, but destination framing is based on partial supporting context.', note_i18n: { zh: '高端住宿可行，但整體目的地判讀建立在部分補充資料上。', en: 'Hotels are available, but destination framing is based on partial supporting context.' } },
      food: { level: 'high', note: 'Indoor dining remains a strong pillar even when outdoor plans degrade.', note_i18n: { zh: '即使戶外行程退化，室內美食仍是強項。', en: 'Indoor dining remains a strong pillar even when outdoor plans degrade.' } },
      sightseeing: { level: 'low', note: 'Outdoor-heavy routes are vulnerable to weather, so scenic quality becomes unstable.', note_i18n: { zh: '以戶外為主的行程受天氣影響大，觀光品質不穩定。', en: 'Outdoor-heavy routes are vulnerable to weather, so scenic quality becomes unstable.' } },
      value: { level: 'medium', note: 'Prices are not extreme, but incomplete confidence weakens planning certainty.', note_i18n: { zh: '價格不算極端，但資料信心不足會削弱規劃確定性。', en: 'Prices are not extreme, but incomplete confidence weakens planning certainty.' } },
      festival: { level: 'low', note: 'No strong marquee signal was available in the fallback path.', note_i18n: { zh: 'fallback 路徑中沒有足夠強的慶典訊號。', en: 'No strong marquee signal was available in the fallback path.' } }
    },
    summary: '這組資料模擬 partial fallback 與低信心輸出，驗證 UI 是否會正確呈現 badge、提示文案、來源與冷卻重試相關訊息。',
    summary_i18n: {
      zh: '這組資料模擬 partial fallback 與低信心輸出，驗證 UI 是否會正確呈現 badge、提示文案、來源與冷卻重試相關訊息。',
      en: 'This dataset simulates partial fallback and lower-confidence output so the UI can be checked for badges, helper notes, sources, and retry messaging.'
    },
    data_confidence: 'low',
    sources: ['mock://partial-fallback-D'],
    meta: buildMeta({
      partialData: true,
      fallbackUsed: true,
      sourceTier: 'fallback',
      retryAfterMs: 30000,
      nextRetryAt: new Date(Date.now() + 30000).toISOString()
    })
  },

  bookingAdvice: {
    currentPriceLevel: 'neutral',
    currentPriceDeviationPct: 3.5,
    bestBookingWeeksBefore: '5-7',
    targetPriceTwd: 9800,
    confidence: 'low',
    riskNotes: ['Weather volatility may invalidate outdoor-heavy planning', 'This guidance is fallback-backed and should be treated cautiously'],
    riskNotes_i18n: {
      zh: ['天氣波動可能使戶外型行程失準', '這份建議目前帶有 fallback 性質，需保守解讀'],
      en: ['Weather volatility may invalidate outdoor-heavy planning', 'This guidance is fallback-backed and should be treated cautiously']
    },
    data_confidence: 'low',
    sources: ['mock://partial-fallback-D'],
    meta: buildMeta({
      fallbackUsed: true,
      sourceTier: 'fallback',
      retryAfterMs: 30000,
      nextRetryAt: new Date(Date.now() + 30000).toISOString()
    })
  },

  flightTrend: {
    trend: buildTrend('2025-06-12', 4, 10400, 2850),
    meta: buildMeta({ fallbackUsed: true, sourceTier: 'fallback' })
  },

  priceHistory: {
    origin: 'TPE',
    destination: 'KIX',
    ...buildYoy(9300, [4, 7, 8, 12]),
    data_confidence: 'low',
    sources: ['mock://partial-fallback-D'],
    meta: buildMeta({ anchorDate: '2025-06-12', fallbackUsed: true, sourceTier: 'fallback' })
  },

  heatmap: {
    destination: 'KIX',
    year: 2025,
    type: 'outbound',
    days: buildHeatmapDays(2025, 9300, [4, 7, 8, 12]),
    meta: buildMeta({ fallbackUsed: true, sourceTier: 'fallback' })
  },

  flights: {
    flights: buildFlights(10400, 'D'),
    meta: buildMeta({ fallbackUsed: true, sourceTier: 'fallback' })
  }
};

const DATASET_E = {
  id: 'mock-e',
  label: 'mock-E (sparse and empty state)',

  dashboard: {
    avgFlightPrice: null,
    avgHotelPrice: null,
    flightPriceDelta: null,
    hotelPriceDelta: null,
    weather: {
      avgTemp: null,
      feelsLike: null,
      avgHumidity: null,
      avgRainProbability: null,
      condition: null,
      icon: null,
      windSpeed: null
    },
    meta: buildMeta({ partialData: true, fallbackUsed: true, sourceTier: 'mock-E-empty' })
  },

  travelintel: {
    destination: 'CTS',
    dateRange: { start: '2025-04-03', end: '2025-04-06' },
    aspects: {},
    summary: 'No stable travel-intel evidence was available for this sparse mock scenario.',
    summary_i18n: {
      zh: '這組 sparse mock 情境沒有足夠穩定的 travel-intel 證據。',
      en: 'No stable travel-intel evidence was available for this sparse mock scenario.'
    },
    data_confidence: 'low',
    sources: [],
    meta: buildMeta({ partialData: true, fallbackUsed: true, sourceTier: 'mock-E-empty' })
  },

  bookingAdvice: {
    currentPriceLevel: 'unknown',
    currentPriceDeviationPct: null,
    bestBookingWeeksBefore: null,
    targetPriceTwd: null,
    confidence: 'low',
    riskNotes: [],
    riskNotes_i18n: { zh: [], en: [] },
    data_confidence: 'low',
    sources: [],
    meta: buildMeta({ fallbackUsed: true, sourceTier: 'mock-E-empty' })
  },

  flightTrend: {
    trend: [],
    meta: buildMeta({ fallbackUsed: true, sourceTier: 'mock-E-empty' })
  },

  priceHistory: {
    origin: 'TPE',
    destination: 'CTS',
    currentYear: [],
    priorYear: [],
    data_confidence: 'low',
    sources: [],
    meta: buildMeta({ anchorDate: '2025-04-03', fallbackUsed: true, sourceTier: 'mock-E-empty' })
  },

  heatmap: {
    destination: 'CTS',
    year: 2025,
    type: 'outbound',
    days: [],
    meta: buildMeta({ fallbackUsed: true, sourceTier: 'mock-E-empty' })
  },

  flights: {
    flights: [],
    meta: buildMeta({ fallbackUsed: true, sourceTier: 'mock-E-empty' })
  }
};

const DATASET_F = {
  id: 'mock-f',
  label: 'mock-F (controlled endpoint failures)',
  responses: {
    flightTrend: {
      status: 503,
      body: { error: 'Mocked trend service outage for QA', code: 'MOCK_TREND_OUTAGE' }
    },
    bookingAdvice: {
      status: 503,
      body: { error: 'Mocked booking advice outage for QA', code: 'MOCK_BOOKING_ADVICE_OUTAGE' }
    }
  },

  dashboard: {
    avgFlightPrice: 9700,
    avgHotelPrice: 3100,
    flightPriceDelta: -4.2,
    hotelPriceDelta: 1.1,
    weather: {
      avgTemp: 21,
      feelsLike: 22,
      avgHumidity: 67,
      avgRainProbability: 28,
      condition: 'Cloudy',
      icon: '03d',
      windSpeed: 11
    },
    meta: buildMeta({ partialData: false, sourceTier: 'mock-F' })
  },

  travelintel: {
    destination: 'FUK',
    dateRange: { start: '2025-09-05', end: '2025-09-10' },
    aspects: {
      shopping: { level: 'medium', note: 'Balanced city retail and food-market browsing.', note_i18n: { zh: '城市購物與市場逛街表現均衡。', en: 'Balanced city retail and food-market browsing.' } },
      relaxation: { level: 'medium', note: 'Urban comfort with moderate crowds.', note_i18n: { zh: '都市舒適度中等，人潮適中。', en: 'Urban comfort with moderate crowds.' } },
      luxury: { level: 'low', note: 'Less premium-led than Kyoto or Tokyo.', note_i18n: { zh: '比起京都或東京，較不是高端導向。', en: 'Less premium-led than Kyoto or Tokyo.' } },
      food: { level: 'high', note: 'Strong ramen, yatai, and seafood identity.', note_i18n: { zh: '拉麵、屋台與海鮮辨識度很強。', en: 'Strong ramen, yatai, and seafood identity.' } },
      sightseeing: { level: 'medium', note: 'Compact city sightseeing works well in short itineraries.', note_i18n: { zh: '短天數下的城市觀光效率不錯。', en: 'Compact city sightseeing works well in short itineraries.' } },
      value: { level: 'high', note: 'Usually more forgiving than peak Tokyo.', note_i18n: { zh: '通常比東京旺季更有價格彈性。', en: 'Usually more forgiving than peak Tokyo.' } },
      festival: { level: 'medium', note: 'Moderate event signal, not marquee-heavy.', note_i18n: { zh: '活動訊號中等，非大型慶典密集型。', en: 'Moderate event signal, not marquee-heavy.' } }
    },
    summary: '這組資料保留主畫面與 travelintel 正常，但刻意讓部分 price-history 相關 endpoint 失敗，用來驗證前端 fallback 與錯誤隔離是否完整。',
    summary_i18n: {
      zh: '這組資料保留主畫面與 travelintel 正常，但刻意讓部分 price-history 相關 endpoint 失敗，用來驗證前端 fallback 與錯誤隔離是否完整。',
      en: 'This scenario keeps dashboard and travel-intel healthy while intentionally failing selected price-history endpoints so fallback isolation can be validated.'
    },
    data_confidence: 'high',
    sources: ['mock://controlled-failure-F'],
    meta: buildMeta({ sourceTier: 'mock-F' })
  },

  bookingAdvice: {
    currentPriceLevel: 'medium',
    currentPriceDeviationPct: 4.8,
    bestBookingWeeksBefore: '4-6',
    targetPriceTwd: 9200,
    confidence: 'medium',
    riskNotes: ['This object should not be served when the failure override is active'],
    riskNotes_i18n: {
      zh: ['這個物件在 failure override 啟動時不應直接被前端看到'],
      en: ['This object should not be served when the failure override is active']
    },
    data_confidence: 'medium',
    sources: ['mock://controlled-failure-F'],
    meta: buildMeta({ sourceTier: 'mock-F' })
  },

  flightTrend: {
    trend: buildTrend('2025-09-05', 7, 9700, 3100),
    meta: buildMeta({ sourceTier: 'mock-F' })
  },

  priceHistory: {
    origin: 'TPE',
    destination: 'FUK',
    ...buildYoy(9100, [1, 7, 8, 12]),
    data_confidence: 'medium',
    sources: ['mock://price-history-F'],
    meta: buildMeta({ anchorDate: '2025-09-05', sourceTier: 'mock-F' })
  },

  heatmap: {
    destination: 'FUK',
    year: 2025,
    type: 'outbound',
    days: buildHeatmapDays(2025, 9100, [1, 7, 8, 12]),
    meta: buildMeta({ sourceTier: 'mock-F' })
  },

  flights: {
    flights: buildFlights(9700, 'F'),
    meta: buildMeta({ sourceTier: 'mock-F' })
  }
};

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

const DATASETS = [
  { ...DATASET_A, id: 'mock-a' },
  { ...DATASET_B, id: 'mock-b' },
  DATASET_C,
  DATASET_D,
  DATASET_E,
  DATASET_F
];
const DATASET_MAP = new Map(DATASETS.map((dataset) => [dataset.id, dataset]));

/**
 * Pick a dataset for this server session (random once, fixed per process).
 * This ensures a single page-load sees consistent data across all endpoints.
 */
const configuredDatasetId = String(process.env.DEV_MOCK_DATASET || '').trim().toLowerCase();
const SESSION_DATASET = DATASET_MAP.get(configuredDatasetId)
  || DATASETS[Math.floor(Math.random() * DATASETS.length)];

function isDevMock() {
  return String(process.env.DEV_MOCK || '').trim().toLowerCase() === 'true';
}

function normalizeDatasetId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return DATASET_MAP.has(normalized) ? normalized : '';
}

function getDataset(selection) {
  const requestedId = normalizeDatasetId(selection);
  return requestedId ? DATASET_MAP.get(requestedId) : SESSION_DATASET;
}

function getDatasetLabel(selection) {
  return getDataset(selection).label;
}

function listDatasets() {
  return DATASETS.map((dataset) => ({
    id: dataset.id,
    label: dataset.label
  }));
}

module.exports = {
  isDevMock,
  getDataset,
  getDatasetLabel,
  listDatasets,
  normalizeDatasetId,
  DATASET_A,
  DATASET_B,
  DATASET_C,
  DATASET_D,
  DATASET_E,
  DATASET_F,
  buildHeatmapDays,
  buildMeta
};
