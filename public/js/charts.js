(function() {
  const DEFAULT_DESTINATION = 'NRT';
  const POPUP_ID = 'chart-heatmap-popover';
  const LEGEND_LEVELS = [1, 2, 3, 4, 5];

  let trendChartInstance = null;
  let activeDestination = DEFAULT_DESTINATION;
  let heatmapType = 'outbound';
  let lastHeatmapPayload = null;
  let currentCenterMonth = null;
  let trendRequestSequence = 0;
  let heatmapRequestSequence = 0;

  function getApp() {
    return (window.TravelIntel && window.TravelIntel.app) || {};
  }

  function isChinese() {
    const app = getApp();
    if (typeof app.isChinese === 'function') return app.isChinese();
    return (document.documentElement.lang || '').toLowerCase().startsWith('zh');
  }

  function t(en, zh) {
    return isChinese() ? zh : en;
  }

  function getCssColor(variable, fallback = '') {
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return value || fallback;
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function getChartAnimationConfig() {
    return prefersReducedMotion() ? false : { duration: 350 };
  }

  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return fallback;
    }
  }

  function formatCurrency(value, emptyText) {
    if (!Number.isFinite(value)) return emptyText || t('No data', '無資料');
    return `NT$${Math.round(value).toLocaleString('en-US')}`;
  }

  function formatCompactCurrency(value) {
    if (!Number.isFinite(value)) return '--';
    if (value >= 1000) return `${Math.round(value / 1000)}k`;
    return `${Math.round(value)}`;
  }

  function normalizeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function average(values) {
    const valid = values.filter((value) => Number.isFinite(value));
    if (!valid.length) return null;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }

  function getTrackingRecord(destination) {
    const tracking = safeJsonParse(localStorage.getItem('travelintel_tracking') || '[]', []);
    return tracking.find((item) => item && (item.id === destination || item.destination === destination)) || null;
  }

  function getTrackingQuery(destination) {
    const track = getTrackingRecord(destination);
    if (!track) return '';
    const params = new URLSearchParams();
    if (track.origin) params.set('origin', track.origin);
    if (track.dateRange) params.set('dateRange', JSON.stringify(track.dateRange));
    const query = params.toString();
    return query ? `&${query}` : '';
  }

  function showToast(message, type) {
    const app = getApp();
    if (typeof app.showToast === 'function') {
      app.showToast(message, type);
    }
  }

  function ensurePopover(container) {
    let popover = container.querySelector(`#${POPUP_ID}`);
    if (popover) return popover;

    popover = document.createElement('div');
    popover.id = POPUP_ID;
    popover.style.position = 'absolute';
    popover.style.minWidth = '180px';
    popover.style.maxWidth = '240px';
    popover.style.padding = '10px 12px';
    popover.style.borderRadius = '8px';
    popover.style.background = getCssColor('--color-surface', '#ffffff');
    popover.style.color = getCssColor('--color-text-primary', '#111827');
    popover.style.border = `1px solid ${getCssColor('--color-text-secondary', 'rgba(0,0,0,0.15)')}`;
    popover.style.boxShadow = '0 10px 30px rgba(0,0,0,0.12)';
    popover.style.fontSize = '0.85rem';
    popover.style.lineHeight = '1.5';
    popover.style.zIndex = '10';
    popover.style.pointerEvents = 'none';
    popover.style.opacity = '0';
    popover.style.transform = 'translateY(4px)';
    popover.style.transition = prefersReducedMotion() ? 'none' : 'opacity 0.15s ease, transform 0.15s ease';
    container.style.position = 'relative';
    container.appendChild(popover);
    return popover;
  }

  function hidePopover(container) {
    const popover = container.querySelector(`#${POPUP_ID}`);
    if (!popover) return;
    popover.style.opacity = '0';
    popover.style.transform = 'translateY(4px)';
  }

  function renderPopover(container, cell, day) {
    const popover = ensurePopover(container);
    const lowPrice = normalizeNumber(day.flightPrice);
    const highPrice = Number.isFinite(lowPrice) ? Math.round(lowPrice * 1.15) : null;
    const weatherScore = normalizeNumber(day.weatherScore);
    const flightsEstimate = Number.isFinite(lowPrice)
      ? Math.max(1, Math.round(12 - day.priceLevel * 1.5))
      : null;

    popover.innerHTML = [
      `<div style="font-weight:700; margin-bottom:4px;">${day.date || t('Unknown date', '未知日期')}</div>`,
      `<div>${t('Price', '票價')}: ${formatCurrency(lowPrice)}</div>`,
      `<div>${t('Price level', '價位等級')}: ${day.priceLevel || '--'} / 5</div>`,
      `<div>${t('Weather score', '天氣分數')}: ${Number.isFinite(weatherScore) ? weatherScore : '--'}</div>`,
      `<div>${t('Estimated flights', '估計航班數')}: ${Number.isFinite(flightsEstimate) ? flightsEstimate : '--'}</div>`,
      `<div>${t('Estimated high', '估計高點')}: ${formatCurrency(highPrice)}</div>`
    ].join('');

    const cellRect = cell.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const left = Math.max(8, cellRect.left - containerRect.left);
    const top = Math.max(8, cellRect.top - containerRect.top - popover.offsetHeight - 12);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.background = getCssColor('--color-surface', '#ffffff');
    popover.style.color = getCssColor('--color-text-primary', '#111827');
    popover.style.borderColor = getCssColor('--color-text-secondary', 'rgba(0,0,0,0.15)');
    popover.style.opacity = '1';
    popover.style.transform = 'translateY(0)';
  }

  function buildTrendDatasets(labels, flightPrices, hotelPrices, colors) {
    const avgFlight = average(flightPrices);
    const avgHotel = average(hotelPrices);

    return {
      datasets: [
        {
          label: t('Flight Price', '機票均價'),
          data: flightPrices,
          borderColor: colors.flight,
          backgroundColor: colors.flight,
          yAxisID: 'yFlight',
          tension: 0.3,
          spanGaps: true,
          pointRadius: 2
        },
        {
          label: t('Hotel Price', '飯店均價'),
          data: hotelPrices,
          borderColor: colors.hotel,
          backgroundColor: colors.hotel,
          yAxisID: 'yHotel',
          tension: 0.3,
          spanGaps: true,
          pointRadius: 2
        },
        {
          label: t('Avg Flight', '機票平均'),
          data: labels.map(() => avgFlight),
          borderColor: colors.flight,
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'yFlight',
          spanGaps: true
        },
        {
          label: t('Avg Hotel', '飯店平均'),
          data: labels.map(() => avgHotel),
          borderColor: colors.hotel,
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'yHotel',
          spanGaps: true
        }
      ],
      avgFlight,
      avgHotel
    };
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

  function getTrendOptions(avgFlight, avgHotel, colors, flightBounds, hotelBounds) {
    return {
      animation: getChartAnimationConfig(),
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 35,
            boxHeight: 2,
            color: colors.text
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = normalizeNumber(context.raw);
              const avg = context.dataset.yAxisID === 'yFlight' ? avgFlight : avgHotel;
              if (!Number.isFinite(value)) {
                return `${context.dataset.label}: ${t('No data', '無資料')}`;
              }
              const diff = Number.isFinite(avg) ? Math.round(value - avg) : null;
              const suffix = diff === null
                ? ''
                : ` (${t('vs avg', '相較平均')}: ${diff > 0 ? '+' : ''}${diff})`;
              return `${context.dataset.label}: ${formatCurrency(value)}${suffix}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: colors.text }
        },
        yFlight: {
          type: 'linear',
          display: true,
          position: 'left',
          min: flightBounds ? flightBounds.min : undefined,
          max: flightBounds ? flightBounds.max : undefined,
          title: {
            display: true,
            text: t('Flight (NT$)', '機票 (NT$)'),
            color: colors.text
          },
          ticks: {
            color: colors.text,
            callback(value) {
              return formatCompactCurrency(Number(value));
            }
          }
        },
        yHotel: {
          type: 'linear',
          display: true,
          position: 'right',
          min: hotelBounds ? hotelBounds.min : undefined,
          max: hotelBounds ? hotelBounds.max : undefined,
          title: {
            display: true,
            text: t('Hotel (NT$)', '飯店 (NT$)'),
            color: colors.text
          },
          ticks: {
            color: colors.text,
            callback(value) {
              return formatCompactCurrency(Number(value));
            }
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    };
  }

  async function renderTrendChart(destination) {
    const requestId = ++trendRequestSequence;
    const canvas = document.getElementById('chart-trend');
    if (!canvas) return;

    const container = canvas.parentElement || canvas;
    container.classList.add('chart-container', 'chart-container--dual-axis');
    container.style.height = '380px';
    container.style.minHeight = '380px';
    canvas.style.height = '100%';
    if (!trendChartInstance) {
      container.classList.add('skeleton', 'skeleton--chart');
    }

    try {
      const response = await fetch(`/api/flight-trend?destination=${encodeURIComponent(destination)}${getTrackingQuery(destination)}`);
      if (!response.ok) throw new Error(`Trend API ${response.status}`);

      const payload = await response.json();
      if (requestId !== trendRequestSequence) return;
      const trend = Array.isArray(payload.trend) ? payload.trend : [];

      const labels = trend.map((item) => item.date || '');
      const flightPrices = trend.map((item) => normalizeNumber(item.avgFlightPrice));
      const hotelPrices = trend.map((item) => normalizeNumber(item.avgHotelPrice));

      const flightBounds = calculateScaleBounds(flightPrices, 0.2);
      const hotelBounds = calculateScaleBounds(hotelPrices, 0.2);

      const colors = {
        flight: getCssColor('--color-primary-mid', '#2E6DB4'),
        hotel: getCssColor('--color-accent', '#1D9E75'),
        text: getCssColor('--color-text-secondary', '#6B7280')
      };

      const { datasets, avgFlight, avgHotel } = buildTrendDatasets(labels, flightPrices, hotelPrices, colors);

      if (trendChartInstance) {
        trendChartInstance.destroy();
      }

      trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: labels.length ? labels : [t('No data', '無資料')],
          datasets
        },
        options: getTrendOptions(avgFlight, avgHotel, colors, flightBounds, hotelBounds)
      });

      container.classList.remove('skeleton', 'skeleton--chart');

      if (!trend.length) {
        showToast(t('Trend chart has no data.', '趨勢圖目前沒有資料。'), 'warning');
      }
    } catch (error) {
      if (requestId !== trendRequestSequence) return;
      container.classList.remove('skeleton', 'skeleton--chart');
      if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
      }

      trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: [t('No data', '無資料')],
          datasets: [
            {
              label: t('Flight Price', '機票均價'),
              data: [null],
              borderColor: getCssColor('--color-primary-mid', '#2E6DB4'),
              backgroundColor: getCssColor('--color-primary-mid', '#2E6DB4'),
              yAxisID: 'yFlight'
            }
          ]
        },
        options: getTrendOptions(null, null, {
          flight: getCssColor('--color-primary-mid', '#2E6DB4'),
          hotel: getCssColor('--color-accent', '#1D9E75'),
          text: getCssColor('--color-text-secondary', '#6B7280')
        }, null, null)
      });

      showToast(t('Trend chart entered fallback mode because the frontend render path failed or the trend request did not complete.', '趨勢圖進入 fallback mode，原因是前端 render 流程失敗或 trend 請求未完成。'), 'warning');
      console.error(error);
    }
  }

  function buildHeatmapHeader(container, allMonths = [], centerIndex = -1, destination = '') {
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.gap = '12px';
    header.style.flexWrap = 'wrap';
    header.style.marginBottom = '12px';

    const title = document.createElement('h3');
    title.textContent = t('Price Heatmap', '價格熱力圖');
    title.style.margin = '0';
    title.style.color = getCssColor('--color-text-primary', '#111827');

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';

    // Left navigation arrow button (disabled if at the start of allMonths list)
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.innerHTML = '&larr;';
    prevBtn.style.padding = '6px 12px';
    prevBtn.style.borderRadius = '8px';
    prevBtn.style.border = `1px solid ${getCssColor('--color-text-secondary', 'rgba(0,0,0,0.12)')}`;
    prevBtn.style.cursor = 'pointer';
    prevBtn.style.background = getCssColor('--color-surface', '#ffffff');
    prevBtn.style.color = getCssColor('--color-text-primary', '#111827');
    prevBtn.style.fontWeight = 'bold';
    prevBtn.title = t('Previous Month', '上一個月');

    if (centerIndex <= 0) {
      prevBtn.disabled = true;
      prevBtn.style.opacity = '0.4';
      prevBtn.style.cursor = 'not-allowed';
    } else {
      prevBtn.onclick = function() {
        currentCenterMonth = allMonths[centerIndex - 1];
        renderHeatmap(destination);
      };
    }
    controls.appendChild(prevBtn);

    // Outbound / Return Mode Buttons
    ['outbound', 'return'].forEach((type) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = type === 'outbound' ? t('Outbound', '去程') : t('Return', '回程');
      button.style.padding = '6px 10px';
      button.style.borderRadius = '8px';
      button.style.border = `1px solid ${getCssColor('--color-text-secondary', 'rgba(0,0,0,0.12)')}`;
      button.style.cursor = 'pointer';
      button.style.background = heatmapType === type
        ? getCssColor('--color-primary', '#1A3C6E')
        : getCssColor('--color-surface', '#ffffff');
      button.style.color = heatmapType === type ? '#ffffff' : getCssColor('--color-text-primary', '#111827');
      button.onclick = function() {
        heatmapType = type;
        currentCenterMonth = null; // Re-eval center month based on start/end date
        renderHeatmap(destination);
      };
      controls.appendChild(button);
    });

    // Right navigation arrow button (disabled if at the end of allMonths list)
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.innerHTML = '&rarr;';
    nextBtn.style.padding = '6px 12px';
    nextBtn.style.borderRadius = '8px';
    nextBtn.style.border = `1px solid ${getCssColor('--color-text-secondary', 'rgba(0,0,0,0.12)')}`;
    nextBtn.style.cursor = 'pointer';
    nextBtn.style.background = getCssColor('--color-surface', '#ffffff');
    nextBtn.style.color = getCssColor('--color-text-primary', '#111827');
    nextBtn.style.fontWeight = 'bold';
    nextBtn.title = t('Next Month', '下一個月');

    if (centerIndex < 0 || centerIndex >= allMonths.length - 1) {
      nextBtn.disabled = true;
      nextBtn.style.opacity = '0.4';
      nextBtn.style.cursor = 'not-allowed';
    } else {
      nextBtn.onclick = function() {
        currentCenterMonth = allMonths[centerIndex + 1];
        renderHeatmap(destination);
      };
    }
    controls.appendChild(nextBtn);

    header.appendChild(title);
    header.appendChild(controls);
    container.appendChild(header);
  }

  function buildHeatmapLegend(container) {
    const legend = document.createElement('div');
    legend.style.display = 'flex';
    legend.style.alignItems = 'center';
    legend.style.flexWrap = 'wrap';
    legend.style.gap = '10px';
    legend.style.marginBottom = '12px';
    legend.style.color = getCssColor('--color-text-secondary', '#6B7280');
    legend.style.fontSize = '0.85rem';

    const label = document.createElement('span');
    label.textContent = t('Legend', '圖例');
    label.style.fontWeight = '600';
    legend.appendChild(label);

    LEGEND_LEVELS.forEach((level) => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '6px';

      const swatch = document.createElement('span');
      swatch.className = `heatmap-cell heatmap-cell--${level}`;
      swatch.style.display = 'inline-block';
      swatch.style.width = '14px';
      swatch.style.height = '14px';
      swatch.style.borderRadius = '4px';

      const text = document.createElement('span');
      if (level === 1) text.textContent = t('Low', '低價');
      else if (level === 5) text.textContent = t('High', '高價');
      else text.textContent = `${level}`;

      item.appendChild(swatch);
      item.appendChild(text);
      legend.appendChild(item);
    });

    container.appendChild(legend);
  }

  function filterHeatmapDays(days, destination) {
    // Return all days to display the full calendar heatmap.
    // The specific tracked dates will be highlighted with a distinctive border/dot.
    return days;
  }

  function groupDaysByMonth(days) {
    const groups = new Map();

    days.forEach((day) => {
      const dateObj = new Date(day.date);
      if (Number.isNaN(dateObj.getTime())) return;

      const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      if (!groups.has(key)) {
        groups.set(key, {
          name: dateObj.toLocaleString(isChinese() ? 'zh-TW' : 'en-US', {
            month: 'long',
            year: 'numeric'
          }),
          days: []
        });
      }
      groups.get(key).days.push(day);
    });

    return groups;
  }

  function buildEmptyHeatmapState(container, message) {
    const empty = document.createElement('div');
    empty.style.padding = '16px';
    empty.style.borderRadius = '12px';
    empty.style.background = getCssColor('--color-surface', '#ffffff');
    empty.style.color = getCssColor('--color-text-secondary', '#6B7280');
    empty.style.border = `1px dashed ${getCssColor('--color-text-secondary', 'rgba(0,0,0,0.15)')}`;
    empty.textContent = message;
    container.appendChild(empty);
  }

  function createMonthGrid(monthData, wrapper, destination) {
    const monthContainer = document.createElement('section');
    monthContainer.style.minWidth = '240px';
    monthContainer.style.maxWidth = '360px';
    monthContainer.style.flex = '1 1 240px';


    const title = document.createElement('h4');
    title.textContent = monthData.name;
    title.style.margin = '0 0 10px 0';
    title.style.textAlign = 'center';
    title.style.fontWeight = '700';
    title.style.color = getCssColor('--color-text-primary', '#111827');
    monthContainer.appendChild(title);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(7, minmax(28px, 1fr))';
    grid.style.gap = '6px';

    const dayLabels = isChinese()
      ? ['日', '一', '二', '三', '四', '五', '六']
      : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    dayLabels.forEach((label) => {
      const cell = document.createElement('div');
      cell.textContent = label;
      cell.style.textAlign = 'center';
      cell.style.fontSize = '0.75rem';
      cell.style.fontWeight = '700';
      cell.style.color = getCssColor('--color-text-secondary', '#6B7280');
      grid.appendChild(cell);
    });

    if (monthData.days.length) {
      const firstDay = new Date(monthData.days[0].date).getDay();
      for (let index = 0; index < firstDay; index += 1) {
        grid.appendChild(document.createElement('div'));
      }
    }

    const track = getTrackingRecord(destination);
    let start = null;
    let end = null;
    if (track && track.dateRange && track.dateRange.start && track.dateRange.end) {
      start = new Date(track.dateRange.start);
      end = new Date(track.dateRange.end);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    monthData.days.forEach((day) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `heatmap-cell heatmap-cell--${Math.min(5, Math.max(1, Number(day.priceLevel) || 3))}`;
      cell.style.minHeight = '54px';
      cell.style.padding = '6px';
      cell.style.border = 'none';
      cell.style.borderRadius = '8px';
      cell.style.cursor = 'pointer';
      cell.style.position = 'relative';
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems = 'center';
      cell.style.justifyContent = 'center';
      cell.style.transition = prefersReducedMotion() ? 'none' : 'transform 0.12s ease';

      const dateValue = new Date(day.date);
      const dayNumber = Number.isNaN(dateValue.getTime()) ? '--' : dateValue.getDate();
      const flightPrice = normalizeNumber(day.flightPrice);

      let isHighlighted = false;
      if (start && end && !Number.isNaN(dateValue.getTime())) {
        const cellMonthDay = dateValue.getMonth() * 100 + dateValue.getDate();
        const startMonthDay = start.getMonth() * 100 + start.getDate();
        const endMonthDay = end.getMonth() * 100 + end.getDate();
        
        if (startMonthDay <= endMonthDay) {
          isHighlighted = (cellMonthDay >= startMonthDay && cellMonthDay <= endMonthDay);
        } else {
          isHighlighted = (cellMonthDay >= startMonthDay || cellMonthDay <= endMonthDay);
        }
      }

      if (isHighlighted) {
        cell.style.boxShadow = '0 0 0 2px var(--color-primary), 0 4px 6px -1px rgba(0,0,0,0.1)';
        cell.style.border = '2px solid var(--color-primary)';
      }

      cell.innerHTML = `
        <span style="position:absolute;top:4px;left:6px;font-size:0.72rem;font-weight:700;opacity:0.85;">${dayNumber}</span>
        <span style="font-size:0.92rem;font-weight:700;margin-top:8px;">${formatCompactCurrency(flightPrice)}</span>
      `;

      if (isHighlighted) {
        const activeDot = document.createElement('span');
        activeDot.style.position = 'absolute';
        activeDot.style.bottom = '4px';
        activeDot.style.right = '6px';
        activeDot.style.width = '6px';
        activeDot.style.height = '6px';
        activeDot.style.borderRadius = '50%';
        activeDot.style.background = 'var(--color-primary)';
        cell.appendChild(activeDot);
      }

      cell.onmouseenter = function() {
        if (!prefersReducedMotion()) cell.style.transform = 'scale(1.04)';
        renderPopover(wrapper, cell, day);
      };
      cell.onmouseleave = function() {
        cell.style.transform = 'scale(1)';
        hidePopover(wrapper);
      };
      cell.onfocus = function() {
        renderPopover(wrapper, cell, day);
      };
      cell.onblur = function() {
        hidePopover(wrapper);
      };
      cell.onclick = function() {
        showToast(
          `${day.date || '--'} · ${t('Price', '票價')}: ${formatCurrency(flightPrice)}`,
          'success'
        );
      };

      grid.appendChild(cell);
    });

    monthContainer.appendChild(grid);
    return monthContainer;
  }

  async function renderHeatmap(destination) {
    const requestId = ++heatmapRequestSequence;
    const container = document.getElementById('chart-heatmap');
    if (!container) return;

    container.classList.add('chart-container', 'chart-container--heatmap');

    // Lock the current height to prevent page height jumping
    const currentHeight = container.offsetHeight;
    if (currentHeight > 0) {
      container.style.minHeight = `${currentHeight}px`;
    }

    container.innerHTML = '<div class="skeleton skeleton--chart"></div>';

    try {
      const response = await fetch(`/api/heatmap?destination=${encodeURIComponent(destination)}&type=${encodeURIComponent(heatmapType)}${getTrackingQuery(destination)}`);
      if (!response.ok) throw new Error(`Heatmap API ${response.status}`);

      const payload = await response.json();
      if (requestId !== heatmapRequestSequence) return;
      lastHeatmapPayload = payload;

      const originalDays = Array.isArray(payload.days) ? payload.days : [];
      const filteredDays = filterHeatmapDays(originalDays, destination);
      const groups = groupDaysByMonth(filteredDays);

      const allMonths = Array.from(groups.keys()).sort();

      // Sync activeDestination and reset center month if destination changed
      if (activeDestination !== destination) {
        currentCenterMonth = null;
      }
      activeDestination = destination;

      // Determine center month based on the selected date:
      // Outbound uses start date, Return uses end date
      const track = getTrackingRecord(destination);
      let selectedDate = null;
      if (track && track.dateRange) {
        selectedDate = heatmapType === 'outbound' ? track.dateRange.start : track.dateRange.end;
      }

      if (!currentCenterMonth && selectedDate) {
        const dateObj = new Date(selectedDate);
        if (!Number.isNaN(dateObj.getTime())) {
          currentCenterMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        }
      }

      // Fallback if currentCenterMonth is invalid or not in the dataset
      if (!currentCenterMonth || !allMonths.includes(currentCenterMonth)) {
        currentCenterMonth = allMonths[Math.floor(allMonths.length / 2)] || allMonths[0] || null;
      }

      let centerIndex = -1;
      let visibleMonths = allMonths;
      if (currentCenterMonth) {
        centerIndex = allMonths.indexOf(currentCenterMonth);
        const startIndex = Math.max(0, centerIndex - 1);
        const endIndex = Math.min(allMonths.length - 1, centerIndex + 1);
        visibleMonths = allMonths.slice(startIndex, endIndex + 1);
      }

      container.innerHTML = '';
      buildHeatmapHeader(container, allMonths, centerIndex, destination);
      buildHeatmapLegend(container);

      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.gap = '16px';
      wrapper.style.overflowX = 'auto';
      wrapper.style.paddingBottom = '12px';
      wrapper.style.width = '100%';
      wrapper.style.justifyContent = 'center';
      wrapper.style.flexWrap = 'wrap';


      if (!filteredDays.length) {
        buildEmptyHeatmapState(container, t('No heatmap data for this range.', '此區間沒有熱力圖資料。'));
        return;
      }

      visibleMonths.forEach((monthKey) => {
        const monthData = groups.get(monthKey);
        if (monthData) {
          wrapper.appendChild(createMonthGrid(monthData, wrapper, destination));
        }
      });

      container.appendChild(wrapper);
      ensurePopover(wrapper);
    } catch (error) {
      if (requestId !== heatmapRequestSequence) return;
      container.innerHTML = '';
      buildHeatmapHeader(container);
      buildHeatmapLegend(container);
      buildEmptyHeatmapState(container, t('Heatmap unavailable. Rendering fallback state.', '熱力圖目前不可用，已顯示 fallback 狀態。'));
      console.error(error);
      showToast(t('Heatmap fallback mode.', '熱力圖已切到 fallback 顯示。'), 'warning');
    } finally {
      if (requestId !== heatmapRequestSequence) return;
      // Restore default min-height style
      container.style.minHeight = '';
    }
  }

  function redrawTrendColors() {
    if (!trendChartInstance) return;

    const flightColor = getCssColor('--color-primary-mid', '#2E6DB4');
    const hotelColor = getCssColor('--color-accent', '#1D9E75');
    const textColor = getCssColor('--color-text-secondary', '#6B7280');

    const [flightDataset, hotelDataset, avgFlightDataset, avgHotelDataset] = trendChartInstance.data.datasets;
    if (flightDataset) {
      flightDataset.borderColor = flightColor;
      flightDataset.backgroundColor = flightColor;
    }
    if (hotelDataset) {
      hotelDataset.borderColor = hotelColor;
      hotelDataset.backgroundColor = hotelColor;
    }
    if (avgFlightDataset) avgFlightDataset.borderColor = flightColor;
    if (avgHotelDataset) avgHotelDataset.borderColor = hotelColor;

    if (trendChartInstance.options.plugins && trendChartInstance.options.plugins.legend) {
      trendChartInstance.options.plugins.legend.labels.color = textColor;
    }

    if (trendChartInstance.options.scales) {
      const scales = trendChartInstance.options.scales;
      if (scales.x && scales.x.ticks) scales.x.ticks.color = textColor;
      if (scales.yFlight) {
        if (scales.yFlight.title) scales.yFlight.title.color = textColor;
        if (scales.yFlight.ticks) scales.yFlight.ticks.color = textColor;
      }
      if (scales.yHotel) {
        if (scales.yHotel.title) scales.yHotel.title.color = textColor;
        if (scales.yHotel.ticks) scales.yHotel.ticks.color = textColor;
      }
    }

    trendChartInstance.options.animation = getChartAnimationConfig();
    trendChartInstance.update();
  }

  function redrawHeatmapTheme() {
    const container = document.getElementById('chart-heatmap');
    if (!container || !lastHeatmapPayload) return;
    renderHeatmap(activeDestination);
  }

  window.TravelIntel = window.TravelIntel || {};
  window.TravelIntel.charts = {
    refreshCharts(destination) {
      if (destination) activeDestination = destination;
      renderTrendChart(activeDestination);
      renderHeatmap(activeDestination);
    },
    redrawCharts() {
      redrawTrendColors();
      redrawHeatmapTheme();
    }
  };

  document.addEventListener('themechange', function() {
    window.TravelIntel.charts.redrawCharts();
  });

  document.addEventListener('langchange', function() {
    window.TravelIntel.charts.refreshCharts(activeDestination);
  });
})();
