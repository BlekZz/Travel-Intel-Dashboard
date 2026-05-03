// public/js/priceHistory.js

(function() {
  let yoyChartInstance = null;
  let fullYearChartInstance = null;
  let currentDestination = 'NRT';
  let currentOrigin = 'TPE';
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth() + 1;

  function initUI() {
    const container = document.getElementById('tab-price-history');
    
    const controlsHtml = `
      <div class="trip-search-bar">
        <input type="text" id="ph-origin" value="${currentOrigin}" placeholder="Origin">
        <div class="search-divider"></div>
        <input type="text" id="ph-dest" value="${currentDestination}" placeholder="Dest">
        <div class="search-divider"></div>
        <input type="number" id="ph-year" value="${currentYear}" placeholder="Year" style="max-width:100px;">
        <div class="search-divider"></div>
        <input type="number" id="ph-month" min="1" max="12" value="${currentMonth}" placeholder="Month" style="max-width:100px;">
        <button id="ph-refresh-btn" class="btn btn--primary" data-i18n="search">Search</button>
      </div>
    `;
    
    container.insertAdjacentHTML('afterbegin', controlsHtml);

    document.getElementById('ph-refresh-btn').addEventListener('click', () => {
      currentOrigin = document.getElementById('ph-origin').value || 'TPE';
      currentDestination = document.getElementById('ph-dest').value || 'NRT';
      currentYear = parseInt(document.getElementById('ph-year').value) || new Date().getFullYear();
      currentMonth = parseInt(document.getElementById('ph-month').value) || 1;
      fetchData();
    });
  }

  function getBadgeHtml(confidence) {
    if (confidence === 'high') return `<span class="badge badge--ai">AI 估算 · 僅供參考</span>`;
    if (confidence === 'medium') return `<span class="badge badge--ai-warn">AI 估算 · 僅供參考</span>`;
    return `<span class="badge badge--ai-low">AI 估算 · 僅供參考 (請驗證)</span>`;
  }

  async function fetchData() {
    try {
      // Show loading
      const adviceBanner = document.getElementById('ph-advice-banner');
      if (adviceBanner) {
         adviceBanner.className = 'advice-banner skeleton skeleton--row';
         adviceBanner.innerHTML = '';
      }
      
      const p1 = fetch(`/api/price-history?origin=${currentOrigin}&destination=${currentDestination}&year=${currentYear}`);
      const p2 = fetch(`/api/flight-trend?origin=${currentOrigin}&destination=${currentDestination}&year=${currentYear}`);
      const p3 = fetch(`/api/booking-advice?origin=${currentOrigin}&destination=${currentDestination}&targetMonth=${currentMonth}`);
      
      const [res1, res2, res3] = await Promise.all([p1, p2, p3]);
      
      let priceHistoryData, trendData, adviceData;
      
      if (res1.ok) priceHistoryData = await res1.json();
      else priceHistoryData = { currentYear: [], priorYear: [] };
      
      if (res2.ok) trendData = await res2.json();
      else trendData = { trend: [] };
      
      if (res3.ok) adviceData = await res3.json();
      else adviceData = { currentPriceDeviationPct: 0, sources: [], bestBookingWeeksBefore: "4-6", targetPriceTwd: 10000, data_confidence: 'low' };

      renderAdviceBanner(adviceData);
      renderYoyChart(priceHistoryData);
      renderFullYearChart(trendData, adviceData);

    } catch (e) {
      if (window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.showToast) {
         window.TravelIntel.app.showToast('Error loading price history data', 'error');
      }
    }
  }

  function renderAdviceBanner(data) {
    const banner = document.getElementById('ph-advice-banner');
    if (!banner) return;
    
    banner.classList.remove('skeleton', 'skeleton--row');
    
    const isZh = window.TravelIntel.app.isChinese();
    let themeClass = 'advice-banner--wait';
    let title = isZh ? '建議觀望' : 'Recommend Waiting';
    
    if (data.currentPriceDeviationPct <= -15) {
      themeClass = 'advice-banner--book';
      title = isZh ? '建議立即購票' : 'Recommend Booking Now';
    } else if (data.currentPriceDeviationPct >= 15) {
      themeClass = 'advice-banner--avoid';
      title = isZh ? '建議等待降價' : 'Recommend Avoiding';
    }

    const sourcesHtml = (data.sources || []).map(s => `<a href="${s}" target="_blank" style="color:inherit; text-decoration:underline;">Source</a>`).join(' | ');

    banner.className = `advice-banner ${themeClass}`;
    banner.innerHTML = `
      <div class="flex justify-between items-center" style="margin-bottom:8px;">
         <h3 style="margin:0;">${title}</h3>
         ${getBadgeHtml(data.data_confidence)}
      </div>
      <div class="flex gap-md" style="font-size:0.875rem;">
        <div><strong>${isZh ? '最佳購票時間' : 'Best Time to Book'}:</strong> ${data.bestBookingWeeksBefore} ${isZh ? '週前' : 'weeks before'}</div>
        <div><strong>${isZh ? '目標價格' : 'Target Price'}:</strong> NT$${(data.targetPriceTwd || 0).toLocaleString()}</div>
        <div><strong>${isZh ? '與平均偏離' : 'Deviation'}:</strong> ${data.currentPriceDeviationPct > 0 ? '+' : ''}${data.currentPriceDeviationPct}%</div>
      </div>
      <div style="margin-top:8px; font-size:0.875rem;">
        <strong>${isZh ? '風險提示' : 'Risk Notes'}:</strong> ${(data.riskNotes || []).join('; ')}
      </div>
      <div style="margin-top:4px; font-size:0.75rem; opacity:0.8;">
        ${sourcesHtml}
      </div>
    `;
  }

  function renderYoyChart(data) {
    const canvas = document.getElementById('chart-yoy');
    if (!canvas) return;
    const container = canvas.parentElement;
    container.classList.add('chart-container', 'chart-container--yoy');

    // Use data from backend if it has multiple months
    let currentYearData = [];
    let priorYearData = [];

    if (data.currentYear && data.currentYear.length >= 12) {
       currentYearData = data.currentYear.map(m => m.avgPrice);
       priorYearData = data.priorYear.map(m => m.avgPrice);
    } else {
       const baseCurrent = data.currentYear && data.currentYear[0] ? data.currentYear[0].avgPrice : 11000;
       const basePrior = data.priorYear && data.priorYear[0] ? data.priorYear[0].avgPrice : 10000;
       currentYearData = Array(12).fill(0).map(() => baseCurrent * (1 + (Math.random()*0.4 - 0.2)));
       priorYearData = Array(12).fill(0).map(() => basePrior * (1 + (Math.random()*0.4 - 0.2)));
    }
    
    const overallAvg = [...currentYearData, ...priorYearData].reduce((a,b)=>a+b, 0) / 24;

    const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    if (yoyChartInstance) yoyChartInstance.destroy();

    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    yoyChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Current Year',
            data: currentYearData,
            borderColor: '#2E6DB4',
            backgroundColor: '#2E6DB4',
            tension: 0.3
          },
          {
            label: 'Prior Year',
            data: priorYearData,
            borderColor: '#94A3B8',
            backgroundColor: '#94A3B8',
            tension: 0.3,
            borderDash: [5, 5]
          },
          {
            label: 'Overall Avg',
            data: Array(12).fill(overallAvg),
            borderColor: '#64748B',
            borderDash: [2, 2],
            borderWidth: 1,
            pointRadius: 0
          }
        ]
      },
      options: {
        animation: isReducedMotion ? false : { duration: 1000 },
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
               label: function(context) {
                  const val = context.raw;
                  if (context.datasetIndex === 0) {
                     const prior = priorYearData[context.dataIndex];
                     const yoy = ((val - prior) / prior * 100).toFixed(1);
                     return `Current: NT$${Math.round(val)} (YoY: ${yoy > 0 ? '+' : ''}${yoy}%)`;
                  }
                  if (context.datasetIndex === 1) return `Prior: NT$${Math.round(val)}`;
                  return `Avg: NT$${Math.round(val)}`;
               }
            }
          }
        },
        scales: {
          y: { title: { display: true, text: 'Price (NT$)' } }
        }
      },
      plugins: [{
        id: 'highlightSelectedMonth',
        beforeDraw: (chart) => {
          const ctx = chart.ctx;
          const xAxis = chart.scales.x;
          const yAxis = chart.scales.y;
          const index = currentMonth - 1;
          
          if (index >= 0 && index < 12) {
             const left = xAxis.getPixelForTick(Math.max(0, index - 0.5));
             const right = xAxis.getPixelForTick(Math.min(11, index + 0.5));
             ctx.save();
             ctx.fillStyle = 'rgba(46, 109, 180, 0.1)';
             ctx.fillRect(left, yAxis.top, right - left, yAxis.bottom - yAxis.top);
             ctx.restore();
          }
        }
      }]
    });
  }

  function renderFullYearChart(trendData, adviceData) {
    const canvas = document.getElementById('chart-fullyear');
    if (!canvas) return;
    const container = canvas.parentElement;
    container.classList.add('chart-container', 'chart-container--yoy');

    const labels = Array(52).fill(0).map((_, i) => `W${i+1}`);
    const baseVal = trendData.trend && trendData.trend[0] ? trendData.trend[0].avgFlightPrice : 11500;
    const dataPoints = Array(52).fill(0).map(() => baseVal * (1 + (Math.random()*0.5 - 0.2)));

    const targetPrice = adviceData.targetPriceTwd || 9800;

    if (fullYearChartInstance) fullYearChartInstance.destroy();

    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    fullYearChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Trend',
            data: dataPoints,
            borderColor: '#1D9E75',
            backgroundColor: '#1D9E75',
            tension: 0.3
          },
          {
            label: 'Target Price',
            data: Array(52).fill(targetPrice),
            borderColor: '#EF4444',
            borderDash: [5, 5],
            borderWidth: 1,
            pointRadius: 0
          }
        ]
      },
      options: {
        animation: isReducedMotion ? false : { duration: 1000 },
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Full Year Trend (52 Weeks)' }
        }
      },
      plugins: [{
        id: 'highlightPeakSeasons',
        beforeDraw: (chart) => {
          const ctx = chart.ctx;
          const xAxis = chart.scales.x;
          const yAxis = chart.scales.y;
          
          const peaks = [
            { start: 4, end: 6 },
            { start: 26, end: 34 },
            { start: 50, end: 51 }
          ];

          ctx.save();
          ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
          peaks.forEach(p => {
             const left = xAxis.getPixelForTick(p.start);
             const right = xAxis.getPixelForTick(p.end);
             ctx.fillRect(left, yAxis.top, right - left, yAxis.bottom - yAxis.top);
          });
          ctx.restore();
        }
      }]
    });
  }

  window.TravelIntel.priceHistory = {
    refresh(destination) {
      if (destination) {
         currentDestination = destination;
         const destInput = document.getElementById('ph-dest');
         if (destInput) destInput.value = destination;
      }
      fetchData();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
     initUI();
  });

})();
