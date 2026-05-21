(function () {
  let yoyChartInstance = null;
  let fullYearChartInstance = null;
  let controlsInitialized = false;
  let requestSequence = 0;
  let lastRenderedPayload = null;
  let adviceRetryTimer = null;
  let adviceRetryDeadline = 0;
  let adviceRetryCount = 0;

  const state = {
    origin: 'TPE',
    destination: 'NRT',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  };

  const MONTH_LABELS_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PEAK_WEEKS = [
    { start: 3, end: 6, labelZh: '農曆年', labelEn: 'Lunar New Year' },
    { start: 26, end: 34, labelZh: '暑假', labelEn: 'Summer' },
    { start: 38, end: 41, labelZh: '連假', labelEn: 'Holiday' },
  ];

  function getApp() {
    return window.TravelIntel && window.TravelIntel.app ? window.TravelIntel.app : {};
  }

  function getTextBundle() {
    const lang = document.documentElement.lang || 'zh-TW';
    const isZh = /^zh/i.test(lang);
    return {
      isZh,
      search: isZh ? '查詢' : 'Search',
      origin: isZh ? '出發地' : 'Origin',
      destination: isZh ? '目的地' : 'Destination',
      year: isZh ? '年份' : 'Year',
      month: isZh ? '月份' : 'Month',
      yoyTitle: isZh ? '年度月均價比較' : 'Year-over-Year Average Price',
      fullyearTitle: isZh ? '全年票價趨勢' : 'Full-Year Flight Trend',
      currentYear: isZh ? '本年度' : 'Current Year',
      priorYear: isZh ? '去年' : 'Prior Year',
      overallAvg: isZh ? '整體平均' : 'Overall Average',
      targetPrice: isZh ? '目標價格' : 'Target Price',
      adviceBook: isZh ? '建議立即購票' : 'Recommend Booking Now',
      adviceWait: isZh ? '建議觀望' : 'Recommend Waiting',
      adviceAvoid: isZh ? '建議等待降價' : 'Recommend Waiting for Lower Prices',
      bestBooking: isZh ? '最佳購票時間' : 'Best Booking Window',
      deviation: isZh ? '與常態偏離' : 'Deviation',
      riskNotes: isZh ? '風險提示' : 'Risk Notes',
      sources: isZh ? '資料來源' : 'Sources',
      noSources: isZh ? '無來源資訊' : 'No source metadata',
      noRiskNotes: isZh ? '目前無額外風險提示' : 'No additional risk notes',
      aiEstimate: isZh ? 'AI 估算 · 僅供參考' : 'AI estimate · Reference only',
      pleaseVerify: isZh ? 'AI 估算 · 請驗證' : 'AI estimate · Please verify',
      deterministicNote: isZh ? '目前為 deterministic sample / route 資料' : 'Currently using deterministic sample / route data',
      unavailable: isZh ? '資料不足' : 'Data unavailable',
      loading: isZh ? '資料載入中…' : 'Loading…',
      noTrendData: isZh ? '沒有可用的趨勢資料' : 'No trend data available',
      noYoyData: isZh ? '沒有可用的 YOY 資料' : 'No YOY data available',
      weekAxis: isZh ? '週次' : 'Week',
      priceAxis: isZh ? '均價 (NT$)' : 'Average Price (NT$)',
      currentPriceLevel: isZh ? '當前價格水位' : 'Current price level',
      confidenceHigh: isZh ? '高可信度' : 'High confidence',
      confidenceMedium: isZh ? '中可信度' : 'Medium confidence',
      confidenceLow: isZh ? '低可信度' : 'Low confidence',
      targetPriceLabel: isZh ? '目標價格' : 'Target price',
      yoyLabel: isZh ? '年增率' : 'YoY',
      selectedMonth: isZh ? '查詢月份' : 'Selected month',
      fallback: isZh ? 'fallback' : 'fallback',
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeIata(value, fallback) {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized || fallback;
  }

  function normalizeYear(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getFullYear();
  }

  function normalizeMonth(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return new Date().getMonth() + 1;
    return Math.min(12, Math.max(1, parsed));
  }

  function formatCurrency(value) {
    if (!Number.isFinite(value)) return '—';
    return `NT$${Math.round(value).toLocaleString('en-US')}`;
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return '—';
    const rounded = Math.round(value * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  }

  function formatWeeksBefore(value, texts) {
    if (!value) return '—';
    return texts.isZh ? `${value} 週前` : `${value} weeks before`;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function selectLocalizedText(value, fallback) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const preferred = getTextBundle().isZh ? value.zh : value.en;
      const alternate = getTextBundle().isZh ? value.en : value.zh;
      return preferred || alternate || fallback || '';
    }
    return value || fallback || '';
  }

  function selectLocalizedArray(value, fallback) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const preferred = getTextBundle().isZh ? value.zh : value.en;
      const alternate = getTextBundle().isZh ? value.en : value.zh;
      return safeArray(preferred).length ? preferred : (safeArray(alternate).length ? alternate : safeArray(fallback));
    }
    return safeArray(value).length ? safeArray(value) : safeArray(fallback);
  }

  function isHttpSource(url) {
    return /^https?:\/\//i.test(String(url || ''));
  }

  function getConfidenceBadge(confidence) {
    const texts = getTextBundle();
    const value = String(confidence || 'low').toLowerCase();
    if (value === 'high') {
      return {
        className: 'badge badge--ai',
        label: `${texts.aiEstimate} · ${texts.confidenceHigh}`,
      };
    }
    if (value === 'medium') {
      return {
        className: 'badge badge--ai-warn',
        label: `${texts.aiEstimate} · ${texts.confidenceMedium}`,
      };
    }
    return {
      className: 'badge badge--ai-low',
      label: `${texts.pleaseVerify} · ${texts.confidenceLow}`,
    };
  }

  function ensureControls() {
    if (controlsInitialized) return;
    const container = document.getElementById('tab-price-history');
    if (!container) return;

    const controls = document.createElement('div');
    controls.className = 'trip-search-bar trip-search-bar--compact';
    controls.id = 'ph-controls';
    controls.innerHTML = `
      <input type="text" id="ph-origin" placeholder="Origin" maxlength="3" aria-label="Origin airport code">
      <div class="search-divider"></div>
      <input type="text" id="ph-dest" placeholder="Dest" maxlength="3" aria-label="Destination airport code">
      <div class="search-divider"></div>
      <input type="number" id="ph-year" min="2000" max="2100" placeholder="Year" aria-label="Year">
      <div class="search-divider"></div>
      <input type="number" id="ph-month" min="1" max="12" placeholder="Month" aria-label="Month">
      <button id="ph-refresh-btn" class="btn btn--primary" type="button">Search</button>
    `;

    container.insertBefore(controls, container.firstChild);

    ['ph-origin', 'ph-dest', 'ph-year', 'ph-month'].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('change', handleControlChange);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleControlChange();
        }
      });
    });

    const refreshButton = document.getElementById('ph-refresh-btn');
    if (refreshButton) {
      refreshButton.addEventListener('click', handleControlChange);
    }

    controlsInitialized = true;
    syncControlsFromState();
    applyControlLabels();
  }

  function syncControlsFromState() {
    const originInput = document.getElementById('ph-origin');
    const destinationInput = document.getElementById('ph-dest');
    const yearInput = document.getElementById('ph-year');
    const monthInput = document.getElementById('ph-month');

    if (originInput) originInput.value = state.origin;
    if (destinationInput) destinationInput.value = state.destination;
    if (yearInput) yearInput.value = String(state.year);
    if (monthInput) monthInput.value = String(state.month);
  }

  function applyControlLabels() {
    const texts = getTextBundle();
    const originInput = document.getElementById('ph-origin');
    const destinationInput = document.getElementById('ph-dest');
    const yearInput = document.getElementById('ph-year');
    const monthInput = document.getElementById('ph-month');
    const refreshButton = document.getElementById('ph-refresh-btn');

    if (originInput) originInput.placeholder = texts.origin;
    if (destinationInput) destinationInput.placeholder = texts.destination;
    if (yearInput) yearInput.placeholder = texts.year;
    if (monthInput) monthInput.placeholder = texts.month;
    if (refreshButton) refreshButton.textContent = texts.search;
  }

  function handleControlChange() {
    state.origin = normalizeIata(document.getElementById('ph-origin')?.value, 'TPE');
    state.destination = normalizeIata(document.getElementById('ph-dest')?.value, 'NRT');
    state.year = normalizeYear(document.getElementById('ph-year')?.value);
    state.month = normalizeMonth(document.getElementById('ph-month')?.value);
    syncControlsFromState();

    const app = getApp();
    if (app && typeof app.currentDestination !== 'undefined') {
      try {
        app.currentDestination = state.destination;
      } catch (_) {
        // ignore app shell setter issues; this module stays self-sufficient
      }
    }

    fetchData();
  }

  function buildQueryParams() {
    return new URLSearchParams({
      origin: state.origin,
      destination: state.destination,
      year: String(state.year),
      targetMonth: `${state.year}-${String(state.month).padStart(2, '0')}`,
    });
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    let payload = null;

    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && payload.error ? payload.error : `HTTP ${response.status}`;
      return { ok: false, status: response.status, data: payload, message };
    }

    return { ok: true, status: response.status, data: payload };
  }

  function setLoadingState(isLoading) {
    const banner = document.getElementById('advice-banner');
    const yoyPanel = document.getElementById('chart-yoy')?.parentElement;
    const fullYearPanel = document.getElementById('chart-fullyear')?.parentElement;
    const texts = getTextBundle();

    if (banner) {
      banner.classList.toggle('skeleton', isLoading);
      banner.classList.toggle('skeleton--row', isLoading);
      if (isLoading) {
        banner.className = 'advice-banner skeleton skeleton--row';
        banner.innerHTML = `
          <div class="price-history-loading">
            <div class="price-history-loading__title">${texts.loading}</div>
            <div class="price-history-loading__subtitle">${texts.isZh ? '正在等待 Gemini 建議與歷史價格分析…' : 'Waiting for Gemini advice and historical pricing analysis…'}</div>
          </div>
        `;
      }
    }

    [yoyPanel, fullYearPanel].forEach((panel) => {
      if (!panel) return;
      panel.classList.toggle('skeleton', isLoading);
      panel.classList.toggle('skeleton--chart', isLoading);
    });
  }

  function normalizePriceHistoryPayload(payload) {
    return {
      currentYear: safeArray(payload?.currentYear)
        .map((item) => ({ month: Number(item?.month), avgPrice: Number(item?.avgPrice) }))
        .filter((item) => Number.isFinite(item.month) && Number.isFinite(item.avgPrice)),
      priorYear: safeArray(payload?.priorYear)
        .map((item) => ({ month: Number(item?.month), avgPrice: Number(item?.avgPrice) }))
        .filter((item) => Number.isFinite(item.month) && Number.isFinite(item.avgPrice)),
      data_confidence: payload?.data_confidence || 'medium',
      sources: safeArray(payload?.sources),
      meta: payload?.meta || null,
    };
  }

  function clearAdviceRetry() {
    if (adviceRetryTimer) {
      clearInterval(adviceRetryTimer);
      adviceRetryTimer = null;
    }
    adviceRetryDeadline = 0;
  }

  function getAdviceRetryState() {
    if (!adviceRetryDeadline) return null;
    return {
      remainingMs: Math.max(0, adviceRetryDeadline - Date.now()),
      active: Date.now() < adviceRetryDeadline
    };
  }

  function scheduleAdviceRetry(delayMs) {
    clearAdviceRetry();
    adviceRetryDeadline = Date.now() + Math.max(1000, Number(delayMs || 30000));
    adviceRetryTimer = setInterval(() => {
      const retryState = getAdviceRetryState();
      if (!retryState || retryState.remainingMs <= 0) {
        clearAdviceRetry();
        fetchData();
        return;
      }
      if (lastRenderedPayload) {
        renderAdviceBanner(lastRenderedPayload.adviceData, {
          priceHistoryOk: lastRenderedPayload.priceHistoryOk,
          trendOk: lastRenderedPayload.trendOk,
          adviceOk: lastRenderedPayload.adviceOk,
          combinedSources: lastRenderedPayload.combinedSources,
          providerMeta: lastRenderedPayload.providerMeta
        });
      }
    }, 1000);
  }

  function normalizeTrendPayload(payload) {
    return {
      trend: safeArray(payload?.trend)
        .map((item) => ({
          date: item?.date,
          avgFlightPrice: Number(item?.avgFlightPrice),
          avgHotelPrice: Number(item?.avgHotelPrice),
        }))
        .filter((item) => item.date && (Number.isFinite(item.avgFlightPrice) || Number.isFinite(item.avgHotelPrice))),
      meta: payload?.meta || null,
    };
  }

  function normalizeAdvicePayload(payload) {
    return {
      currentPriceLevel: payload?.currentPriceLevel || null,
      currentPriceDeviationPct: Number.isFinite(Number(payload?.currentPriceDeviationPct)) ? Number(payload.currentPriceDeviationPct) : null,
      bestBookingWeeksBefore: payload?.bestBookingWeeksBefore || null,
      targetPriceTwd: Number.isFinite(Number(payload?.targetPriceTwd)) ? Number(payload.targetPriceTwd) : null,
      confidence: payload?.confidence || payload?.data_confidence || 'low',
      riskNotes: safeArray(payload?.riskNotes).filter(Boolean),
      riskNotes_i18n: payload?.riskNotes_i18n || null,
      data_confidence: payload?.data_confidence || 'low',
      sources: safeArray(payload?.sources),
      meta: payload?.meta || null,
    };
  }

  function mergeSourceMetadata(priceHistoryResult, adviceResult) {
    return [
      ...safeArray(priceHistoryResult?.sources),
      ...safeArray(adviceResult?.sources),
    ];
  }

  function mergeProviderMeta(priceHistoryMeta, trendMeta, adviceMeta) {
    const candidates = [priceHistoryMeta, trendMeta, adviceMeta].filter((meta) => meta && typeof meta === 'object');
    if (candidates.length === 0) {
      return null;
    }

    return {
      provider: candidates[0].provider || 'unknown',
      generatedAt: candidates.find((meta) => meta.generatedAt)?.generatedAt || null,
      cached: candidates.some((meta) => Boolean(meta.cached)),
      stale: candidates.some((meta) => Boolean(meta.stale)),
      fallbackUsed: candidates.some((meta) => Boolean(meta.fallbackUsed)),
      sourceTier: candidates.find((meta) => meta.sourceTier)?.sourceTier || null,
    };
  }

  async function fetchData() {
    ensureControls();
    applyControlLabels();
    syncControlsFromState();

    const currentRequest = ++requestSequence;
    setLoadingState(true);

    const params = buildQueryParams();
    const priceHistoryUrl = `/api/price-history?origin=${encodeURIComponent(state.origin)}&destination=${encodeURIComponent(state.destination)}&year=${encodeURIComponent(String(state.year))}`;
    const trendUrl = `/api/flight-trend?origin=${encodeURIComponent(state.origin)}&destination=${encodeURIComponent(state.destination)}&year=${encodeURIComponent(String(state.year))}`;
    const adviceUrl = `/api/booking-advice?origin=${encodeURIComponent(state.origin)}&destination=${encodeURIComponent(state.destination)}&targetMonth=${encodeURIComponent(params.get('targetMonth'))}`;

    try {
      const [priceHistoryResponse, trendResponse, adviceResponse] = await Promise.all([
        fetchJson(priceHistoryUrl),
        fetchJson(trendUrl),
        fetchJson(adviceUrl),
      ]);

      if (currentRequest !== requestSequence) return;

      const priceHistoryData = normalizePriceHistoryPayload(priceHistoryResponse.data);
      const trendData = normalizeTrendPayload(trendResponse.data);
      const adviceData = normalizeAdvicePayload(adviceResponse.data);
      lastRenderedPayload = {
        priceHistoryData,
        trendData,
        adviceData,
        priceHistoryOk: priceHistoryResponse.ok,
        trendOk: trendResponse.ok,
        adviceOk: adviceResponse.ok,
        combinedSources: mergeSourceMetadata(priceHistoryData, adviceData),
        providerMeta: mergeProviderMeta(priceHistoryData.meta, trendData.meta, adviceData.meta),
      };

      if (adviceData.meta && adviceData.meta.fallbackUsed && Number(adviceData.meta.retryAfterMs || 0) > 0 && adviceRetryCount < 1) {
        adviceRetryCount += 1;
        scheduleAdviceRetry(adviceData.meta.retryAfterMs);
      } else if (!adviceData.meta || !adviceData.meta.fallbackUsed) {
        clearAdviceRetry();
        adviceRetryCount = 0;
      }

      renderAdviceBanner(adviceData, {
        priceHistoryOk: lastRenderedPayload.priceHistoryOk,
        trendOk: lastRenderedPayload.trendOk,
        adviceOk: lastRenderedPayload.adviceOk,
        combinedSources: lastRenderedPayload.combinedSources,
        providerMeta: lastRenderedPayload.providerMeta,
      });
      renderYoyChart(priceHistoryData, priceHistoryResponse.ok);
      renderFullYearChart(trendData, adviceData, trendResponse.ok);
    } catch (error) {
      if (currentRequest !== requestSequence) return;
      const fallbackAdvice = normalizeAdvicePayload(null);
      const fallbackHistory = normalizePriceHistoryPayload(null);
      const fallbackTrend = normalizeTrendPayload(null);
      lastRenderedPayload = {
        priceHistoryData: fallbackHistory,
        trendData: fallbackTrend,
        adviceData: fallbackAdvice,
        priceHistoryOk: false,
        trendOk: false,
        adviceOk: false,
        combinedSources: [],
        providerMeta: null,
      };

      renderAdviceBanner(fallbackAdvice, {
        priceHistoryOk: false,
        trendOk: false,
        adviceOk: false,
        combinedSources: [],
      });
      renderYoyChart(fallbackHistory, false);
      renderFullYearChart(fallbackTrend, fallbackAdvice, false);

      const app = getApp();
      if (app && typeof app.showToast === 'function') {
        app.showToast(getTextBundle().isZh ? '載入歷史價格資料失敗' : 'Failed to load price history data', 'error');
      }
    } finally {
      if (currentRequest === requestSequence) {
        setLoadingState(false);
      }
    }
  }

  function redrawLanguage() {
    initialize();
    applyControlLabels();

    if (!lastRenderedPayload) return;

    renderAdviceBanner(lastRenderedPayload.adviceData, {
      priceHistoryOk: lastRenderedPayload.priceHistoryOk,
      trendOk: lastRenderedPayload.trendOk,
        adviceOk: lastRenderedPayload.adviceOk,
        combinedSources: lastRenderedPayload.combinedSources,
        providerMeta: lastRenderedPayload.providerMeta,
      });
    renderYoyChart(lastRenderedPayload.priceHistoryData, lastRenderedPayload.priceHistoryOk);
    renderFullYearChart(lastRenderedPayload.trendData, lastRenderedPayload.adviceData, lastRenderedPayload.trendOk);
  }

  function renderAdviceBanner(data, context) {
    const banner = document.getElementById('advice-banner');
    if (!banner) return;

    const texts = getTextBundle();
    const deviation = data.currentPriceDeviationPct;
    let variantClass = 'advice-banner--wait';
    let title = texts.adviceWait;

    if (Number.isFinite(deviation) && deviation <= -15) {
      variantClass = 'advice-banner--book';
      title = texts.adviceBook;
    } else if (Number.isFinite(deviation) && deviation >= 15) {
      variantClass = 'advice-banner--avoid';
      title = texts.adviceAvoid;
    }

    const badge = getConfidenceBadge(data.data_confidence);
    const providerBadges = buildProviderBadges(context.providerMeta);
    const fallbackFlags = [];
    if (!context.adviceOk) fallbackFlags.push('booking-advice');
    if (!context.priceHistoryOk) fallbackFlags.push('price-history');
    if (!context.trendOk) fallbackFlags.push('flight-trend');

    const sourcesHtml = context.combinedSources.length
      ? context.combinedSources.map((source, index) => {
          if (isHttpSource(source)) {
            return `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${texts.sources} ${index + 1}</a>`;
          }
          return `<span>${escapeHtml(String(source))}</span>`;
        }).join(' · ')
      : `<span>${texts.noSources}</span>`;

    const localizedRiskNotes = selectLocalizedArray(data.riskNotes_i18n, data.riskNotes);
    const riskNotes = localizedRiskNotes.length
      ? `<ul class="advice-banner__list">${localizedRiskNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
      : `<span>${texts.noRiskNotes}</span>`;

    const fallbackNotice = fallbackFlags.length
      ? `<div class="advice-banner__fallback-note">${texts.deterministicNote} (${escapeHtml(fallbackFlags.join(', '))})</div>`
      : `<div class="advice-banner__fallback-note">${texts.deterministicNote}</div>`;
    const retryState = getAdviceRetryState();
    const retryLine = retryState && retryState.active
      ? `<div class="retry-inline"><span class="badge badge--provider-warn">${escapeHtml(texts.isZh ? '即將重試 live' : 'Retrying live soon')}</span><span>${escapeHtml(texts.isZh ? `倒數 ${Math.ceil(retryState.remainingMs / 1000)} 秒` : `${Math.ceil(retryState.remainingMs / 1000)}s remaining`)}</span></div>`
      : '';
    const quotaNote = `<div class="subtle-note" title="${escapeHtml(texts.isZh ? '請避免連續刷新；booking advice 會優先使用快取並在冷卻後再試一次 live。' : 'Avoid repeated refreshes; booking advice prefers cache and retries live after cooldown.')}">${escapeHtml(texts.isZh ? '提示：避免頻繁刷新。若目前是 fallback 建議，系統會在 30 秒冷卻後再自動嘗試一次 live。' : 'Tip: avoid repeated refreshes. If the current advice is fallback-backed, the app will retry live once after a 30s cooldown.')}</div>`;

    banner.className = `advice-banner ${variantClass}`;
    banner.innerHTML = `
      <div class="advice-banner__header">
        <div>
          <div class="advice-banner__title">${escapeHtml(title)}</div>
          <div class="advice-banner__subtitle">${texts.currentPriceLevel}: ${escapeHtml(data.currentPriceLevel || texts.unavailable)}</div>
        </div>
        <div class="advice-banner__badge-group">
          ${providerBadges}
          <span class="${badge.className}">${escapeHtml(badge.label)}</span>
        </div>
      </div>
      <div class="advice-banner__grid">
        <div class="advice-metric">
          <div class="advice-metric__label">${escapeHtml(texts.bestBooking)}</div>
          <div class="advice-metric__val">${escapeHtml(formatWeeksBefore(data.bestBookingWeeksBefore, texts))}</div>
        </div>
        <div class="advice-metric">
          <div class="advice-metric__label">${escapeHtml(texts.targetPriceLabel)}</div>
          <div class="advice-metric__val">${escapeHtml(formatCurrency(data.targetPriceTwd))}</div>
        </div>
        <div class="advice-metric">
          <div class="advice-metric__label">${escapeHtml(texts.deviation)}</div>
          <div class="advice-metric__val">${escapeHtml(formatPercent(deviation))}</div>
        </div>
      </div>
      <div class="advice-banner__section">
        <strong>${texts.riskNotes}:</strong>
        ${riskNotes}
      </div>
      <div class="advice-banner__sources">
        <strong>${texts.sources}:</strong> ${sourcesHtml}
      </div>
      ${retryLine}
      ${fallbackNotice}
      ${quotaNote}
    `;
  }

  function buildProviderBadges(meta) {
    if (!meta) {
      return '';
    }

    const badges = [];
    badges.push(`<span class="badge badge--provider">${escapeHtml(renderProviderLabel(meta.provider))}</span>`);
    if (meta.fallbackUsed) {
      badges.push(`<span class="badge badge--provider-warn">${escapeHtml(getTextBundle().isZh ? '備援' : 'Fallback')}</span>`);
    }
    if (meta.cached) {
      badges.push(`<span class="badge badge--provider">${escapeHtml(getTextBundle().isZh ? '快取' : 'Cached')}</span>`);
    }
    if (meta.stale) {
      badges.push(`<span class="badge badge--provider-stale">${escapeHtml(getTextBundle().isZh ? '舊快照' : 'Stale')}</span>`);
    }
    return badges.join('');
  }

  function renderProviderLabel(provider) {
    const value = String(provider || '').toLowerCase();
    if (value.includes('serpapi')) return 'SerpApi';
    if (value.includes('fli')) return 'fli';
    if (value.includes('gemini')) return 'Gemini';
    if (value.includes('sample')) return getTextBundle().isZh ? '樣本' : 'Sample';
    return provider || 'unknown';
  }

  function renderGeneratedAt(value) {
    const texts = getTextBundle();
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return texts.isZh ? '更新時間未知' : 'Updated time unavailable';
    }

    return `${texts.isZh ? '更新時間' : 'Updated'}: ${date.toLocaleString(texts.isZh ? 'zh-TW' : undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }

  function ensureMetaElement(canvas, className) {
    const panel = canvas?.parentElement;
    if (!panel) return null;
    panel.style.height = '380px';
    panel.style.minHeight = '380px';
    panel.style.overflow = 'hidden';
    canvas.style.height = '100%';
    canvas.style.maxHeight = '100%';
    let meta = panel.querySelector(`.${className}`);
    if (!meta) {
      meta = document.createElement('div');
      meta.className = `${className} chart-meta`;
      panel.insertBefore(meta, canvas);
    }
    return meta;
  }

  function setChartMeta(canvas, className, badgeConfidence, detailText, providerMeta) {
    const meta = ensureMetaElement(canvas, className);
    if (!meta) return;
    const badge = getConfidenceBadge(badgeConfidence);
    const providerBadges = buildProviderBadges(providerMeta);
    const generatedText = providerMeta?.generatedAt ? renderGeneratedAt(providerMeta.generatedAt) : '';
    meta.innerHTML = `
      <div class="chart-meta__primary">
        <span class="chart-meta__detail">${escapeHtml(detailText)}</span>
        ${generatedText ? `<span class="chart-meta__detail">${escapeHtml(generatedText)}</span>` : ''}
      </div>
      <div class="chart-meta__badges">
        ${providerBadges}
        <span class="${badge.className}">${escapeHtml(badge.label)}</span>
      </div>
    `;
  }

  function buildMonthlySeries(series) {
    const values = Array(12).fill(null);
    safeArray(series).forEach((item) => {
      const monthIndex = Number(item.month) - 1;
      const value = Number(item.avgPrice);
      if (monthIndex >= 0 && monthIndex < 12 && Number.isFinite(value)) {
        values[monthIndex] = value;
      }
    });
    return values;
  }

  function average(values) {
    const filtered = values.filter((value) => Number.isFinite(value));
    if (!filtered.length) return null;
    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  }

  function getCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function destroyChart(chart) {
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
  }

  function calculateScaleBounds(values, percentage = 0.2) {
    const valid = values.filter((v) => Number.isFinite(v));
    if (!valid.length) return { min: undefined, max: undefined };
    const minVal = Math.min(...valid);
    const maxVal = Math.max(...valid);
    const range = maxVal - minVal;
    const padding = range * percentage || minVal * 0.1 || 1000;
    const minScale = Math.max(0, Math.floor((minVal - padding) / 100) * 100);
    const yMaxBase = maxVal + padding;
    const maxScale = Math.ceil(yMaxBase / 100) * 100;
    return { min: minScale, max: maxScale };
  }

  function renderYoyChart(data, isOk) {
    const canvas = document.getElementById('chart-yoy');
    if (!canvas || typeof Chart === 'undefined') return;

    const texts = getTextBundle();
    const currentYearData = buildMonthlySeries(data.currentYear);
    const priorYearData = buildMonthlySeries(data.priorYear);
    const currentAverage = average(currentYearData);
    const priorAverage = average(priorYearData);
    const combinedAverage = average([...currentYearData, ...priorYearData]);
    const labels = texts.isZh ? MONTH_LABELS_ZH : MONTH_LABELS_EN;
    const hasData = currentYearData.some(Number.isFinite) || priorYearData.some(Number.isFinite);

    const yoyBounds = calculateScaleBounds([...currentYearData, ...priorYearData].filter(Number.isFinite), 0.2);

    setChartMeta(canvas, 'price-history-yoy-meta', data.data_confidence || 'medium', hasData
      ? `${texts.currentYear}: ${formatCurrency(currentAverage)} · ${texts.priorYear}: ${formatCurrency(priorAverage)}`
      : `${texts.noYoyData}${isOk ? '' : ` · ${texts.fallback}`}`, data.meta);

    destroyChart(yoyChartInstance);

    yoyChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: texts.currentYear,
            data: currentYearData,
            borderColor: getCssVar('--color-primary-mid', '#2E6DB4'),
            backgroundColor: getCssVar('--color-primary-mid', '#2E6DB4'),
            spanGaps: true,
            tension: 0.28,
          },
          {
            label: texts.priorYear,
            data: priorYearData,
            borderColor: '#94A3B8',
            backgroundColor: '#94A3B8',
            spanGaps: true,
            tension: 0.28,
            borderDash: [6, 4],
          },
          {
            label: texts.overallAvg,
            data: Array(12).fill(combinedAverage),
            borderColor: '#64748B',
            backgroundColor: '#64748B',
            borderDash: [2, 2],
            borderWidth: 1,
            pointRadius: 0,
            spanGaps: true,
          },
        ],
      },
      options: {
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 400 },
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          title: { display: false },
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 35,
              boxHeight: 2,
              color: getCssVar('--color-text-secondary', '#64748B'),
            }
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.raw;
                if (!Number.isFinite(value)) return `${context.dataset.label}: —`;
                if (context.datasetIndex === 0) {
                  const prior = priorYearData[context.dataIndex];
                  const yoy = Number.isFinite(prior) && prior !== 0 ? ((value - prior) / prior) * 100 : null;
                  return `${context.dataset.label}: ${formatCurrency(value)}${Number.isFinite(yoy) ? ` (${texts.yoyLabel}: ${formatPercent(yoy)})` : ''}`;
                }
                return `${context.dataset.label}: ${formatCurrency(value)}`;
              },
            },
          },
        },
        scales: {
          y: {
            title: { display: true, text: texts.priceAxis },
            min: yoyBounds.min,
            max: yoyBounds.max,
          },
        },
      },
      plugins: [{
        id: 'highlightSelectedMonth',
        beforeDraw(chart) {
          if (!Number.isFinite(state.month) || state.month < 1 || state.month > 12) return;
          const xAxis = chart.scales.x;
          const yAxis = chart.scales.y;
          const index = state.month - 1;
          const center = xAxis.getPixelForTick(index);
          const prev = index > 0 ? xAxis.getPixelForTick(index - 1) : center - ((xAxis.getPixelForTick(1) - center) || 20);
          const next = index < labels.length - 1 ? xAxis.getPixelForTick(index + 1) : center + ((center - xAxis.getPixelForTick(index - 1)) || 20);
          const left = (prev + center) / 2;
          const right = (center + next) / 2;
          const ctx = chart.ctx;
          ctx.save();
          ctx.fillStyle = 'rgba(46, 109, 180, 0.08)';
          ctx.fillRect(left, yAxis.top, right - left, yAxis.bottom - yAxis.top);
          ctx.restore();
        },
      }],
    });
  }

  function weekOfYear(date) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const firstDay = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const dayDiff = Math.floor((target - firstDay) / 86400000);
    return Math.min(51, Math.max(0, Math.floor(dayDiff / 7)));
  }

  function buildWeeklySeries(trend) {
    const buckets = Array.from({ length: 52 }, () => []);
    safeArray(trend).forEach((item) => {
      if (!item?.date || !Number.isFinite(item.avgFlightPrice)) return;
      const date = new Date(item.date);
      if (Number.isNaN(date.getTime())) return;
      buckets[weekOfYear(date)].push(item.avgFlightPrice);
    });

    return buckets.map((values) => average(values));
  }

  function renderFullYearChart(trendData, adviceData, isOk) {
    const canvas = document.getElementById('chart-fullyear');
    if (!canvas || typeof Chart === 'undefined') return;

    const texts = getTextBundle();
    const weeklySeries = buildWeeklySeries(trendData.trend);
    const labels = Array.from({ length: 52 }, (_, index) => `${texts.isZh ? '第' : 'W'}${index + 1}${texts.isZh ? '週' : ''}`);
    const hasData = weeklySeries.some(Number.isFinite);
    const targetPrice = Number.isFinite(adviceData.targetPriceTwd) ? adviceData.targetPriceTwd : null;
    const averageWeekly = average(weeklySeries);

    const allFullYearVals = [...weeklySeries].filter(Number.isFinite);
    if (targetPrice !== null && Number.isFinite(targetPrice)) {
      allFullYearVals.push(targetPrice);
    }
    const fullYearBounds = calculateScaleBounds(allFullYearVals, 0.2);

    setChartMeta(canvas, 'price-history-fullyear-meta', adviceData.data_confidence || 'low', hasData
      ? `${texts.currentYear}: ${formatCurrency(averageWeekly)} · ${texts.targetPriceLabel}: ${formatCurrency(targetPrice)}`
      : `${texts.noTrendData}${isOk ? '' : ` · ${texts.fallback}`}`, trendData.meta);

    destroyChart(fullYearChartInstance);

    fullYearChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: texts.fullyearTitle,
            data: weeklySeries,
            borderColor: getCssVar('--color-accent', '#1D9E75'),
            backgroundColor: getCssVar('--color-accent', '#1D9E75'),
            tension: 0.25,
            spanGaps: true,
          },
          {
            label: texts.targetPriceLabel,
            data: Array(52).fill(targetPrice),
            borderColor: '#EF4444',
            backgroundColor: '#EF4444',
            borderDash: [6, 4],
            borderWidth: 1,
            pointRadius: 0,
            spanGaps: true,
          },
        ],
      },
      options: {
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 400 },
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 35,
              boxHeight: 2,
              color: getCssVar('--color-text-secondary', '#64748B'),
            }
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.raw;
                return `${context.dataset.label}: ${formatCurrency(value)}`;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: texts.weekAxis },
            ticks: { maxTicksLimit: 13 },
          },
          y: {
            title: { display: true, text: texts.priceAxis },
            min: fullYearBounds.min,
            max: fullYearBounds.max,
          },
        },
      },
      plugins: [{
        id: 'highlightPeakSeasons',
        beforeDraw(chart) {
          const xAxis = chart.scales.x;
          const yAxis = chart.scales.y;
          const ctx = chart.ctx;
          ctx.save();
          ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
          PEAK_WEEKS.forEach((range) => {
            const left = xAxis.getPixelForValue(range.start);
            const right = xAxis.getPixelForValue(range.end);
            ctx.fillRect(left, yAxis.top, right - left, yAxis.bottom - yAxis.top);
          });
          ctx.restore();
        },
      }],
    });
  }

  function initialize() {
    ensureControls();
    const app = getApp();
    if (app && typeof app.currentDestination === 'string' && app.currentDestination.trim()) {
      state.destination = normalizeIata(app.currentDestination, state.destination);
    }
    syncControlsFromState();
    applyControlLabels();
  }

  window.TravelIntel.priceHistory = {
    refresh(destination) {
      initialize();
      if (destination) {
        state.destination = normalizeIata(destination, state.destination);
      } else {
        const app = getApp();
        if (app && typeof app.currentDestination === 'string' && app.currentDestination.trim()) {
          state.destination = normalizeIata(app.currentDestination, state.destination);
        }
      }
      syncControlsFromState();
      fetchData();
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    initialize();
  });

  document.addEventListener('themechange', () => {
    if (lastRenderedPayload) {
      renderAdviceBanner(lastRenderedPayload.adviceData, {
        priceHistoryOk: lastRenderedPayload.priceHistoryOk,
        trendOk: lastRenderedPayload.trendOk,
        adviceOk: lastRenderedPayload.adviceOk,
        combinedSources: lastRenderedPayload.combinedSources,
        providerMeta: lastRenderedPayload.providerMeta,
      });
      renderYoyChart(lastRenderedPayload.priceHistoryData, lastRenderedPayload.priceHistoryOk);
      renderFullYearChart(lastRenderedPayload.trendData, lastRenderedPayload.adviceData, lastRenderedPayload.trendOk);
      return;
    }
    fetchData();
  });

  document.addEventListener('langchange', redrawLanguage);
})();
