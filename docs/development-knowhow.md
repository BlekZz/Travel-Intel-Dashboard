# Travel Intel Dashboard Development Know-How

Last updated: 2026-05-20

This file records implementation lessons that should be reused in future work to avoid rediscovering the same pitfalls.

---

## 0. Dev Mock Mode (`DEV_MOCK=true`)

### 目的

在調整 UI/CSS 時，避免每次頁面重整都觸發 Gemini / SerpApi / fli / OpenWeatherMap 的實際 API 呼叫，浪費有限的免費配額。

### 使用方式

**開啟 mock 模式（UI 開發期間）：**
```bash
# .env
DEV_MOCK=true
```

**關閉 mock 模式（測試真實 API）：**
```bash
# .env
DEV_MOCK=false
```

重啟 server 後，啟動日誌會明確顯示目前模式：
```
[startup] ⚠️  DEV_MOCK=true — serving mock data (mock-A (Tokyo summer peak))
[startup]    All /api/* calls return fixture data. Set DEV_MOCK=false to use real APIs.
```
或
```
[startup] DEV_MOCK=false — real API routes active
```

### 運作機制

- `server.js` 在掛載真實 routes **之前**，先掛載 `routes/devMockRouter.js`
- Mock router 攔截所有 `/api/*` 請求並回傳對應的 fixture data
- **不接觸任何外部服務**，response time < 5ms
- 每個 response 帶有 `_mock: true` 欄位與 `X-Dev-Mock: true` / `X-Dev-Mock-Dataset: <label>` HTTP headers，在 DevTools Network 面板一眼可辨

### 兩組 Datasets

資料集在 server 啟動時**隨機選一組**，該 session 全程固定（同一組資料，各端點一致）。

| Dataset | 場景 | 亮點 |
|---|---|---|
| **A — Tokyo summer peak** | 8 月旺季，高消費、多節慶 | festival=high, food=high, value=low, 機票 NT$11,500 |
| **B — Tokyo winter off-peak** | 1 月淡季，超值、購物黃金期 | shopping=high, luxury=high, value=high, 機票 NT$8,900 |

兩組資料都包含：
- `/api/dashboard` — 機票均價 + 飯店均價 + 天氣
- `/api/travelintel` — 7 面向完整分析（中英雙語 note_i18n）
- `/api/booking-advice` — 購票建議（中英雙語 riskNotes_i18n）
- `/api/flight-trend` — 7 天趨勢折線
- `/api/price-history` — 12 個月 YOY 資料
- `/api/heatmap` — 365 天熱力圖（以全年季節性公式生成）
- `/api/flights` — 4 筆假航班
- `POST /api/fun-score` — 從 travelintel aspects 反推的好玩指數

### 相關檔案

| 檔案 | 說明 |
|---|---|
| `services/devMock.js` | 兩組完整 datasets + `isDevMock()` / `getDataset()` 工具函式 |
| `routes/devMockRouter.js` | Express router，各端點 handler |
| `server.js` L.152-168 | Mock router 掛載邏輯 |
| `.env` `DEV_MOCK=` | 開關旗標 |

### 新增或修改 Dataset 的方式

1. 開啟 `services/devMock.js`
2. 在 `DATASET_A` 或 `DATASET_B` 修改對應欄位
3. 若要新增第三組，在 `DATASETS` 陣列加入新物件即可，`SESSION_DATASET` 會自動隨機選取

### 注意事項

- `_mock: true` 欄位不影響前端 normalization，所有 render 路徑都正常走過
- `/api/quota` 端點**不被 mock 攔截**（quota router 仍從真實 provider-usage.json 讀取）
- CI/CD 環境應確保 `DEV_MOCK=false`（或直接不設定，預設 false）

---

## 1. Gemini 模型選擇與配額

### 模型比較（2026-05）

