/**
 * app.js — NeuroSpec Core Dashboard Controller
 * 
 * ============================================================================
 * OVERVIEW FOR STUDENTS:
 * This script powers the entire NeuroSpec single-page dashboard.
 * It manages:
 * 1. Reactive State: User constraint sliders, noise simulation toggle, cost model.
 * 2. Pareto Frontier Optimization: Calculates which hardware specs offer the
 *    best trade-off between unit cost and screening sensitivity.
 * 3. Recommendation Engine: Identifies the lowest-cost spec that satisfies
 *    both sensitivity and referral-burden limits.
 * 4. Chart.js Visualization: Renders an interactive scatter chart with custom
 *    Pareto markers and a minimum-sensitivity target threshold line.
 * 5. Interactive Table: Sortable matrix of all candidate sensor specs.
 * 6. Dynamic Cost Recalculation: Updates all metrics whenever vendor cost estimates change.
 * 7. CSV File Ingestion: Parses empirical test results and switches dataset source.
 * ============================================================================
 */

// Global Dashboard State
const state = {
  minSensitivity: 85,          // Minimum % of patients flagged (slider 1)
  maxReferrals: 30,            // Maximum allowed extra referrals per 100 healthy (slider 2)
  simulateNoise: false,        // Illustrative toggle: lowers sensitivity by 4.0%
  noisePenalty: 4.0,           // Constant penalty amount when noise is simulated
  sortColumn: 'cost',          // Active column for sorting specs table
  sortAscending: true,         // Sort direction
  chart: null,                 // Chart.js instance reference
  customFileName: null,        // Name of uploaded CSV file (if any)
  datasetTitle: 'Illustrative Mockup'
};

// ============================================================================
// 1. INITIALIZATION & DOM BINDINGS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Bind UI control elements
  initControls();
  
  // Populate cost inputs from default model
  initCostInputs();

  // Initial dashboard calculation & render
  updateDashboard();

  // Attach CSV upload and download listeners
  initCsvHandlers();
  
  // Attach quick action listeners
  initActionButtons();
});

/**
 * Connects sliders and switches to reactive state updates.
 */
function initControls() {
  const sliderSensitivity = document.getElementById('sliderSensitivity');
  const sliderReferrals = document.getElementById('sliderReferrals');
  const toggleNoise = document.getElementById('toggleNoise');

  // Sensitivity Slider Listener
  sliderSensitivity.addEventListener('input', (e) => {
    state.minSensitivity = Number(e.target.value);
    document.getElementById('valSensitivity').textContent = `${state.minSensitivity}%`;
    document.getElementById('patientsCaughtDisplay').textContent = state.minSensitivity;
    updateDashboard();
  });

  // Extra Referrals Slider Listener
  sliderReferrals.addEventListener('input', (e) => {
    state.maxReferrals = Number(e.target.value);
    document.getElementById('valReferrals').textContent = `${state.maxReferrals} / 100`;
    updateDashboard();
  });

  // Simulate Noisier Sensors Toggle Listener
  toggleNoise.addEventListener('change', (e) => {
    state.simulateNoise = e.target.checked;
    updateDashboard();
  });
}

/**
 * Initializes the editable cost input fields with current values from COSTS.
 */
