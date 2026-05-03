// public/js/app.js

(function() {
  // --- Theming System ---
  function getTheme() {
    return localStorage.getItem('travelintel_theme') || 
           (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.remove('theme-light');
    } else {
      document.documentElement.classList.add('theme-light');
      document.documentElement.classList.remove('theme-dark');
    }
  }

  function toggleTheme() {
    const current = getTheme();
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('travelintel_theme', nextTheme);
    applyTheme(nextTheme);
    
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: nextTheme } }));
  }

  // Restore theme synchronously
  const initialTheme = getTheme();
  applyTheme(initialTheme);

  // --- Global Toast ---
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
        if (toast.parentElement) toast.remove();
      }, 300);
    }, 3000);
  }

  // --- Shared Destination State ---
  let _currentDestination = 'NRT';
  const subscribers = [];

  const appState = {
    get currentDestination() {
      // Dashboard has priority if it's the active tracker
      if (window.TravelIntel && window.TravelIntel.dashboard && typeof window.TravelIntel.dashboard.getActiveDestination === 'function') {
         const dashboardDest = window.TravelIntel.dashboard.getActiveDestination();
         if (dashboardDest) _currentDestination = dashboardDest;
      }
      return _currentDestination;
    },
    set currentDestination(val) {
      if (_currentDestination !== val) {
        _currentDestination = val;
        subscribers.forEach(cb => cb(val));
      }
    },
    subscribe(callback) {
      subscribers.push(callback);
    },
    showToast
  };

  // Expose Contract
  window.TravelIntel = window.TravelIntel || {};
  window.TravelIntel.app = appState;

  // Make sure stubs exist for unmounted agents
  window.TravelIntel.flightSearch = window.TravelIntel.flightSearch || { refresh: () => {} };
  window.TravelIntel.priceHistory = window.TravelIntel.priceHistory || { refresh: () => {} };
  window.TravelIntel.charts = window.TravelIntel.charts || { refreshCharts: () => {}, redrawCharts: () => {} };

  // --- Tab Routing ---
  const tabs = [
    { id: 'dashboard', navId: 'nav-dashboard', panelId: 'tab-dashboard', agentKey: 'dashboard' },
    { id: 'flights', navId: 'nav-flights', panelId: 'tab-flights', agentKey: 'flightSearch' },
    { id: 'price-history', navId: 'nav-price-history', panelId: 'tab-price-history', agentKey: 'priceHistory' }
  ];

  function switchTab(targetId) {
    tabs.forEach(tab => {
      const navEl = document.getElementById(tab.navId);
      const panelEl = document.getElementById(tab.panelId);
      
      if (!navEl || !panelEl) return;

      if (tab.id === targetId) {
        panelEl.removeAttribute('hidden');
        navEl.setAttribute('aria-selected', 'true');
        navEl.classList.add('active'); // optional styling
        
        // Trigger agent refresh
        const agent = window.TravelIntel[tab.agentKey];
        if (agent && typeof agent.refresh === 'function') {
          // Sync destination when switching
          agent.refresh(appState.currentDestination);
        }
        
        // Specific charts refresh for dashboard
        if (targetId === 'dashboard' && window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function') {
           window.TravelIntel.charts.refreshCharts(appState.currentDestination);
        }

      } else {
        panelEl.setAttribute('hidden', '');
        navEl.setAttribute('aria-selected', 'false');
        navEl.classList.remove('active');
      }
    });
  }

  // --- Boot Sequence ---
  document.addEventListener('DOMContentLoaded', () => {
    // Attach theme toggle
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleTheme);
    }

    // Attach nav clicks
    tabs.forEach(tab => {
      const navEl = document.getElementById(tab.navId);
      if (navEl) {
        navEl.addEventListener('click', () => switchTab(tab.id));
      }
    });

    // Subscriptions: whenever destination changes across app, sync active tab if necessary
    appState.subscribe((newDest) => {
        // If needed, globally broadcast or refresh things
    });

    // Language Toggle
    let currentLang = localStorage.getItem('travelintel_lang') || 'en';
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
    function applyLang() {
      const dict = langDict[currentLang];
      
      // Update IDs directly
      ['nav-dashboard', 'nav-flights', 'nav-price-history', 'lang-toggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el && dict[id]) el.textContent = dict[id];
      });
      
      // Update data-i18n elements
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = 'i18n-' + el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
      });

      document.documentElement.lang = currentLang;
      // Re-render things that depend on lang dynamically
      if (window.TravelIntel.dashboard && typeof window.TravelIntel.dashboard.refresh === 'function') {
        window.TravelIntel.dashboard.refresh();
      }
      if (window.TravelIntel.charts && typeof window.TravelIntel.charts.refreshCharts === 'function') {
        // Redraw heatmap for language
        window.TravelIntel.charts.refreshCharts();
      }
    }
    window.TravelIntel.app.applyLang = applyLang;

    function isChinese() {
      return document.documentElement.lang.startsWith('zh');
    }
    window.TravelIntel.app.isChinese = isChinese;

    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'zh' : 'en';
        localStorage.setItem('travelintel_lang', currentLang);
        applyLang();
      });
      applyLang();
    }

    // Boot to default tab
    switchTab('dashboard');
  });

})();
