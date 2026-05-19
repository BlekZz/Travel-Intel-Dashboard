const { GoogleGenerativeAI } = require('@google/generative-ai');
const quotaTracker = require('./quotaTracker');

const SYSTEM_INSTRUCTION = '你是一個旅遊資料分析器。只可回傳合法 JSON；不得輸出 Markdown、前後綴說明或額外文字。找不到資料的欄位請回傳 null，禁止捏造。所有回應都必須包含 data_confidence (high/medium/low) 與 sources (URL 字串陣列)。';
const DEFAULT_CONFIDENCE = 'low';
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low']);
const FUN_SCORE_DIMENSIONS = ['shopping', 'relaxation', 'luxury', 'food', 'sightseeing', 'value', 'festival'];
const TRAVEL_INTEL_ASPECTS = [...FUN_SCORE_DIMENSIONS];
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DEFAULT_GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || 'v1beta';
const TRANSIENT_GEMINI_RETRY_DELAYS_MS = [400, 1200];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfiguredApiKeys() {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_SECONDARY
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function createClient(apiKey, options = {}) {
  if (!apiKey) {
    return null;
  }

  const useTools = options.useTools !== false;
  const useJsonMime = options.useJsonMime !== false;
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelConfig = {
    model: DEFAULT_GEMINI_MODEL,
    systemInstruction: SYSTEM_INSTRUCTION
  };

  if (useTools) {
    modelConfig.tools = [{ googleSearch: {} }];
  }

  if (useJsonMime) {
    modelConfig.generationConfig = {
      responseMimeType: 'application/json'
    };
  }

  return genAI.getGenerativeModel(modelConfig, {
    apiVersion: DEFAULT_GEMINI_API_VERSION
  });
}

function clampScore(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeConfidence(value, fallback = DEFAULT_CONFIDENCE) {
  return ALLOWED_CONFIDENCE.has(value) ? value : fallback;
}

function normalizeSources(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function normalizeLocalizedText(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const zh = typeof value.zh === 'string' && value.zh.trim() ? value.zh.trim() : null;
    const en = typeof value.en === 'string' && value.en.trim() ? value.en.trim() : null;
    return {
      zh: zh || en || fallback.zh || fallback.en || null,
      en: en || zh || fallback.en || fallback.zh || null
    };
  }

  if (typeof value === 'string' && value.trim()) {
    const text = value.trim();
    return {
      zh: fallback.zh || text,
      en: fallback.en || text
    };
  }

  return {
    zh: fallback.zh || fallback.en || null,
    en: fallback.en || fallback.zh || null
  };
}

function normalizeLocalizedStringArray(value, fallback = {}) {
  const zh = Array.isArray(value?.zh) ? normalizeStringArray(value.zh) : [];
  const en = Array.isArray(value?.en) ? normalizeStringArray(value.en) : [];
  const fallbackZh = Array.isArray(fallback?.zh) ? normalizeStringArray(fallback.zh) : [];
  const fallbackEn = Array.isArray(fallback?.en) ? normalizeStringArray(fallback.en) : [];

  return {
    zh: zh.length ? zh : (en.length ? en : fallbackZh),
    en: en.length ? en : (zh.length ? zh : fallbackEn)
  };
}

function parseJsonResponse(result) {
  const text = result?.response?.text?.();
  if (!text) {
    throw new Error('Empty Gemini response');
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/```json\s*([\s\S]*?)\s*```|```([\s\S]*?)```|(\{[\s\S]*\}|\[[\s\S]*\])/);
    const candidate = match?.[1] || match?.[2] || match?.[3];

    if (!candidate) {
      throw error;
    }

    return JSON.parse(candidate);
  }
}

function shouldTrySecondaryKey(message) {
  const text = String(message || '');
  return (
    text.includes('429') ||
    text.includes('503') ||
    text.includes('quota') ||
    text.includes('Resource has been exhausted') ||
    text.includes('high demand') ||
    text.includes('Service Unavailable')
  );
}

async function generateStructuredJson(prompt) {
  const apiKeys = getConfiguredApiKeys();
  if (apiKeys.length === 0) {
    throw new Error('Gemini API key is not configured');
  }

  const attempts = [
    { useTools: true, useJsonMime: true, label: 'tools+json' },
    { useTools: false, useJsonMime: true, label: 'json-only' },
    { useTools: false, useJsonMime: false, label: 'plain-text-json' }
  ];
  let lastError = null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyIndex === 0 ? 'primary' : `secondary-${keyIndex}`;

    for (const attempt of attempts) {
      const model = createClient(apiKey, attempt);
      if (!model) {
        throw new Error('Gemini API key is not configured');
      }

      for (let index = 0; index <= TRANSIENT_GEMINI_RETRY_DELAYS_MS.length; index += 1) {
        try {
          quotaTracker.recordProviderCall('gemini', {
            route: 'generateStructuredJson',
            mode: `${keyLabel}:${attempt.label}`,
            status: 'attempt'
          });
          const result = await model.generateContent(prompt);
          return parseJsonResponse(result);
        } catch (error) {
          lastError = error;
          const message = String(error?.message || '');
          const canRetryWithNextAttempt =
            message.includes('response mime type') ||
            message.includes('unsupported') ||
            message.includes('Markdown') ||
            message.includes('JSON');
          const isTransient =
            message.includes('503') ||
            message.includes('Service Unavailable') ||
            message.includes('high demand') ||
            message.includes('429');

          if (isTransient && index < TRANSIENT_GEMINI_RETRY_DELAYS_MS.length) {
            await sleep(TRANSIENT_GEMINI_RETRY_DELAYS_MS[index]);
            continue;
          }

          if (!canRetryWithNextAttempt) {
            if (keyIndex < apiKeys.length - 1 && shouldTrySecondaryKey(message)) {
              break;
            }
            throw error;
          }

          break;
        }
      }
    }

    if (lastError && keyIndex < apiKeys.length - 1 && shouldTrySecondaryKey(lastError.message)) {
      continue;
    }
  }

  throw lastError || new Error('Gemini structured generation failed');
}