function initCostInputs() {
  const inputChip2 = document.getElementById('inputChip2');
  const inputChip4 = document.getElementById('inputChip4');
  const inputChip8 = document.getElementById('inputChip8');
  const inputChip19 = document.getElementById('inputChip19');
  const inputEsp32 = document.getElementById('inputCostEsp32');
  const inputElectrode = document.getElementById('inputCostElectrode');
  const inputBattery = document.getElementById('inputCostBattery');
  const inputLeads = document.getElementById('inputCostLeads');
  const inputRefBias = document.getElementById('inputCostRefBias');

  if (!inputChip2) return;

  inputChip2.value = COSTS.frontEndChipCostByChannels[2];
  inputChip4.value = COSTS.frontEndChipCostByChannels[4];
  inputChip8.value = COSTS.frontEndChipCostByChannels[8];
  inputChip19.value = COSTS.frontEndChipCostByChannels[19];
  inputEsp32.value = COSTS.esp32BoardINR;
  inputElectrode.value = COSTS.electrodeCostPerUnitINR;
  inputBattery.value = COSTS.batteryINR;
  inputLeads.value = COSTS.leadsINR;
  inputRefBias.value = COSTS.refBiasElectrodesINR;

  // Listen to any input change to immediately recalculate device costs
  const handleCostEdit = () => {
    COSTS.frontEndChipCostByChannels[2] = Math.max(0, Number(inputChip2.value) || 0);
    COSTS.frontEndChipCostByChannels[4] = Math.max(0, Number(inputChip4.value) || 0);
    COSTS.frontEndChipCostByChannels[8] = Math.max(0, Number(inputChip8.value) || 0);
    COSTS.frontEndChipCostByChannels[19] = Math.max(0, Number(inputChip19.value) || 0);
    COSTS.esp32BoardINR = Math.max(0, Number(inputEsp32.value) || 0);
    COSTS.electrodeCostPerUnitINR = Math.max(0, Number(inputElectrode.value) || 0);
    COSTS.batteryINR = Math.max(0, Number(inputBattery.value) || 0);
    COSTS.leadsINR = Math.max(0, Number(inputLeads.value) || 0);
    COSTS.refBiasElectrodesINR = Math.max(0, Number(inputRefBias.value) || 0);

    updateDashboard();
  };

  [inputChip2, inputChip4, inputChip8, inputChip19, inputEsp32, inputElectrode, inputBattery, inputLeads, inputRefBias].forEach(input => {
    input.addEventListener('input', handleCostEdit);
  });
}

// ============================================================================
// 2. MATHEMATICAL & LOGICAL CALCULATIONS
// ============================================================================

/**
 * Evaluates all specs against current cost model, noise settings, and constraints.
 * 
 * @returns {Array} Array of evaluated specification objects
 */
function evaluateSpecifications() {
  const penalty = state.simulateNoise ? state.noisePenalty : 0;

  // 1. Calculate effective metrics for each specification
  const evaluated = RESULTS.map((spec, index) => {
    const effectiveSensitivity = Math.max(0, Number((spec.sensitivity_pct - penalty).toFixed(1)));
    const cost = calculateSpecCost(spec.channels, spec.sampling_rate_hz);
    const referrals = Number(spec.extra_referrals_per_100_healthy);
    
    // Check if both threshold constraints are satisfied
    const meetsSensitivity = effectiveSensitivity >= state.minSensitivity;
    const meetsReferrals = referrals <= state.maxReferrals;
    const meetsLimits = meetsSensitivity && meetsReferrals;

    return {
      id: index,
      channels: spec.channels,
      sampling_rate_hz: spec.sampling_rate_hz,
      raw_sensitivity: spec.sensitivity_pct,
      effective_sensitivity: effectiveSensitivity,
      extra_referrals: referrals,
      cost: cost,
      meetsSensitivity,
      meetsReferrals,
      meetsLimits,
      isPareto: false // will be calculated in step 2
    };
  });

  // 2. Compute Pareto Frontier (Cost vs. Effective Sensitivity)
  // In our evaluation:
  // - Cost should be minimized.
  // - Sensitivity should be maximized.
  // A spec A is "dominated" by spec B if:
  //   Cost(B) <= Cost(A) AND Sens(B) >= Sens(A)
  //   and at least one inequality is strict.
  // If no spec dominates A, then A belongs to the Pareto Frontier.
  evaluated.forEach(specA => {
    let isDominated = false;
    for (const specB of evaluated) {
      if (specA === specB) continue;
      
      const bCheaperOrEqual = specB.cost <= specA.cost;
      const bHigherOrEqualSens = specB.effective_sensitivity >= specA.effective_sensitivity;
      const bStrictlyBetter = (specB.cost < specA.cost) || (specB.effective_sensitivity > specA.effective_sensitivity);

      if (bCheaperOrEqual && bHigherOrEqualSens && bStrictlyBetter) {
        isDominated = true;
        break;
      }
    }
    specA.isPareto = !isDominated;
  });

  return evaluated;
}

