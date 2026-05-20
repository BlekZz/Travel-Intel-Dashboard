# Travel Intel Dashboard — Multi-Agent 分工表

> 版本：v1.0 · 2026-05-03
> 對應 PRD：Travel_Intel_Dashboard_PRD_v1.0.docx

---

## 架構原則

- **一個 Agent 獨佔一組檔案** → 結構上不可能產生 merge conflict
- **Wave 1 全部平行啟動** → 無相互依賴，可同時開工
- **Wave 2 依賴介面契約（文字），不是 Wave 1 的完成品** → Wave 1 寫完契約即可解鎖 Wave 2

---

## 專案技術總覽

| 層 | 技術 |
|---|---|
| 前端 | 純 HTML5 + Vanilla JS，單一 `public/index.html`，無框架 |
| 圖表 | Chart.js 4.x（CDN 載入） |
| 本地儲存 | LocalStorage |
| 樣式 | CSS Variables，支援 dark/light 自動切換 |
| 後端 | Node.js Express（API proxy，避免前端暴露 key） |
| 外部 API | Amadeus（機票/飯店）、OpenWeatherMap（天氣）、Gemini API（AI 分析） |

---

## 工作波次總覽

```
Wave 1（同時啟動，無依賴）
  Agent-A  專案骨架 + HTML Shell
  Agent-B  Amadeus API 整合
  Agent-C  Weather + Gemini API 整合
  Agent-D  CSS 設計系統

Wave 2（Wave 1 契約確認後同時啟動）
  Agent-E  Dashboard JS — Metric Cards + 追蹤分頁 + 好玩指數滑桿
  Agent-F  Dashboard JS — 雙軸趨勢圖 + 日曆熱力圖
  Agent-G  App Shell — Tab 路由 + 主題切換 + 全域 Toast
  Agent-H  Flight Search Tab JS
  Agent-I  Price History Tab JS
```

---

## 檔案獨佔矩陣

| 檔案 | Owner |
|---|---|
| `package.json` | Agent-A |
| `server.js` | Agent-A |
| `.env.example` | Agent-A |
| `public/index.html` | Agent-A |
| `services/amadeus.js` | Agent-B |
| `routes/flights.js` | Agent-B |
| `routes/dashboard.js` | Agent-B |
| `routes/priceHistory.js` | Agent-B |
| `services/weather.js` | Agent-C |
| `services/gemini.js` | Agent-C |
| `routes/funScore.js` | Agent-C |
| `routes/heatmap.js` | Agent-C |
| `routes/bookingAdvice.js` | Agent-C |
| `public/styles/main.css` | Agent-D |
| `public/styles/components.css` | Agent-D |
| `public/styles/charts.css` | Agent-D |
| `public/js/dashboard.js` | Agent-E |
| `public/js/charts.js` | Agent-F |
| `public/js/app.js` | Agent-G |
| `public/js/flightSearch.js` | Agent-H |
| `public/js/priceHistory.js` | Agent-I |

---

---

# Wave 1

---

## Agent-A｜專案骨架 + HTML Shell

### 角色
建立整個專案的骨架與 HTML 結構，為所有其他 Agent 提供共同的 element ID、CSS token 名稱與全域 JS 命名空間。

### 獨佔檔案
```
package.json
server.js
.env.example
public/index.html
```

### 任務清單

- **`package.json`**
  - 加入依賴：`express`, `dotenv`, `cors`, `node-fetch`（或 `axios`）
  - scripts：`"start": "node server.js"`, `"dev": "nodemon server.js"`

- **`server.js`**
  - Express 入口，CORS 設定，靜態服務 `public/`
  - 掛載所有 route 檔案（先以 stub 佔位，整合階段再填入）：
    ```js
    app.use('/api', require('./routes/dashboard'));
    app.use('/api', require('./routes/flights'));
    app.use('/api', require('./routes/priceHistory'));
    app.use('/api', require('./routes/funScore'));
    app.use('/api', require('./routes/heatmap'));
    app.use('/api', require('./routes/bookingAdvice'));
    ```
  - 統一錯誤處理 middleware

- **`.env.example`**
  - 列出所有必要 key：
    ```
    AMADEUS_API_KEY=
    AMADEUS_API_SECRET=
    OPENWEATHERMAP_API_KEY=
    GEMINI_API_KEY=
    PORT=3000
    ```

- **`public/index.html`**
  - HTML 骨架：三個 tab panel（固定 ID，見下方契約）
  - `<nav>` tab 切換按鈕（固定 ID）
  - 主題切換按鈕 `#theme-toggle`
  - `<link>` 載入三個 CSS 檔
  - Chart.js CDN `<script>` 標籤（必須在 JS 模組前載入）
  - 所有 JS 模組 `<script>` 標籤，載入順序：
    1. `app.js`（最先，建立命名空間）
    2. `dashboard.js`
    3. `charts.js`
    4. `flightSearch.js`
    5. `priceHistory.js`
  - `:root` CSS 變數 token 宣告（token 名稱見下方契約）
  - `window.TravelIntel = {}` 全域命名空間初始化

