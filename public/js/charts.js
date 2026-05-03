(function() {
  let trendChartInstance = null;
  let activeDestination = 'NRT';
  let heatmapType = 'outbound';
  
  function getCssColor(variable) {
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  }

  function getChartConfig() {
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      animation: isReducedMotion ? false : { duration: 1000 }
    };
  }

  async function renderTrendChart(destination) {
    const canvas = document.getElementById('chart-trend');
    const container = canvas.parentElement;
    
    // Skeleton
    if (!trendChartInstance) {
       container.classList.add('skeleton', 'skeleton--chart');
    }

    try {
      let url = `/api/flight-trend?destination=${destination}`;
      const tracking = JSON.parse(localStorage.getItem('travelintel_tracking') || '[]');
      const track = tracking.find(t => t.id === destination || t.destination === destination);
      if (track && track.dateRange) {
         url += `&dateRange=${encodeURIComponent(JSON.stringify(track.dateRange))}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      
      container.classList.remove('skeleton', 'skeleton--chart');
      container.classList.add('chart-container', 'chart-container--dual-axis');

      const labels = data.trend.map(t => t.date);
      const flightPrices = data.trend.map(t => t.avgFlightPrice);
      const hotelPrices = data.trend.map(t => t.avgHotelPrice);

      const avgFlight = flightPrices.reduce((a, b) => a + b, 0) / (flightPrices.length || 1);
      const avgHotel = hotelPrices.reduce((a, b) => a + b, 0) / (hotelPrices.length || 1);

      const flightColor = getCssColor('--color-primary-mid');
      const hotelColor = getCssColor('--color-accent');
      const textColor = getCssColor('--color-text-secondary');

      if (trendChartInstance) {
        trendChartInstance.destroy();
      }

      trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Flight Price',
              data: flightPrices,
              borderColor: flightColor,
              backgroundColor: flightColor,
              yAxisID: 'yFlight',
              tension: 0.3
            },
            {
              label: 'Hotel Price',
              data: hotelPrices,
              borderColor: hotelColor,
              backgroundColor: hotelColor,
              yAxisID: 'yHotel',
              tension: 0.3
            }
          ]
        },
        options: {
          ...getChartConfig(),
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function(context) {
                  const val = context.raw;
                  const avg = context.datasetIndex === 0 ? avgFlight : avgHotel;
                  const diff = val - avg;
                  const diffStr = diff > 0 ? `+${Math.round(diff)}` : `${Math.round(diff)}`;
                  return `${context.dataset.label}: NT$${val} (vs Avg: ${diffStr})`;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: textColor }
            },
            yFlight: {
              type: 'linear',
              display: true,
              position: 'left',
              title: { display: true, text: 'Flight (NT$)', color: textColor },
              ticks: { color: textColor }
            },
            yHotel: {
              type: 'linear',
              display: true,
              position: 'right',
              title: { display: true, text: 'Hotel (NT$)', color: textColor },
              ticks: { color: textColor },
              grid: { drawOnChartArea: false }
            }
          }
        }
      });
      
      // Manually add average line datasets
      trendChartInstance.data.datasets.push({
          label: 'Avg Flight',
          data: labels.map(() => avgFlight),
          borderColor: flightColor,
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'yFlight'
      });
      trendChartInstance.data.datasets.push({
          label: 'Avg Hotel',
          data: labels.map(() => avgHotel),
          borderColor: hotelColor,
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'yHotel'
      });
      trendChartInstance.update();

    } catch (e) {
      console.error(e);
      container.classList.remove('skeleton', 'skeleton--chart');
    }
  }

  async function renderHeatmap(destination) {
    const container = document.getElementById('chart-heatmap');
    container.innerHTML = '<div class="skeleton skeleton--chart"></div>';
    
    try {
      const res = await fetch(`/api/heatmap?destination=${destination}&type=${heatmapType}`);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      
      container.innerHTML = '';
      container.classList.add('chart-container');
      
      const t = (en, zh) => window.TravelIntel.app.isChinese() ? zh : en;
      const lang = document.documentElement.lang;
      
      const header = document.createElement('div');
      header.className = 'flex justify-between items-center';
      header.innerHTML = `
        <h3 style="margin:0;">${t('Price Heatmap', '價格熱力圖')}</h3>
        <div>
          <button id="hm-outbound" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border-color); cursor:pointer; ${heatmapType==='outbound'?'background:var(--color-primary);color:#fff':'background:var(--color-surface);color:var(--color-text-primary)'}">${t('Outbound', '去程')}</button>
          <button id="hm-return" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border-color); cursor:pointer; ${heatmapType==='return'?'background:var(--color-primary);color:#fff':'background:var(--color-surface);color:var(--color-text-primary)'}">${t('Return', '回程')}</button>
        </div>
      `;
      container.appendChild(header);
      
      document.getElementById('hm-outbound').onclick = () => { heatmapType = 'outbound'; renderHeatmap(activeDestination); };
      document.getElementById('hm-return').onclick = () => { heatmapType = 'return'; renderHeatmap(activeDestination); };

      const gridWrapper = document.createElement('div');
      gridWrapper.className = 'chart-container--heatmap flex gap-lg';
      gridWrapper.style.overflowX = 'auto';
      gridWrapper.style.paddingBottom = '16px'; // scrollbar space
      
      // Apply Date Filter from tracking
      const tracking = JSON.parse(localStorage.getItem('travelintel_tracking') || '[]');
      const track = tracking.find(t => t.id === activeDestination || t.destination === activeDestination);
      if (track && track.dateRange && track.dateRange.start && track.dateRange.end) {
          const start = new Date(track.dateRange.start);
          const end = new Date(track.dateRange.end);
          // Set to start of day and end of day to avoid timezone cutoff issues
          start.setHours(0,0,0,0);
          end.setHours(23,59,59,999);
          data.days = data.days.filter(d => {
              const current = new Date(d.date);
              return current >= start && current <= end;
          });
      }

      // Group by month
      const months = {};
      data.days.forEach(day => {
         const dateObj = new Date(day.date);
         const m = dateObj.getFullYear() + '-' + (dateObj.getMonth() + 1).toString().padStart(2, '0');
         if (!months[m]) months[m] = { name: dateObj.toLocaleString(window.TravelIntel.app.isChinese() ? 'zh-TW' : 'en-US', {month: 'long', year:'numeric'}), days: [] };
         months[m].days.push(day);
      });

      const dayLabels = window.TravelIntel.app.isChinese() ? ['日','一','二','三','四','五','六'] : ['Su','Mo','Tu','We','Th','Fr','Sa'];

      Object.keys(months).forEach(mKey => {
         const mData = months[mKey];
         const mContainer = document.createElement('div');
         mContainer.innerHTML = `<h4 style="text-align:center; margin-bottom:12px; font-weight:bold; color:var(--color-text-primary);">${mData.name}</h4>`;
         
         const mGrid = document.createElement('div');
         mGrid.style.display = 'grid';
         mGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';
         mGrid.style.gap = '6px';

         // Headers
         dayLabels.forEach(dl => {
             mGrid.innerHTML += `<div style="text-align:center; font-size:0.75rem; color:var(--color-text-secondary); font-weight:bold;">${dl}</div>`;
         });

         // Pad empty days
         if (mData.days.length > 0) {
             const firstDay = new Date(mData.days[0].date).getDay();
             for (let i = 0; i < firstDay; i++) {
                 mGrid.innerHTML += `<div></div>`;
             }
         }

         mData.days.forEach(day => {
            const cell = document.createElement('div');
            cell.className = `heatmap-cell heatmap-cell--${day.priceLevel}`;
            cell.style.padding = '8px';
            cell.style.borderRadius = '4px';
            cell.style.minWidth = '45px';
            cell.style.cursor = 'pointer';
            cell.style.transition = 'transform 0.1s';
            
            // Flex layout with relative positioning for date in top-left
            cell.style.display = 'flex';
            cell.style.flexDirection = 'column';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.position = 'relative';
            
            const dayOfMonth = new Date(day.date).getDate();
            const priceK = Math.round(day.flightPrice / 1000) + 'k';
            cell.innerHTML = `
              <span style="position:absolute; top:4px; left:6px; font-size:0.75rem; font-weight:600; opacity:0.8;">${dayOfMonth}</span>
              <span style="font-size:1rem; font-weight:bold; margin-top:8px;">${priceK}</span>
            `;
            
            cell.onmouseenter = () => cell.style.transform = 'scale(1.1)';
            cell.onmouseleave = () => cell.style.transform = 'scale(1)';
            
            cell.onclick = () => {
              if(window.TravelIntel && window.TravelIntel.app && window.TravelIntel.app.showToast) {
                window.TravelIntel.app.showToast(`Date: ${day.date} | Low: NT$${day.flightPrice} | High: NT$${Math.round(day.flightPrice*1.3)}`, 'success');
              }
            };
            mGrid.appendChild(cell);
         });

         mContainer.appendChild(mGrid);
         gridWrapper.appendChild(mContainer);
      });
      
      container.appendChild(gridWrapper);
      
    } catch (e) {
      console.error(e);
      container.innerHTML = '<p>Error loading heatmap.</p>';
    }
  }

  // Contract Export
  window.TravelIntel.charts = {
    refreshCharts(destination) {
      if (destination) activeDestination = destination;
      renderTrendChart(activeDestination);
      renderHeatmap(activeDestination);
    },
    redrawCharts(theme) {
      if (trendChartInstance) {
        const flightColor = getCssColor('--color-primary-mid');
        const hotelColor = getCssColor('--color-accent');
        const textColor = getCssColor('--color-text-secondary');
        
        // Update scales
        trendChartInstance.options.scales.x.ticks.color = textColor;
        trendChartInstance.options.scales.yFlight.title.color = textColor;
        trendChartInstance.options.scales.yFlight.ticks.color = textColor;
        trendChartInstance.options.scales.yHotel.title.color = textColor;
        trendChartInstance.options.scales.yHotel.ticks.color = textColor;
        
        // Update datasets
        trendChartInstance.data.datasets[0].borderColor = flightColor;
        trendChartInstance.data.datasets[0].backgroundColor = flightColor;
        trendChartInstance.data.datasets[1].borderColor = hotelColor;
        trendChartInstance.data.datasets[1].backgroundColor = hotelColor;
        trendChartInstance.data.datasets[2].borderColor = flightColor; // avg
        trendChartInstance.data.datasets[3].borderColor = hotelColor; // avg
        
        trendChartInstance.update();
      }
    }
  };

  document.addEventListener('themechange', (e) => {
    setTimeout(() => {
      window.TravelIntel.charts.redrawCharts(e.detail.theme);
    }, 50);
  });

})();
