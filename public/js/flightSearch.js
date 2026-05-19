(function () {
  const DEFAULT_QUERY = {
    origin: 'TPE',
    destination: 'NRT',
    departureDate: '2025-08-01',
    adults: '1',
    cabin: 'economy',
    maxStops: ''
  };

  const state = {
    initialized: false,
    flights: [],
    currentQuery: { ...DEFAULT_QUERY },
    sortKey: 'price',
    sortDirection: 'asc',
    filters: {
      direct: false,
      budget: false,
      baggage: false
    },
    selectedIds: [],
    expandedIds: new Set(),
    requestStatus: 'idle',
    requestError: null,
    lastAppliedDestination: ''
  };

  function getApp() {
    return window.TravelIntel && window.TravelIntel.app ? window.TravelIntel.app : null;
  }

  function isChinese() {
    const app = getApp();
    if (app && typeof app.isChinese === 'function') {
      return app.isChinese();
    }
    return (document.documentElement.lang || '').toLowerCase().startsWith('zh');
  }

  function t(en, zh) {
    return isChinese() ? zh : en;
  }

  function toast(message, type) {
    const app = getApp();
    if (app && typeof app.showToast === 'function') {
      app.showToast(message, type);
    }
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
    const normalized = String(value || fallback || '').trim().toUpperCase();
    return normalized || fallback;
  }

  function getDefaultDate() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  }

  function getElements() {
    return {
      tab: document.getElementById('tab-flights'),
      results: document.getElementById('flight-results'),
      compareBtn: document.getElementById('compare-btn'),
      form: document.getElementById('fs-form'),
      origin: document.getElementById('fs-origin'),
      destination: document.getElementById('fs-dest'),
      departureDate: document.getElementById('fs-date'),
      adults: document.getElementById('fs-adults'),
      cabin: document.getElementById('fs-cabin'),
      maxStops: document.getElementById('fs-max-stops'),
      summary: document.getElementById('fs-summary'),
      modal: document.getElementById('compare-modal-wrapper'),
      modalBody: document.getElementById('compare-body'),
      modalClose: document.getElementById('compare-close')
    };
  }

  function buildUi() {
    const tab = document.getElementById('tab-flights');
    const results = document.getElementById('flight-results');
    const compareBtn = document.getElementById('compare-btn');

    if (!tab || !results || !compareBtn) {
      return false;
    }

    if (!document.getElementById('fs-form')) {
      const formMarkup = `
        <div id="fs-shell" style="display:grid; gap:var(--spacing-md); margin-bottom:var(--spacing-md);">
          <form id="fs-form" class="trip-search-bar" novalidate>
            <input type="text" id="fs-origin" placeholder="${escapeHtml(t('Origin (e.g. TPE)', '出發地 (例：TPE)'))}" maxlength="3" value="${escapeHtml(DEFAULT_QUERY.origin)}" required>
            <div class="search-divider"></div>
            <input type="text" id="fs-dest" placeholder="${escapeHtml(t('Destination (e.g. NRT)', '目的地 (例：NRT)'))}" maxlength="3" value="${escapeHtml(DEFAULT_QUERY.destination)}" required>
            <div class="search-divider"></div>
            <input type="date" id="fs-date" value="${escapeHtml(getDefaultDate())}" required>
            <div class="search-divider"></div>
            <select id="fs-adults">
              <option value="1">${escapeHtml(t('1 Adult', '1 位成人'))}</option>
              <option value="2">${escapeHtml(t('2 Adults', '2 位成人'))}</option>
              <option value="3">${escapeHtml(t('3 Adults', '3 位成人'))}</option>
            </select>
            <div class="search-divider"></div>
            <select id="fs-cabin">
              <option value="economy">${escapeHtml(t('Economy', '經濟艙'))}</option>
              <option value="premium_economy">${escapeHtml(t('Premium Economy', '豪華經濟艙'))}</option>
              <option value="business">${escapeHtml(t('Business', '商務艙'))}</option>
            </select>
            <div class="search-divider"></div>
            <select id="fs-max-stops">
              <option value="">${escapeHtml(t('Any Stops', '不限轉機'))}</option>
              <option value="0">${escapeHtml(t('Direct Only', '僅直飛'))}</option>
              <option value="1">${escapeHtml(t('Up to 1 Stop', '最多 1 次轉機'))}</option>
              <option value="2">${escapeHtml(t('Up to 2 Stops', '最多 2 次轉機'))}</option>
            </select>
            <button type="submit" class="btn btn--primary">${escapeHtml(t('Search Flights', '搜尋航班'))}</button>
          </form>

          <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm); align-items:center; justify-content:space-between;">
            <div style="display:flex; flex-wrap:wrap; gap:var(--spacing-sm);">
              <button type="button" class="badge" id="flt-direct" data-filter-chip="direct" aria-pressed="false">${escapeHtml(t('Direct', '直飛'))}</button>
              <button type="button" class="badge" id="flt-budget" data-filter-chip="budget" aria-pressed="false">${escapeHtml(t('Budget', '廉航'))}</button>
              <button type="button" class="badge" id="flt-baggage" data-filter-chip="baggage" aria-pressed="false">${escapeHtml(t('With Baggage', '含行李'))}</button>
            </div>
            <div id="fs-summary" style="font-size:0.875rem; color:var(--color-text-secondary);"></div>
          </div>

          <div id="fs-sortbar" style="display:grid; grid-template-columns:72px minmax(170px,1.3fr) minmax(160px,1fr) minmax(140px,0.9fr) minmax(120px,0.8fr) minmax(140px,0.9fr); gap:var(--spacing-sm); align-items:center; padding:var(--spacing-sm) var(--spacing-md); border-radius:var(--radius-card); background:var(--color-surface); color:var(--color-text-secondary); font-size:0.875rem; font-weight:600;">
            <div>${escapeHtml(t('Compare', '比較'))}</div>
            <button type="button" data-fs-sort="airline" style="all:unset; cursor:pointer;">${escapeHtml(t('Airline', '航空公司'))}</button>
            <button type="button" data-fs-sort="departureTime" style="all:unset; cursor:pointer;">${escapeHtml(t('Time', '時間'))}</button>
            <button type="button" data-fs-sort="durationMinutes" style="all:unset; cursor:pointer;">${escapeHtml(t('Duration', '時長'))}</button>
            <button type="button" data-fs-sort="price" style="all:unset; cursor:pointer;">${escapeHtml(t('Price', '價格'))}</button>
            <div>${escapeHtml(t('AI Last-Min', 'AI 晚鳥估價'))}</div>
          </div>
        </div>
      `;

      results.insertAdjacentHTML('beforebegin', formMarkup);
    }

    if (!document.getElementById('compare-modal-wrapper')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `
          <div id="compare-modal-wrapper" class="compare-modal" hidden>
            <div class="compare-modal__overlay"></div>
            <div class="compare-modal__content" style="position:relative; max-width:min(1100px, calc(100vw - 32px)); max-height:calc(100vh - 64px); overflow:auto; display:grid; gap:var(--spacing-md);">
              <button type="button" id="compare-close" class="btn" style="position:absolute; top:12px; right:12px;">${escapeHtml(t('Close', '關閉'))}</button>
              <div style="padding-right:80px;">
                <h3 style="margin:0 0 var(--spacing-sm);">${escapeHtml(t('Flight Comparison', '航班比較'))}</h3>
                <p style="margin:0; color:var(--color-text-secondary); font-size:0.875rem;">${escapeHtml(t('Compare up to 3 selected flights.', '最多比較 3 筆已選航班。'))}</p>
              </div>
              <div id="compare-body" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:var(--spacing-md);"></div>
            </div>
          </div>
        `
      );
    }

    compareBtn.textContent = t('Compare Selected', '比較所選');
    compareBtn.disabled = true;
    return true;
  }

  function setSelectOptionText(selectId, labels) {
    const select = document.getElementById(selectId);
    if (!select) return;

    Array.from(select.options).forEach(function(option) {
      if (Object.prototype.hasOwnProperty.call(labels, option.value)) {
        option.textContent = labels[option.value];
      }
    });
  }

  function applyStaticLanguage() {
    const origin = document.getElementById('fs-origin');
    const destination = document.getElementById('fs-dest');
    const submit = document.querySelector('#fs-form button[type="submit"]');
    const modalClose = document.getElementById('compare-close');
    const modalTitle = document.querySelector('#compare-modal-wrapper h3');
    const modalSubtitle = document.querySelector('#compare-modal-wrapper p');
    const sortbar = document.getElementById('fs-sortbar');

    if (origin) origin.placeholder = t('Origin (e.g. TPE)', '出發地 (例：TPE)');
    if (destination) destination.placeholder = t('Destination (e.g. NRT)', '目的地 (例：NRT)');
    if (submit) submit.textContent = t('Search Flights', '搜尋航班');
    if (modalClose) modalClose.textContent = t('Close', '關閉');
    if (modalTitle) modalTitle.textContent = t('Flight Comparison', '航班比較');
    if (modalSubtitle) modalSubtitle.textContent = t('Compare up to 3 selected flights.', '最多比較 3 筆已選航班。');

    setSelectOptionText('fs-adults', {
      1: t('1 Adult', '1 位成人'),
      2: t('2 Adults', '2 位成人'),
      3: t('3 Adults', '3 位成人')
    });
    setSelectOptionText('fs-cabin', {
      economy: t('Economy', '經濟艙'),
      premium_economy: t('Premium Economy', '豪華經濟艙'),
      business: t('Business', '商務艙')
    });
    setSelectOptionText('fs-max-stops', {
      '': t('Any Stops', '不限轉機'),
      0: t('Direct Only', '僅直飛'),
      1: t('Up to 1 Stop', '最多 1 次轉機'),
      2: t('Up to 2 Stops', '最多 2 次轉機')
    });

    const chips = {
      'flt-direct': t('Direct', '直飛'),
      'flt-budget': t('Budget', '廉航'),
      'flt-baggage': t('With Baggage', '含行李')
    };
    Object.entries(chips).forEach(function([id, label]) {
      const chip = document.getElementById(id);
      if (chip) chip.textContent = label;
    });

    if (sortbar) {
      const columns = sortbar.children;
      if (columns[0]) columns[0].textContent = t('Compare', '比較');
      if (columns[5]) columns[5].textContent = t('AI Last-Min', 'AI 晚鳥估價');
    }

    syncCompareButton();
    updateSortButtons();
    updateSummary();
  }

  function bindEvents() {
    const elements = getElements();
    if (!elements.tab || !elements.results || !elements.compareBtn || !elements.form) {
      return;
    }

    elements.form.addEventListener('submit', handleSubmit);
    elements.tab.addEventListener('click', handleTabClick);

    if (elements.modalClose) {
      elements.modalClose.addEventListener('click', closeCompareModal);
    }

    const overlay = document.querySelector('#compare-modal-wrapper .compare-modal__overlay');
    if (overlay) {
      overlay.addEventListener('click', closeCompareModal);
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeCompareModal();
      }
    });

    document.addEventListener('themechange', function () {
      renderFlights();
    });

    document.addEventListener('langchange', function () {
      applyStaticLanguage();
      renderFlights();
    });
  }

  function initialize() {
    if (state.initialized) {
      return true;
    }

    if (!buildUi()) {
      return false;
    }

    bindEvents();
    state.currentQuery.departureDate = document.getElementById('fs-date')?.value || getDefaultDate();
    state.initialized = true;
    applyStaticLanguage();
    renderFlights();
    return true;
  }

  function handleSubmit(event) {
    event.preventDefault();
    fetchFlights();
  }

  function handleTabClick(event) {
    const filterChip = event.target.closest('[data-filter-chip]');
    if (filterChip) {
      const key = filterChip.getAttribute('data-filter-chip');
      if (key && key in state.filters) {
        state.filters[key] = !state.filters[key];
        renderFlights();
      }
      return;
    }

    const sortButton = event.target.closest('[data-fs-sort]');
    if (sortButton) {
      const nextKey = sortButton.getAttribute('data-fs-sort');
      if (nextKey) {
        if (state.sortKey === nextKey) {
          state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = nextKey;
          state.sortDirection = 'asc';
        }
        renderFlights();
      }
      return;
    }

    const retryButton = event.target.closest('[data-fs-retry]');
    if (retryButton) {
      fetchFlights();
      return;
    }

    const compareToggle = event.target.closest('.compare-chk');
    if (compareToggle) {
      handleCompareToggle(compareToggle);
      return;
    }

    const compareButton = event.target.closest('#compare-btn');
    if (compareButton) {
      openCompareModal();
      return;
    }

    const row = event.target.closest('.flight-row');
    if (!row || event.target.closest('button, a, input, label')) {
      return;
    }

    const flightId = row.getAttribute('data-flight-id');
    if (!flightId) {
      return;
    }

    if (state.expandedIds.has(flightId)) {
      state.expandedIds.delete(flightId);
    } else {
      state.expandedIds.add(flightId);
    }

    renderFlights();
  }

  function handleCompareToggle(input) {
    const flightId = input.getAttribute('data-id');
    if (!flightId) {
      return;
    }

    if (input.checked) {
      if (state.selectedIds.length >= 3) {
        input.checked = false;
        toast(t('You can compare up to 3 flights.', '最多只能比較 3 筆航班。'), 'warning');
        return;
      }

      if (!state.selectedIds.includes(flightId)) {
        state.selectedIds.push(flightId);
      }
    } else {
      state.selectedIds = state.selectedIds.filter(function (id) {
        return id !== flightId;
      });
    }

    syncCompareButton();
  }

  function syncCompareButton() {
    const compareBtn = document.getElementById('compare-btn');
    if (!compareBtn) {
      return;
    }

    const count = state.selectedIds.length;
    compareBtn.disabled = count === 0;
    compareBtn.textContent = count > 0
      ? t(`Compare Selected (${count})`, `比較所選（${count}）`)
      : t('Compare Selected', '比較所選');
  }

  function readFormQuery(overrides) {
    const elements = getElements();
    const extra = overrides || {};

    return {
      origin: normalizeIata(extra.origin ?? elements.origin?.value, DEFAULT_QUERY.origin),
      destination: normalizeIata(extra.destination ?? elements.destination?.value, DEFAULT_QUERY.destination),
      departureDate: extra.departureDate ?? elements.departureDate?.value ?? state.currentQuery.departureDate ?? getDefaultDate(),
      adults: String(extra.adults ?? elements.adults?.value ?? DEFAULT_QUERY.adults),
      cabin: String(extra.cabin ?? elements.cabin?.value ?? DEFAULT_QUERY.cabin),
      maxStops: String(extra.maxStops ?? elements.maxStops?.value ?? DEFAULT_QUERY.maxStops)
    };
  }

  function buildFlightsUrl(query) {
    const params = new URLSearchParams({
      origin: query.origin,
      destination: query.destination,
      departureDate: query.departureDate,
      adults: query.adults,
      cabin: query.cabin,
      sort: 'price'
    });

    if (query.maxStops !== '') {
      params.set('maxStops', query.maxStops);
    }

    return `/api/flights?${params.toString()}`;
  }

  async function fetchFlights(overrides) {
    if (!initialize()) {
      return;
    }

    const query = readFormQuery(overrides);
    state.currentQuery = { ...query };
    state.lastAppliedDestination = query.destination;
    state.requestStatus = 'loading';
    state.requestError = null;
    state.selectedIds = [];
    state.expandedIds.clear();
    renderFlights();

    try {
      const response = await fetch(buildFlightsUrl(query));
      const payload = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        const error = new Error(payload.error || payload.message || response.statusText || 'Flight search failed');
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      state.flights = Array.isArray(payload.flights)
        ? payload.flights.map(normalizeFlightRecord)
        : [];
      state.requestStatus = 'success';
      state.requestError = null;
      renderFlights();
    } catch (error) {
      state.flights = [];
      state.requestStatus = error.status === 503 ? 'unavailable' : 'error';
      state.requestError = {
        status: error.status || 0,
        message: error.payload?.error || error.message || 'Flight search failed',
        details: error.payload?.details || error.payload?.reason || ''
      };

      if (state.requestStatus === 'error') {
        toast(t('Unable to load flights right now.', '目前無法載入航班資料。'), 'error');
      }

      renderFlights();
    }
  }

  function normalizeFlightRecord(flight) {
    const departureDate = flight.departureTime ? new Date(flight.departureTime) : null;
    const arrivalDate = flight.arrivalTime ? new Date(flight.arrivalTime) : null;

    return {
      ...flight,
      id: String(flight.id || `${flight.airlineCode || 'XX'}-${flight.flightNumber || Date.now()}`),
      airline: flight.airline || flight.airlineCode || 'Unknown',
      airlineCode: flight.airlineCode || '',
      flightNumber: flight.flightNumber || '',
      type: flight.type || 'traditional',
      departureTime: flight.departureTime || '',
      arrivalTime: flight.arrivalTime || '',
      departureTimestamp: departureDate ? departureDate.getTime() : 0,
      arrivalTimestamp: arrivalDate ? arrivalDate.getTime() : 0,
      duration: flight.duration || '',
      durationMinutes: parseDurationToMinutes(flight.duration),
      stops: Number.isFinite(Number(flight.stops)) ? Number(flight.stops) : 0,
      stopCities: Array.isArray(flight.stopCities) ? flight.stopCities : [],
      price: Number.isFinite(Number(flight.price)) ? Number(flight.price) : 0,
      currency: flight.currency || 'TWD',
      cabin: flight.cabin || state.currentQuery.cabin,
      baggage: flight.baggage || '0kg',
      seatsRemaining: Number.isFinite(Number(flight.seatsRemaining)) ? Number(flight.seatsRemaining) : null,
      aiEstimate: estimateAiPrice(flight)
    };
  }

  function estimateAiPrice(flight) {
    const basePrice = Number(flight.price) || 0;
    const typeFactor = flight.type === 'budget' ? -0.04 : flight.type === 'regional' ? 0.03 : 0.08;
    const stopFactor = (Number(flight.stops) || 0) * 0.025;
    const baggageFactor = !flight.baggage || flight.baggage === '0kg' ? -0.015 : 0.02;
    return Math.max(Math.round(basePrice * (1 + typeFactor + stopFactor + baggageFactor)), 0);
  }

  function parseDurationToMinutes(duration) {
    if (!duration) {
      return 0;
    }

    const normalized = String(duration);
    const hourMatch = normalized.match(/(\d+)h/i);
    const minuteMatch = normalized.match(/(\d+)m/i);
    const hours = hourMatch ? Number(hourMatch[1]) : 0;
    const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
    return (hours * 60) + minutes;
  }

  function getVisibleFlights() {
    const visible = state.flights.filter(function (flight) {
      if (state.filters.direct && flight.stops > 0) return false;
      if (state.filters.budget && flight.type !== 'budget') return false;
      if (state.filters.baggage && (!flight.baggage || flight.baggage === '0kg')) return false;
      return true;
    });

    visible.sort(function (left, right) {
      const a = getSortValue(left, state.sortKey);
      const b = getSortValue(right, state.sortKey);
      if (a < b) return state.sortDirection === 'asc' ? -1 : 1;
      if (a > b) return state.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return visible;
  }

  function getSortValue(flight, key) {
    switch (key) {
      case 'airline':
        return `${flight.airlineCode} ${flight.flightNumber}`.toLowerCase();
      case 'departureTime':
        return flight.departureTimestamp;
      case 'durationMinutes':
        return flight.durationMinutes;
      case 'price':
      default:
        return flight.price;
    }
  }

  function renderFlights() {
    if (!state.initialized) {
      return;
    }

    const elements = getElements();
    if (!elements.results) {
      return;
    }

    updateFilterChips();
    updateSortButtons();
    updateSummary();
    syncCompareButton();

    if (state.requestStatus === 'loading') {
      elements.results.innerHTML = Array.from({ length: 5 }, function () {
        return '<div class="skeleton skeleton--row" style="height:88px; border-radius:var(--radius-card);"></div>';
      }).join('');
      return;
    }

    if (state.requestStatus === 'unavailable') {
      elements.results.innerHTML = buildUnavailableState();
      return;
    }

    if (state.requestStatus === 'error') {
      elements.results.innerHTML = buildErrorState();
      return;
    }

    const visibleFlights = getVisibleFlights();

    if (state.requestStatus === 'success' && visibleFlights.length === 0) {
      elements.results.innerHTML = state.flights.length === 0
        ? buildNoResultsState()
        : buildFilteredEmptyState();
      return;
    }

    if (visibleFlights.length === 0) {
      elements.results.innerHTML = buildIdleState();
      return;
    }

    elements.results.innerHTML = visibleFlights.map(renderFlightRow).join('');
  }

  function updateFilterChips() {
    ['direct', 'budget', 'baggage'].forEach(function (key) {
      const button = document.getElementById(`flt-${key}`);
      if (!button) {
        return;
      }

      const active = !!state.filters[key];
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('badge--ai', active);
      button.classList.toggle('badge--ai-warn', !active);
    });
  }

  function updateSortButtons() {
    const labels = {
      airline: t('Airline', '航空公司'),
      departureTime: t('Time', '時間'),
      durationMinutes: t('Duration', '時長'),
      price: t('Price', '價格')
    };

    document.querySelectorAll('[data-fs-sort]').forEach(function (button) {
      const key = button.getAttribute('data-fs-sort');
      const active = key === state.sortKey;
      const arrow = active ? (state.sortDirection === 'asc' ? ' ↑' : ' ↓') : '';
      button.textContent = `${labels[key] || key}${arrow}`;
      button.style.color = active ? 'var(--color-primary)' : 'inherit';
    });
  }

  function updateSummary() {
    const summary = document.getElementById('fs-summary');
    if (!summary) {
      return;
    }

    if (state.requestStatus === 'loading') {
      summary.textContent = t('Searching flights…', '正在搜尋航班…');
      return;
    }

    if (state.requestStatus === 'unavailable') {
      summary.textContent = t('Live flight search unavailable', '即時航班搜尋目前不可用');
      return;
    }

    if (state.requestStatus === 'error') {
      summary.textContent = t('Search failed', '搜尋失敗');
      return;
    }

    const visibleCount = getVisibleFlights().length;
    const totalCount = state.flights.length;

    if (totalCount === 0) {
      summary.textContent = t('Set a route and search.', '設定航線後開始搜尋。');
      return;
    }

    summary.textContent = totalCount === visibleCount
      ? t(`${totalCount} flights`, `${totalCount} 筆航班`)
      : t(`${visibleCount} / ${totalCount} flights`, `${visibleCount} / ${totalCount} 筆航班`);
  }

  function buildIdleState() {
    return buildStateCard({
      title: t('Start your flight search', '開始搜尋航班'),
      body: t('Choose an origin, destination, and date to load results.', '選擇出發地、目的地與日期後即可載入結果。'),
      tone: 'neutral'
    });
  }

  function buildNoResultsState() {
    return buildStateCard({
      title: t('No flights found', '找不到航班'),
      body: t('Try a different date, cabin, or route.', '請改用其他日期、艙等或航線。'),
      tone: 'neutral',
      includeRetry: true
    });
  }

  function buildFilteredEmptyState() {
    return buildStateCard({
      title: t('No flights match the current filters', '目前篩選條件下沒有符合的航班'),
      body: t('Clear one or more filter chips to broaden the result set.', '請取消部分篩選條件以擴大結果。'),
      tone: 'neutral'
    });
  }

  function buildUnavailableState() {
    const details = state.requestError?.message === 'missing_required_env'
      ? t('Live flight search is not configured yet.', '即時航班搜尋尚未設定完成。')
      : (state.requestError?.message || '');

    return buildStateCard({
      title: t('Live flight search is unavailable', '即時航班搜尋目前不可用'),
      body: t(
        'The backend route is available, but provider credentials are missing. Retry after environment setup, or continue validating the UI flow now.',
        '後端路由存在，但供應商金鑰尚未設定。可在環境設定完成後重試，或先繼續驗證前端流程。'
      ),
      subbody: details,
      tone: 'warning',
      includeRetry: true
    });
  }

  function buildErrorState() {
    return buildStateCard({
      title: t('Flight search failed', '航班搜尋失敗'),
      body: t('The request did not complete successfully. Please retry.', '請求未成功完成，請再試一次。'),
      subbody: state.requestError?.message || '',
      tone: 'error',
      includeRetry: true
    });
  }

  function buildStateCard(options) {
    const tone = options.tone || 'neutral';
    const borderColor = tone === 'error'
      ? 'var(--color-danger)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : 'rgba(0,0,0,0.12)';

    const badge = tone === 'warning'
      ? `<span class="badge badge--ai-warn">${escapeHtml(t('Unavailable', '不可用'))}</span>`
      : tone === 'error'
        ? `<span class="badge badge--ai-low">${escapeHtml(t('Error', '錯誤'))}</span>`
        : '';

    return `
      <div style="border:1px solid ${borderColor}; border-radius:var(--radius-card); background:var(--color-surface); padding:var(--spacing-lg); display:grid; gap:var(--spacing-sm);">
        <div style="display:flex; align-items:center; gap:var(--spacing-sm); flex-wrap:wrap;">
          <h3 style="margin:0; color:var(--color-text-primary);">${escapeHtml(options.title)}</h3>
          ${badge}
        </div>
        <p style="margin:0; color:var(--color-text-secondary);">${escapeHtml(options.body)}</p>
        ${options.subbody ? `<p style="margin:0; font-size:0.875rem; color:var(--color-text-secondary);">${escapeHtml(options.subbody)}</p>` : ''}
        ${options.includeRetry ? `<div><button type="button" class="btn btn--primary" data-fs-retry>${escapeHtml(t('Retry', '重新嘗試'))}</button></div>` : ''}
      </div>
    `;
  }

  function renderFlightRow(flight) {
    const expanded = state.expandedIds.has(flight.id);
    const checked = state.selectedIds.includes(flight.id);
    const priceText = `${flight.currency === 'TWD' ? 'NT$' : `${flight.currency} `}${Number(flight.price).toLocaleString()}`;
    const aiText = `${flight.currency === 'TWD' ? 'NT$' : `${flight.currency} `}${Number(flight.aiEstimate).toLocaleString()}`;
    const stopSummary = flight.stops === 0
      ? t('Direct', '直飛')
      : t(`${flight.stops} stop${flight.stops > 1 ? 's' : ''}`, `${flight.stops} 次轉機`);
    const stopCities = flight.stopCities.length > 0 ? flight.stopCities.join(', ') : t('None', '無');
    const baggage = flight.baggage || t('Not included', '未含行李');
    const seats = Number.isFinite(flight.seatsRemaining) ? String(flight.seatsRemaining) : t('Unknown', '未知');

    return `
      <div class="flight-row ${expanded ? 'flight-row--expanded' : ''}" data-flight-id="${escapeHtml(flight.id)}" style="display:grid; gap:var(--spacing-sm); padding:var(--spacing-md); margin-bottom:var(--spacing-sm); border-radius:var(--radius-card); cursor:pointer;">
        <div style="display:grid; grid-template-columns:72px minmax(170px,1.3fr) minmax(160px,1fr) minmax(140px,0.9fr) minmax(120px,0.8fr) minmax(140px,0.9fr); gap:var(--spacing-sm); align-items:center;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" class="compare-chk" data-id="${escapeHtml(flight.id)}" ${checked ? 'checked' : ''}>
            <span style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(t('Pick', '選取'))}</span>
          </label>
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong>${escapeHtml(flight.airline)}</strong>
              <span class="badge ${flight.type === 'budget' ? 'badge--ai-warn' : 'badge--ai'}">${escapeHtml(renderFlightType(flight.type))}</span>
            </div>
            <div style="font-size:0.875rem; color:var(--color-text-secondary); margin-top:4px;">${escapeHtml(`${flight.airlineCode} ${flight.flightNumber}`.trim())}</div>
          </div>
          <div>
            <div><strong>${escapeHtml(formatTime(flight.departureTime))}</strong> → <strong>${escapeHtml(formatTime(flight.arrivalTime))}</strong></div>
            <div style="font-size:0.875rem; color:var(--color-text-secondary); margin-top:4px;">${escapeHtml(stopSummary)}</div>
          </div>
          <div>
            <strong>${escapeHtml(flight.duration || '--')}</strong>
            <div style="font-size:0.875rem; color:var(--color-text-secondary); margin-top:4px;">${escapeHtml(stopCities)}</div>
          </div>
          <div>
            <strong style="color:var(--color-accent);">${escapeHtml(priceText)}</strong>
            <div style="font-size:0.875rem; color:var(--color-text-secondary); margin-top:4px;">${escapeHtml(baggage)}</div>
          </div>
          <div title="${escapeHtml(t('AI estimate, reference only.', 'AI 估算，僅供參考。'))}">
            <strong>${escapeHtml(aiText)}</strong>
            <div style="display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap;">
              <span class="badge badge--ai-warn">⚠ AI</span>
              <span style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(t('Reference only', '僅供參考'))}</span>
            </div>
          </div>
        </div>
        <div class="flight-row__detail" ${expanded ? '' : 'hidden'} style="display:${expanded ? 'grid' : 'none'}; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:var(--spacing-md); border-top:1px dashed rgba(0,0,0,0.12); padding-top:var(--spacing-md);">
          <div>
            <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(t('Cabin', '艙等'))}</div>
            <div style="margin-top:4px; font-weight:600;">${escapeHtml(renderCabin(flight.cabin))}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(t('Stops / Layovers', '轉機 / 經停'))}</div>
            <div style="margin-top:4px; font-weight:600;">${escapeHtml(stopCities)}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(t('Seats Remaining', '剩餘機位'))}</div>
            <div style="margin-top:4px; font-weight:600;">${escapeHtml(seats)}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(t('Baggage Policy', '行李政策'))}</div>
            <div style="margin-top:4px; font-weight:600;">${escapeHtml(baggage)}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(t('Aircraft / Equipment', '機型 / 設備'))}</div>
            <div style="margin-top:4px; font-weight:600;">${escapeHtml(renderAircraftLabel(flight))}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(t('Wait Time', '候機時間'))}</div>
            <div style="margin-top:4px; font-weight:600;">${escapeHtml(renderLayoverDuration(flight))}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderFlightType(type) {
    if (type === 'budget') return t('Budget', '廉航');
    if (type === 'regional') return t('Regional', '區域航空');
    return t('Traditional', '傳統航空');
  }

  function renderCabin(cabin) {
    if (cabin === 'business') return t('Business', '商務艙');
    if (cabin === 'premium_economy') return t('Premium Economy', '豪華經濟艙');
    return t('Economy', '經濟艙');
  }

  function renderAircraftLabel(flight) {
    const map = {
      traditional: t('Wide-body jet', '廣體客機'),
      budget: t('Narrow-body jet', '窄體客機'),
      regional: t('Regional jet', '區域噴射機')
    };
    return map[flight.type] || t('Commercial aircraft', '商用客機');
  }

  function renderLayoverDuration(flight) {
    if ((flight.stops || 0) <= 0) {
      return t('Non-stop', '無需候機');
    }

    const estimateMinutes = 55 + ((flight.stops || 0) * 35);
    const hours = Math.floor(estimateMinutes / 60);
    const minutes = estimateMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  function formatTime(value) {
    if (!value) {
      return '--:--';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '--:--';
    }

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function openCompareModal() {
    const modal = document.getElementById('compare-modal-wrapper');
    const body = document.getElementById('compare-body');
    if (!modal || !body) {
      return;
    }

    const selectedFlights = state.selectedIds
      .map(function (id) {
        return state.flights.find(function (flight) {
          return flight.id === id;
        });
      })
      .filter(Boolean);

    if (selectedFlights.length === 0) {
      toast(t('Select at least one flight to compare.', '請至少選擇 1 筆航班再比較。'), 'warning');
      return;
    }

    body.innerHTML = selectedFlights.map(function (flight) {
      return `
        <section style="border:1px solid rgba(0,0,0,0.12); border-radius:var(--radius-card); padding:var(--spacing-md); display:grid; gap:var(--spacing-sm); background:var(--color-surface);">
          <div>
            <h4 style="margin:0;">${escapeHtml(flight.airline)}</h4>
            <p style="margin:4px 0 0; color:var(--color-text-secondary);">${escapeHtml(`${flight.airlineCode} ${flight.flightNumber}`.trim())}</p>
          </div>
          <div><strong>${escapeHtml(t('Price', '價格'))}:</strong> ${escapeHtml(`${flight.currency === 'TWD' ? 'NT$' : `${flight.currency} `}${flight.price.toLocaleString()}`)}</div>
          <div><strong>${escapeHtml(t('AI Last-Min', 'AI 晚鳥估價'))}:</strong> ${escapeHtml(`${flight.currency === 'TWD' ? 'NT$' : `${flight.currency} `}${flight.aiEstimate.toLocaleString()}`)}</div>
          <div><strong>${escapeHtml(t('Time', '時間'))}:</strong> ${escapeHtml(`${formatTime(flight.departureTime)} → ${formatTime(flight.arrivalTime)}`)}</div>
          <div><strong>${escapeHtml(t('Duration', '時長'))}:</strong> ${escapeHtml(flight.duration || '--')}</div>
          <div><strong>${escapeHtml(t('Stops', '轉機'))}:</strong> ${escapeHtml(flight.stops === 0 ? t('Direct', '直飛') : t(`${flight.stops} stop(s)`, `${flight.stops} 次轉機`))}</div>
          <div><strong>${escapeHtml(t('Baggage', '行李'))}:</strong> ${escapeHtml(flight.baggage || t('Not included', '未含行李'))}</div>
          <div><strong>${escapeHtml(t('Cabin', '艙等'))}:</strong> ${escapeHtml(renderCabin(flight.cabin))}</div>
        </section>
      `;
    }).join('');

    modal.removeAttribute('hidden');
  }

  function closeCompareModal() {
    const modal = document.getElementById('compare-modal-wrapper');
    if (modal) {
      modal.setAttribute('hidden', '');
    }
  }

  function applyDestinationToForm(destination) {
    const normalized = normalizeIata(destination, '');
    if (!normalized) {
      return;
    }

    const destinationInput = document.getElementById('fs-dest');
    if (destinationInput) {
      destinationInput.value = normalized;
    }
  }

  function refresh(destination) {
    if (!initialize()) {
      return;
    }

    if (destination) {
      applyDestinationToForm(destination);
    }

    const nextDestination = normalizeIata(destination || document.getElementById('fs-dest')?.value, DEFAULT_QUERY.destination);
    const shouldFetch = state.requestStatus === 'idle'
      || state.flights.length === 0
      || state.lastAppliedDestination !== nextDestination;

    if (shouldFetch) {
      fetchFlights({ destination: nextDestination });
    } else {
      renderFlights();
    }
  }

  window.TravelIntel = window.TravelIntel || {};
  window.TravelIntel.flightSearch = {
    refresh
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
