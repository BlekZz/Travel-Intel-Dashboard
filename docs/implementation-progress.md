# Travel Intel Dashboard Implementation Progress

Last updated: 2026-05-19

## Completed Work

### Wave A - Project Shell

- Express entrypoint serves `public/` and mounts all `/api` routes.
- HTML shell includes the required tab panels, nav IDs, metric containers, chart containers, toast container, Chart.js, and ordered frontend scripts.
- Theme preloading is in place to avoid light/dark flash on initial render.
- Amadeus credentials no longer block `/api/flights`, because flight search now uses a provider adapter path.

### Wave B - Flight and Price APIs

- `/api/flights` now calls the flight provider orchestrator.
- Provider order is SerpApi Google Flights, then `fli`, then deterministic sample fallback.
- Flight response normalization preserves the frontend contract.
- Backend filtering and sorting are applied for `maxStops` and `sort`.
- `/api/price-history` and `/api/flight-trend` return deterministic contract-safe data for local testing.

### Wave C - Weather and AI APIs

- Weather service resolves common IATA/city aliases and returns null-safe weather payloads when credentials or lookups are unavailable.
- Gemini service normalizes fun score and booking advice JSON with confidence and sources fields.
- `/api/fun-score`, `/api/heatmap`, and `/api/booking-advice` return contract-safe payloads.
- Booking advice fallback now preserves risk notes and source metadata.
- `/api/dashboard` combines flight, hotel, weather, and fun score data into one response.

### Wave D - CSS Design System

- Core CSS tokens and component classes are present across `main.css`, `components.css`, and `charts.css`.
- Metric cards, tracking pills, sliders, flight rows, modals, advice banners, badges, skeleton loaders, toasts, and heatmap classes are implemented.
- Title and metric value typography now uses stable fixed sizes rather than viewport-scaled font sizes.
- Chart containers have stable minimum heights to avoid blank or collapsed chart areas.

### Wave E - Dashboard Interactions

- Dashboard metric cards load from `/api/dashboard`.
- Tracking state persists in `localStorage` under `travelintel_tracking`.
- Default fun score dimensions now sum to 100 using the PRD sample weights.
- Fun score slider labels and best-dimension display are localized.
- Language changes dispatch a `langchange` event and re-render dynamic dashboard, chart, flight search, and price history content.

### Wave C - Flight Provider Cache and Metadata

- Added `services/flights/cache.js` for short TTL cache and last-known-good cache.
- `/api/flights` now returns provider metadata including `provider`, `generatedAt`, `cached`, `stale`, `fallbackUsed`, and `attempts`.
- Flight Search now displays provider/source badges so users can distinguish live, fallback, cached, stale, and sample-backed results.

### Wave D - Dashboard / Trend / Heatmap Alignment

- Added `services/flights/snapshot.js` to derive a shared flight-price snapshot from the flight provider path.
- Dashboard flight metrics no longer depend on Amadeus price metrics as the primary flight-price source.
- `dashboard`, `price-history`, `flight-trend`, and `heatmap` now align to the same flight snapshot/provider metadata for the same route/date anchor.

### Wave E - Flight Search / Price History UX Completion

- Flight Search now preserves the previous successful result set when a refresh fails or a provider becomes unavailable.
- Flight Search loading/unavailable/error states now render panel-level status messages instead of relying on toast alone.
- Price History now surfaces provider/cache/stale/fallback badges and generated-at metadata alongside the AI confidence state.

### Gemini Debug Follow-up - 2026-05-19

- The earlier `models/gemini-1.5-pro` `404 Not Found` issue is resolved at the service configuration level.
- `services/gemini.js` now defaults to `gemini-2.5-flash` and supports `GEMINI_MODEL` / `GEMINI_API_VERSION` overrides.
- Structured generation now degrades through three modes:
  - `tools + responseMimeType=application/json`
  - `responseMimeType=application/json` without tools
  - plain text constrained to JSON
- This fallback chain is required because the current Gemini API rejects `googleSearch` tool use together with `responseMimeType: application/json`.
- `computeFunScore()` and `/api/dashboard` fun-score aggregation now return live Gemini payloads again in this environment.
- `getBookingAdvice()` can still hit transient `503 Service Unavailable` / high-demand failures; the service now retries briefly before returning the deterministic fallback payload.

### Booking Advice Fallback Hardening - 2026-05-19

- `/api/booking-advice` now uses a four-tier fallback order:
  - fresh cache
  - live Gemini
  - last-known-good cache
  - deterministic sample