### 對外介面契約

> 以下所有 ID 與 token 名稱為全專案固定值，其他 Agent 直接依賴，不得更改。

**HTML Element IDs**

| 用途 | ID |
|---|---|
| Dashboard tab panel | `#tab-dashboard` |
| Flights tab panel | `#tab-flights` |
| Price History tab panel | `#tab-price-history` |
| Dashboard nav 按鈕 | `#nav-dashboard` |
| Flights nav 按鈕 | `#nav-flights` |
| Price History nav 按鈕 | `#nav-price-history` |
| 主題切換按鈕 | `#theme-toggle` |
| Toast 容器 | `#toast-container` |
| Metric Card — 機票均價 | `#metric-flight-price` |
| Metric Card — 飯店均價 | `#metric-hotel-price` |
| Metric Card — 天氣 | `#metric-weather` |
| Metric Card — 好玩指數 | `#metric-fun-score` |
| 追蹤分頁容器 | `#tracking-tabs` |
| 新增追蹤按鈕 | `#tracking-add-btn` |
| 好玩指數滑桿容器 | `#slider-container` |
| 趨勢圖 canvas | `#chart-trend` |
| 熱力圖容器 | `#chart-heatmap` |
| 航班結果列表 | `#flight-results` |
| 比較按鈕 | `#compare-btn` |
| YOY 圖 canvas | `#chart-yoy` |
| 全年趨勢圖 canvas | `#chart-fullyear` |
| 購票建議 Banner | `#advice-banner` |

**CSS Token 名稱**

```css
--color-bg
--color-surface
--color-text-primary
--color-text-secondary
--color-accent        /* #1D9E75 綠 */
--color-primary       /* #1A3C6E 深藍 */
--color-primary-mid   /* #2E6DB4 中藍 */
--color-danger
--color-success
--color-warning
--spacing-sm
--spacing-md
--spacing-lg
--font-size-base
--radius-card         /* 12px */
--radius-badge        /* 8px */
--z-modal             /* 100 */
--z-overlay           /* 90 */
--z-tooltip           /* 80 */
--z-nav               /* 70 */
```

**全域 JS 命名空間**

```js
window.TravelIntel = {
  app: {},        // Agent-G 填入
  dashboard: {},  // Agent-E 填入
  charts: {},     // Agent-F 填入
  flightSearch: {},// Agent-H 填入
  priceHistory: {}// Agent-I 填入
}
```

**Route 掛載慣例**

```js
// 每個 route 檔案使用 express.Router() 並 module.exports = router
app.use('/api', require('./routes/<name>'));
```

### 依賴
無。

---

## Agent-B｜Amadeus API 整合

### 角色
實作所有 Amadeus API 呼叫，作為後端 `/api/flights`、`/api/price-history`、`/api/flight-trend`、`/api/dashboard`（機票/飯店部分）的資料來源。

### 獨佔檔案
```
services/amadeus.js
routes/flights.js
routes/dashboard.js
routes/priceHistory.js
```

### 任務清單

- **`services/amadeus.js`**
  - OAuth2 token 取得（`POST https://test.api.amadeus.com/v1/security/oauth2/token`）
  - Token 快取（有效期內不重新取得）
  - 匯出函式：
    - `searchFlights(params)` → 呼叫 `GET /v2/shopping/flight-offers`
    - `searchHotels(params)` → 呼叫 `GET /v3/shopping/hotel-offers`
    - `getPriceMetrics(origin, dest, dateRange)` → 呼叫 `GET /v1/analytics/itinerary-price-metrics`
  - 所有函式回傳正規化資料（去除 Amadeus 原始回應雜訊）

- **`routes/flights.js`**
  - `GET /api/flights`
  - Query params：`origin`, `destination`, `departureDate`, `adults`, `cabin`, `maxStops`, `sort`
  - 呼叫 `amadeus.searchFlights()`，回傳正規化航班陣列

- **`routes/priceHistory.js`**
  - `GET /api/price-history`：回傳 YOY 月均價
  - `GET /api/flight-trend`：回傳日期區間每日機票/飯店均價資料點

- **`routes/dashboard.js`**
  - `GET /api/dashboard`（機票/飯店部分）
  - 計算指定日期範圍最低票價均值 + 飯店每晚均價
  - 計算與上月比較 % delta
  - **注意**：此 route 最終需與 Agent-C 的天氣/好玩指數資料合併，預留 merge 介面（見契約）

### 對外介面契約