function buildFunScoreFallback(dimensions, options = {}) {
  const normalizedDimensions = normalizeFunScoreDimensions(dimensions);
  const strength = Object.entries(normalizedDimensions)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .slice(0, 2)
    .map(([key]) => key);
  const weakness = Object.entries(normalizedDimensions)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => (a[1] || 0) - (b[1] || 0))
    .slice(0, 1)
    .map(([key]) => key);

  return {
    score: options.score ?? null,
    dimension_scores: Object.fromEntries(
      FUN_SCORE_DIMENSIONS.map((key) => [key, clampScore(normalizedDimensions[key])])
    ),
    strength,
    weakness,
    note: options.note || '目前無法取得穩定 AI 分析，已回傳可預期的保底結構。',
    data_confidence: normalizeConfidence(options.data_confidence, DEFAULT_CONFIDENCE),
    sources: normalizeSources(options.sources)
  };
}

function normalizeFunScoreDimensions(dimensions) {
  const source = dimensions && typeof dimensions === 'object' ? dimensions : {};

  return Object.fromEntries(
    FUN_SCORE_DIMENSIONS.map((key) => {
      const numeric = Number(source[key]);
      return [key, Number.isFinite(numeric) ? numeric : 0];
    })
  );
}

function normalizeFunScoreResponse(payload, dimensions) {
  const fallback = buildFunScoreFallback(dimensions);
  const source = payload && typeof payload === 'object' ? payload : {};
  const score = clampScore(source.score);
  const normalizedScores = Object.fromEntries(
    FUN_SCORE_DIMENSIONS.map((key) => [
      key,
      clampScore(source?.dimension_scores?.[key] ?? dimensions?.[key] ?? fallback.dimension_scores[key])
    ])
  );
  const confidence = normalizeConfidence(source.data_confidence, fallback.data_confidence);
  const strength = normalizeStringArray(source.strength);
  const weakness = normalizeStringArray(source.weakness);
  const note = typeof source.note === 'string' && source.note.trim()
    ? source.note.trim()
    : fallback.note;
  const sources = normalizeSources(source.sources);
  const hasMeaningfulScore = score !== null || Object.values(normalizedScores).some((value) => value !== null);

  return {
    score,
    dimension_scores: normalizedScores,
    strength,
    weakness,
    note,
    data_confidence: hasMeaningfulScore ? confidence : DEFAULT_CONFIDENCE,
    sources: hasMeaningfulScore ? sources : []
  };
}

