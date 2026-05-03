const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    tools: [{ googleSearch: {} }],
    systemInstruction: "你是一個旅遊資料分析器。回傳 JSON，不含任何其他文字、說明或 Markdown 格式。找不到資料的欄位回傳 null，禁止捏造。必須包含 data_confidence (high/medium/low) 與 sources (URL 陣列)。",
    generationConfig: {
        responseMimeType: "application/json"
    }
});

async function computeFunScore(dimensions, context) {
    try {
        const prompt = `請根據以下維度佔比和背景資訊，計算好玩指數。
        背景資訊: ${JSON.stringify(context)}
        維度佔比: ${JSON.stringify(dimensions)}
        
        回傳 JSON 格式如下：
        {
          "score": 84,
          "dimension_scores": {
            "shopping": 78, "relaxation": 90, "luxury": 65,
            "food": 88, "sightseeing": 82, "value": 70, "festival": 75
          },
          "strength": ["優勢1", "優勢2"],
          "weakness": ["劣勢1"],
          "note": "AI 分析說明文字",
          "data_confidence": "high|medium|low",
          "sources": ["網址"]
        }`;

        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (error) {
        console.error('Error computing fun score:', error);
        return { error: 'Failed to compute fun score', data_confidence: 'low', sources: [] };
    }
}

async function getBookingAdvice(priceHistory, trendData) {
    try {
        const prompt = `請根據歷史票價和近期趨勢提供購票建議。
        歷史票價: ${JSON.stringify(priceHistory)}
        近期趨勢: ${JSON.stringify(trendData)}
        
        回傳 JSON 格式如下：
        {
          "currentPriceLevel": "high|medium|low",
          "currentPriceDeviationPct": 18.5,
          "bestBookingWeeksBefore": "6-8",
          "targetPriceTwd": 9800,
          "confidence": "high|medium|low",
          "riskNotes": ["風險說明"],
          "data_confidence": "high|medium|low",
          "sources": ["網址"]
        }`;

        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (error) {
        console.error('Error getting booking advice:', error);
        return { error: 'Failed to get booking advice', data_confidence: 'low', sources: [] };
    }
}

module.exports = { computeFunScore, getBookingAdvice };