**`GET /api/flights` 回應**
```json
{
  "flights": [
    {
      "id": "string",
      "airline": "EVA Air",
      "airlineCode": "BR",
      "flightNumber": "BR-851",
      "type": "traditional|budget|regional",
      "departureTime": "2025-08-01T10:00:00",
      "arrivalTime": "2025-08-01T14:30:00",
      "duration": "4h30m",
      "stops": 0,
      "stopCities": [],
      "price": 12500,
      "currency": "TWD",
      "cabin": "economy",
      "baggage": "23kg",
      "seatsRemaining": 4
    }
  ]
}
```

**`GET /api/price-history` 回應**
```json
{
  "origin": "TPE",
  "destination": "NRT",
  "currentYear": [{ "month": 1, "avgPrice": 11000 }],
  "priorYear":   [{ "month": 1, "avgPrice": 10200 }],
  "data_confidence": "medium",
  "sources": []
}
```

**`GET /api/flight-trend` 回應**
```json
{
  "trend": [
    { "date": "2025-08-01", "avgFlightPrice": 11500, "avgHotelPrice": 3200 }
  ]
}
```

**`GET /api/dashboard` 機票/飯店欄位**
```json
{
  "avgFlightPrice": 11500,
  "avgHotelPrice": 3200,
  "flightPriceDelta": 5.2,
  "hotelPriceDelta": -2.1
}
```

**`services/amadeus.js` 匯出**
```js
module.exports = { searchFlights, searchHotels, getPriceMetrics }
```

### 依賴
- `.env.example`（Agent-A 定義的 key 名稱：`AMADEUS_API_KEY`, `AMADEUS_API_SECRET`）

---

## Agent-C｜Weather + Gemini API 整合

### 角色
實作 OpenWeatherMap 天氣查詢、Gemini AI 好玩指數計算、熱力圖資料、購票建議，以及 `/api/dashboard` 的天氣/好玩指數部分。

### 獨佔檔案
```
services/weather.js
services/gemini.js
routes/funScore.js
routes/heatmap.js
routes/bookingAdvice.js
```

### 任務清單

- **`services/weather.js`**
  - `getCurrentWeather(city)` → OpenWeatherMap current weather
  - `getWeatherForecast(city, days)` → OpenWeatherMap 5-day forecast
  - 回傳格式：`{ temp, feelsLike, condition, icon, humidity, windSpeed, rainProbability }`

- **`services/gemini.js`**
  - 所有 Gemini 呼叫遵循 PRD 6.3 規範：
    - System prompt：「你是一個旅遊資料分析器。回傳 JSON，不含任何其他文字、說明或 Markdown 格式。」
    - 啟用 `tools: [{ google_search: {} }]`
    - 指定 `response_mime_type: 'application/json'`
    - 找不到資料的欄位回傳 `null`，禁止捏造
    - 必含 `data_confidence`（high/medium/low）與 `sources`（URL 陣列）
  - `computeFunScore(dimensions, context)` → 呼叫 Gemini，回傳好玩指數 JSON
  - `getBookingAdvice(priceHistory, trendData)` → 呼叫 Gemini，回傳購票建議 JSON

- **`routes/funScore.js`**
  - `POST /api/fun-score`
  - Body：`{ destination, dates, dimensions: { shopping, relaxation, luxury, food, sightseeing, value, festival } }`（七維度，總和須為 100）
  - 呼叫 `gemini.computeFunScore()`，回傳好玩指數

- **`routes/heatmap.js`**
  - `GET /api/heatmap`
  - Query params：`destination`, `year`, `type`（outbound/return）
  - 回傳日曆熱力圖每日資料（去程/回程分離）

- **`routes/bookingAdvice.js`**
  - `GET /api/booking-advice`
  - Query params：`origin`, `destination`, `targetMonth`
  - 呼叫 `gemini.getBookingAdvice()`，回傳購票建議

### 對外介面契約

**`POST /api/fun-score` 回應**
```json
{
  "score": 84,
  "dimension_scores": {
    "shopping": 78, "relaxation": 90, "luxury": 65,
    "food": 88, "sightseeing": 82, "value": 70, "festival": 75
  },
  "strength": ["美食", "放鬆"],
  "weakness": ["奢侈享受"],
  "note": "AI 分析說明文字",
  "data_confidence": "medium",
  "sources": ["https://..."]
}
```

**`GET /api/heatmap` 回應**
```json
{
  "destination": "NRT",
  "year": 2025,
  "type": "outbound",
  "days": [
    { "date": "2025-08-01", "flightPrice": 11500, "priceLevel": 2, "weatherScore": 75 }
  ]
}
```
> `priceLevel`：1（最低）～ 5（最高），對應前端五色梯度