function normalizeBookingAdviceResponse(payload, options = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const fallback = {
    currentPriceLevel: 'medium',
    currentPriceDeviationPct: null,
    bestBookingWeeksBefore: null,
    targetPriceTwd: null,
    confidence: DEFAULT_CONFIDENCE,
    riskNotes: [],
    riskNotes_i18n: null,
    data_confidence: DEFAULT_CONFIDENCE,
    sources: [],
    ...options
  };

  const deviation = toFiniteNumberOrNull(source.currentPriceDeviationPct);
  const targetPrice = toFiniteNumberOrNull(source.targetPriceTwd);
  const confidence = normalizeConfidence(source.confidence, fallback.confidence);
  const dataConfidence = normalizeConfidence(source.data_confidence, fallback.data_confidence);
  const riskNotes = normalizeStringArray(source.riskNotes).length
    ? normalizeStringArray(source.riskNotes)
    : normalizeStringArray(fallback.riskNotes);
  const sources = normalizeSources(source.sources).length
    ? normalizeSources(source.sources)
    : normalizeSources(fallback.sources);
  const bestBookingWeeksBefore = typeof source.bestBookingWeeksBefore === 'string' && source.bestBookingWeeksBefore.trim()
    ? source.bestBookingWeeksBefore.trim()
    : fallback.bestBookingWeeksBefore;
  const currentPriceLevel = ['high', 'medium', 'low'].includes(source.currentPriceLevel)
    ? source.currentPriceLevel
    : fallback.currentPriceLevel;
  const hasMeaningfulAdvice = deviation !== null || targetPrice !== null || riskNotes.length > 0 || Boolean(bestBookingWeeksBefore);

  return {
    currentPriceLevel,
    currentPriceDeviationPct: deviation !== null
      ? Number(deviation.toFixed(1))
      : fallback.currentPriceDeviationPct,
    bestBookingWeeksBefore,
    targetPriceTwd: targetPrice !== null
      ? Math.round(targetPrice)
      : fallback.targetPriceTwd,
    confidence: hasMeaningfulAdvice ? confidence : DEFAULT_CONFIDENCE,
    riskNotes,
    riskNotes_i18n: normalizeLocalizedStringArray(source.riskNotes_i18n || fallback.riskNotes_i18n, {
      zh: riskNotes,
      en: riskNotes
    }),
    data_confidence: hasMeaningfulAdvice ? dataConfidence : DEFAULT_CONFIDENCE,
    sources: hasMeaningfulAdvice ? sources : []
  };
}

function normalizeTravelIntelAspect(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const rawLevel = typeof source.level === 'string' ? source.level.trim().toLowerCase() : '';
  const level = ['high', 'medium', 'low'].includes(rawLevel) ? rawLevel : null;
  const note = typeof source.note === 'string' && source.note.trim() ? source.note.trim() : null;
  return {
    level,
    note,
    note_i18n: normalizeLocalizedText(source.note_i18n, { zh: note, en: note })
  };
}

function buildTravelIntelFallback(context = {}, options = {}) {
  const aspects = Object.fromEntries(
    TRAVEL_INTEL_ASPECTS.map((key) => [key, { level: null, note: null }])
  );

  return {
    destination: String(context.destination || '').toUpperCase() || null,
    dateRange: {
      start: context?.dateRange?.start || null,
      end: context?.dateRange?.end || null
    },
    aspects,
    summary: options.summary || '目前無法取得穩定的旅遊時段分析，已回傳保底結構。',
    summary_i18n: {
      zh: options.summary || '目前無法取得穩定的旅遊時段分析，已回傳保底結構。',
      en: options.summaryEn || options.summary || 'Travel intel is temporarily unavailable; a safe fallback structure was returned.'
    },
    data_confidence: normalizeConfidence(options.data_confidence, DEFAULT_CONFIDENCE),
    sources: normalizeSources(options.sources)
  };
}

