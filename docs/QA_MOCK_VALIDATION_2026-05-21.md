# Travel Intel Dashboard Mock QA Validation

Date: 2026-05-21

## Scope

This QA wave was run in mock-only mode. No real Gemini, SerpApi, `fli`, Amadeus, or OpenWeather traffic was used.

Validation goals:

- expand mock coverage beyond happy-path A/B fixtures
- verify user flow and data flow completeness with deterministic scenarios
- test fallback, partial-data, empty-state, and controlled endpoint-failure behavior
- verify desktop and mobile layout resilience
- fix high-value regressions found during QA

## Environment

- app URL: `http://localhost:3000/`
- browser path: Codex in-app Browser plugin (`iab`)
- browser availability: available
- viewport coverage:
  - default desktop viewport (`1280x720`)
  - mobile breakpoint (`375x812`)
- runtime mode: `DEV_MOCK=true`

## Mock Scenario Set

The mock layer now supports six deterministic scenarios:

| ID | Purpose |
|---|---|
| `mock-a` | baseline summer peak / happy path |
| `mock-b` | baseline winter off-peak / happy path |
| `mock-c` | long-copy + premium-layout stress |
| `mock-d` | partial fallback + retry metadata |
| `mock-e` | sparse / empty-state coverage |
| `mock-f` | controlled endpoint failures (`booking-advice`, `flight-trend`) |

Selection methods:

- server startup: `node scripts/run-server.js mock mock-d`
- route override for API QA: `?mockDataset=mock-d`
- request header override for API QA: `X-Dev-Mock-Dataset: mock-d`

Selection precedence in the dev mock router:

1. query `mockDataset`
2. header `X-Dev-Mock-Dataset`
3. env `DEV_MOCK_DATASET`
4. session default mock dataset

## User Flow Coverage

### 1. Dashboard flow

Flow:

`/` -> dashboard shell loads -> dashboard metrics + travel-intel cards + trend chart + heatmap render

Validated:

- dashboard page identity loaded correctly
- no blank shell
- no framework error overlay
- baseline metrics rendered from mock payload
- trend chart rendered for healthy scenarios
- trend chart degraded to inline fallback state for controlled failure scenario
- heatmap rendered for healthy scenarios
- heatmap rendered true empty-state under `mock-e`
- no cross-tab chart toast leakage after fix

### 2. Flight search flow

Flow:

`/` -> switch to `航班搜尋` -> results list renders -> row expands -> compare selection updates -> compare modal opens

Validated:

- baseline `mock-a` produced 4 rows and expandable details
- long-content `mock-c` produced 5 rows without horizontal overflow on mobile
- compare button correctly updated to `比較所選（2）`
- compare modal opened with 2 selected cards on mobile
- sparse `mock-e` rendered 0 rows and the empty-state copy path

### 3. Price history flow

Flow:

`/` -> switch to `歷史價格` -> booking advice banner + YOY + full-year trend render

Validated:

- baseline `mock-a` rendered banner and both chart surfaces
- partial fallback `mock-d` rendered fallback badges, retry countdown, and source notes
- sparse `mock-e` rendered no-data copy without crashing
- controlled failure `mock-f` rendered deterministic fallback inline when `booking-advice` and `flight-trend` returned `503`

## Data Flow Coverage

### Frontend data flow

1. `public/index.html`
2. `public/js/app.js`
3. module handoff:
   - `public/js/dashboard.js`
   - `public/js/charts.js`
   - `public/js/flightSearch.js`
   - `public/js/priceHistory.js`
4. `/api/*` requests
5. `routes/devMockRouter.js`
6. `services/devMock.js`
7. selected scenario payload returned with:
   - `X-Dev-Mock: true`
   - `X-Dev-Mock-Dataset: <label>`
   - `_mock: true`

### QA-specific mock data flow