| 模型 | 免費 RPD | 輸出品質 | 建議場景 |
|---|---|---|---|
| `gemini-2.5-flash` | 20/天 | ★★★★★ | 最終 production 驗證 |
| `gemini-1.5-flash` | 1500/天 | ★★★★☆ | 日常開發 + UI 測試 |
| `gemini-2.0-flash-lite` | 200/天 | ★★★☆☆ | 備選方案 |

目前 `.env` 預設為 `GEMINI_MODEL=gemini-1.5-flash`。

### 切換方式

```bash
# .env
GEMINI_MODEL=gemini-1.5-flash    # 日常開發（免費額度足夠）
GEMINI_MODEL=gemini-2.5-flash    # 品質驗證（需節制使用）
```

---

## 1. Flight provider execution on Windows

- Do not assume `fli.exe` is the safest runtime path on Windows.
- `pip install flights` creates unsigned launcher wrappers under:
  - `C:\Users\<user>\AppData\Roaming\Python\Python313\Scripts\fli.exe`
  - `fli-mcp.exe`
  - `fli-mcp-http.exe`
- These are standard Python `console_scripts` launchers, but unsigned `.exe` stubs can trigger antivirus heuristics.
- Preferred safe path for this repo:

```txt
FLI_COMMAND=C:\Users\<user>\.pyenv\pyenv-win\versions\3.13.11\python.exe
```

- The backend adapter now treats a Python interpreter command as:

```txt
python.exe -m fli.cli.main ...
```

That avoids executing `fli.exe` directly while still using the same official `flights` package.

## 2. Local proxy pollution can break provider calls

- This machine had these environment variables set:
  - `HTTP_PROXY=http://127.0.0.1:9`
  - `HTTPS_PROXY=http://127.0.0.1:9`
  - `ALL_PROXY=http://127.0.0.1:9`
- That caused `fli` to fail with connection errors to `127.0.0.1:9`.
- The `services/flights/fli.js` adapter now clears those proxy variables before spawning the fallback provider.
- If flight provider behavior suddenly degrades, inspect `Env:` for proxy variables before blaming provider code.

## 3. `fli` CLI contract is version-sensitive

- Do not assume all locale options from other providers map to `fli`.
- The current `fli flights --help` on 2026-05-19 does **not** support:
  - `--language`
  - `--country`
- Supported options include:
  - `--class`
  - `--stops`
  - `--currency`
  - `--format json`
- If `fli` is upgraded, re-check the live help output before changing the adapter.

## 4. SerpApi payload mapping details

- For Google Flights results via SerpApi, the carrier code may not be exposed as a dedicated field.
- Real payloads observed in this repo used:
  - `flight_number: "TR 866"`
  - `airline_logo: ".../TR.png"`
- The normalizer should infer airline code from:
  1. explicit provider fields when present
  2. `flight_number`
  3. `airline_logo`
- The final normalized output should look like:
  - `airlineCode: "TR"`
  - `flightNumber: "TR-866"`
  - `departureTime: "2026-08-15T06:45:00"`

## 5. Align all flight-derived views to one snapshot source

- Flight Search, Dashboard, Price History, Trend, and Heatmap must not each invent their own idea of the current flight-price level.
- Use `services/flights/snapshot.js` as the common source for:
  - route/date anchor
  - average price
  - provider metadata
  - signature/seed for deterministic derived series
- This avoids one tab showing live SerpApi prices while another still shows unrelated deterministic values.

## 6. Cache semantics already in use

- `services/flights/cache.js` now implements:
  - short TTL cache
  - last-known-good cache
- Expected meaning of metadata:
  - `cached=true, stale=false` → short TTL cache hit
  - `cached=true, stale=true` → last-known-good fallback
  - `fallbackUsed=true` → not the primary live path for this request
- Frontend should display these states, not hide them.

## 7. Preserve previous successful UI data on failure

- Do not blank the panel immediately when a refresh fails.
- Flight Search now follows this rule:
  - if there is prior successful data, keep rendering it
  - overlay a panel-level warning/error state with retry