function normalizeTravelIntelResponse(payload, context = {}) {
  const fallback = buildTravelIntelFallback(context);
  const source = payload && typeof payload === 'object' ? payload : {};
  const aspectsSource = source.aspects && typeof source.aspects === 'object' ? source.aspects : {};
  const aspects = Object.fromEntries(
    TRAVEL_INTEL_ASPECTS.map((key) => [key, normalizeTravelIntelAspect(aspectsSource[key])])
  );
  const summary = typeof source.summary === 'string' && source.summary.trim()
    ? source.summary.trim()
    : fallback.summary;
  const dataConfidence = normalizeConfidence(source.data_confidence, fallback.data_confidence);
  const sources = normalizeSources(source.sources);
  const hasMeaningfulAspect = Object.values(aspects).some((entry) => entry.level || entry.note);

  return {
    destination: String(source.destination || context.destination || fallback.destination || '').toUpperCase() || null,
    dateRange: {
      start: source?.dateRange?.start || context?.dateRange?.start || fallback.dateRange.start,
      end: source?.dateRange?.end || context?.dateRange?.end || fallback.dateRange.end
    },
    aspects,
    summary,
    summary_i18n: normalizeLocalizedText(source.summary_i18n, { zh: summary, en: summary }),
    data_confidence: hasMeaningfulAspect ? dataConfidence : DEFAULT_CONFIDENCE,
    sources: hasMeaningfulAspect ? sources : []
  };
}

async function computeFunScore(dimensions, context = {}) {
  const normalizedDimensions = normalizeFunScoreDimensions(dimensions);
  const prompt = [
    '請根據以下旅遊背景與偏好權重，輸出好玩指數分析 JSON。',
    '若資訊不足，欄位請回傳 null，不可補造資料。',
    'JSON schema:',
    JSON.stringify({
      score: 84,
      dimension_scores: {
        shopping: 78,
        relaxation: 90,
        luxury: 65,
        food: 88,
        sightseeing: 82,
        value: 70,
        festival: 75
      },
      strength: ['美食', '放鬆'],
      weakness: ['奢侈享受'],
      note: 'AI 分析說明文字',
      data_confidence: 'medium',
      sources: ['https://example.com']
    }),
    `context=${JSON.stringify(context)}`,
    `dimensions=${JSON.stringify(normalizedDimensions)}`
  ].join('\n');

  try {
    const payload = await generateStructuredJson(prompt);
    return {
      ...normalizeFunScoreResponse(payload, normalizedDimensions),
      _transport: {
        live: true,
        error: null
      }
    };
  } catch (error) {
    console.error('Gemini computeFunScore failed:', error.message);
    return {
      ...buildFunScoreFallback(normalizedDimensions),
      _transport: {
        live: false,
        error: error.message
      }
    };
  }
}

async function getBookingAdvice(priceHistory, trendData, options = {}) {
  const prompt = [
    '請根據歷史票價與近期趨勢，輸出購票建議 JSON。',
    '若資訊不足，欄位請回傳 null，不可補造資料。',
    'JSON schema:',
    JSON.stringify({
      currentPriceLevel: 'high',
      currentPriceDeviationPct: 18.5,
      bestBookingWeeksBefore: '6-8',
      targetPriceTwd: 9800,
      confidence: 'medium',
      riskNotes: ['農曆年旺季漲幅明顯'],
      riskNotes_i18n: {
        zh: ['農曆年旺季漲幅明顯'],
        en: ['Peak holiday demand is pushing fares higher.']
      },
      data_confidence: 'medium',
      sources: ['https://example.com']
    }),
    `priceHistory=${JSON.stringify(priceHistory)}`,
    `trendData=${JSON.stringify(trendData)}`
  ].join('\n');

  try {
    const payload = await generateStructuredJson(prompt);
    const liveFallback = {
      ...(options.fallback || {}),
      sources: []
    };
    return {
      ...normalizeBookingAdviceResponse(payload, liveFallback),
      _transport: {
        live: true,
        error: null
      }
    };
  } catch (error) {
    console.error('Gemini getBookingAdvice failed:', error.message);
    return {
      ...normalizeBookingAdviceResponse({}, {
        confidence: DEFAULT_CONFIDENCE,
        data_confidence: DEFAULT_CONFIDENCE,
        ...(options.fallback || {})
      }),
      _transport: {
        live: false,
        error: error.message
      }
    };
  }
}