**`GET /api/booking-advice` 回應**
```json
{
  "currentPriceLevel": "high",
  "currentPriceDeviationPct": 18.5,
  "bestBookingWeeksBefore": "6-8",
  "targetPriceTwd": 9800,
  "confidence": "medium",
  "riskNotes": ["農曆年旺季漲幅明顯"],
  "data_confidence": "medium",
  "sources": ["https://..."]
}
```

**`GET /api/dashboard` 天氣/好玩指數欄位**
```json
{
  "weather": {
    "avgTemp": 28.5,
    "avgHumidity": 72,
    "avgRainProbability": 35,
    "condition": "Partly Cloudy"
  },
  "funScore": {
    "overall": 84,
    "breakdown": { "shopping": 78, "food": 88 },
    "data_confidence": "medium"
  }
}
```

**`services/gemini.js` 匯出**
```js
module.exports = { computeFunScore, getBookingAdvice }
```

**`services/weather.js` 匯出**
```js
module.exports = { getCurrentWeather, getWeatherForecast }
```

### 依賴
- `.env.example`（Agent-A 定義的 key 名稱：`OPENWEATHERMAP_API_KEY`, `GEMINI_API_KEY`）

---

## Agent-D｜CSS 設計系統

### 角色
建立整套視覺設計語言：配色、排版、元件樣式、dark/light 主題、Skeleton Loader、圖表樣式。

### 獨佔檔案
```
public/styles/main.css
public/styles/components.css
public/styles/charts.css
```

### 任務清單

- **`main.css`**
  - `:root` token 具體數值（light theme 預設，`.theme-dark` 覆寫）
    - 主色 `#1A3C6E`、輔色 `#2E6DB4`、accent `#1D9E75`
    - 圓角：card 12px, badge/button 8px, input 6px
    - Border：`0.5px solid rgba(0,0,0,0.12)`，hover `0.3`
  - Grid/Flex 全域佈局
  - Tab panel 顯示/隱藏規則（`.tab-panel[hidden]`）
  - 響應式 breakpoint：768px、1280px（mobile-first）
  - 主題切換 transition（`transition: background-color 0.2s, color 0.2s`）
  - `prefers-color-scheme` 自動套用

- **`components.css`**
  - Metric Card：`.metric-card`, `.metric-card__label`, `.metric-card__value`, `.metric-card__delta`, `.metric-card__delta--positive`, `.metric-card__delta--negative`
  - Tracking Pill：`.tracking-pill`, `.tracking-pill--active`, `.tracking-pill__close`
  - Slider Group：`.slider-group`, `.slider-group__label`, `.slider-group__input`, `.slider-group__value`
  - Flight Row：`.flight-row`, `.flight-row--expanded`, `.flight-row__detail`
  - Compare Modal：`.compare-modal`, `.compare-modal__overlay`, `.compare-modal__content`
  - Booking Advice Banner：`.advice-banner`, `.advice-banner--book`（綠）, `.advice-banner--wait`（黃）, `.advice-banner--avoid`（紅）
  - Badge：`.badge`, `.badge--ai`（藍）, `.badge--ai-warn`（黃）, `.badge--ai-low`（紅）
  - Skeleton Loader：`.skeleton`, `.skeleton--card`, `.skeleton--row`, `.skeleton--chart`（灰色脈動動畫）
  - Toast：`.toast`, `.toast--error`, `.toast--success`, `.toast--warning`

- **`charts.css`**
  - `.chart-container`：canvas wrapper 尺寸設定
  - `.chart-container--dual-axis`：雙 Y 軸趨勢圖容器
  - `.chart-container--heatmap`：日曆熱力圖格子佈局（CSS Grid，52 欄 × 7 行）
  - `.chart-container--yoy`：YOY 折線圖容器
  - `.heatmap-cell`：熱力圖格子，含五級顏色 `.heatmap-cell--1` ～ `.heatmap-cell--5`
  - Chart.js tooltip 覆寫樣式

### 對外介面契約

> 以下 class 名稱為全專案固定值，Wave 2 Agent 直接使用。

**元件 Class 對照**

| 元件 | 主要 Class |
|---|---|
| Metric Card | `.metric-card` / `.metric-card__delta--positive` / `--negative` |
| Tracking Pill | `.tracking-pill` / `.tracking-pill--active` |
| Slider Group | `.slider-group` |
| Flight Row | `.flight-row` / `.flight-row--expanded` |
| Compare Modal | `.compare-modal` / `.compare-modal__overlay` |
| Advice Banner | `.advice-banner--book` / `.advice-banner--wait` / `.advice-banner--avoid` |
| AI Badge | `.badge--ai` / `.badge--ai-warn` / `.badge--ai-low` |
| Skeleton | `.skeleton--card` / `.skeleton--row` / `.skeleton--chart` |
| Toast | `.toast--error` / `.toast--success` / `.toast--warning` |