- This pattern should be reused in other tabs where live data can temporarily fail.

## 8. Toast is not enough

- Toast should remain a global nudge, not the only failure surface.
- For content panels, always prefer:
  - inline loading state
  - inline unavailable/error state
  - retry action
  - explicit source/provider metadata

## 9. Gemini config lessons

- `models/gemini-1.5-pro` is no longer a safe default for this repo; it returned `404 Not Found` on the active `v1beta` `generateContent` path in this environment.
- The service default is now `gemini-2.5-flash`, with env overrides:
  - `GEMINI_MODEL`
  - `GEMINI_API_VERSION`
- Do not assume the following combination is valid:
  - `tools: [{ googleSearch: {} }]`
  - `generationConfig.responseMimeType = 'application/json'`
- In this environment, that combination returned `400 Bad Request` (`Tool use with a response mime type: 'application/json' is unsupported`).
- The service now uses a fallback sequence:
  1. tools + JSON mime
  2. JSON mime without tools
  3. plain text forced to JSON by prompt + post-parse cleanup
- Keep post-parse cleanup in place because once JSON mime is dropped, the model may still wrap JSON in code fences.
- Transient Gemini failures such as `503 Service Unavailable` / high-demand spikes should be treated as retriable, not as permanent configuration bugs.

## 10. Codex sandbox limitations to remember

- In this environment, Node child-process spawning and local hidden-window server launch can be sandbox-sensitive.
- If route-level fallback verification is blocked inside the sandbox:
  - verify the provider CLI independently
  - verify payload normalization independently

## 11. Booking-advice fallback should be tiered, not binary

- Do not model booking advice as only `live` or `deterministic`.
- The route now uses four tiers:
  1. fresh cache
  2. live Gemini
  3. last-known-good cache
  4. deterministic sample
- This matters because Gemini failures are often transient (`503`, high demand), not permanent misconfiguration.
- Return fallback state explicitly in response `meta`:
  - `cached`
  - `stale`
  - `fallbackUsed`
  - `sourceTier`
  - `attempts`
- Do not let a live Gemini response inherit deterministic sample `sources`; otherwise the UI will falsely imply that the live answer was sample-backed.

## 12. Track quota locally, and prefer observed limits over assumptions

- Keep provider quota assumptions in `config/provider-quotas.json`, but treat them as defaults, not as unquestionable truth.
- Gemini free-tier limits can differ by model, account state, or rollout state.
- If Gemini returns `429` with an explicit `quotaValue` or retry delay, prefer that observed signal over the static config when presenting UI guidance.
- This repo now exposes `/api/quota` and stores tracked usage in `tmp/provider-usage.json`.
- The header quota bar is meant to guide operator behavior, not to replace the provider console.

## 13. Count actual outbound attempts, not just successful responses

- Gemini structured generation may try several compatibility modes:
  1. tools + JSON mime
  2. JSON mime only
  3. plain text JSON
- Each outbound call still consumes provider capacity, even if the request later falls back.
- Quota tracking therefore counts outbound attempts, not just successful final payloads.

## 14. Cooldown is a product behavior, not only a backend optimization

- For Gemini-backed UI surfaces, repeated manual refresh should not be the primary operator loop.
- The current pattern is:
  - return fallback metadata with `retryAfterMs`
  - show a visible countdown in the UI
  - auto-retry live once
  - discourage spam refresh with inline note / tooltip
- This keeps the system legible to the user while also protecting free-tier quotas.

## 15. If you add a second Gemini key, it must be from a different project

- Adding a second API key from the same project does not meaningfully solve project-level quota exhaustion.
- This repo now supports:
  - `GEMINI_API_KEY`
  - `GEMINI_API_KEY_SECONDARY`
- The intended use is:
  - primary project handles the normal path
  - secondary project is the last quota/isolation fallback
- Keep the secondary key as a true last resort. The correct first move is still:
  - merge calls
  - cache results
  - rate-limit UI retries