- The route now returns `meta` with:
  - `provider`
  - `generatedAt`
  - `cached`
  - `stale`
  - `fallbackUsed`
  - `sourceTier`
  - `attempts`
- `services/gemini.js` no longer lets a live booking-advice payload inherit deterministic-sample `sources` from the fallback baseline.
- `public/js/priceHistory.js` now reads booking-advice `meta` so the banner can show whether the recommendation is fresh, cached, stale, or fallback-derived.

### Quota / Cooldown Governance - 2026-05-19

- Added `config/provider-quotas.json` as the repo-level quota/cooldown policy document.
- Added `services/quotaTracker.js` and `/api/quota` for local usage tracking and UI consumption.
- The app header now renders a quota bar sourced from `/api/quota`.
- Provider usage is now recorded for:
  - Gemini
  - SerpApi
  - OpenWeatherMap
- `fun-score` now has:
  - fresh cache
  - last-known-good cache
  - cooldown-aware fallback metadata
  - one-shot frontend live retry countdown
- `booking-advice` now has:
  - cooldown-aware metadata
  - one-shot frontend live retry countdown
  - user-facing quota/cooldown hints to discourage repeated manual refreshes
- The frontend now shows small warning/help text near quota-sensitive surfaces so the user understands why repeated refreshes are intentionally discouraged.

### Gemini Consolidation + Secondary Key Fallback - 2026-05-19

- Added `services/travelInsights.js` as a shared Gemini insights layer.
- `dashboard` now asks for fun score and booking advice together through one shared Gemini pipeline.
- `fun-score` and `booking-advice` routes now reuse shared travel-insights cache when the same trip context was already analyzed.
- Added `GEMINI_API_KEY_SECONDARY` to `.env` / `.env.example`.
- Secondary Gemini key is only intended as the final fallback when it belongs to a different project with separate quota.
- Current execution order is:
  - primary Gemini key
  - compatibility-mode fallback
  - transient retry
  - secondary Gemini key
  - app-level fallback payload

## Smoke Checks

- `node --check` passed for updated backend and frontend JavaScript files.
- `GET /api/flights` returns `200` with fallback data when live providers fail.
- `GET /api/price-history` returns 12 current-year and 12 prior-year monthly points.
- `GET /api/flight-trend` returns date-range trend points.
- `POST /api/fun-score` returns seven dimension scores.
- `GET /api/heatmap` returns a full-year daily series.
- `GET /api/booking-advice` returns risk notes and source metadata.
- `GET /api/dashboard` returns combined metric, weather, and fun score fields.

## Wave A/B Validation Notes (Historical)

- The earlier environment-readiness note is no longer current for this machine; live SerpApi validation has since been completed with the configured `.env`.
- Wave B uncovered two concrete implementation issues and both were addressed:
  - `services/flights/fli.js` was passing unsupported `--language` and `--country` flags to the current `fli` CLI.
  - The local shell sets `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` to `127.0.0.1:9`; the `fli` adapter now clears those proxy variables before spawning the fallback provider.
- Windows security note:
  - `pip install flights` installs unsigned launcher wrappers such as `fli.exe`.
  - Those launchers are normal Python `console_scripts` stubs, but they may trigger antivirus heuristics.
  - The adapter now supports pointing `FLI_COMMAND` at `python.exe` so the project can run `python -m fli.cli.main ...` instead of executing `fli.exe`.
- Real `fli` payload validation completed outside the launcher wrapper:
  - `python.exe -m fli.cli.main flights TPE NRT 2026-08-15 --format json --class ECONOMY --stops 1 --currency TWD`
  - Returned 156 flights for the sample route/date.
  - `services/flights/normalize.js` was updated to correctly map the current `fli` payload shape (`legs`, nested `airline.code`, nested airport `code`, and `departure_time` / `arrival_time` fields).
  - Normalization now produced 156 contract-compliant `FlightOffer` objects from that live payload.
- Sandbox limitation:
  - Direct end-to-end verification of Node `execFile()` spawning the fallback provider inside this Codex sandbox is still constrained by local spawn permissions.
  - CLI-level execution and payload normalization are verified; route-level fallback wiring should be re-smoked once run in the user's unrestricted local shell.

## Wave D Follow-up Note (2026-05-19)

