// public/js/flightSearch.js

(function() {
  let flightsData = [];
  let currentSort = 'price';
  let sortAsc = true;
  let filters = { direct: false, budget: false, baggage: false };
  let selectedForCompare = [];

  // Create UI Structure
  function initUI() {
    const tabPanel = document.getElementById('tab-flights');
    
    // Add Search Form before results
    const formHtml = `
      <div class="search-form" style="margin-bottom:var(--spacing-md);">
        <form id="fs-form" class="trip-search-bar">
          <input type="text" id="fs-origin" placeholder="Origin (e.g. TPE)" value="TPE" required>
          <div class="search-divider"></div>
          <input type="text" id="fs-dest" placeholder="Dest (e.g. NRT)" required>
          <div class="search-divider"></div>
          <input type="date" id="fs-date" value="2025-08-01" required>
          <div class="search-divider"></div>
          <select id="fs-adults">
            <option value="1" data-i18n="adults_1">1 Adult</option>
            <option value="2" data-i18n="adults_2">2 Adults</option>
          </select>
          <div class="search-divider"></div>
          <select id="fs-cabin">
            <option value="economy" data-i18n="economy">Economy</option>
            <option value="business" data-i18n="business">Business</option>
          </select>
          <button type="submit" class="btn btn--primary" data-i18n="search">Search</button>
        </form>
        
        <div class="filters flex gap-md" style="margin-top:var(--spacing-md);">
          <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="checkbox" id="flt-direct" style="width:18px;height:18px;"> <span data-i18n="direct_only">Direct Only</span></label>
          <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="checkbox" id="flt-budget" style="width:18px;height:18px;"> <span data-i18n="budget_only">Budget Only</span></label>
          <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="checkbox" id="flt-baggage" style="width:18px;height:18px;"> <span data-i18n="with_baggage">With Baggage</span></label>
        </div>
      </div>
      
      <div id="fs-headers" class="flex justify-between" style="padding:var(--spacing-sm) var(--spacing-md); font-weight:bold; font-size:0.875rem; color:var(--color-text-secondary); cursor:pointer;">
        <div style="flex:0 0 50px;" data-i18n="sel">Sel</div>
        <div style="flex:1;" data-sort="airline" data-i18n="airline">Airline ↕</div>
        <div style="flex:1;" data-sort="departureTime" data-i18n="time">Time ↕</div>
        <div style="flex:1;" data-sort="duration" data-i18n="duration">Duration ↕</div>
        <div style="flex:1;" data-sort="price" data-i18n="price">Price ↕</div>
        <div style="flex:1;" data-i18n="ai_last_min">AI Last-Min Price</div>
      </div>
    `;
    
    // Insert before flight-results
    const resultsContainer = document.getElementById('flight-results');
    resultsContainer.insertAdjacentHTML('beforebegin', formHtml);

    // Setup Modal
    const modalHtml = `
      <div id="compare-modal-wrapper" class="compare-modal" hidden>
        <div class="compare-modal__overlay"></div>
        <div class="compare-modal__content flex gap-md" style="min-width:600px;">
           <div style="position:absolute; right:16px; top:16px; cursor:pointer; font-weight:bold;" id="compare-close">X</div>
           <div id="compare-body" class="flex gap-md" style="width:100%; margin-top:20px;"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Bind events
    document.getElementById('fs-form').addEventListener('submit', (e) => {
      e.preventDefault();
      fetchFlights();
    });

    ['direct', 'budget', 'baggage'].forEach(f => {
      document.getElementById(`flt-${f}`).addEventListener('change', (e) => {
        filters[f] = e.target.checked;
        renderFlights();
      });
    });

    document.getElementById('fs-headers').addEventListener('click', (e) => {
      const sortKey = e.target.getAttribute('data-sort');
      if (sortKey) {
        if (currentSort === sortKey) sortAsc = !sortAsc;
        else { currentSort = sortKey; sortAsc = true; }
        renderFlights();
      }
    });

    document.getElementById('compare-btn').addEventListener('click', showCompareModal);
    document.getElementById('compare-close').addEventListener('click', closeCompareModal);
    document.querySelector('.compare-modal__overlay').addEventListener('click', closeCompareModal);
  }

  async function fetchFlights() {
    const dest = document.getElementById('fs-dest').value || 'NRT';
    const origin = document.getElementById('fs-origin').value || 'TPE';
    const date = document.getElementById('fs-date').value || '2025-08-01';
    const adults = document.getElementById('fs-adults').value || 1;
    const cabin = document.getElementById('fs-cabin').value || 'economy';

    const resultsEl = document.getElementById('flight-results');
    
    // Skeleton
    resultsEl.innerHTML = Array(5).fill('<div class="skeleton skeleton--row"></div>').join('');
    
    try {
      const res = await fetch(`/api/flights?origin=${origin}&destination=${dest}&departureDate=${date}&adults=${adults}&cabin=${cabin}`);
      if (!res.ok) throw new Error('Failed to load flights');
      const data = await res.json();
      flightsData = data.flights || [];
      selectedForCompare = [];
      renderFlights();
    } catch(e) {
      if(window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.showToast) {
        window.TravelIntel.app.showToast(e.message, 'error');
      }
      resultsEl.innerHTML = '<p>Error loading flights.</p>';
    }
  }

  function renderFlights() {
    let filtered = flightsData.filter(f => {
      if (filters.direct && f.stops > 0) return false;
      if (filters.budget && f.type !== 'budget') return false;
      if (filters.baggage && (!f.baggage || f.baggage === '0kg')) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let valA = a[currentSort];
      let valB = b[currentSort];
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    const resultsEl = document.getElementById('flight-results');
    resultsEl.innerHTML = '';
    
    const lang = document.documentElement.lang;
    const t = (en, zh) => window.TravelIntel.app.isChinese() ? zh : en;

    filtered.forEach(f => {
      const row = document.createElement('div');
      row.className = 'flight-row';
      
      const timeFmt = time => new Date(time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const aiPrice = Math.round(f.price * (1 + (Math.random()*0.2 - 0.05)));

      const layoversText = f.stopCities.length ? f.stopCities.join(', ') : t('None', '無');
      const baggageText = f.baggage || t('None', '無');
      const stopsText = f.stops === 0 ? t('Direct', '直飛') : f.stops + ' ' + t('stops', '轉機');

      const typeText = t(f.type, f.type === 'traditional' ? '傳統航空' : (f.type === 'budget' ? '廉價航空' : f.type));

      row.innerHTML = `
        <div class="flex items-center justify-between">
          <div style="flex:0 0 50px;" class="chk-wrapper">
             <input type="checkbox" class="compare-chk" data-id="${f.id}" ${selectedForCompare.includes(f.id)?'checked':''}>
          </div>
          <div style="flex:1;">
            <strong>${f.airlineCode} ${f.flightNumber}</strong> 
            <span class="badge badge--ai-low">${typeText}</span>
          </div>
          <div style="flex:1;">${timeFmt(f.departureTime)} - ${timeFmt(f.arrivalTime)}</div>
          <div style="flex:1;">${f.duration} (${stopsText})</div>
          <div style="flex:1; font-weight:bold; color:var(--color-accent);">NT$${f.price.toLocaleString()}</div>
          <div style="flex:1;" title="${t('AI estimated', 'AI 估算，僅供參考')}">
             NT$${aiPrice.toLocaleString()} <span class="badge badge--ai-warn">⚠ AI</span>
          </div>
        </div>
        <div class="flight-row__detail" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-top:12px; padding-top:12px; border-top:1px dashed var(--border-color);">
          <div><p style="margin:0; font-size:0.875rem; color:var(--color-text-secondary);">${t('Baggage', '行李')}</p><p style="margin:4px 0 0; font-weight:bold;">${baggageText}</p></div>
          <div><p style="margin:0; font-size:0.875rem; color:var(--color-text-secondary);">${t('Cabin', '艙等')}</p><p style="margin:4px 0 0; font-weight:bold;">${t(f.cabin.charAt(0).toUpperCase() + f.cabin.slice(1), f.cabin === 'economy' ? '經濟艙' : '商務艙')}</p></div>
          <div><p style="margin:0; font-size:0.875rem; color:var(--color-text-secondary);">${t('Seats Remaining', '剩餘機位')}</p><p style="margin:4px 0 0; font-weight:bold;">${f.seatsRemaining}</p></div>
          <div><p style="margin:0; font-size:0.875rem; color:var(--color-text-secondary);">${t('Layovers', '轉機點')}</p><p style="margin:4px 0 0; font-weight:bold;">${layoversText}</p></div>
        </div>
      `;

      // Expand logic
      row.addEventListener('click', (e) => {
        if(e.target.tagName === 'INPUT') return; // ignore checkbox clicks
        row.classList.toggle('flight-row--expanded');
      });

      // Checkbox logic
      const chk = row.querySelector('.compare-chk');
      chk.addEventListener('change', (e) => {
        if(e.target.checked) {
          if (selectedForCompare.length >= 3) {
            e.target.checked = false;
            if(window.TravelIntel.app.showToast) window.TravelIntel.app.showToast('Max 3 flights for comparison', 'warning');
          } else {
            selectedForCompare.push(f.id);
          }
        } else {
          selectedForCompare = selectedForCompare.filter(id => id !== f.id);
        }
      });

      resultsEl.appendChild(row);
    });

    if (window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.applyLang) {
      window.TravelIntel.app.applyLang();
    }
  }

  function showCompareModal() {
    if (selectedForCompare.length === 0) {
      if(window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.showToast) {
         window.TravelIntel.app.showToast('Select at least one flight to compare', 'warning');
      }
      return;
    }

    const wrapper = document.getElementById('compare-modal-wrapper');
    const body = document.getElementById('compare-body');
    body.innerHTML = '';

    selectedForCompare.forEach(id => {
      const f = flightsData.find(x => x.id === id);
      if(!f) return;

      const col = document.createElement('div');
      col.style.flex = '1';
      col.style.padding = 'var(--spacing-md)';
      col.style.border = '1px solid var(--border-color)';
      col.style.borderRadius = 'var(--radius-card)';
      
      const timeFmt = t => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

      col.innerHTML = `
        <h3>${f.airlineCode} ${f.flightNumber}</h3>
        <p><strong>Type:</strong> ${f.type}</p>
        <p><strong>Price:</strong> NT$${f.price.toLocaleString()}</p>
        <p><strong>Duration:</strong> ${f.duration} (${f.stops} stops)</p>
        <p><strong>Departure:</strong> ${timeFmt(f.departureTime)}</p>
        <p><strong>Arrival:</strong> ${timeFmt(f.arrivalTime)}</p>
        <p><strong>Baggage:</strong> ${f.baggage}</p>
      `;
      body.appendChild(col);
    });

    wrapper.removeAttribute('hidden');
  }

  function closeCompareModal() {
    document.getElementById('compare-modal-wrapper').setAttribute('hidden', '');
  }

  window.TravelIntel.flightSearch = {
    refresh(destination) {
      const destInput = document.getElementById('fs-dest');
      if (destInput && destination && destInput.value !== destination) {
        destInput.value = destination;
        fetchFlights();
      } else if (flightsData.length === 0) {
        // Initial load
        if(destination) document.getElementById('fs-dest').value = destination;
        fetchFlights();
      }
    }
  };

  document.addEventListener('DOMContentLoaded', initUI);

})();