## 16. Shared Gemini insights should populate downstream route caches

- `services/travelInsights.js` is now the shared layer for Gemini-backed trip analysis.
- `dashboard` can precompute and cache insights that `fun-score` and `booking-advice` later reuse.
- Route-level caches can still exist for endpoint-specific behavior, but the shared insights layer should be treated as the first reuse boundary.
  - then re-run the full route check in the user's unrestricted local shell
- Do not confuse sandbox restrictions with actual app bugs.

## 11. Recommended validation sequence for future flight work

1. Confirm `.env` presence without printing secrets
2. Confirm `SERPAPI_API_KEY` is present
3. Confirm `FLI_COMMAND` points to `python.exe` rather than unsigned `fli.exe` on Windows
4. Smoke test live SerpApi path
5. Simulate SerpApi miss and confirm `fli` fallback
6. Confirm cache hit path
7. Confirm last-known-good path
8. Only then validate frontend source badges and retry UX

## 17. If the product model changes, stop spending Gemini budget inside aggregate dashboard routes

- Once the AI surface became `travelintel` instead of weighted `fun-score`, `GET /api/dashboard` should no longer invoke Gemini.
- Keep dashboard aggregation focused on deterministic or provider-backed metrics:
  - flight snapshot
  - hotel snapshot
  - weather summary
- Move Gemini into a dedicated route with its own cache, cooldown, retry metadata, and UI trigger rules.
- This makes the product behavior legible:
  - every search may refresh prices
  - only destination/date changes refresh `travelintel`

## 18. Cache keys should follow the real product trigger, not the legacy schema

- The old fun-score cache key included seven user-assigned weights.
- The new `travelintel` cache key should be driven by:
  - `origin`
  - `destination`
  - `dateRange.start`
  - `dateRange.end`
- If the product question is "what is this destination like in this travel window", any extra key dimension increases Gemini spend without improving relevance.

## 19. Route-level cooldown should not block fresh cache reads

- Cooldown is for avoiding repeated outbound provider calls.
- It should not prevent the UI from reading a fresh cached answer.
- For quota-sensitive routes:
  1. check fresh cache first
  2. only then check whether a new live call is allowed
  3. return stale or deterministic fallback only if no fresh cache exists
- This prevents a good live answer from being hidden behind a cooldown fallback.

## 20. Travelintel UX should preserve the AI result across same-window searches

- If destination and date range are unchanged, the user pressing Search is asking for newer price/hotel data, not a new seasonal analysis.
- Frontend behavior should therefore be:
  - refresh dashboard metrics
  - refresh charts
  - keep current `travelintel` card/panel
- Re-run `travelintel` only when the destination/date signature changes.

## 21. Seven-aspect travelintel is easier to ground than one synthetic score

- `high/medium/low + short reason` is easier for Gemini to ground with web evidence than a single synthetic 0-100 score.
- It also produces a UI that is easier to audit.
- If a result is weak, you can see which aspect is weak and why, instead of only seeing one low-confidence number.

## 22. When quota-heavy AI routes are under active testing, expect the UI to look like the system is "all fallback"

- In this repo, repeated manual testing can push Gemini-backed routes into cooldown, stale-cache, or deterministic fallback even while the structural implementation is correct.
- Do not diagnose that state from visuals alone.
- Separate the problem into two questions:
  1. Is the route contract healthy?
  2. Is the provider currently allowing fresh live calls?
- For this project, a browser page that looks "all fallback" after many test cycles is often an operational artifact, not a frontend regression.

## 23. Trend fallback needs route-level verification before frontend debugging

- If the trend chart appears to be in fallback mode, first call `/api/flight-trend` directly with the exact `origin`, `destination`, and `dateRange` used by the UI.
- In this run, the endpoint returned `200` with live provider metadata while the UI still appeared degraded.
- That means the next debugging layer is:
  - request context assembly in the frontend
  - stale panel state reuse
  - fallback messaging logic