- healthy scenarios (`mock-a`, `mock-b`, `mock-c`) return full `200` payloads
- fallback scenarios (`mock-d`, `mock-e`) return `200` payloads with `meta.fallbackUsed=true` where appropriate
- controlled-failure scenario (`mock-f`) intentionally returns `503` for:
  - `/api/booking-advice`
  - `/api/flight-trend`

## API Matrix Summary

Final route sweep result:

| Dataset | 200 routes | intentional 503 routes | fallback-backed endpoints |
|---|---:|---:|---|
| `mock-a` | 8 | 0 | none |
| `mock-b` | 8 | 0 | none |
| `mock-c` | 8 | 0 | none |
| `mock-d` | 8 | 0 | `dashboard`, `travelintel`, `bookingAdvice`, `flightTrend`, `priceHistory`, `heatmap`, `flights` |
| `mock-e` | 8 | 0 | `dashboard`, `travelintel`, `bookingAdvice`, `flightTrend`, `priceHistory`, `heatmap`, `flights` |
| `mock-f` | 6 | 2 | `bookingAdvice` and `flightTrend` as intentional mock failures |

Notes:

- `heatmap` now follows the selected mock scenario instead of always synthesizing generic days.
- this made `mock-e` capable of returning a true empty heatmap state.

## Responsive / Visual QA

### Desktop

- baseline dashboard visuals passed on default desktop viewport
- trend chart, metric cards, travel-intel cards, and price-history banner remained readable
- no console errors in healthy scenarios

### Mobile (`375x812`)

- `mock-c` long summary and long card copy did not create horizontal overflow
- `mock-c` flights list did not overflow horizontally
- compare modal with 2 selected flights fit the mobile viewport without width spill
- measured mobile overflow check:
  - `document.documentElement.scrollWidth === document.documentElement.clientWidth`
  - flight result container width also stayed within viewport

## Findings

### Fixed in this QA wave

1. `priceHistory` null advice numbers were being coerced into false `0` values.
   - symptom: sparse advice state displayed `NT$0` and `0%` instead of unavailable markers
   - fix: `normalizeAdvicePayload()` now treats `null` / `undefined` / empty string as unavailable instead of numerically coercing them

2. chart status toasts were too noisy for background / cross-flow behavior.
   - symptom: chart no-data or fallback toast could appear while the user was already in another tab
   - fix: trend/heatmap no-data and fallback notifications were downgraded to inline-only states

3. heatmap did not respect selected mock scenarios.
   - symptom: `mock-e` could not produce a real empty heatmap because the route synthesized generic days
   - fix: `routes/devMockRouter.js` now serves scenario-owned `heatmap` payloads when a mock scenario is selected

### Remaining low-severity risk

1. controlled `503` failures still produce a browser console `warn` from `charts.js`.
   - this is now non-fatal and the UI degrades correctly
   - it is acceptable diagnostic noise for failure-mode QA, but not a runtime crash

2. scenario switching is payload-centric.
   - the shell's visible search labels can still reflect the current local UI state even when the selected mock scenario conceptually represents another destination theme
   - this does not break rendering or fallback behavior, but it is worth remembering when interpreting mock screenshots manually

3. mobile screenshot capture through the in-app browser timed out once under the smaller viewport.
   - responsive verdicts were therefore confirmed primarily through live interaction plus `scrollWidth/clientWidth` checks

## Commands Used

Representative commands:

```bash
node scripts/run-server.js mock mock-a
node scripts/run-server.js mock mock-c
node scripts/run-server.js mock mock-d
node scripts/run-server.js mock mock-e
node scripts/run-server.js mock mock-f
```

Representative API QA pattern:

```bash
curl "http://localhost:3000/api/flight-trend?destination=NRT&mockDataset=mock-f"
```

## QA Verdict

Pass with fixes applied.

What is now covered well:

- baseline happy paths
- mobile long-copy stress
- partial fallback rendering
- empty-state rendering
- controlled endpoint failure handling
- deterministic scenario selection for repeatable QA

What is intentionally not claimed:

- any live-provider correctness
- any quota-sensitive AI/provider behavior outside mock mode
- cross-browser verification outside the in-app browser