function normalizeTravelInsightsResponse(payload, options = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const funScore = normalizeFunScoreResponse(source.funScore, options.dimensions || {});
  const bookingAdvice = normalizeBookingAdviceResponse(source.bookingAdvice, options.bookingFallback || {});
  const liveRequested = Boolean(source._transport?.live ?? options.live);
  const hasMeaningfulFun = funScore.score !== null || (Array.isArray(funScore.sources) && funScore.sources.length > 0) || funScore.data_confidence !== DEFAULT_CONFIDENCE;
  const hasMeaningfulBooking = bookingAdvice.targetPriceTwd !== null || bookingAdvice.currentPriceDeviationPct !== null || bookingAdvice.bestBookingWeeksBefore !== null || (Array.isArray(bookingAdvice.riskNotes) && bookingAdvice.riskNotes.length > 0);
  const overallLive = liveRequested && (hasMeaningfulFun || hasMeaningfulBooking);

  return {
    funScore,
    bookingAdvice,
    _transport: {
      live: overallLive,
      error: overallLive ? null : (source._transport?.error || options.error || 'Gemini returned an incomplete insights payload')
    }
  };
}

async function getTravelInsights(options = {}) {
  const normalizedDimensions = normalizeFunScoreDimensions(options.dimensions || {});
  const prompt = [
    '請根據以下旅遊背景、票價趨勢與偏好權重，輸出單一 JSON。',
    '若資訊不足，欄位請回傳 null，不可補造資料。',
    '你必須同時回傳 funScore 與 bookingAdvice 兩個子物件。',
    '若某個子物件資訊不足，仍要回傳完整欄位結構，不能省略 key，不能回傳半套物件。',
    '只有在有足夠依據時才能回傳 medium/high；若無來源或依據不足，confidence 與 data_confidence 必須是 low。',
    '若無有效 sources，請回傳空陣列，不要填入假連結。',
    'JSON schema:',
    JSON.stringify({
      funScore: {
        score: 84,
        dimension_scores: {
          shopping: 78,
          relaxation: 90,
          luxury: 65,
          food: 88,
          sightseeing: 82,
          value: 70,
          festival: 75
        },
        strength: ['美食', '放鬆'],
        weakness: ['奢侈享受'],
        note: 'AI 分析說明文字',
        data_confidence: 'medium',
        sources: ['https://example.com']
      },
      bookingAdvice: {
        currentPriceLevel: 'high',
        currentPriceDeviationPct: 18.5,
        bestBookingWeeksBefore: '6-8',
        targetPriceTwd: 9800,
        confidence: 'medium',
        riskNotes: ['農曆年旺季漲幅明顯'],
        data_confidence: 'medium',
        sources: ['https://example.com']
      }
    }),
    `context=${JSON.stringify(options.context || {})}`,
    `dimensions=${JSON.stringify(normalizedDimensions)}`,
    `priceHistory=${JSON.stringify(options.priceHistory || null)}`,
    `trendData=${JSON.stringify(options.trendData || null)}`
  ].join('\n');

  try {
    const payload = await generateStructuredJson(prompt);
    return {
      ...normalizeTravelInsightsResponse(payload, {
        dimensions: normalizedDimensions,
        bookingFallback: options.bookingFallback || {}
      }),
      _transport: {
        live: true,
        error: null
      }
    };
  } catch (error) {
    console.error('Gemini getTravelInsights failed:', error.message);
    return {
      funScore: buildFunScoreFallback(normalizedDimensions),
      bookingAdvice: normalizeBookingAdviceResponse({}, {
        confidence: DEFAULT_CONFIDENCE,
        data_confidence: DEFAULT_CONFIDENCE,
        ...(options.bookingFallback || {})
      }),
      _transport: {
        live: false,
        error: error.message
      }
    };
  }
}

