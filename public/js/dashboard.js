(function() {
  const TRACKING_KEY = 'travelintel_tracking';
  const DEFAULT_DESTINATION = 'NRT';
  const DEFAULT_ORIGIN = 'TPE';
  const DEFAULT_DATE_RANGE = { start: '2025-08-01', end: '2025-08-07' };
  const MAX_TRACKINGS = 5;
  const ASPECT_KEYS = ['shopping', 'relaxation', 'luxury', 'food', 'sightseeing', 'value', 'festival'];

  let activeTrackingId = null;
  let latestDashboardData = null;
  let latestTravelIntelResponse = null;
  let latestTravelIntelSignature = '';
  let travelIntelRetryTimer = null;
  let travelIntelRetryDeadline = 0;
  let travelIntelRetryCount = 0;

  function appApi() {
    return window.TravelIntel && window.TravelIntel.app ? window.TravelIntel.app : null;
  }

  function isChinese() {
    return String(document.documentElement.lang || '').startsWith('zh');
  }

  function t(en, zh) {
    return isChinese() ? zh : en;
  }

  function normalizeDestination(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
  }

  function safeParseTracking(raw) {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function normalizeTrackingItem(item, index) {
    const destination = normalizeDestination(item && item.destination);
    const fallbackName = destination || `${t('Trip', '旅程')} ${index + 1}`;

    return {
      id: item && item.id ? String(item.id) : `tracking-${Date.now()}-${index}`,
      name: item && typeof item.name === 'string' && item.name.trim() ? item.name.trim() : fallbackName,
      destination,
      origin: item && typeof item.origin === 'string' && item.origin.trim() ? item.origin.trim().toUpperCase() : DEFAULT_ORIGIN,
      dateRange: {
        start: item && item.dateRange && item.dateRange.start ? String(item.dateRange.start) : DEFAULT_DATE_RANGE.start,
        end: item && item.dateRange && item.dateRange.end ? String(item.dateRange.end) : DEFAULT_DATE_RANGE.end
      },
      dimensions: item && item.dimensions && typeof item.dimensions === 'object' ? item.dimensions : null,
      lastFetched: item && item.lastFetched ? String(item.lastFetched) : null,
      lastTravelIntelFetched: item && item.lastTravelIntelFetched ? String(item.lastTravelIntelFetched) : null,
      lastTravelIntelSignature: item && item.lastTravelIntelSignature ? String(item.lastTravelIntelSignature) : null,
      refreshInterval: item && item.refreshInterval ? String(item.refreshInterval) : 'onOpen'
    };
  }

  function getTracking() {
    return safeParseTracking(localStorage.getItem(TRACKING_KEY)).map(normalizeTrackingItem);
  }

  function saveTracking(tracking) {
    const sanitized = tracking.map((item, index) => {
      const normalized = normalizeTrackingItem(item, index);
      return {
        id: normalized.id,
        name: normalized.name,
        destination: normalized.destination,
        origin: normalized.origin,
        dateRange: normalized.dateRange,
        dimensions: normalized.dimensions,
        lastFetched: normalized.lastFetched,
        lastTravelIntelFetched: normalized.lastTravelIntelFetched,
        lastTravelIntelSignature: normalized.lastTravelIntelSignature,
        refreshInterval: normalized.refreshInterval
      };
    });

    localStorage.setItem(TRACKING_KEY, JSON.stringify(sanitized));
    return sanitized;
  }

  function ensureTrackingSeed() {
    const tracking = getTracking();
    if (tracking.length > 0) {
      return tracking;
    }

    return saveTracking([
      {
        id: 'tracking-default',
        name: 'Tokyo',
        destination: DEFAULT_DESTINATION,
        origin: DEFAULT_ORIGIN,
        dateRange: { ...DEFAULT_DATE_RANGE },
        lastFetched: null,
        lastTravelIntelFetched: null,
        lastTravelIntelSignature: null,
        refreshInterval: 'onOpen'
      }
    ]).map(normalizeTrackingItem);
  }

  function getActiveTracking(tracking = getTracking()) {
    if (!tracking.length) return null;
    if (activeTrackingId) {
      const byId = tracking.find((item) => item.id === activeTrackingId);
      if (byId) return byId;
    }

    const app = appApi();
    const appDestination = normalizeDestination(app && app.currentDestination);
    if (appDestination) {
      const byDestination = tracking.find((item) => item.destination === appDestination);
      if (byDestination) {
        activeTrackingId = byDestination.id;
        return byDestination;
      }
    }

    activeTrackingId = tracking[0].id;
    return tracking[0];
  }

  function patchTrackingItem(id, patch) {
    const tracking = getTracking();
    const index = tracking.findIndex((item) => item.id === id);
    if (index < 0) return null;

    const current = tracking[index];
    tracking[index] = normalizeTrackingItem({
      ...current,
      ...patch,
      dateRange: patch && patch.dateRange ? { ...current.dateRange, ...patch.dateRange } : current.dateRange
    }, index);
    saveTracking(tracking);
    return tracking[index];
  }

  function getActiveTrack() {
    return getActiveTracking(ensureTrackingSeed());
  }

  function buildTravelIntelSignature(track) {
    return JSON.stringify({
      destination: normalizeDestination(track && track.destination),
      start: track && track.dateRange ? track.dateRange.start || null : null,
      end: track && track.dateRange ? track.dateRange.end || null : null
    });
  }

  function createTrackingSeed() {
    const current = getActiveTrack();
    return {
      id: `tracking-${Date.now()}`,
      name: current && current.name ? `${current.name} Copy` : 'New Trip',
      destination: current && current.destination ? current.destination : DEFAULT_DESTINATION,
      origin: current && current.origin ? current.origin : DEFAULT_ORIGIN,
      dateRange: current ? { ...current.dateRange } : { ...DEFAULT_DATE_RANGE },
      lastFetched: null,
      lastTravelIntelFetched: null,
      lastTravelIntelSignature: null,
      refreshInterval: 'onOpen'
    };
  }

  function showToast(message, type) {
    const app = appApi();
    if (app && typeof app.showToast === 'function') {
      app.showToast(message, type);
      return;
    }
    console[type === 'error' ? 'error' : 'log'](message);
  }

  function coerceNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function formatCurrency(value) {
    const numeric = coerceNumber(value);
    return numeric === null ? '—' : `NT$${numeric.toLocaleString()}`;
  }

  function formatPercent(value) {
    const numeric = coerceNumber(value);
    if (numeric === null) return t('No comparison', '無比較資料');
    return `${numeric > 0 ? '+' : ''}${numeric}%`;
  }

  function getDeltaClass(delta, reverse = false) {
    const numeric = coerceNumber(delta);
    if (numeric === null || numeric === 0) return '';
    if (numeric > 0) return reverse ? 'metric-card__delta--negative' : 'metric-card__delta--positive';
    return reverse ? 'metric-card__delta--positive' : 'metric-card__delta--negative';
  }

  function getConfidenceClass(confidence) {
    if (confidence === 'high') return 'badge--ai';
    if (confidence === 'medium') return 'badge--ai-warn';
    return 'badge--ai-low';
  }

  function getAspectLabels() {
    return {
      shopping: t('Shopping', '購物'),
      relaxation: t('Relaxation', '渡假放鬆'),
      luxury: t('Luxury', '奢侈享受'),
      food: t('Food', '美食'),
      sightseeing: t('Sightseeing', '觀光名勝'),
      value: t('Value', '性價比'),
      festival: t('Festival', '節慶活動')
    };
  }

  function selectLocalizedText(value, fallback) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const preferred = isChinese() ? value.zh : value.en;
      const alternate = isChinese() ? value.en : value.zh;
      return preferred || alternate || fallback || '';
    }
    return value || fallback || '';
  }

  function getLevelBadge(level) {
    if (level === 'high') {
      return { label: t('High', '高'), className: 'badge badge--level-high' };
    }
    if (level === 'medium') {
      return { label: t('Medium', '中'), className: 'badge badge--level-medium' };
    }
    if (level === 'low') {
      return { label: t('Low', '低'), className: 'badge badge--level-low' };
    }
    return { label: t('Pending', '待補'), className: 'badge badge--provider-warn' };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMetricsSkeleton() {
    ['metric-flight-price', 'metric-hotel-price', 'metric-weather', 'metric-fun-score'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = '<div class="skeleton skeleton--card"></div>';
      }
    });
  }

  function renderTravelIntelPanelSkeleton() {
    const container = document.getElementById('slider-container');
    if (!container) return;
    container.innerHTML = '<div class="skeleton skeleton--chart" style="min-height: 320px;"></div>';
  }

  function clearTravelIntelRetry() {
    if (travelIntelRetryTimer) {
      clearInterval(travelIntelRetryTimer);
      travelIntelRetryTimer = null;
    }
    travelIntelRetryDeadline = 0;
  }

  function getTravelIntelRetryState() {
    if (!travelIntelRetryDeadline) return null;
    return {
      remainingMs: Math.max(0, travelIntelRetryDeadline - Date.now()),
      active: Date.now() < travelIntelRetryDeadline
    };
  }

  function scheduleTravelIntelRetry(track, delayMs) {
    clearTravelIntelRetry();
    const retryDelay = Math.max(1000, Number(delayMs || 30000));
    travelIntelRetryDeadline = Date.now() + retryDelay;
    travelIntelRetryTimer = setInterval(() => {
      const retryState = getTravelIntelRetryState();
      if (!retryState || retryState.remainingMs <= 0) {
        clearTravelIntelRetry();
        fetchTravelIntel(track, { autoRetry: true });
        return;
      }
      if (latestTravelIntelResponse) {
        renderTravelIntelMetric(latestTravelIntelResponse);
        renderTravelIntelPanel(latestTravelIntelResponse);
      }
    }, 1000);
  }

  function updateDashboardTitle(track) {
    const titleEl = document.getElementById('dashboard-title');
    if (!titleEl || !track) return;
    const destinationText = track.destination || t('Destination pending', '目的地未設定');
    const dateText = track.dateRange.start && track.dateRange.end
      ? `[${track.dateRange.start} ~ ${track.dateRange.end}]`
      : t('[Date pending]', '[日期未設定]');
    titleEl.textContent = `${track.name} (${destinationText}) ${dateText}`;
  }

  function populateTrackingInputs(track) {
    const originEl = document.getElementById('dash-origin');
    const destinationEl = document.getElementById('dash-dest');
    const startEl = document.getElementById('dash-start');
    const endEl = document.getElementById('dash-end');
    if (originEl) originEl.value = track.origin || DEFAULT_ORIGIN;
    if (destinationEl) destinationEl.value = track.destination || '';
    if (startEl) startEl.value = track.dateRange.start || '';
    if (endEl) endEl.value = track.dateRange.end || '';
  }

  function renderTracking() {
    const tabs = document.getElementById('tracking-tabs');
    if (!tabs) return;
    const tracking = ensureTrackingSeed();
    const active = getActiveTracking(tracking);
    tabs.innerHTML = '';

    tracking.forEach((item) => {
      const pill = document.createElement('div');
      pill.className = `tracking-pill ${active && item.id === active.id ? 'tracking-pill--active' : ''}`;

      const labelBtn = document.createElement('button');
      labelBtn.type = 'button';
      labelBtn.textContent = item.name;
      labelBtn.addEventListener('click', () => {
        activeTrackingId = item.id;
        const app = appApi();
        if (app && item.destination) {
          app.currentDestination = item.destination;
        }
        refresh(item.destination, { forceTravelIntel: buildTravelIntelSignature(item) !== latestTravelIntelSignature });
        if (window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function') {
          window.TravelIntel.charts.refreshCharts(item.destination || DEFAULT_DESTINATION);
        }
      });

      const meta = document.createElement('span');
      meta.className = 'tracking-pill__meta';
      meta.textContent = item.destination || t('Pending', '待設定');

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tracking-pill__close';
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!window.confirm(t('Remove this tracking?', '要刪除這個追蹤嗎？'))) return;
        const remaining = getTracking().filter((entry) => entry.id !== item.id);
        const saved = remaining.length ? saveTracking(remaining) : saveTracking([createTrackingSeed()]);
        const normalizedSaved = saved.map(normalizeTrackingItem);
        const fallback = normalizedSaved[0] || null;
        activeTrackingId = fallback ? fallback.id : null;
        if (fallback) {
          const app = appApi();
          if (app && fallback.destination) {
            app.currentDestination = fallback.destination;
          }
          refresh(fallback.destination || DEFAULT_DESTINATION, { forceTravelIntel: true });
          if (window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function') {
            window.TravelIntel.charts.refreshCharts(fallback.destination || DEFAULT_DESTINATION);
          }
        }
      });

      pill.appendChild(labelBtn);
      pill.appendChild(meta);
      pill.appendChild(closeBtn);
      tabs.appendChild(pill);
    });
  }

  function renderFlightMetric(data) {
    const container = document.getElementById('metric-flight-price');
    if (!container) return;
    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card__label">${t('Flight Price', '機票均價')}</div>
        <div class="metric-card__value">${formatCurrency(data.avgFlightPrice)}</div>
        <div class="metric-card__delta ${getDeltaClass(data.flightPriceDelta)}">${formatPercent(data.flightPriceDelta)}</div>
      </div>
    `;
  }

  function renderHotelMetric(data) {
    const container = document.getElementById('metric-hotel-price');
    if (!container) return;
    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card__label">${t('Hotel Price / Night', '飯店均價 / 晚')}</div>
        <div class="metric-card__value">${formatCurrency(data.avgHotelPrice)}</div>
        <div class="metric-card__delta ${getDeltaClass(data.hotelPriceDelta, true)}">${formatPercent(data.hotelPriceDelta)}</div>
      </div>
    `;
  }

  function renderWeatherMetric(weatherData, meta) {
    const container = document.getElementById('metric-weather');
    if (!container) return;
    const details = [];
    if (coerceNumber(weatherData.avgHumidity) !== null) details.push(`${t('Humidity', '濕度')} ${weatherData.avgHumidity}%`);
    if (coerceNumber(weatherData.avgRainProbability) !== null) details.push(`${t('Rain', '降雨')} ${weatherData.avgRainProbability}%`);
    const fallbackText = meta && meta.partialData ? t('Partial live/fallback weather signal', '目前為混合 live/fallback 天氣訊號') : '';

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card__label">${t('Weather', '天氣')}</div>
        <div class="metric-card__value">${coerceNumber(weatherData.avgTemp) === null ? '—' : `${weatherData.avgTemp}°C`}</div>
        <div class="metric-card__delta">${escapeHtml(weatherData.condition || t('Condition unavailable', '暫無天氣描述'))}</div>
        <div class="subtle-note">${escapeHtml(details.join(' · ') || fallbackText || t('Weather context unavailable', '天氣細節暫時不可用'))}</div>
      </div>
    `;
  }

  function renderTravelIntelMetric(payload) {
    const container = document.getElementById('metric-fun-score');
    if (!container) return;
    const aspects = payload && payload.aspects ? payload.aspects : {};
    const counts = { high: 0, medium: 0, low: 0 };
    Object.values(aspects).forEach((entry) => {
      if (entry && ['high', 'medium', 'low'].includes(entry.level)) {
        counts[entry.level] += 1;
      }
    });

    const badgeClass = getConfidenceClass(payload && payload.data_confidence);
    const meta = payload && payload.meta ? payload.meta : {};
    const retryState = getTravelIntelRetryState();
    const valueText = counts.high > 0
      ? `${counts.high} ${t('High', '高')}`
      : (counts.medium > 0 ? `${counts.medium} ${t('Medium', '中')}` : '—');
    const summary = payload
      ? selectLocalizedText(payload.summary_i18n, payload.summary)
      : t('Awaiting travel window analysis', '等待旅遊時段分析');
    const retryLine = retryState && retryState.active
      ? `<div class="retry-inline"><span class="badge badge--provider-warn">${escapeHtml(t('Retrying live soon', '即將重試 live'))}</span><span>${escapeHtml(t(`${Math.ceil(retryState.remainingMs / 1000)}s remaining`, `倒數 ${Math.ceil(retryState.remainingMs / 1000)} 秒`))}</span></div>`
      : ((meta.fallbackUsed && Number(meta.retryAfterMs || 0) > 0 && travelIntelRetryCount < 1)
        ? `<div class="retry-inline"><span class="badge badge--provider-warn">${escapeHtml(t('Fallback active', '目前為 fallback'))}</span><span>${escapeHtml(t('This panel will retry live once after cooldown.', '冷卻後會再自動重試一次 live。'))}</span></div>`
        : '');

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card__label">${t('travelintel', 'travelintel')} <span class="badge ${badgeClass}">${escapeHtml(payload && payload.data_confidence === 'high' ? t('AI Live', 'AI Live') : t('AI Analysis', 'AI 分析'))}</span></div>
        <div class="metric-card__value">${escapeHtml(valueText)}</div>
        <div class="metric-card__delta">${escapeHtml(summary)}</div>
        ${retryLine}
        <div class="subtle-note" title="${escapeHtml(t('Repeated refreshes can exhaust free-tier quotas or trigger throttling.', '頻繁刷新可能耗盡免費額度，或觸發暫時性節流。'))}">${escapeHtml(t('Search only re-runs travelintel when destination or dates change.', '只有在目的地或日期改變時，Search 才會重跑 travelintel。'))}</div>
      </div>
    `;
  }

  function renderTravelIntelPanel(payload) {
    const container = document.getElementById('slider-container');
    if (!container) return;
    const labels = getAspectLabels();
    const aspects = payload && payload.aspects ? payload.aspects : {};
    const meta = payload && payload.meta ? payload.meta : {};
    const sourceBadges = [];
    if (meta.cached) sourceBadges.push(`<span class="badge badge--provider">${escapeHtml(t('Cached', '快取'))}</span>`);
    if (meta.stale) sourceBadges.push(`<span class="badge badge--provider-stale">${escapeHtml(t('Stale', '舊快照'))}</span>`);
    if (meta.fallbackUsed) sourceBadges.push(`<span class="badge badge--provider-warn">${escapeHtml(t('Fallback', 'Fallback'))}</span>`);

    const cards = ASPECT_KEYS.map((key) => {
      const entry = aspects[key] || {};
      const badge = getLevelBadge(entry.level);
      return `
        <article class="travelintel-card">
          <div class="travelintel-card__header">
            <h4 class="travelintel-card__title">${escapeHtml(labels[key])}</h4>
            <span class="${badge.className}">${escapeHtml(badge.label)}</span>
          </div>
          <p class="travelintel-card__note">${escapeHtml(selectLocalizedText(entry.note_i18n, entry.note) || t('No grounded note yet.', '目前尚無足夠依據。'))}</p>
        </article>
      `;
    }).join('');

    container.innerHTML = `
      <div class="travelintel-panel">
        <div class="travelintel-panel__header">
          <div>
            <h3 class="travelintel-panel__title">${t('travelintel', 'travelintel')}</h3>
            <p class="travelintel-panel__summary">${escapeHtml(payload ? (selectLocalizedText(payload.summary_i18n, payload.summary) || t('No travelintel summary yet.', '目前尚無 travelintel 總結。')) : t('No travelintel summary yet.', '目前尚無 travelintel 總結。'))}</p>
          </div>
          <div class="travelintel-panel__meta">
            <span class="badge ${getConfidenceClass(payload && payload.data_confidence)}">${escapeHtml(t(`Confidence: ${payload && payload.data_confidence ? payload.data_confidence : 'low'}`, `可信度：${payload && payload.data_confidence ? payload.data_confidence : 'low'}`))}</span>
            ${sourceBadges.join('')}
          </div>
        </div>
        <div class="travelintel-grid">${cards}</div>
        <div class="subtle-note">${escapeHtml(t('Tip: avoid repeated refreshes. Flights and hotels can update independently without re-running travelintel.', '提示：請避免頻繁刷新。機票與飯店可單獨更新，不需要每次都重跑 travelintel。'))}</div>
      </div>
    `;
  }

  function renderMetrics(data) {
    const meta = data && data.meta ? data.meta : {};
    renderFlightMetric(data || {});
    renderHotelMetric(data || {});
    renderWeatherMetric(data && data.weather ? data.weather : {}, meta);
    if (latestTravelIntelResponse) {
      renderTravelIntelMetric(latestTravelIntelResponse);
    } else {
      renderTravelIntelMetric({ summary: t('Awaiting travelintel analysis', '等待 travelintel 分析'), data_confidence: 'low', aspects: {} });
    }
  }

  async function fetchDashboardData(track) {
    renderMetricsSkeleton();
    try {
      const params = new URLSearchParams({
        origin: track.origin || DEFAULT_ORIGIN,
        destination: track.destination || DEFAULT_DESTINATION,
        dateRange: JSON.stringify(track.dateRange || DEFAULT_DATE_RANGE)
      });
      const response = await fetch(`/api/dashboard?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Dashboard request failed (${response.status})`);
      latestDashboardData = data;
      renderMetrics(latestDashboardData);
      const now = new Date().toISOString();
      patchTrackingItem(track.id, { lastFetched: now });
      renderTracking();
    } catch (error) {
      showToast(error.message || t('Failed to refresh dashboard', 'Dashboard 更新失敗'), 'error');
      if (latestDashboardData) {
        renderMetrics(latestDashboardData);
      }
    }
  }

  async function fetchTravelIntel(track, options = {}) {
    renderTravelIntelPanelSkeleton();
    const signature = buildTravelIntelSignature(track);

    try {
      const params = new URLSearchParams({
        origin: track.origin || DEFAULT_ORIGIN,
        destination: track.destination || DEFAULT_DESTINATION,
        startDate: track.dateRange.start || '',
        endDate: track.dateRange.end || ''
      });
      const response = await fetch(`/api/travelintel?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `travelintel request failed (${response.status})`);

      latestTravelIntelSignature = signature;
      latestTravelIntelResponse = data;
      renderTravelIntelMetric(data);
      renderTravelIntelPanel(data);

      if (data.meta && data.meta.fallbackUsed && Number(data.meta.retryAfterMs || 0) > 0 && !options.autoRetry && travelIntelRetryCount < 1) {
        travelIntelRetryCount += 1;
        scheduleTravelIntelRetry(track, data.meta.retryAfterMs);
      } else if (!data.meta || !data.meta.fallbackUsed) {
        clearTravelIntelRetry();
        travelIntelRetryCount = 0;
      }

      patchTrackingItem(track.id, {
        lastTravelIntelFetched: new Date().toISOString(),
        lastTravelIntelSignature: signature
      });
      renderTracking();
    } catch (error) {
      showToast(error.message || t('travelintel analysis failed', 'travelintel 分析失敗'), 'error');
      if (latestTravelIntelResponse && latestTravelIntelSignature === signature) {
        renderTravelIntelMetric(latestTravelIntelResponse);
        renderTravelIntelPanel(latestTravelIntelResponse);
      } else {
        const fallback = {
          aspects: {},
          summary: t('travelintel update failed. Keeping price and hotel data current.', 'travelintel 更新失敗，但機票與飯店資訊仍可持續更新。'),
          data_confidence: 'low',
          meta: {
            fallbackUsed: true,
            sourceTier: 'ui-error'
          }
        };
        renderTravelIntelMetric(fallback);
        renderTravelIntelPanel(fallback);
      }
    }
  }

  function shouldRefreshTravelIntel(track, options = {}) {
    const signature = buildTravelIntelSignature(track);
    if (options.forceTravelIntel) return true;
    if (!latestTravelIntelResponse) return true;
    return latestTravelIntelSignature !== signature;
  }

  function syncInputsToTracking() {
    const track = getActiveTrack();
    if (!track) return null;

    const originEl = document.getElementById('dash-origin');
    const destinationEl = document.getElementById('dash-dest');
    const startEl = document.getElementById('dash-start');
    const endEl = document.getElementById('dash-end');
    const previousSignature = buildTravelIntelSignature(track);
    const nextDestination = normalizeDestination(destinationEl && destinationEl.value) || DEFAULT_DESTINATION;
    const nextPayload = {
      origin: normalizeDestination(originEl && originEl.value) || DEFAULT_ORIGIN,
      destination: nextDestination,
      dateRange: {
        start: startEl && startEl.value ? startEl.value : DEFAULT_DATE_RANGE.start,
        end: endEl && endEl.value ? endEl.value : DEFAULT_DATE_RANGE.end
      },
      name: track.name === track.destination || !track.name ? nextDestination : track.name
    };
    const updated = patchTrackingItem(track.id, nextPayload);
    if (!updated) return null;
    const app = appApi();
    if (app && updated.destination) {
      app.currentDestination = updated.destination;
    }
    return {
      track: updated,
      signatureChanged: previousSignature !== buildTravelIntelSignature(updated)
    };
  }

  function bindSearchAction() {
    const searchBtn = document.getElementById('dash-search-btn');
    if (!searchBtn) return;
    searchBtn.addEventListener('click', () => {
      const synced = syncInputsToTracking();
      if (!synced || !synced.track) return;
      updateDashboardTitle(synced.track);
      populateTrackingInputs(synced.track);
      renderTracking();
      refresh(synced.track.destination, { forceTravelIntel: synced.signatureChanged });
      if (window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function') {
        window.TravelIntel.charts.refreshCharts(synced.track.destination);
      }
    });
  }

  function bindInputAutoSave() {
    ['dash-origin', 'dash-dest', 'dash-start', 'dash-end'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const synced = syncInputsToTracking();
        if (!synced || !synced.track) return;
        updateDashboardTitle(synced.track);
        renderTracking();
      });
    });
  }

  function handleAddTracking() {
    const tracking = getTracking();
    if (tracking.length >= MAX_TRACKINGS) {
      showToast(t('Maximum 5 trackings allowed', '最多只能建立 5 筆追蹤'), 'warning');
      return;
    }

    const seed = createTrackingSeed();
    const requestedName = window.prompt(t('Tracking name', '追蹤名稱'), seed.name);
    if (requestedName && requestedName.trim()) {
      seed.name = requestedName.trim();
    }

    saveTracking([...tracking, seed]);
    activeTrackingId = seed.id;
    const app = appApi();
    if (app && seed.destination) {
      app.currentDestination = seed.destination;
    }
    refresh(seed.destination || DEFAULT_DESTINATION, { forceTravelIntel: true });
    if (window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function' && seed.destination) {
      window.TravelIntel.charts.refreshCharts(seed.destination);
    }
  }

  function redrawLanguage() {
    const active = getActiveTrack();
    if (active) {
      updateDashboardTitle(active);
      populateTrackingInputs(active);
    }
    renderTracking();
    if (latestDashboardData) {
      renderMetrics(latestDashboardData);
    } else {
      renderMetricsSkeleton();
    }
    if (latestTravelIntelResponse) {
      renderTravelIntelMetric(latestTravelIntelResponse);
      renderTravelIntelPanel(latestTravelIntelResponse);
    }
  }

  function refresh(destination, options = {}) {
    const tracking = ensureTrackingSeed();
    let active = getActiveTracking(tracking);
    if (!active) return;

    if (destination) {
      const normalizedDestination = normalizeDestination(destination);
      const byDestination = tracking.find((item) => item.destination === normalizedDestination);
      if (byDestination) {
        activeTrackingId = byDestination.id;
        active = byDestination;
      } else {
        const patched = patchTrackingItem(active.id, { destination: normalizedDestination });
        if (patched) active = patched;
      }
      const app = appApi();
      if (app && normalizedDestination) {
        app.currentDestination = normalizedDestination;
      }
    }

    updateDashboardTitle(active);
    populateTrackingInputs(active);
    renderTracking();
    fetchDashboardData(active);
    if (shouldRefreshTravelIntel(active, options)) {
      fetchTravelIntel(active);
    } else if (latestTravelIntelResponse) {
      renderTravelIntelMetric(latestTravelIntelResponse);
      renderTravelIntelPanel(latestTravelIntelResponse);
    }
  }

  function getActiveDestination() {
    const active = getActiveTrack();
    return active && active.destination ? active.destination : DEFAULT_DESTINATION;
  }

  window.TravelIntel = window.TravelIntel || {};
  window.TravelIntel.dashboard = {
    refresh,
    getActiveDestination,
    redrawLanguage
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensureTrackingSeed();
    const active = getActiveTrack();
    if (active) {
      activeTrackingId = active.id;
    }

    const addBtn = document.getElementById('tracking-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', handleAddTracking);
    }

    bindInputAutoSave();
    bindSearchAction();
    renderMetricsSkeleton();
    renderTravelIntelPanelSkeleton();
    refresh(active && active.destination ? active.destination : DEFAULT_DESTINATION, { forceTravelIntel: true });
  });

  document.addEventListener('langchange', redrawLanguage);
})();

