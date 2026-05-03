(function() {
  const defaultDimensions = { shopping: 0, relaxation: 0, luxury: 0, food: 0, sightseeing: 0, value: 0, festival: 0 };
  let activeDestination = "NRT";
  let sliderTimeout = null;

  // Render Metric Cards
  function renderMetricsSkeleton() {
    document.getElementById('metric-flight-price').innerHTML = '<div class="skeleton skeleton--card"></div>';
    document.getElementById('metric-hotel-price').innerHTML = '<div class="skeleton skeleton--card"></div>';
    document.getElementById('metric-weather').innerHTML = '<div class="skeleton skeleton--card"></div>';
    document.getElementById('metric-fun-score').innerHTML = '<div class="skeleton skeleton--card"></div>';
  }

  function getDeltaClass(delta, reverse = false) {
    if (delta > 0) return reverse ? 'metric-card__delta--negative' : 'metric-card__delta--positive';
    if (delta < 0) return reverse ? 'metric-card__delta--positive' : 'metric-card__delta--negative';
    return '';
  }

  function formatDelta(delta) {
    if (delta > 0) return `+${delta}%`;
    return `${delta}%`;
  }

  async function fetchDashboardData(destination) {
    renderMetricsSkeleton();
    try {
      const res = await fetch(`/api/dashboard?destination=${destination}`);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();

      const lang = document.documentElement.lang;
      const t = (en, zh) => lang === 'zh' ? zh : en;

      // Flight Price
      document.getElementById('metric-flight-price').innerHTML = `
        <div class="metric-card">
          <div class="metric-card__label">${t('Flight Avg Price', '航班均價')}</div>
          <div class="metric-card__value">NT$${data.avgFlightPrice.toLocaleString()}</div>
          <div class="metric-card__delta ${getDeltaClass(data.flightPriceDelta, true)}">${formatDelta(data.flightPriceDelta)}</div>
        </div>
      `;

      // Hotel Price
      document.getElementById('metric-hotel-price').innerHTML = `
        <div class="metric-card">
          <div class="metric-card__label">${t('Hotel Avg Price (Night)', '飯店每晚均價')}</div>
          <div class="metric-card__value">NT$${data.avgHotelPrice.toLocaleString()}</div>
          <div class="metric-card__delta ${getDeltaClass(data.hotelPriceDelta, true)}">${formatDelta(data.hotelPriceDelta)}</div>
        </div>
      `;

      // Weather
      document.getElementById('metric-weather').innerHTML = `
        <div class="metric-card">
          <div class="metric-card__label">${t('Weather', '天氣')}</div>
          <div class="metric-card__value">${data.weather.avgTemp}°C</div>
          <div class="metric-card__delta">${t('Humidity', '濕度')}: ${data.weather.avgHumidity}% | ${t('Rain', '降雨機率')}: ${data.weather.avgRainProbability}%</div>
        </div>
      `;

      // Fun Score
      const confidenceClass = data.funScore.data_confidence === 'high' ? 'badge--ai' : 
                             (data.funScore.data_confidence === 'medium' ? 'badge--ai-warn' : 'badge--ai-low');
      const bestFor = Object.keys(data.funScore.breakdown)[0] || 'Everything';
      document.getElementById('metric-fun-score').innerHTML = `
        <div class="metric-card">
          <div class="metric-card__label">${t('Fun Score', '好玩指數')} <span class="badge ${confidenceClass}">${t('AI Score', 'AI 評分')}</span></div>
          <div class="metric-card__value">${data.funScore.overall} / 100</div>
          <div class="metric-card__delta metric-card__delta--positive">${t('Great for: ', '適合: ')}${bestFor}</div>
        </div>
      `;
    } catch (e) {
      if (window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.showToast) {
        window.TravelIntel.app.showToast('Failed to load dashboard metrics', 'error');
      } else {
        console.error('Failed to load dashboard metrics', e);
      }
    }
  }

  // Tracking Pills
  function getTracking() {
    return JSON.parse(localStorage.getItem('travelintel_tracking') || '[]');
  }

  function saveTracking(tracking) {
    localStorage.setItem('travelintel_tracking', JSON.stringify(tracking));
  }

  function renderTracking() {
    const tabs = document.getElementById('tracking-tabs');
    const tracking = getTracking();
    tabs.innerHTML = '';
    tracking.forEach(t => {
      const pill = document.createElement('div');
      pill.className = `tracking-pill ${t.destination === activeDestination ? 'tracking-pill--active' : ''}`;
      
      const span = document.createElement('span');
      span.textContent = t.name;
      span.style.cursor = 'pointer';
      span.onclick = () => {
        activeDestination = t.destination;
        renderTracking();
        window.TravelIntel.dashboard.refresh(activeDestination);
        if (window.TravelIntel.charts && window.TravelIntel.charts.refreshCharts) {
            window.TravelIntel.charts.refreshCharts(activeDestination);
        }
      };
      span.ondblclick = () => {
        const newName = prompt('Rename tracking:', t.name);
        if (newName && newName.trim() !== '') {
          t.name = newName.trim();
          saveTracking(tracking);
          renderTracking();
          const titleEl = document.getElementById('dashboard-title');
          if (titleEl && activeDestination === t.destination) {
            titleEl.textContent = `${t.name} (${t.destination}) [${t.dateRange.start} ~ ${t.dateRange.end}]`;
          }
        }
      };
      
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tracking-pill__close';
      closeBtn.innerHTML = '×';
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Remove this tracking?')) {
          saveTracking(tracking.filter(item => item.id !== t.id));
          if (t.destination === activeDestination) {
            const next = getTracking()[0];
            activeDestination = next ? next.destination : 'NRT';
            window.TravelIntel.dashboard.refresh(activeDestination);
          }
          renderTracking();
        }
      };

      pill.appendChild(span);
      pill.appendChild(closeBtn);
      tabs.appendChild(pill);
    });
  }

  document.getElementById('tracking-add-btn').addEventListener('click', () => {
    const tracking = getTracking();
    if (tracking.length >= 5) {
      if(window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.showToast) {
          window.TravelIntel.app.showToast('Max 5 trackings allowed', 'warning');
      }
      return;
    }
    const newId = Date.now().toString();
    tracking.push({
      id: newId,
      name: 'New Trip',
      destination: '',
      origin: 'TPE',
      dateRange: { start: '', end: '' },
      dimensions: { ...defaultDimensions },
      lastFetched: new Date().toISOString(),
      refreshInterval: 'daily',
      isNew: true
    });
    saveTracking(tracking);
    renderTracking();
    
    // Switch to the newly created tab automatically
    activeDestination = newId; // use id for routing temporary if no dest
    window.TravelIntel.dashboard.refresh(activeDestination);
  });

  // Fun Score Sliders
  function renderSliders() {
    const lang = document.documentElement.lang;
    const t = (en, zh) => lang === 'zh' ? zh : en;
    const dimNames = {
      shopping: t('Shopping', '購物'), relaxation: t('Relaxation', '放鬆'), luxury: t('Luxury', '奢華'),
      food: t('Food', '美食'), sightseeing: t('Sightseeing', '觀光'), value: t('Value', '性價比'), festival: t('Festival', '節慶')
    };

    const container = document.getElementById('slider-container');
    container.innerHTML = `<h4 style="margin-bottom: 8px;">${t('Fun Score Dimensions', '好玩指數維度')} <span id="slider-sum">(100%)</span></h4>`;
    
    const tracking = getTracking().find(t => t.destination === activeDestination);
    const dims = tracking && tracking.dimensions ? tracking.dimensions : defaultDimensions;

    Object.keys(dims).forEach(key => {
      const group = document.createElement('div');
      group.className = 'slider-group';
      
      const label = document.createElement('div');
      label.className = 'slider-group__label';
      label.innerHTML = `<span>${dimNames[key] || key}</span><span class="slider-group__value">${dims[key]}%</span>`;
      
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'slider-group__input';
      input.min = '0';
      input.max = '100';
      input.step = '10';
      input.value = dims[key];
      input.setAttribute('data-prev', dims[key]);
      
      input.addEventListener('input', (e) => {
        const oldVal = parseInt(input.getAttribute('data-prev') || dims[key]);
        const newVal = parseInt(e.target.value);
        let sum = 0;
        document.querySelectorAll('.slider-group__input').forEach(inp => {
           sum += inp === input ? newVal : parseInt(inp.value);
        });
        
        if (sum > 100) {
           e.target.value = oldVal;
        } else {
           input.setAttribute('data-prev', e.target.value);
           dims[key] = parseInt(e.target.value);
           label.querySelector('.slider-group__value').textContent = e.target.value + '%';
           updateSliderSum();
           
           // Save to local storage
           const tracking = getTracking();
           const index = tracking.findIndex(t => t.id === activeDestination || t.destination === activeDestination);
           if (index >= 0) {
              tracking[index].dimensions = dims;
              localStorage.setItem('travelintel_tracking', JSON.stringify(tracking));
           }

           clearTimeout(sliderTimeout);
           sliderTimeout = setTimeout(() => {
             submitFunScore();
           }, 400);
        }
      });

      group.appendChild(label);
      group.appendChild(input);
      container.appendChild(group);
    });
    updateSliderSum();
  }

  function updateSliderSum() {
    const inputs = document.querySelectorAll('.slider-group__input');
    let sum = 0;
    inputs.forEach(input => sum += parseInt(input.value));
    const sumEl = document.getElementById('slider-sum');
    if(sumEl) {
        sumEl.textContent = `(${sum}%)`;
        sumEl.style.color = sum === 100 ? 'var(--color-success)' : 'var(--color-danger)';
    }
    return sum;
  }

  async function submitFunScore() {
    const sum = updateSliderSum();
    if (sum !== 100) {
      if(window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.showToast) {
          window.TravelIntel.app.showToast('Dimensions must sum up to exactly 100%', 'warning');
      }
      return;
    }

    const inputs = document.querySelectorAll('.slider-group__input');
    const labels = document.querySelectorAll('.slider-group__label span:first-child');
    const dimensions = {};
    inputs.forEach((input, idx) => {
      dimensions[labels[idx].textContent.toLowerCase()] = parseInt(input.value);
    });

    try {
      const res = await fetch('/api/fun-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: activeDestination, dates: '2025-08-01 to 2025-08-07', dimensions })
      });
      if (!res.ok) throw new Error('Failed to compute fun score');
      const data = await res.json();
      
      const confidenceClass = data.data_confidence === 'high' ? 'badge--ai' : 
                             (data.data_confidence === 'medium' ? 'badge--ai-warn' : 'badge--ai-low');
      
      document.getElementById('metric-fun-score').innerHTML = `
        <div class="metric-card">
          <div class="metric-card__label">Fun Score <span class="badge ${confidenceClass}">AI Score</span></div>
          <div class="metric-card__value">${data.score || data.overall || 0} / 100</div>
          <div class="metric-card__delta metric-card__delta--positive">Great for: ${(data.strength || []).join(', ')}</div>
        </div>
      `;
    } catch (e) {
      if (window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.showToast) {
          window.TravelIntel.app.showToast(e.message, 'error');
      }
    }
  }

  // Contract Export
  window.TravelIntel.dashboard = {
    refresh(destination) {
      if (destination) {
          activeDestination = destination;
      }
      
      const tracking = getTracking();
      // Match by ID if isNew, or by destination
      const track = tracking.find(t => t.id === activeDestination || t.destination === activeDestination);
      
      if (track) {
          activeDestination = track.destination || track.id; // ensure correct active
          
          const titleEl = document.getElementById('dashboard-title');
          if (titleEl) {
              const lang = document.documentElement.lang || 'en';
              const isNewTxt = lang === 'zh' ? '新追蹤' : 'New Tracking';
              titleEl.textContent = track.isNew ? isNewTxt : `${track.name} (${track.destination}) [${track.dateRange.start} ~ ${track.dateRange.end}]`;
          }

          // Populate search bar
          document.getElementById('dash-origin').value = track.origin || 'TPE';
          document.getElementById('dash-dest').value = track.destination || '';
          document.getElementById('dash-start').value = track.dateRange.start || '';
          document.getElementById('dash-end').value = track.dateRange.end || '';
          
          if (!track.isNew) {
            fetchDashboardData(track.destination);
          } else {
            renderMetricsSkeleton(); // wait for user to search
          }
      }
      
      renderTracking();
      renderSliders();
    },
    getActiveDestination() {
      const track = getTracking().find(t => t.id === activeDestination || t.destination === activeDestination);
      return track ? track.destination : activeDestination;
    }
  };

  // Auto-save search bar parameters on change
  ['dash-origin', 'dash-dest', 'dash-start', 'dash-end'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
         const origin = document.getElementById('dash-origin').value;
         const dest = document.getElementById('dash-dest').value.toUpperCase();
         const start = document.getElementById('dash-start').value;
         const end = document.getElementById('dash-end').value;

         if(!dest) return;

         const tracking = getTracking();
         const index = tracking.findIndex(t => t.id === activeDestination || t.destination === activeDestination);
         if (index >= 0) {
            tracking[index].origin = origin;
            tracking[index].destination = dest;
            tracking[index].dateRange = { start, end };
            
            if (tracking[index].isNew) {
               tracking[index].name = dest + ' Trip';
               delete tracking[index].isNew;
               activeDestination = tracking[index].id;
               renderTracking(); // re-render to update tab name
            }
            localStorage.setItem('travelintel_tracking', JSON.stringify(tracking));
         }
      });
  });

  document.getElementById('dash-search-btn').addEventListener('click', () => {
     const origin = document.getElementById('dash-origin').value;
     const dest = document.getElementById('dash-dest').value.toUpperCase();
     const start = document.getElementById('dash-start').value;
     const end = document.getElementById('dash-end').value;

     if(!dest) return;

     const tracking = getTracking();
     const index = tracking.findIndex(t => t.id === activeDestination || t.destination === activeDestination);
     if (index >= 0) {
        tracking[index].origin = origin;
        tracking[index].destination = dest;
        tracking[index].dateRange = { start, end };
        
        if (tracking[index].isNew) {
           tracking[index].name = dest + ' Trip';
           delete tracking[index].isNew;
        }
        
        activeDestination = dest;
        saveTracking(tracking);
        window.TravelIntel.dashboard.refresh(activeDestination);
        if (window.TravelIntel.charts && window.TravelIntel.charts.refreshCharts) {
            window.TravelIntel.charts.refreshCharts(activeDestination);
        }
     }
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Initialize defaults if empty
    if (getTracking().length === 0) {
      saveTracking([{
        id: 'default',
        name: 'Tokyo',
        destination: 'NRT',
        origin: 'TPE',
        dateRange: { start: '2025-08-01', end: '2025-08-07' },
        dimensions: defaultDimensions,
        lastFetched: new Date().toISOString(),
        refreshInterval: 'daily'
      }]);
    }
    
    // Set initial destination
    const firstTrack = getTracking()[0];
    if (firstTrack) activeDestination = firstTrack.destination;
    
    window.TravelIntel.dashboard.refresh(activeDestination);
  });

})();