**主題切換機制**
- 在 `document.body` 加上 `.theme-dark` 或 `.theme-light` 即可切換
- 所有顏色透過 CSS variable，JS 不需要手動改顏色

**熱力圖色級**
```
level 1：低價 → var(--color-heatmap-1)  #4ade80（綠）
level 2：       var(--color-heatmap-2)  #a3e635
level 3：均值 → var(--color-heatmap-3)  #facc15（黃）
level 4：       var(--color-heatmap-4)  #fb923c
level 5：高價 → var(--color-heatmap-5)  #f87171（紅）
```

### 依賴
- Agent-A 定義的 CSS token 名稱（直接使用，不依賴 Agent-A 的程式碼）

---

---

# Wave 2

> **啟動條件**：Wave 1 四個 Agent 的「對外介面契約」章節確認後即可啟動，無需等待實作完成。

---

## Agent-E｜Dashboard JS — Metric Cards + 追蹤分頁 + 好玩指數滑桿

### 角色
實作 Dashboard Tab 的互動邏輯：資料載入、四格 Metric Cards、追蹤分頁管理、好玩指數七維度滑桿。

### 獨佔檔案
```
public/js/dashboard.js
```

### 任務清單

- **Metric Cards 載入**
  - `DOMContentLoaded` 後呼叫 `GET /api/dashboard`
  - 填入 `#metric-flight-price`, `#metric-hotel-price`, `#metric-weather`, `#metric-fun-score`
  - 依 delta 正負套用 `.metric-card__delta--positive` / `--negative`
  - fetch 中顯示 `.skeleton--card`；錯誤呼叫 `window.TravelIntel.app.showToast()`

- **追蹤分頁系統**
  - LocalStorage key：`travelintel_tracking`（最多 5 筆，儲存格式見下方）
  - 渲染 tracking pills 至 `#tracking-tabs`
  - 點擊 pill → 切換目的地 → 重新呼叫 dashboard API
  - `#tracking-add-btn` 點擊 → 新增當前目的地至 LocalStorage
  - pill 右側 × 按鈕 → 確認後移除

- **好玩指數七維度滑桿**
  - 在 `#slider-container` 渲染七個滑桿（購物/渡假放鬆/奢侈享受/吃喝玩樂/觀光名勝/性價比/節慶活動）
  - 即時顯示佔比總計是否達 100%
  - 任一滑桿變動 → debounce 400ms → `POST /api/fun-score`
  - 收到回應 → 更新 `#metric-fun-score`，顯示 AI badge（依 `data_confidence` 選色）

- **追蹤分頁 LocalStorage 格式**
  ```json
  [
    {
      "id": "uuid",
      "name": "東京夏季",
      "destination": "NRT",
      "origin": "TPE",
      "dateRange": { "start": "2025-08-01", "end": "2025-08-07" },
      "dimensions": { "shopping": 20, "relaxation": 15, "luxury": 10, "food": 25, "sightseeing": 15, "value": 10, "festival": 5 },
      "lastFetched": "2025-07-20T10:00:00Z",
      "refreshInterval": "daily|weekly|onOpen"
    }
  ]
  ```

### 對外介面契約

```js
window.TravelIntel.dashboard = {
  refresh(destination) {},   // Agent-G 呼叫（切換 tab 時）
  getActiveDestination() {}  // 回傳當前目的地字串
}
```

**LocalStorage key**：`travelintel_tracking`（Agent-G 讀取當前目的地）

### 依賴
| 依賴 | 項目 |
|---|---|
| Agent-A | HTML element IDs（`#tab-dashboard`, `#metric-*`, `#tracking-*`, `#slider-container`）、`window.TravelIntel` 命名空間 |
| Agent-B | `GET /api/dashboard` 回應（機票/飯店欄位） |
| Agent-C | `GET /api/dashboard` 回應（天氣/好玩指數欄位）、`POST /api/fun-score` 回應格式 |
| Agent-D | `.metric-card*`, `.tracking-pill*`, `.slider-group*`, `.skeleton--card`, `.badge--ai*` CSS class |

---

## Agent-F｜Dashboard JS — 雙軸趨勢圖 + 日曆熱力圖

### 角色
使用 Chart.js 實作 Dashboard Tab 的兩個視覺化元件：機票/飯店雙軸趨勢折線圖與日曆熱力圖。

### 獨佔檔案
```
public/js/charts.js
```

### 任務清單

- **雙 Y 軸趨勢圖（`#chart-trend`）**
  - 呼叫 `GET /api/flight-trend`
  - 左 Y 軸：機票均價（NT$），藍色折線
  - 右 Y 軸：飯店均價（NT$），綠色折線
  - 各附虛線平均線
  - Tooltip：hover 顯示當日兩項價格 + 與均線差距
  - 顏色從 CSS variables 讀取（`getComputedStyle(document.documentElement)`）

