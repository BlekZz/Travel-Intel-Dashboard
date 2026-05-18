// public/js/app.js

(function() {
  const THEME_KEY = 'travelintel_theme';
  const LANG_KEY = 'travelintel_lang';
  const DEFAULT_DESTINATION = 'NRT';

  const tabs = [
    { id: 'dashboard', navId: 'nav-dashboard', panelId: 'tab-dashboard' },
    { id: 'flights', navId: 'nav-flights', panelId: 'tab-flights' },
    { id: 'price-history', navId: 'nav-price-history', panelId: 'tab-price-history' }
  ];

  let currentDestinationState = DEFAULT_DESTINATION;
  let activeTabId = 'dashboard';
  let booted = false;
  const subscribers = new Set();

  window.TravelIntel = window.TravelIntel || {};

  function getTheme() {
    return localStorage.getItem(THEME_KEY) ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('theme-dark', normalizedTheme === 'dark');
    document.documentElement.classList.toggle('theme-light', normalizedTheme === 'light');
    document.body.classList.toggle('theme-dark', normalizedTheme === 'dark');
    document.body.classList.toggle('theme-light', normalizedTheme === 'light');
  }

  function toggleTheme() {
    const nextTheme = getTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, nextTheme);
    applyTheme(nextTheme);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: nextTheme } }));
  }

  function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove();
        }
      }, 300);
    }, 3000);
  }

  function normalizeDestination(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toUpperCase();
  }

  function readTrackingDestination() {
    try {
      const raw = localStorage.getItem('travelintel_tracking');
      if (!raw) return '';

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return '';

      return normalizeDestination(parsed[0].destination);
    } catch (_) {
      return '';
    }
  }

  function readDashboardDestination() {
    const dashboard = window.TravelIntel.dashboard;
    if (!dashboard || typeof dashboard.getActiveDestination !== 'function') {
      return '';
    }

    try {
      return normalizeDestination(dashboard.getActiveDestination());
    } catch (_) {
      return '';
    }
  }

  function resolveInitialDestination() {
    return readDashboardDestination() || readTrackingDestination() || DEFAULT_DESTINATION;
  }

  function notifyDestinationSubscribers(nextDestination) {
    subscribers.forEach((callback) => {
      try {
        callback(nextDestination);
      } catch (error) {
        console.error('TravelIntel.app subscriber error:', error);
      }
    });
  }

  function setCurrentDestination(nextValue, options = {}) {
    const normalized = normalizeDestination(nextValue);
    if (!normalized) return currentDestinationState;

    const { silent = false, force = false } = options;
    const changed = normalized !== currentDestinationState;

    if (!changed && !force) {
      return currentDestinationState;
    }

    currentDestinationState = normalized;

    if (!silent && (changed || force)) {
      notifyDestinationSubscribers(currentDestinationState);
    }

    return currentDestinationState;
  }

  function ensureModuleStubs() {
    window.TravelIntel.dashboard = window.TravelIntel.dashboard || {};
    window.TravelIntel.flightSearch = window.TravelIntel.flightSearch || {};
    window.TravelIntel.priceHistory = window.TravelIntel.priceHistory || {};
    window.TravelIntel.charts = window.TravelIntel.charts || {};

    if (typeof window.TravelIntel.dashboard.refresh !== 'function') {
      window.TravelIntel.dashboard.refresh = function() {};
    }
    if (typeof window.TravelIntel.dashboard.getActiveDestination !== 'function') {
      window.TravelIntel.dashboard.getActiveDestination = function() {
        return currentDestinationState;
      };
    }
    if (typeof window.TravelIntel.flightSearch.refresh !== 'function') {
      window.TravelIntel.flightSearch.refresh = function() {};
    }
    if (typeof window.TravelIntel.priceHistory.refresh !== 'function') {
      window.TravelIntel.priceHistory.refresh = function() {};
    }
    if (typeof window.TravelIntel.charts.refreshCharts !== 'function') {
      window.TravelIntel.charts.refreshCharts = function() {};
    }
    if (typeof window.TravelIntel.charts.redrawCharts !== 'function') {
      window.TravelIntel.charts.redrawCharts = function() {};
    }
  }

  function callModuleRefresh(moduleName, methodName, destination) {
    const module = window.TravelIntel[moduleName];
    if (!module || typeof module[methodName] !== 'function') {
      return;
    }

    try {
      module[methodName](destination);
    } catch (error) {
      console.error(`TravelIntel.${moduleName}.${methodName} failed:`, error);
    }
  }

  function syncDestinationFromDashboard() {
    const dashboardDestination = readDashboardDestination();
    if (dashboardDestination) {
      setCurrentDestination(dashboardDestination, { silent: true });
    }
  }

  function refreshTabModules(tabId) {
    const destination = currentDestinationState;

    if (tabId === 'dashboard') {
      syncDestinationFromDashboard();
      callModuleRefresh('dashboard', 'refresh', currentDestinationState);
      callModuleRefresh('charts', 'refreshCharts', currentDestinationState);
      return;
    }

    if (tabId === 'flights') {
      callModuleRefresh('flightSearch', 'refresh', destination);
      return;
    }

    if (tabId === 'price-history') {
      callModuleRefresh('priceHistory', 'refresh', destination);
    }
  }

  function renderTabState(targetTabId) {
    tabs.forEach((tab) => {
      const navEl = document.getElementById(tab.navId);
      const panelEl = document.getElementById(tab.panelId);
      if (!navEl || !panelEl) return;

      const isActive = tab.id === targetTabId;
      navEl.setAttribute('aria-selected', String(isActive));
      navEl.classList.toggle('active', isActive);

      if (isActive) {
        panelEl.removeAttribute('hidden');
      } else {
        panelEl.setAttribute('hidden', '');
      }
    });
  }

  function switchTab(targetTabId, options = {}) {
    const nextTab = tabs.find((tab) => tab.id === targetTabId);
    if (!nextTab) return;

    const { refresh = true, force = false } = options;
    const shouldRefresh = refresh && (force || activeTabId !== nextTab.id || !booted);

    activeTabId = nextTab.id;
    renderTabState(activeTabId);

    if (shouldRefresh) {
      refreshTabModules(activeTabId);
    }
  }

  const langDict = {
    en: {
      'nav-dashboard': 'Dashboard',
      'nav-flights': 'Flights',
      'nav-price-history': 'Price History',
      'lang-toggle': '繁體中文',
      'i18n-add_tracking': '+ Add Tracking',
      'i18n-compare': 'Compare Selected',
      'i18n-search': 'Search',
      'i18n-heatmap': 'Price Heatmap',
      'i18n-outbound': 'Outbound',
      'i18n-return': 'Return',
      'i18n-fun-dim': 'Fun Score Dimensions',
      'i18n-direct_only': 'Direct Only',
      'i18n-budget_only': 'Budget Only',
      'i18n-with_baggage': 'With Baggage',
      'i18n-sel': 'Sel',
      'i18n-airline': 'Airline ↕',
      'i18n-time': 'Time ↕',
      'i18n-duration': 'Duration ↕',
      'i18n-price': 'Price ↕',
      'i18n-ai_last_min': 'AI Last-Min Price',
      'i18n-adults_1': '1 Adult',
      'i18n-adults_2': '2 Adults',
      'i18n-economy': 'Economy',
      'i18n-business': 'Business'
    },
    zh: {
      'nav-dashboard': '儀表板',
      'nav-flights': '航班搜尋',
      'nav-price-history': '歷史價格',
      'lang-toggle': 'English',
      'i18n-add_tracking': '+ 新增追蹤',
      'i18n-compare': '比較所選',
      'i18n-search': '搜尋',
      'i18n-heatmap': '價格熱力圖',
      'i18n-outbound': '去程',
      'i18n-return': '回程',
      'i18n-fun-dim': '好玩指數維度',
      'i18n-direct_only': '僅直飛',
      'i18n-budget_only': '僅廉航',
      'i18n-with_baggage': '含行李',
      'i18n-sel': '選擇',
      'i18n-airline': '航空公司 ↕',
      'i18n-time': '時間 ↕',
      'i18n-duration': '總時長 ↕',
      'i18n-price': '價格 ↕',
      'i18n-ai_last_min': 'AI 晚鳥預估價',
      'i18n-adults_1': '1 位成人',
      'i18n-adults_2': '2 位成人',
      'i18n-economy': '經濟艙',
      'i18n-business': '商務艙'
    }
  };

  let currentLang = localStorage.getItem(LANG_KEY) || 'en';

  function applyLang() {
    const dict = langDict[currentLang] || langDict.en;

    ['nav-dashboard', 'nav-flights', 'nav-price-history', 'lang-toggle'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && dict[id]) {
        el.textContent = dict[id];
      }
    });

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = `i18n-${el.getAttribute('data-i18n')}`;
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    document.documentElement.lang = currentLang;
  }

  function isChinese() {
    return document.documentElement.lang.startsWith('zh');
  }

  const appState = {
    get currentDestination() {
      return currentDestinationState;
    },
    set currentDestination(value) {
      setCurrentDestination(value);
    },
    get activeTab() {
      return activeTabId;
    },
    subscribe(callback) {
      if (typeof callback !== 'function') {
        return function() {};
      }

      subscribers.add(callback);
      return function unsubscribe() {
        subscribers.delete(callback);
      };
    },
    showToast,
    switchTab,
    applyLang,
    isChinese
  };

  window.TravelIntel.app = appState;

  applyTheme(getTheme());

  document.addEventListener('DOMContentLoaded', () => {
    ensureModuleStubs();

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleTheme);
    }

    tabs.forEach((tab) => {
      const navEl = document.getElementById(tab.navId);
      if (!navEl) return;

      navEl.addEventListener('click', () => {
        switchTab(tab.id);
      });
    });

    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'zh' : 'en';
        localStorage.setItem(LANG_KEY, currentLang);
        applyLang();
      });
    }

    applyLang();
    setCurrentDestination(resolveInitialDestination(), { silent: true, force: true });
    booted = true;
    switchTab(activeTabId, { refresh: true, force: true });
  });
})();