/**
 * Finds the optimal hardware recommendation.
 * Prioritizes the lowest cost among specs meeting both constraints.
 * If none qualify, finds the closest alternative based on constraint distance.
 */
function findRecommendation(evaluatedSpecs) {
  const qualifyingSpecs = evaluatedSpecs.filter(s => s.meetsLimits);

  if (qualifyingSpecs.length > 0) {
    // Sort qualifying by cost ascending (cheapest first)
    // If costs are tied, choose highest sensitivity; if still tied, lowest sampling rate
    qualifyingSpecs.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      if (b.effective_sensitivity !== a.effective_sensitivity) {
        return b.effective_sensitivity - a.effective_sensitivity;
      }
      return a.sampling_rate_hz - b.sampling_rate_hz;
    });

    return {
      success: true,
      spec: qualifyingSpecs[0],
      totalQualifying: qualifyingSpecs.length
    };
  }

  // Fallback: No spec meets both constraints. Find the "closest" option.
  // Distance penalty = shortfall in sensitivity + excess in referrals.
  let closestSpec = null;
  let lowestPenalty = Infinity;

  evaluatedSpecs.forEach(spec => {
    const sensShortfall = Math.max(0, state.minSensitivity - spec.effective_sensitivity);
    const refExcess = Math.max(0, spec.extra_referrals - state.maxReferrals);
    // Weigh shortfall in sensitivity slightly higher (1.5x) for screening safety
    const penalty = (sensShortfall * 1.5) + refExcess;

    if (penalty < lowestPenalty) {
      lowestPenalty = penalty;
      closestSpec = spec;
    }
  });

  return {
    success: false,
    spec: closestSpec,
    totalQualifying: 0
  };
}

// ============================================================================
// 3. UI RENDERING PIPELINE
// ============================================================================

/**
 * Master update cycle: re-evaluates data and triggers all visual updates.
 */
function updateDashboard() {
  const evaluatedSpecs = evaluateSpecifications();
  const recommendation = findRecommendation(evaluatedSpecs);

  renderRecommendationCard(recommendation);
  renderScatterChart(evaluatedSpecs);
  renderComparisonTable(evaluatedSpecs, recommendation.spec);
}

/**
 * SECTION 3: Renders the Hero Recommendation Block.
 * Confident block with thick accent left border, serif headline, and simple metrics row.
 */