- **日曆熱力圖（`#chart-heatmap`）**
  - 呼叫 `GET /api/heatmap`
  - CSS Grid 渲染：月份標題 + 日期格子
  - 格子內容：日期數字 + 價格（k 縮寫）
  - 顏色套用 `.heatmap-cell--1` ～ `.heatmap-cell--5`
  - 去程/回程切換按鈕（重新 fetch 不同 `type` 參數）
  - 點擊格子 → popover 顯示：航班數量、最低票價、最高票價

- **主題切換支援**
  - 監聽 `document` 上的 `themechange` CustomEvent
  - 重新從 CSS variables 讀取顏色並更新 Chart.js 資料集顏色

- **`prefers-reduced-motion`**
  - 若為 true，停用 Chart.js animation

- **載入狀態**
  - fetch 中顯示 `.skeleton--chart`

### 對外介面契約

```js
window.TravelIntel.charts = {
  refreshCharts(destination) {},  // 重新 fetch 並更新圖表資料
  redrawCharts(theme) {}          // 僅更新配色，不重新 fetch（Agent-G 主題切換時呼叫）
}
```

### 依賴
| 依賴 | 項目 |
|---|---|
| Agent-A | `#chart-trend`, `#chart-heatmap` HTML ID、Chart.js CDN 須在此 script 前載入、`window.TravelIntel` 命名空間 |
| Agent-B | `GET /api/flight-trend` 回應格式 |
| Agent-C | `GET /api/heatmap` 回應格式（含 `priceLevel` 1–5） |
| Agent-D | `.chart-container*`, `.heatmap-cell--*`, `.skeleton--chart` CSS class、CSS 顏色 token 名稱 |

---

## Agent-G｜App Shell — Tab 路由 + 主題切換 + 全域 Toast

### 角色
應用程式入口，負責 tab 切換路由、dark/light 主題切換、全域錯誤 Toast，以及共享狀態管理。

### 獨佔檔案
```
public/js/app.js
```

### 任務清單

- **Tab 切換**
  - 監聽 `#nav-dashboard`, `#nav-flights`, `#nav-price-history` 點擊
  - 切換對應 tab panel 顯示（`hidden` attribute）
  - 更新 nav 按鈕 `aria-selected`
  - 觸發對應模組的 `.refresh()` 呼叫

- **主題切換**
  - `#theme-toggle` 點擊 → toggle `document.body.classList`（`.theme-dark` / `.theme-light`）
  - Persist 至 LocalStorage key `travelintel_theme`
  - 頁面載入時從 LocalStorage 還原主題（避免 FOUC，需在 `<head>` 有 inline script）
  - Dispatch CustomEvent：`document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }))`

- **全域 Toast**
  - 在 `#toast-container` 渲染 toast 訊息
  - 自動 3 秒後消失
  - 支援 `type`：`error`, `success`, `warning`

- **共享目的地狀態**
  - `currentDestination` getter/setter
  - setter 呼叫時通知所有已訂閱的 callback

- **啟動序列**
  - DOMContentLoaded → 還原主題 → 啟動預設 tab → 觸發初始資料載入

### 對外介面契約

```js
window.TravelIntel.app = {
  showToast(message, type) {},         // type: 'error'|'success'|'warning'
  get currentDestination() {},
  set currentDestination(val) {},
  subscribe(callback) {}               // destination 變更時呼叫 callback(newDest)
}
```

**LocalStorage key**：`travelintel_theme`（`'dark'` 或 `'light'`）

**CustomEvent**：`themechange`，`detail: { theme: 'dark'|'light' }`

### 依賴
| 依賴 | 項目 |
|---|---|
| Agent-A | 所有 tab/nav HTML ID、`#theme-toggle`, `#toast-container`、`window.TravelIntel` 命名空間 |
| Agent-D | `.theme-dark` / `.theme-light` body class、`.toast*` CSS class |
| Agent-E | `window.TravelIntel.dashboard.refresh()` 函式簽名 |
| Agent-F | `window.TravelIntel.charts.refreshCharts()`, `redrawCharts()` 函式簽名 |
| Agent-H | `window.TravelIntel.flightSearch.refresh()` 函式簽名 |
| Agent-I | `window.TravelIntel.priceHistory.refresh()` 函式簽名 |

> Agent-G 可先以 stub（空函式）呼叫 E/F/H/I 的 refresh，最後整合時補上即可。

---

## Agent-H｜Flight Search Tab JS

### 角色
實作 Tab 2 的所有前端互動：航班搜尋表單、結果列表渲染、排序篩選、列展開詳情、並排比較 Modal。

### 獨佔檔案
```
public/js/flightSearch.js
```

### 任務清單