- Do not start by changing provider code when the route is already live.

## 24. Every user-visible Gemini text field should have an explicit bilingual payload

- Do not rely on one free-text field plus UI translation assumptions.
- For this project, if a text can appear on screen and the site can switch languages, the response should carry both variants explicitly.
- Current examples:
  - `summary_i18n: { zh, en }`
  - `note_i18n: { zh, en }`
  - `riskNotes_i18n: { zh: [], en: [] }`
- This avoids mixed-language UI states such as English chrome with Chinese AI text.

## 25. Fix chart growth bugs at the container level first

- The repeated downward-extension bug in `priceHistory` is primarily a geometry/state problem, not a data problem.
- First stabilize:
  - panel min-height
  - fixed canvas/container height
  - `overflow: hidden`
  - theme redraw behavior that reuses the last payload instead of recursively refetching
- Only after geometry is stable should you tune chart rendering details.

## 26. Browser-level QA should be documented as a distinct milestone from API validation

- API validation can pass while the visual product still has layout or state bugs.
- Keep separate notes for:
  - route health
  - browser visual QA
  - quota/cooldown operational state
- This prevents false conclusions such as "backend broken" when the actual issue is a frontend state or rate-limit artifact.

## 27. Lock container height before innerHTML clear to eliminate layout jumps

- When switching between data states that require clearing a container's innerHTML (e.g. heatmap Outbound ↔ Return toggle), the page height will jump if the new content is shorter during the loading skeleton phase.
- Pattern to prevent this:
  ```js
  const currentHeight = container.offsetHeight;
  if (currentHeight > 0) {
    container.style.minHeight = `${currentHeight}px`;
  }
  container.innerHTML = '<div class="skeleton skeleton--chart"></div>';
  try {
    // ... fetch and render ...
  } finally {
    container.style.minHeight = ''; // always restore
  }
  ```
- The `finally` block is critical — it guarantees cleanup even on errors or early returns.
- Do NOT set `minHeight` in CSS permanently; that would prevent shorter content states from collapsing naturally after initial load.
- This same pattern should be applied to any panel that can switch between a skeleton and a variable-height result: heatmap, price history advice banner, travelintel panel.

## 28. Sort AI-ranked cards by confidence level, then alphabetically

- When rendering a set of AI-assessed dimension cards (e.g. 7 travel aspects), do not rely on a fixed array order.
- Define a score mapping: `{ high: 3, medium: 2, low: 1, undefined: 0 }`.
- Sort by descending score first, then by localized title via `localeCompare`.
- Use the `Intl` locale hint (`'zh-Hant'` vs `'en'`) to match the app's current language.
  ```js
  const levelScores = { high: 3, medium: 2, low: 1 };
  const sortedKeys = [...ASPECT_KEYS].sort((a, b) => {
    const scoreA = levelScores[aspects[a]?.level] || 0;
    const scoreB = levelScores[aspects[b]?.level] || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return (labels[a] || '').localeCompare(labels[b] || '', isChinese() ? 'zh-Hant' : 'en');
  });
  ```
- This makes the most relevant (highest confidence) items immediately visible at the top-left of a grid without requiring the user to scan the entire layout.

## 29. DEV_MOCK nodemon does NOT auto-reload on .env changes

- `nodemon` watches `*.js`, `*.json` files by default; it does **not** watch `.env`.
- Changing `DEV_MOCK=true` in `.env` will NOT trigger an automatic server restart.
- Correct workflow to switch mock mode:
  1. Edit `.env`
  2. Kill the running server (Ctrl+C or kill background task)
  3. Restart with `npm run dev`
- The startup log will immediately confirm the new mode:
  - Mock: `⚠️  DEV_MOCK=true — serving mock data`
  - Real: `DEV_MOCK=false — real API routes active`
- Do not debug "mock not working" without first verifying the server was restarted after the `.env` change.