- Gemini dashboard aggregation currently falls back because the configured model path returns `404 Not Found` for `models/gemini-1.5-pro` on the active `v1beta` generateContent endpoint.
- This does not block flight-provider alignment work, but it does mean dashboard fun score content is not yet backed by a working live Gemini model in this environment.
- The issue should be treated as an environment/model-configuration task before final release smoke.

## Remaining Work

- Gemini model configuration: replace or reconfigure the dashboard fun-score model path so live Gemini calls stop returning `404 Not Found`.
- Flight Search / Price History visual debt: several dynamic UI fragments still rely on inline styles because the original shell did not provide enough fixed DOM anchors.
- Wave F: browser-level release smoke, including desktop/mobile visual pass and final interaction checks across all three tabs.
- Browser visual QA should be repeated once the in-app browser automation permission issue is resolved.

## Travelintel Model Shift - 2026-05-20

- Dashboard AI analysis is no longer designed around user-assigned weight sliders.
- The new primary model is `travelintel`: a date-window and destination grounded analysis surface.
- Added `GET /api/travelintel`.
- Request contract:
  - `origin`
  - `destination`
  - `startDate`
  - `endDate`
- Response contract now returns seven aspect evaluations:
  - `shopping`
  - `relaxation`
  - `luxury`
  - `food`
  - `sightseeing`
  - `value`
  - `festival`
- Each aspect now returns:
  - `level: high|medium|low|null`
  - `note`
- Dashboard search behavior changed:
  - every search still refreshes flight / hotel / weather metrics
  - `travelintel` only re-runs when destination or date range changes
  - repeated search on the same destination/date window keeps the last `travelintel` result in place
- Dashboard backend was decoupled from Gemini:
  - `GET /api/dashboard` no longer calls Gemini
  - Gemini quota is now spent only on the dedicated `travelintel` route
- Added shared cache support for `travelintel` in `services/travelInsights.js`.
- Added frontend retry behavior for `travelintel` fallback:
  - visible fallback state
  - one automatic live retry after cooldown
  - small quota note discouraging repeated refreshes

## Verification - 2026-05-20

- `node --check` passed for:
  - `services/gemini.js`
  - `services/travelInsights.js`
  - `routes/dashboard.js`
  - `routes/travelIntel.js`
  - `public/js/dashboard.js`
- `GET /api/dashboard?origin=TPE&destination=NRT&dateRange={...}` returned `200` without invoking Gemini in the route.
- `GET /api/travelintel?origin=TPE&destination=NRT&startDate=2026-08-15&endDate=2026-08-21` produced grounded seven-aspect output after cooldown expired.
- Example live/cached output for `NRT` / `2026-08-15` to `2026-08-21` showed:
  - shopping: high
  - food: high
  - festival: high
  - value: low
  - overall confidence: medium

## UI Stabilization + Fallback Observation - 2026-05-20

- Browser-level visual pass was completed against `http://localhost:3002/`.
- Dashboard structure was reshaped to the current intended order:
  1. `travelintel`
  2. `flight price`
  3. `hotel price/night`
  4. `weather`
  5. trend chart
  6. horizontal seven-aspect `travelintel` cards
  7. heatmap
- Frontend layout fixes landed for:
  - inconsistent metric card heights
  - flights tab date-input width/icon overlap
  - price-history loading-state visibility
  - price-history chart container height/overflow control
- Gemini-backed surfaces were observed rendering mostly fallback content during the visual pass.
- This is currently treated as an operational state, not a schema break:
  - route contracts still hold
  - fallback UI now renders legibly
  - repeated testing likely consumed quota / triggered cooldown paths
- `flight-trend` backend itself was separately verified as healthy with non-fallback data.
- The visible trend fallback behavior should therefore be treated as a frontend request-context or fallback-state presentation issue, not a provider outage in the core trend endpoint.

## Next Repair Steps

1. Re-verify live/fallback state after cooldown expiry with a smaller manual test budget.
2. Inspect why the trend chart can present fallback state even when `/api/flight-trend` returns live provider data.
3. Improve travelintel / booking-advice language separation so every AI text field consistently carries `*_i18n` payloads in both `zh` and `en`.
4. Complete browser-level regression on the price-history charts to confirm the vertical growth bug is fully eliminated in repeated tab switches and scroll scenarios.
5. Add a lightweight operator-facing status summary for Gemini routes so the UI can distinguish:
   - fresh live
   - cached live
   - cooldown fallback
   - deterministic fallback
6. Only after the above, run a lower-frequency release smoke instead of repeated quota-heavy testing.
