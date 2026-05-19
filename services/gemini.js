const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_INSTRUCTION = '你是一個旅遊資料分析器。只可回傳合法 JSON；不得輸出 Markdown、前後綴說明或額外文字。找不到資料的欄位請回傳 null，禁止捏造。所有回應都必須包含 data_confidence (high/medium/low) 與 sources (URL 字串陣列)。';
const DEFAULT_CONFIDENCE = 'low';
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low']);
const FUN_SCORE_DIMENSIONS = ['shopping', 'relaxation', 'luxury', 'food', 'sightseeing', 'value', 'festival'];

function createClient() {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    tools: [{ googleSearch: {} }],
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json'
    }
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

function parseJsonResponse(result) {
  const text = result?.response?.text?.();
  if (!text) {
    throw new Error('Empty Gemini response');
  }

  return JSON.parse(text);
}

async function generateStructuredJson(prompt) {
  const model = createClient();
  if (!model) {
    throw new Error('Gemini API key is not configured');
  }

  const result = await model.generateContent(prompt);
  return parseJsonResponse(result);
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

  return {
    score: clampScore(source.score),
    dimension_scores: Object.fromEntries(
      FUN_SCORE_DIMENSIONS.map((key) => [
        key,
        clampScore(source?.dimension_scores?.[key] ?? dimensions?.[key] ?? fallback.dimension_scores[key])
      ])
    ),
    strength: normalizeStringArray(source.strength),
    weakness: normalizeStringArray(source.weakness),
    note: typeof source.note === 'string' && source.note.trim()
      ? source.note.trim()
      : fallback.note,
    data_confidence: normalizeConfidence(source.data_confidence, fallback.data_confidence),
    sources: normalizeSources(source.sources)
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
    data_confidence: DEFAULT_CONFIDENCE,
    sources: [],
    ...options
  };

  const deviation = Number(source.currentPriceDeviationPct);
  const targetPrice = Number(source.targetPriceTwd);

  return {
    currentPriceLevel: ['high', 'medium', 'low'].includes(source.currentPriceLevel)
      ? source.currentPriceLevel
      : fallback.currentPriceLevel,
    currentPriceDeviationPct: Number.isFinite(deviation)
      ? Number(deviation.toFixed(1))
      : fallback.currentPriceDeviationPct,
    bestBookingWeeksBefore: typeof source.bestBookingWeeksBefore === 'string' && source.bestBookingWeeksBefore.trim()
      ? source.bestBookingWeeksBefore.trim()
      : fallback.bestBookingWeeksBefore,
    targetPriceTwd: Number.isFinite(targetPrice)
      ? Math.round(targetPrice)
      : fallback.targetPriceTwd,
    confidence: normalizeConfidence(source.confidence, fallback.confidence),
    riskNotes: normalizeStringArray(source.riskNotes).length
      ? normalizeStringArray(source.riskNotes)
      : normalizeStringArray(fallback.riskNotes),
    data_confidence: normalizeConfidence(source.data_confidence, fallback.data_confidence),
    sources: normalizeSources(source.sources).length
      ? normalizeSources(source.sources)
      : normalizeSources(fallback.sources)
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
    return normalizeFunScoreResponse(payload, normalizedDimensions);
  } catch (error) {
    console.error('Gemini computeFunScore failed:', error.message);
    return buildFunScoreFallback(normalizedDimensions);
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
      data_confidence: 'medium',
      sources: ['https://example.com']
    }),
    `priceHistory=${JSON.stringify(priceHistory)}`,
    `trendData=${JSON.stringify(trendData)}`
  ].join('\n');

  try {
    const payload = await generateStructuredJson(prompt);
    return normalizeBookingAdviceResponse(payload, options.fallback || {});
  } catch (error) {
    console.error('Gemini getBookingAdvice failed:', error.message);
    return normalizeBookingAdviceResponse({}, {
      confidence: DEFAULT_CONFIDENCE,
      data_confidence: DEFAULT_CONFIDENCE,
      ...(options.fallback || {})
    });
  }
}

module.exports = {
  computeFunScore,
  getBookingAdvice,
  normalizeFunScoreDimensions,
  normalizeFunScoreResponse,
  normalizeBookingAdviceResponse,
  buildFunScoreFallback
};