- **搜尋表單**
  - `#tab-flights` 內建立搜尋表單（出發地/目的地 IATA、日期、成人數、艙等、行李、最大轉機次數）
  - 送出 → `GET /api/flights` → 渲染結果至 `#flight-results`
  - fetch 中顯示 5 行 `.skeleton--row`

- **結果列表**
  - 欄位：航空公司、航班代碼、類別 badge、起飛/抵達時間、飛行時數、轉機、含稅總價、行李額度
  - 預設依價格升冪排序
  - 點擊欄位標題 → 客戶端重新排序（不重新 fetch）

- **篩選**
  - 快速篩選 chips：直飛、廉航、含行李
  - 即時 filter 已載入的結果陣列

- **列展開**
  - 點擊列 → toggle `.flight-row--expanded`
  - 展開顯示：各航段起降時間、候機時間、機型、行李政策

- **比較 Modal**
  - 每列有 checkbox，最多選 3 筆
  - `#compare-btn` 點擊 → 開啟 `.compare-modal`
  - Modal 內並排顯示選中航班的所有欄位
  - overlay 點擊或關閉按鈕 → 關閉 Modal

- **AI 臨飛價格欄位**
  - 顯示 Gemini 估算的臨飛價格
  - 必須加上 `⚠` 符號與 `.badge--ai-warn` badge
  - Hover tooltip 說明「AI 估算，僅供參考」

### 對外介面契約

```js
window.TravelIntel.flightSearch = {
  refresh(destination) {}  // Agent-G tab 切換時呼叫
}
```

### 依賴
| 依賴 | 項目 |
|---|---|
| Agent-A | `#tab-flights`, `#flight-results`, `#compare-btn` HTML ID、`window.TravelIntel` 命名空間 |
| Agent-B | `GET /api/flights` 完整回應格式（含所有欄位） |
| Agent-D | `.flight-row`, `.flight-row--expanded`, `.compare-modal`, `.compare-modal__overlay`, `.skeleton--row`, `.badge--ai-warn` CSS class |
| Agent-G | `window.TravelIntel.app.showToast()` 錯誤顯示 |

---

## Agent-I｜Price History Tab JS

### 角色
實作 Tab 3 的所有前端邏輯：YOY 折線圖、全年趨勢圖、購票建議 Banner，以及所有 AI 估算可信度標示。

### 獨佔檔案
```
public/js/priceHistory.js
```

### 任務清單

- **參數選擇器**
  - `#tab-price-history` 內建立出發地/目的地/年份選擇器
  - 任一變動 → 重新 fetch 所有三支 API

- **YOY 折線圖（`#chart-yoy`）**
  - 呼叫 `GET /api/price-history`
  - 兩條折線：本年度（藍）、去年（灰）
  - X 軸：月份 1–12；Y 軸：均價 NT$
  - 灰色虛線全體平均線
  - 使用者查詢月份以半透明底色 highlight
  - Tooltip：各年同月均價 + YOY 漲跌 %

- **全年趨勢圖（`#chart-fullyear`）**
  - 呼叫 `GET /api/flight-trend`
  - X 軸：週為單位（全年 52 週）
  - 旺季區間（農曆年、暑假、連假）以紅底半透明區塊標示
  - 購票建議目標價格以水平虛線標示（從 `GET /api/booking-advice` 取得）

- **當前價格水準 Banner（`#advice-banner`）**
  - 呼叫 `GET /api/booking-advice`
  - 依 `currentPriceDeviationPct` 套用：
    - ≤ -15%：`.advice-banner--book`（綠）→「建議立即購票」
    - -15% ～ +15%：`.advice-banner--wait`（黃）→「建議觀望」
    - ≥ +15%：`.advice-banner--avoid`（紅）→「建議等待降價」
  - 顯示：最佳購票時間、目標價格、風險提示
  - Sources 渲染為可點擊外部連結（`target="_blank"`）

- **AI 估算標示**
  - 所有 Gemini 資料旁顯示「AI 估算 · 僅供參考」
  - 依 `data_confidence` 套用對應 badge：
    - `high` → `.badge--ai`（藍）
    - `medium` → `.badge--ai-warn`（黃）
    - `low` → `.badge--ai-low`（紅，附「請驗證」文字）

### 對外介面契約

```js
window.TravelIntel.priceHistory = {
  refresh(destination) {}  // Agent-G tab 切換時呼叫
}
```

### 依賴
| 依賴 | 項目 |
|---|---|
| Agent-A | `#tab-price-history`, `#chart-yoy`, `#chart-fullyear`, `#advice-banner` HTML ID、`window.TravelIntel` 命名空間、Chart.js CDN 已在此 script 前載入 |
| Agent-B | `GET /api/price-history` 回應格式、`GET /api/flight-trend` 回應格式 |
| Agent-C | `GET /api/booking-advice` 完整回應格式 |
| Agent-D | `.advice-banner--book`, `--wait`, `--avoid`、`.badge--ai*`、`.skeleton--chart` CSS class |
| Agent-G | `window.TravelIntel.app.showToast()` 錯誤顯示 |