function renderRecommendationCard(recResult) {
  const card = document.getElementById('recommendationCard');
  if (!card) return;

  if (recResult.success) {
    const spec = recResult.spec;
    card.className = 'recommendation-block';
    card.innerHTML = `
      <div class="rec-meta-row">
        <span class="rec-kicker">Recommended Specification</span>
      </div>

      <h2 class="rec-headline">${spec.channels} Channels @ ${spec.sampling_rate_hz} Hz &mdash; ₹${spec.cost.toLocaleString('en-IN')} / unit</h2>

      <p class="rec-plain-sentence">
        At this setting, <strong>${spec.channels} channels at ${spec.sampling_rate_hz} Hz</strong> is the cheapest option that meets your limits.
      </p>

      <div class="rec-metrics-row">
        <div class="rec-metric-item">
          <span class="rec-metric-label">Screening Sensitivity</span>
          <span class="rec-metric-val">${spec.effective_sensitivity}%</span>
          <span class="rec-metric-sub">Patients flagged</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Extra Referrals</span>
          <span class="rec-metric-val">${spec.extra_referrals}</span>
          <span class="rec-metric-sub">Per 100 healthy</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Partial hardware cost estimate</span>
          <span class="rec-metric-val">₹${spec.cost.toLocaleString('en-IN')}</span>
          <span class="rec-metric-sub">Component estimate</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Pareto Frontier</span>
          <span class="rec-metric-val">${spec.isPareto ? 'Yes' : 'No'}</span>
          <span class="rec-metric-sub">${spec.isPareto ? 'Optimal trade-off' : 'Standard'}</span>
        </div>
      </div>
    `;
  } else {
    // When no spec qualifies under the user's sliders
    const closest = recResult.spec;
    card.className = 'recommendation-block fallback-mode';
    card.innerHTML = `
      <div class="rec-meta-row">
        <span class="rec-kicker">No Specification Qualifies</span>
      </div>

      <h2 class="rec-headline">Closest Candidate: ${closest.channels} Channels @ ${closest.sampling_rate_hz} Hz &mdash; ₹${closest.cost.toLocaleString('en-IN')}</h2>

      <p class="rec-plain-sentence">
        No hardware specification currently satisfies both a minimum sensitivity of <strong>${state.minSensitivity}%</strong> and a referral limit of <strong>${state.maxReferrals} / 100</strong>. Consider relaxing either your sensitivity requirement (${closest.effective_sensitivity}% achieved) or your referral ceiling (${closest.extra_referrals} / 100 required).
      </p>

      <div class="rec-metrics-row">
        <div class="rec-metric-item">
          <span class="rec-metric-label">Achieved Sensitivity</span>
          <span class="rec-metric-val">${closest.effective_sensitivity}%</span>
          <span class="rec-metric-sub">Target was ${state.minSensitivity}%</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Extra Referrals</span>
          <span class="rec-metric-val">${closest.extra_referrals}</span>
          <span class="rec-metric-sub">Ceiling was ${state.maxReferrals}</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Partial hardware cost estimate</span>
          <span class="rec-metric-val">₹${closest.cost.toLocaleString('en-IN')}</span>
          <span class="rec-metric-sub">Component estimate</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Sensitivity Shortfall</span>
          <span class="rec-metric-val">${Math.abs(closest.effective_sensitivity - state.minSensitivity).toFixed(1)}%</span>
          <span class="rec-metric-sub">Gap to target</span>
        </div>
      </div>
    `;
  }
}

// ============================================================================
// 4. CHART.JS SCATTER & PARETO PLOT
// ============================================================================

/**
 * Custom inline Chart.js plugin to draw the horizontal minimum sensitivity target line.
 */
const targetLinePlugin = {
  id: 'targetLinePlugin',
  afterDraw: (chart) => {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y) return;

    const yVal = scales.y.getPixelForValue(state.minSensitivity);
    
    // Draw only if within visible chart canvas bounds
    if (yVal >= chartArea.top && yVal <= chartArea.bottom) {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#B5532A'; // Burnt orange line
      ctx.lineWidth = 1.5;
      ctx.moveTo(chartArea.left, yVal);
      ctx.lineTo(chartArea.right, yVal);
      ctx.stroke();

      // Label on the right margin
      ctx.fillStyle = '#B5532A';
      ctx.font = '500 11px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Target: ${state.minSensitivity}% min`, chartArea.right - 8, yVal - 4);
      ctx.restore();
    }
  }
};

/**
 * SECTION 4: Renders or updates the Chart.js scatter plot.
 * Displays Pareto frontier as a thin connecting line with markers.
 */
