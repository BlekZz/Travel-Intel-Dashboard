(function() {
  const TRACKING_KEY = 'travelintel_tracking';
  const DEFAULT_DESTINATION = 'NRT';
  const DEFAULT_ORIGIN = 'TPE';
  const DEFAULT_DATE_RANGE = { start: '2025-08-01', end: '2025-08-07' };
  const MAX_TRACKINGS = 5;
  const DIMENSION_KEYS = ['shopping', 'relaxation', 'luxury', 'food', 'sightseeing', 'value', 'festival'];
  const defaultDimensions = {
    shopping: 0,
    relaxation: 0,
    luxury: 0,
    food: 0,
    sightseeing: 0,
    value: 0,
    festival: 0
  };

  let activeTrackingId = null;
  let sliderTimeout = null;
  let latestFunScoreResponse = null;

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
    if (typeof value !== 'string') return '';
    return value.trim().toUpperCase();
  }

  function cloneDefaultDimensions() {
    return { ...defaultDimensions };
  }

  function safeParseTracking(raw) {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function normalizeDimensions(input) {
    const output = cloneDefaultDimensions();
    if (!input || typeof input !== 'object') return output;

    DIMENSION_KEYS.forEach((key) => {
      const value = Number(input[key]);
      output[key] = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
    });

    return output;
  }

  function normalizeTrackingItem(item, index) {
    const destination = normalizeDestination(item && item.destination);
    const fallbackDestination = destination || DEFAULT_DESTINATION;
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
      dimensions: normalizeDimensions(item && item.dimensions),
      lastFetched: item && item.lastFetched ? String(item.lastFetched) : null,
      refreshInterval: item && item.refreshInterval ? String(item.refreshInterval) : 'onOpen',
      destinationFallback: fallbackDestination
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
        refreshInterval: normalized.refreshInterval
      };
    });

    localStorage.setItem(TRACKING_KEY, JSON.stringify(sanitized));
    return sanitized;
  }

  function createTrackingSeed() {
    const app = appApi();
    const currentDestination = normalizeDestination(app && app.currentDestination);
    const tracking = getTracking();
    const currentTrack = getActiveTracking(tracking);

    return {
      id: `tracking-${Date.now()}`,
      name: currentTrack && currentTrack.name ? `${currentTrack.name} Copy` : currentDestination || 'New Trip',
      destination: currentTrack && currentTrack.destination ? currentTrack.destination : currentDestination,
      origin: currentTrack && currentTrack.origin ? currentTrack.origin : DEFAULT_ORIGIN,
      dateRange: currentTrack ? { ...currentTrack.dateRange } : { ...DEFAULT_DATE_RANGE },
      dimensions: currentTrack ? { ...currentTrack.dimensions } : cloneDefaultDimensions(),
      lastFetched: currentTrack && currentTrack.lastFetched ? currentTrack.lastFetched : null,
      refreshInterval: currentTrack && currentTrack.refreshInterval ? currentTrack.refreshInterval : 'onOpen'
    };
  }

  function ensureTrackingSeed() {
    const tracking = getTracking();
    if (tracking.length > 0) {
      return tracking;
    }

    const seeded = saveTracking([
      {
        id: 'tracking-default',
        name: 'Tokyo',
        destination: DEFAULT_DESTINATION,
        origin: DEFAULT_ORIGIN,
        dateRange: { ...DEFAULT_DATE_RANGE },
        dimensions: cloneDefaultDimensions(),
        lastFetched: null,
        refreshInterval: 'onOpen'
      }
    ]);

    return seeded.map(normalizeTrackingItem);
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

  function setActiveTrackingById(id, options = {}) {
    const tracking = getTracking();
    const target = tracking.find((item) => item.id === id);
    if (!target) return null;

    activeTrackingId = target.id;

    const app = appApi();
    if (!options.skipAppSync && app && target.destination) {
      app.currentDestination = target.destination;
    }

    return target;
  }

  function patchTrackingItem(id, patch) {
    const tracking = getTracking();
    const index = tracking.findIndex((item) => item.id === id);
    if (index < 0) return null;

    const nextItem = {
      ...tracking[index],
      ...patch,
      dateRange: patch && patch.dateRange ? { ...tracking[index].dateRange, ...patch.dateRange } : tracking[index].dateRange,
      dimensions: patch && patch.dimensions ? normalizeDimensions(patch.dimensions) : tracking[index].dimensions
    };

    tracking[index] = normalizeTrackingItem(nextItem, index);
    saveTracking(tracking);
    return tracking[index];
  }

  function renderMetricsSkeleton() {
    ['metric-flight-price', 'metric-hotel-price', 'metric-weather', 'metric-fun-score'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = '<div class="skeleton skeleton--card"></div>';
      }
    });
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

  function formatLastUpdated(value) {
    if (!value) {
      return t('Last updated: not yet fetched', '最後更新：尚未抓取');
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return t('Last updated: unavailable', '最後更新：無法判定');
    }

    const locale = isChinese() ? 'zh-TW' : 'en-US';
    return `${t('Last updated', '最後更新')}：${date.toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
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
      pill.title = formatLastUpdated(item.lastFetched);

      const labelBtn = document.createElement('button');
      labelBtn.type = 'button';
      labelBtn.textContent = item.name;
      labelBtn.setAttribute('aria-label', `${t('Switch tracking', '切換追蹤')}: ${item.name}`);
      labelBtn.addEventListener('click', () => {
        setActiveTrackingById(item.id);
        refresh(item.destination || DEFAULT_DESTINATION);
        if (window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function') {
          window.TravelIntel.charts.refreshCharts(item.destination || DEFAULT_DESTINATION);
        }
      });
      labelBtn.addEventListener('dblclick', () => {
        const nextName = window.prompt(t('Rename tracking', '重新命名追蹤'), item.name);
        if (!nextName || !nextName.trim()) return;
        patchTrackingItem(item.id, { name: nextName.trim() });
        renderTracking();
        const refreshed = getActiveTracking();
        if (refreshed && refreshed.id === item.id) {
          updateDashboardTitle(refreshed);
        }
      });

      const meta = document.createElement('span');
      meta.className = 'tracking-pill__meta';
      meta.textContent = item.destination || t('Pending', '待設定');

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tracking-pill__close';
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', `${t('Remove tracking', '刪除追蹤')}: ${item.name}`);
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!window.confirm(t('Remove this tracking?', '要刪除這個追蹤嗎？'))) {
          return;
        }

        const nextTracking = getTracking().filter((entry) => entry.id !== item.id);
        const saved = nextTracking.length ? saveTracking(nextTracking) : saveTracking([createTrackingSeed()]);
        const normalizedSaved = saved.map(normalizeTrackingItem);
        const fallback = normalizedSaved[0] || null;
        activeTrackingId = fallback ? fallback.id : null;

        if (fallback && fallback.destination) {
          const app = appApi();
          if (app) {
            app.currentDestination = fallback.destination;
          }
        }

        renderTracking();
        if (fallback) {
          refresh(fallback.destination || DEFAULT_DESTINATION);
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

  function getTrackingPayloadForActive() {
    const tracking = ensureTrackingSeed();
    return getActiveTracking(tracking);
  }

  function renderFlightMetric(data, meta) {
    const container = document.getElementById('metric-flight-price');
    if (!container) return;

    const deltaClass = getDeltaClass(data.flightPriceDelta, true);
    const fallbackNote = meta && meta.partialData ? `<div class="metric-card__delta">${t('Partial data mode', '部分資料模式')}</div>` : '';

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card__label">${t('Flight Avg Price', '航班均價')}</div>
        <div class="metric-card__value">${formatCurrency(data.avgFlightPrice)}</div>
        <div class="metric-card__delta ${deltaClass}">${formatPercent(data.flightPriceDelta)}</div>
        ${fallbackNote}
      </div>
    `;
  }

  function renderHotelMetric(data, meta) {
    const container = document.getElementById('metric-hotel-price');
    if (!container) return;

    const deltaClass = getDeltaClass(data.hotelPriceDelta, true);
    const unavailableNote = coerceNumber(data.avgHotelPrice) === null
      ? `<div class="metric-card__delta">${t('Hotel data unavailable', '飯店資料暫時不可用')}</div>`
      : '';
    const fallbackNote = meta && meta.partialData && !unavailableNote
      ? `<div class="metric-card__delta">${t('Fallback source in use', '目前使用 fallback 資料')}</div>`
      : '';

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card__label">${t('Hotel Avg Price (Night)', '飯店每晚均價')}</div>
        <div class="metric-card__value">${formatCurrency(data.avgHotelPrice)}</div>
        <div class="metric-card__delta ${deltaClass}">${formatPercent(data.hotelPriceDelta)}</div>
        ${unavailableNote || fallbackNote}
      </div>
    `;
  }

  function renderWeatherMetric(weather, meta) {
    const container = document.getElementById('metric-weather');
    if (!container) return;

    const avgTemp = coerceNumber(weather && weather.avgTemp);
    const avgHumidity = coerceNumber(weather && weather.avgHumidity);
    const avgRain = coerceNumber(weather && weather.avgRainProbability);
    const condition = weather && weather.condition ? weather.condition : t('Unavailable', '暫無資料');

    const secondary = avgTemp === null
      ? t('Weather data unavailable', '天氣資料暫時不可用')
      : `${t('Humidity', '濕度')}: ${avgHumidity ?? '—'}% | ${t('Rain', '降雨機率')}: ${avgRain ?? '—'}%`;

    const fallbackNote = meta && meta.partialData && avgTemp === null
      ? `<div class="metric-card__delta">${t('Fallback source in use', '目前使用 fallback 資料')}</div>`
      : '';

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card__label">${t('Weather', '天氣')}</div>
        <div class="metric-card__value">${avgTemp === null ? '—' : `${avgTemp}°C`}</div>
        <div class="metric-card__delta">${condition} · ${secondary}</div>
        ${fallbackNote}
      </div>
    `;
  }

  function getConfidenceClass(value) {
    if (value === 'high') return 'badge--ai';
    if (value === 'medium') return 'badge--ai-warn';
    return 'badge--ai-low';
  }

  function renderFunScoreMetric(funScore, options = {}) {
    const container = document.getElementById('metric-fun-score');
    if (!container) return;

    const overall = coerceNumber(funScore && (funScore.overall ?? funScore.score));
    const breakdown = funScore && typeof funScore.breakdown === 'object' ? funScore.breakdown
      : (funScore && typeof funScore.dimension_scores === 'object' ? funScore.dimension_scores : {});
    const topEntry = Object.entries(breakdown)
      .map(([key, value]) => [key, coerceNumber(value)])
      .filter(([, value]) => value !== null)
      .sort((a, b) => b[1] - a[1])[0];
    const bestFor = topEntry ? topEntry[0] : null;
    const badgeClass = getConfidenceClass(funScore && funScore.data_confidence);
    const badgeText = funScore && funScore.data_confidence === 'low'
      ? t('AI Score · Verify', 'AI 評分 · 請驗證')
      : t('AI Score', 'AI 評分');
    const note = options.note || (overall === null
      ? t('AI score unavailable', 'AI 評分暫時不可用')
      : bestFor
        ? `${t('Best for', '適合')}: ${bestFor}`
        : t('Awaiting better signal', '等待更多資料'));

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card__label">${t('Fun Score', '好玩指數')} <span class="badge ${badgeClass}">${badgeText}</span></div>
        <div class="metric-card__value">${overall === null ? '—' : `${overall} / 100`}</div>
        <div class="metric-card__delta">${note}</div>
      </div>
    `;
  }

  function renderMetrics(data) {
    const meta = data && data.meta ? data.meta : {};
    renderFlightMetric(data || {}, meta);
    renderHotelMetric(data || {}, meta);
    renderWeatherMetric(data && data.weather ? data.weather : {}, meta);
    renderFunScoreMetric(data && data.funScore ? data.funScore : {}, {
      note: meta && meta.partialData ? t('Dashboard using mixed live/fallback data', '目前使用混合 live/fallback 資料') : undefined
    });
  }

  async function fetchDashboardData(track) {
    if (!track || !track.destination) {
      renderFlightMetric({}, {});
      renderHotelMetric({}, {});
      renderWeatherMetric({}, {});
      renderFunScoreMetric(latestFunScoreResponse || {}, { note: t('Set a destination to load data', '請先設定目的地') });
      return;
    }

    renderMetricsSkeleton();

    const params = new URLSearchParams({
      destination: track.destination,
      origin: track.origin || DEFAULT_ORIGIN,
      dateRange: JSON.stringify(track.dateRange)
    });

    try {
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Dashboard request failed (${res.status})`);
      }

      const data = await res.json();
      renderMetrics(data);

      const now = new Date().toISOString();
      patchTrackingItem(track.id, { lastFetched: now });
      renderTracking();
      updateDashboardTitle({ ...track, lastFetched: now });
    } catch (error) {
      showToast(t('Failed to load dashboard metrics', '載入 dashboard metrics 失敗'), 'error');
      renderFlightMetric({}, { partialData: true });
      renderHotelMetric({}, { partialData: true });
      renderWeatherMetric({}, { partialData: true });
      renderFunScoreMetric(latestFunScoreResponse || {}, { note: t('Dashboard load failed', 'Dashboard 載入失敗') });
      console.error(error);
    }
  }

  function updateSliderSum() {
    const inputs = Array.from(document.querySelectorAll('.slider-group__input'));
    const sum = inputs.reduce((acc, input) => acc + Number(input.value || 0), 0);
    const sumEl = document.getElementById('slider-sum');

    if (sumEl) {
      sumEl.textContent = `(${sum}%)`;
      sumEl.style.color = sum === 100 ? 'var(--color-success)' : 'var(--color-danger)';
    }

    return sum;
  }

  function scheduleFunScoreSubmit() {
    clearTimeout(sliderTimeout);
    sliderTimeout = setTimeout(() => {
      submitFunScore();
    }, 400);
  }

  function renderSliders() {
    const container = document.getElementById('slider-container');
    if (!container) return;

    const track = getTrackingPayloadForActive();
    const dims = track ? normalizeDimensions(track.dimensions) : cloneDefaultDimensions();
    const labels = {
      shopping: t('Shopping', '購物'),
      relaxation: t('Relaxation', '渡假放鬆'),
      luxury: t('Luxury', '奢侈享受'),
      food: t('Food', '吃喝玩樂'),
      sightseeing: t('Sightseeing', '觀光名勝'),
      value: t('Value', '性價比'),
      festival: t('Festival', '節慶活動')
    };

    container.innerHTML = `<h4>${t('Fun Score Dimensions', '好玩指數維度')} <span id="slider-sum"></span></h4>`;

    DIMENSION_KEYS.forEach((key) => {
      const group = document.createElement('div');
      group.className = 'slider-group';

      const label = document.createElement('div');
      label.className = 'slider-group__label';
      label.innerHTML = `<span>${labels[key]}</span><span class="slider-group__value">${dims[key]}%</span>`;

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'slider-group__input';
      input.min = '0';
      input.max = '100';
      input.step = '5';
      input.value = String(dims[key]);
      input.dataset.dimension = key;
      input.dataset.prev = String(dims[key]);

      input.addEventListener('input', (event) => {
        const slider = event.currentTarget;
        const previous = Number(slider.dataset.prev || 0);
        const nextValue = Number(slider.value || 0);
        const allInputs = Array.from(container.querySelectorAll('.slider-group__input'));
        const nextSum = allInputs.reduce((acc, current) => {
          return acc + (current === slider ? nextValue : Number(current.value || 0));
        }, 0);

        if (nextSum > 100) {
          slider.value = String(previous);
          return;
        }

        slider.dataset.prev = String(nextValue);
        label.querySelector('.slider-group__value').textContent = `${nextValue}%`;

        const currentTrack = getTrackingPayloadForActive();
        if (currentTrack) {
          const nextDimensions = { ...currentTrack.dimensions, [key]: nextValue };
          patchTrackingItem(currentTrack.id, { dimensions: nextDimensions });
        }

        updateSliderSum();
        scheduleFunScoreSubmit();
      });

      group.appendChild(label);
      group.appendChild(input);
      container.appendChild(group);
    });

    updateSliderSum();
  }

  async function submitFunScore() {
    const track = getTrackingPayloadForActive();
    if (!track || !track.destination) {
      showToast(t('Set a destination before computing fun score', '請先設定目的地再計算好玩指數'), 'warning');
      return;
    }

    const sum = updateSliderSum();
    if (sum !== 100) {
      showToast(t('Dimensions must sum to exactly 100%', '各維度總和必須剛好為 100%'), 'warning');
      return;
    }

    const payload = {
      destination: track.destination,
      dates: track.dateRange,
      dimensions: { ...track.dimensions }
    };

    try {
      const res = await fetch('/api/fun-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        const message = data && data.note ? data.note : `Fun score request failed (${res.status})`;
        throw new Error(message);
      }

      latestFunScoreResponse = {
        overall: data.score,
        score: data.score,
        breakdown: data.dimension_scores,
        dimension_scores: data.dimension_scores,
        strength: data.strength,
        weakness: data.weakness,
        note: data.note,
        data_confidence: data.data_confidence,
        sources: data.sources
      };

      renderFunScoreMetric(latestFunScoreResponse, {
        note: data.note || ((data.strength || []).length ? `${t('Best for', '適合')}: ${(data.strength || []).join(', ')}` : undefined)
      });

      const now = new Date().toISOString();
      patchTrackingItem(track.id, { lastFetched: now });
      renderTracking();
    } catch (error) {
      showToast(error.message || t('Failed to compute fun score', '計算好玩指數失敗'), 'error');
      renderFunScoreMetric(latestFunScoreResponse || {}, { note: t('AI score update failed', 'AI 評分更新失敗') });
    }
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

    const saved = saveTracking([...tracking, seed]).map(normalizeTrackingItem);
    activeTrackingId = seed.id;

    const app = appApi();
    if (app && seed.destination) {
      app.currentDestination = seed.destination;
    }

    renderTracking();
    refresh(seed.destination || DEFAULT_DESTINATION);
    if (window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function' && seed.destination) {
      window.TravelIntel.charts.refreshCharts(seed.destination);
    }
  }

  function bindInputAutoSave() {
    ['dash-origin', 'dash-dest', 'dash-start', 'dash-end'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener('change', () => {
        const track = getTrackingPayloadForActive();
        if (!track) return;

        const originEl = document.getElementById('dash-origin');
        const destinationEl = document.getElementById('dash-dest');
        const startEl = document.getElementById('dash-start');
        const endEl = document.getElementById('dash-end');

        const nextDestination = normalizeDestination(destinationEl && destinationEl.value);
        const nextName = track.name === track.destination || !track.name
          ? nextDestination || track.name
          : track.name;

        patchTrackingItem(track.id, {
          origin: originEl && originEl.value ? originEl.value.trim().toUpperCase() : DEFAULT_ORIGIN,
          destination: nextDestination,
          name: nextName,
          dateRange: {
            start: startEl && startEl.value ? startEl.value : track.dateRange.start,
            end: endEl && endEl.value ? endEl.value : track.dateRange.end
          }
        });

        if (nextDestination) {
          const app = appApi();
          if (app) {
            app.currentDestination = nextDestination;
          }
        }

        renderTracking();
        updateDashboardTitle(getTrackingPayloadForActive());
      });
    });
  }

  function bindSearchAction() {
    const button = document.getElementById('dash-search-btn');
    if (!button) return;

    button.addEventListener('click', () => {
      const track = getTrackingPayloadForActive();
      if (!track) return;

      const refreshedTrack = getTrackingPayloadForActive();
      if (!refreshedTrack || !refreshedTrack.destination) {
        showToast(t('Destination is required', '目的地為必填'), 'warning');
        return;
      }

      const app = appApi();
      if (app) {
        app.currentDestination = refreshedTrack.destination;
      }

      refresh(refreshedTrack.destination);
      if (window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function') {
        window.TravelIntel.charts.refreshCharts(refreshedTrack.destination);
      }
    });
  }

  function refresh(destination) {
    const tracking = ensureTrackingSeed();
    let active = getActiveTracking(tracking);

    if (destination) {
      const normalizedDestination = normalizeDestination(destination);
      const byDestination = tracking.find((item) => item.destination === normalizedDestination);
      if (byDestination) {
        activeTrackingId = byDestination.id;
        active = byDestination;
      } else if (active) {
        patchTrackingItem(active.id, { destination: normalizedDestination });
        active = getActiveTracking();
      }

      const app = appApi();
      if (app && normalizedDestination) {
        app.currentDestination = normalizedDestination;
      }
    }

    active = getTrackingPayloadForActive();
    if (!active) return;

    updateDashboardTitle(active);
    populateTrackingInputs(active);
    renderTracking();
    renderSliders();
    fetchDashboardData(active);
  }

  function getActiveDestination() {
    const active = getTrackingPayloadForActive();
    return active && active.destination ? active.destination : DEFAULT_DESTINATION;
  }

  window.TravelIntel = window.TravelIntel || {};
  window.TravelIntel.dashboard = {
    refresh,
    getActiveDestination
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensureTrackingSeed();

    const active = getActiveTracking();
    if (active) {
      activeTrackingId = active.id;
    }

    const addBtn = document.getElementById('tracking-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', handleAddTracking);
    }

    bindInputAutoSave();
    bindSearchAction();

    const app = appApi();
    if (app && active && active.destination) {
      app.currentDestination = active.destination;
    }

    refresh(active && active.destination ? active.destination : DEFAULT_DESTINATION);
  });
})();