---

---

# 最終整合步驟

> 所有 9 個 Agent 完成後，執行一次性整合。

1. **掛載 routes**：`server.js`（Agent-A）將 Agent-B 與 Agent-C 的所有 route 檔案實際 `require()` 進來（取代 stub）

2. **合併 `GET /api/dashboard`**：`routes/dashboard.js`（Agent-B）內，呼叫 `services/weather.js` 與 `services/gemini.js`（Agent-C），將天氣/好玩指數欄位合併至同一 JSON 回應

3. **核對 HTML ID**：`public/index.html`（Agent-A）對照本文件「對外介面契約」的 ID 表，確認所有 element ID 存在且正確

4. **補齊 refresh 呼叫**：`public/js/app.js`（Agent-G）的 tab 切換函式，補上對 `window.TravelIntel.dashboard.refresh()`、`charts.refreshCharts()`、`flightSearch.refresh()`、`priceHistory.refresh()` 的實際呼叫（取代 stub）

5. **環境設定**：複製 `.env.example` 為 `.env`，填入真實 API key

6. **啟動測試**：`npm run dev` → 逐一測試三個 tab 的 happy path

---

*本文件由 Claude Code 根據 Travel_Intel_Dashboard_PRD_v1.0.docx 自動生成。*

---

---

# UI/UX Pro Max Skill 整合

> 已安裝版本：從 [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 移植
> Skill 文件路徑：`docs/skills/ui-ux-pro-max.md`

## 適用 Agent

**Agent-D（CSS 設計系統）** 和所有涉及前端 UI 工作的 Agent（A/E/F/G/H/I）在執行任何視覺設計、CSS 撰寫、元件樣式或互動實作之前，**必須**以 `IsSkillFile: true` 讀取 `docs/skills/ui-ux-pro-max.md`，並依其規則執行。

## 觸發條件（何時必須讀取 Skill）

在以下任何情況發生時，必須先讀取 skill 文件再開始工作：

- 新增或修改 CSS（`main.css`, `components.css`, `charts.css`）
- 設計或實作 UI 元件（card, modal, button, badge, skeleton, toast）
- 選擇配色系統、字型配對或視覺風格
- 實作動畫或互動狀態（hover, active, disabled, loading）
- 建立響應式版面（breakpoints, mobile-first）
- 做 UI Code Review

## Skill 核心規則摘要（10 優先順序）

| 優先 | 類別 | 關鍵要求 |
|------|------|---------|
| 1 | 無障礙 | 對比度 4.5:1、focus ring、aria-label、鍵盤導航 |
| 2 | 觸控互動 | 最小 44×44px、8px 間距、cursor-pointer、載入狀態 |
| 3 | 效能 | WebP/AVIF、lazy loading、防 CLS、font-display: swap |
| 4 | 風格選擇 | 產品類型匹配、SVG icons（禁用 emoji）、一致性 |
| 5 | 版面響應式 | mobile-first、breakpoints 375/768/1024/1440 |
| 6 | 字型色彩 | body min 16px、line-height 1.5、語意色彩 token |
| 7 | 動畫 | 150–300ms、transform/opacity only、exit 比 enter 快 |
| 8 | 表單反饋 | 可見 label、錯誤置於欄位下方、Submit loading 狀態 |
| 9 | 導航模式 | 底部導航 ≤5 項、深度連結、可預測的返回行為 |
| 10 | 圖表資料 | 圖例 + Tooltip、色盲友善、不能只靠顏色傳達資訊 |

## 本專案設計系統對照

| UI/UX Pro Max 規則 | 本專案實作 |
|-------------------|-----------|
| 語意色彩 token | `--color-primary`, `--color-accent`, `--color-danger` 等 |
| 卡片圓角 | `--radius-card: 12px` |
| z-index 分層 | `--z-modal: 100`, `--z-nav: 70` 等 |
| Dark/Light 主題 | `.theme-dark` / `.theme-light` body class |
| Skeleton loading | `.skeleton--card`, `.skeleton--row`, `.skeleton--chart` |
| AI 可信度標示 | `.badge--ai` / `.badge--ai-warn` / `.badge--ai-low` |

## 使用方式

當 Antigravity 的任何 subagent 要執行前端 UI 工作時，應在開始前讀取此 skill：

```
view_file(
  AbsolutePath: "C:/Users/lolz_/Desktop/Travel-Intel-Dashboard/docs/skills/ui-ux-pro-max.md",
  IsSkillFile: true
)
```

讀取後，依照 skill 的「Rule Categories by Priority」由高到低套用規則，並在完成後自我 review「Pre-delivery Checklist」。