function renderScatterChart(evaluatedSpecs) {
  const canvas = document.getElementById('specScatterChart');
  if (!canvas) return;

  // 1. Separate Pareto frontier points from non-frontier points
  const paretoSpecs = evaluatedSpecs.filter(s => s.isPareto).sort((a, b) => a.cost - b.cost);
  
  // Pareto connecting line data (cost ascending)
  const paretoLineData = paretoSpecs.map(s => ({
    x: s.cost,
    y: s.effective_sensitivity
  }));

  const paretoQualPoints = [];
  const paretoFailPoints = [];
  const qualifiedPoints = [];
  const failingPoints = [];

  evaluatedSpecs.forEach(spec => {
    const point = {
      x: spec.cost,
      y: spec.effective_sensitivity,
      rawSpec: spec
    };

    if (spec.isPareto) {
      if (spec.meetsLimits) {
        paretoQualPoints.push(point);
      } else {
        paretoFailPoints.push(point);
      }
    } else if (spec.meetsLimits) {
      qualifiedPoints.push(point);
    } else {
      failingPoints.push(point);
    }
  });

  const chartData = {
    datasets: [
      // Thin Pareto connecting line
      {
        type: 'line',
        label: 'Frontier Line',
        data: paretoLineData,
        showLine: true,
        fill: false,
        borderColor: '#B5532A',
        borderWidth: 1.5,
        borderDash: [3, 3],
        pointRadius: 0,
        hoverRadius: 0,
        order: 3
      },
      // Pareto points (Meets limits): filled burnt orange star
      {
        type: 'scatter',
        label: 'Frontier (Meets Limits)',
        data: paretoQualPoints,
        backgroundColor: '#B5532A',
        borderColor: '#B5532A',
        borderWidth: 1.5,
        pointRadius: 7,
        pointHoverRadius: 10,
        pointStyle: 'star',
        order: 1
      },
      // Pareto points (Outside limits): hollow burnt orange star
      {
        type: 'scatter',
        label: 'Frontier (Outside Limits)',
        data: paretoFailPoints,
        backgroundColor: '#F6F3EC', // Hollow effect on paper background
        borderColor: '#B5532A',
        borderWidth: 2,
        pointRadius: 7,
        pointHoverRadius: 10,
        pointStyle: 'star',
        order: 1
      },
      // Non-frontier points (Meets limits): deep teal circle
      {
        type: 'scatter',
        label: 'Meets Limits',
        data: qualifiedPoints,
        backgroundColor: '#1F6F6B',
        borderColor: '#1F6F6B',
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointStyle: 'circle',
        order: 2
      },
      // Non-frontier points (Outside limits): warm grey circle
      {
        type: 'scatter',
        label: 'Outside Limits',
        data: failingPoints,
        backgroundColor: '#D5D1C7',
        borderColor: '#8A857B',
        borderWidth: 1,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointStyle: 'circle',
        order: 2
      }
    ]
  };

  // If chart already exists, update data smoothly
  if (state.chart) {
    state.chart.data = chartData;
    state.chart.update('none');
    return;
  }

  // Create new Chart.js instance with minimal chart junk
  const ctx = canvas.getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'scatter',
    data: chartData,
    plugins: [targetLinePlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: true
      },
      plugins: {
        legend: {
          display: false // Clean typographic custom legend used in HTML
        },
        tooltip: {
          backgroundColor: '#1F2933',
          titleColor: '#F6F3EC',
          bodyColor: '#E2DDD5',
          titleFont: { family: 'Source Serif 4, Georgia, serif', size: 13, weight: '600' },
          bodyFont: { family: 'IBM Plex Sans, sans-serif', size: 12 },
          padding: 10,
          cornerRadius: 2,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const raw = items[0].raw.rawSpec;
              if (!raw) return '';
              return `${raw.channels} Channels @ ${raw.sampling_rate_hz} Hz`;
            },
            label: (item) => {
              const raw = item.raw.rawSpec;
              if (!raw) return '';
              return [
                `Est. Cost: ₹${raw.cost.toLocaleString('en-IN')}`,
                `Sensitivity: ${raw.effective_sensitivity}% (${raw.effective_sensitivity} / 100)`,
                `Extra Referrals: ${raw.extra_referrals} / 100 healthy`,
                `Status: ${raw.meetsLimits ? 'Qualifies' : 'Outside limits'}`,
                `Pareto Frontier: ${raw.isPareto ? 'Yes (Optimal trade-off)' : 'No'}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Partial hardware cost estimate (INR ₹)',
            font: { family: 'IBM Plex Sans, sans-serif', size: 12, weight: '500' },
            color: '#5E5A52'
          },
          grid: {
            color: '#E2DDD5',
            borderDash: [2, 2],
            drawBorder: false
          },
          ticks: {
            font: { family: 'IBM Plex Mono, monospace', size: 11 },
            color: '#5E5A52',
            callback: (val) => '₹' + Number(val).toLocaleString('en-IN')
          }
        },
        y: {
          title: {
            display: true,
            text: 'Screening Sensitivity (%)',
            font: { family: 'IBM Plex Sans, sans-serif', size: 12, weight: '500' },
            color: '#5E5A52'
          },
          min: 60,
          max: 100,
          grid: {
            color: '#E2DDD5',
            borderDash: [2, 2],
            drawBorder: false
          },
          ticks: {
            stepSize: 5,
            font: { family: 'IBM Plex Mono, monospace', size: 11 },
            color: '#5E5A52',
            callback: (val) => val + '%'
          }
        }
      }
    }
  });
}

// ============================================================================
// 5. COMPARISON TABLE RENDERING & SORTING
// ============================================================================

/**
 * SECTION 5: Renders the compact, zebra-free specification matrix.
 * Numbers right-aligned in mono, status as plain text with ticks/dashes.
 */
function renderComparisonTable(evaluatedSpecs, recommendedSpec) {
  const tbody = document.getElementById('specsTableBody');
  const countBadge = document.getElementById('qualifyingCountBadge');
  if (!tbody) return;

  const qualifyingCount = evaluatedSpecs.filter(s => s.meetsLimits).length;
  countBadge.textContent = `${qualifyingCount} of ${evaluatedSpecs.length} qualify`;

  // Sort specs based on current active sort column and order
  const sorted = [...evaluatedSpecs].sort((a, b) => {
    let valA = a[state.sortColumn];
    let valB = b[state.sortColumn];

    if (state.sortColumn === 'sensitivity_pct') {
      valA = a.effective_sensitivity;
      valB = b.effective_sensitivity;
    }

    if (valA < valB) return state.sortAscending ? -1 : 1;
    if (valA > valB) return state.sortAscending ? 1 : -1;
    return 0;
  });

  // Generate table rows HTML
  tbody.innerHTML = sorted.map(spec => {
    const isRecommended = recommendedSpec && (spec.channels === recommendedSpec.channels && spec.sampling_rate_hz === recommendedSpec.sampling_rate_hz);
    const rowClass = isRecommended ? 'row-recommended' : '';

    const statusHtml = spec.meetsLimits 
      ? `<span class="status-qualifies">✓ Qualifies</span>`
      : `<span class="status-fails">– Outside limits</span>`;

    const paretoHtml = spec.isPareto 
      ? `<span class="table-pareto-tag">[Pareto]</span>` 
      : '';

    const bestIndicator = isRecommended
      ? `<span class="best-rec-indicator">Best</span>`
      : '';

    return `
      <tr class="${rowClass}">
        <td class="col-num">${spec.channels}${bestIndicator}</td>
        <td class="col-num">${spec.sampling_rate_hz}</td>
        <td class="col-num">₹${spec.cost.toLocaleString('en-IN')}</td>
        <td class="col-num">
          ${spec.effective_sensitivity}%
          ${state.simulateNoise ? '<small style="color:#B5532A;">(-4%)</small>' : ''}
        </td>
        <td class="col-num">${spec.extra_referrals}</td>
        <td class="col-status">
          ${statusHtml}
          ${paretoHtml}
        </td>
      </tr>
    `;
  }).join('');

  // Update table header sort indicators
  document.querySelectorAll('#specsTable th.sortable').forEach(th => {
    const col = th.getAttribute('data-sort');
    const indicator = th.querySelector('.sort-glyph');
    if (indicator) {
      if (col === state.sortColumn) {
        indicator.textContent = state.sortAscending ? '▲' : '▼';
        indicator.style.color = '#1F6F6B';
      } else {
        indicator.textContent = '↕';
        indicator.style.color = '#8A857B';
      }
    }
  });

  // Attach header click sort listeners (once)
  if (!tbody.dataset.listenersAttached) {
    document.querySelectorAll('#specsTable th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (state.sortColumn === col) {
          state.sortAscending = !state.sortAscending;
        } else {
          state.sortColumn = col;
          state.sortAscending = true;
        }
        updateDashboard();
      });
    });
    tbody.dataset.listenersAttached = 'true';
  }
}

// ============================================================================
// 6. CSV PARSER & UPLOAD HANDLER
// ============================================================================

/**
 * SECTION 7: Handles CSV file upload, format validation, and dataset replacement.
 */
function initCsvHandlers() {
  const fileInput = document.getElementById('csvFileInput');
  const feedback = document.getElementById('uploadFeedback');
  const bannerText = document.getElementById('bannerText');
  const datasetNameContainer = document.getElementById('datasetNameContainer');
  const datasetNameInput = document.getElementById('datasetNameInput');
  const btnReloadPlaceholder = document.getElementById('btnReloadPlaceholder');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const parsedRows = parseResultsCsv(text);

        if (parsedRows.length === 0) {
          throw new Error('CSV file did not contain any valid data rows.');
        }

        // Replace active RESULTS array with uploaded rows
        RESULTS = parsedRows;
        state.customFileName = file.name;
        state.datasetTitle = file.name.replace(/\.[^/.]+$/, "");

        // Update banner strictly as requested:
        // "change the banner to 'Loaded from file: [filename]' and show the dataset name field the user can type."
        bannerText.textContent = `Loaded from file: ${file.name}`;
        datasetNameContainer.classList.remove('hidden');
        datasetNameInput.value = state.datasetTitle;
        btnReloadPlaceholder.classList.remove('hidden');

        feedback.className = 'upload-feedback success';
        feedback.textContent = `✓ Successfully loaded ${parsedRows.length} specifications from "${file.name}".`;

        updateDashboard();
      } catch (err) {
        feedback.className = 'upload-feedback error';
        feedback.textContent = `Upload Error: ${err.message}`;
      }
    };

    reader.readAsText(file);
  });

  // Dataset Name text field listener
  datasetNameInput.addEventListener('input', (e) => {
    state.datasetTitle = e.target.value;
  });

  // Reload Default Placeholders button
  btnReloadPlaceholder.addEventListener('click', () => {
    RESULTS = JSON.parse(JSON.stringify(DEFAULT_RESULTS));
    state.customFileName = null;
    fileInput.value = '';

    bannerText.textContent = 'ILLUSTRATIVE MOCKUP. Placeholder numbers, not real results.';
    datasetNameContainer.classList.add('hidden');
    btnReloadPlaceholder.classList.add('hidden');
    feedback.className = 'upload-feedback';
    feedback.textContent = 'Default placeholder dataset restored.';

    updateDashboard();
  });
}

/**
 * Parses CSV text with columns:
 * channels, sampling_rate_hz, sensitivity_pct, extra_referrals_per_100_healthy
 */
function parseResultsCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must have a header line followed by at least one data row.');
  }

  // Parse header
  const headerParts = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const reqCols = ['channels', 'sampling_rate_hz', 'sensitivity_pct', 'extra_referrals_per_100_healthy'];
  
  // Verify all required column names are present
  for (const col of reqCols) {
    if (!headerParts.includes(col)) {
      throw new Error(`Missing required column "${col}". Expected header: ${reqCols.join(', ')}`);
    }
  }

  const colIdx = {
    channels: headerParts.indexOf('channels'),
    sampling_rate_hz: headerParts.indexOf('sampling_rate_hz'),
    sensitivity_pct: headerParts.indexOf('sensitivity_pct'),
    extra_referrals_per_100_healthy: headerParts.indexOf('extra_referrals_per_100_healthy')
  };

  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(val => val.trim().replace(/['"]/g, ''));
    if (row.length < headerParts.length) continue;

    const channels = parseInt(row[colIdx.channels], 10);
    const samplingRate = parseInt(row[colIdx.sampling_rate_hz], 10);
    const sensitivity = parseFloat(row[colIdx.sensitivity_pct]);
    const referrals = parseFloat(row[colIdx.extra_referrals_per_100_healthy]);

    if (isNaN(channels) || isNaN(samplingRate) || isNaN(sensitivity) || isNaN(referrals)) {
      throw new Error(`Invalid numeric data on row ${i + 1}.`);
    }

    parsed.push({
      channels: channels,
      sampling_rate_hz: samplingRate,
      sensitivity_pct: sensitivity,
      extra_referrals_per_100_healthy: referrals
    });
  }

  return parsed;
}

// ============================================================================
// 7. UTILITY & ACTION BUTTONS
// ============================================================================

/**
 * Binds header and panel action buttons.
 */
function initActionButtons() {
  // 1. Reset Costs to Default Model
  const btnResetCosts = document.getElementById('btnResetCosts');
  if (btnResetCosts) {
    btnResetCosts.addEventListener('click', () => {
      COSTS = JSON.parse(JSON.stringify(DEFAULT_COSTS));
      initCostInputs();
      updateDashboard();
    });
  }

  // 2. Global Reset Defaults
  const btnResetAll = document.getElementById('btnResetAll');
  if (btnResetAll) {
    btnResetAll.addEventListener('click', () => {
      // Reset sliders
      document.getElementById('sliderSensitivity').value = 85;
      document.getElementById('sliderReferrals').value = 30;
      document.getElementById('toggleNoise').checked = false;

      state.minSensitivity = 85;
      state.maxReferrals = 30;
      state.simulateNoise = false;
      document.getElementById('valSensitivity').textContent = '85%';
      document.getElementById('patientsCaughtDisplay').textContent = '85';
      document.getElementById('valReferrals').textContent = '30 / 100';

      // Reset costs
      COSTS = JSON.parse(JSON.stringify(DEFAULT_COSTS));
      initCostInputs();

      // Reset data
      RESULTS = JSON.parse(JSON.stringify(DEFAULT_RESULTS));
      document.getElementById('bannerText').textContent = 'ILLUSTRATIVE MOCKUP. Placeholder numbers, not real results.';
      document.getElementById('datasetNameContainer').classList.add('hidden');
      document.getElementById('btnReloadPlaceholder').classList.add('hidden');
      document.getElementById('uploadFeedback').textContent = '';

      updateDashboard();
    });
  }

  // 3. Print / Save PDF
  const btnPrint = document.getElementById('btnPrint');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // 4. Download Sample CSV Template
  const btnDownloadSample = document.getElementById('btnDownloadSample');
  if (btnDownloadSample) {
    btnDownloadSample.addEventListener('click', () => {
      downloadSampleCsv();
    });
  }
}

/**
 * Generates and downloads a clean sample CSV template.
 */
function downloadSampleCsv() {
  const csvContent = [
    'channels,sampling_rate_hz,sensitivity_pct,extra_referrals_per_100_healthy',
    '19,500,93.5,12.0',
    '19,250,92.0,14.2',
    '19,125,89.8,16.5',
    '19,62,83.5,22.0',
    '8,500,90.5,15.0',
    '8,250,89.0,17.5',
    '8,125,86.5,20.0',
    '8,62,80.2,26.5',
    '4,500,87.2,21.0',
    '4,250,85.8,23.5',
    '4,125,82.0,27.2',
    '4,62,74.8,34.0',
    '2,500,82.0,28.0',
    '2,250,79.5,31.0',
    '2,125,73.8,38.5',
    '2,62,66.5,47.0'
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'neurospec_results_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