async function getTravelIntelAnalysis(options = {}) {
  const destination = String(options.destination || '').toUpperCase();
  const dateRange = {
    start: options?.dateRange?.start || null,
    end: options?.dateRange?.end || null
  };
  const prompt = [
    '請根據旅遊地點與日期區間，搜尋並評估 7 個旅遊面向的適合程度。',
    '每個面向只能回傳 high、medium、low 三種等級之一；若資訊不足可回傳 null。',
    '每個面向都要提供一段簡短評語，聚焦該時段與該地點的具體原因。',
    '所有 AI 文字欄位都必須同時提供中英文兩版，以利前端切換語言，不可只回單語。',
    '你評估的是季節/時段適配，不是使用者偏好權重。',
    '若沒有足夠來源，不可給 high confidence；data_confidence 必須降為 low。',
    'JSON schema:',
    JSON.stringify({
      destination: 'NRT',
      dateRange: { start: '2026-08-15', end: '2026-08-21' },
      aspects: {
        shopping: { level: 'high', note: '夏季折扣與百貨活動較密集。', note_i18n: { zh: '夏季折扣與百貨活動較密集。', en: 'Late-summer shopping promotions and department-store events are still active.' } },
        relaxation: { level: 'medium', note: '城市節奏偏快，但近郊仍可安排放鬆行程。', note_i18n: { zh: '城市節奏偏快，但近郊仍可安排放鬆行程。', en: 'The city stays busy, but nearby quieter areas can still support a more relaxed plan.' } },
        luxury: { level: 'medium', note: '高端飯店與餐飲選項穩定，但旺季價格偏高。', note_i18n: { zh: '高端飯店與餐飲選項穩定，但旺季價格偏高。', en: 'Premium hotels and dining are available, but peak-season pricing remains elevated.' } },
        food: { level: 'high', note: '此時令海鮮與夏季限定餐飲選擇豐富。', note_i18n: { zh: '此時令海鮮與夏季限定餐飲選擇豐富。', en: 'Seasonal seafood and summer-limited menus are strong during this window.' } },
        sightseeing: { level: 'high', note: '天氣適合外出，主要景點可完整安排。', note_i18n: { zh: '天氣適合外出，主要景點可完整安排。', en: 'Most major attractions remain accessible, though weather comfort may vary by day.' } },
        value: { level: 'low', note: '旺季交通與住宿價格普遍較高。', note_i18n: { zh: '旺季交通與住宿價格普遍較高。', en: 'Flights and lodging are typically more expensive in this peak window.' } },
        festival: { level: 'high', note: '日期區間常有夏祭或煙火活動。', note_i18n: { zh: '日期區間常有夏祭或煙火活動。', en: 'Summer festivals and fireworks events are commonly available during this period.' } }
      },
      summary: '一句總結這段時間去該地點的整體輪廓。',
      summary_i18n: {
        zh: '一句總結這段時間去該地點的整體輪廓。',
        en: 'A one-line summary of what this destination feels like during the selected window.'
      },
      data_confidence: 'medium',
      sources: ['https://example.com']
    }),
    `context=${JSON.stringify({
      destination,
      dateRange,
      origin: options.origin || null,
      route: options.route || 'travelintel'
    })}`
  ].join('\n');

  try {
    const payload = await generateStructuredJson(prompt);
    return {
      ...normalizeTravelIntelResponse(payload, { destination, dateRange }),
      _transport: {
        live: true,
        error: null
      }
    };
  } catch (error) {
    console.error('Gemini getTravelIntelAnalysis failed:', error.message);
    return {
      ...buildTravelIntelFallback({ destination, dateRange }),
      _transport: {
        live: false,
        error: error.message
      }
    };
  }
}

module.exports = {
  computeFunScore,
  getBookingAdvice,
  getTravelInsights,
  getTravelIntelAnalysis,
  normalizeFunScoreDimensions,
  normalizeFunScoreResponse,
  normalizeBookingAdviceResponse,
  normalizeTravelInsightsResponse,
  normalizeTravelIntelResponse,
  buildFunScoreFallback,
  buildTravelIntelFallback,
  TRAVEL_INTEL_ASPECTS
};
