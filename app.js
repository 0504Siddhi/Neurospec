/**
 * app.js — NeuroSpec Core Dashboard Controller
 * 
 * ============================================================================
 * OVERVIEW:
 * Powers the NeuroSpec single-page dashboard.
 * - Reactive state: constraints (sensitivity, referrals), camp simulation parameters.
 * - Best-value options (Pareto optimization): detects specs not beaten on cost & sensitivity.
 * - Recommendation engine: deterministic tie-break for equal cost.
 * - Camp calculator: computes detected cases, false referrals, precision, and hardware budget.
 * - Chart.js visualization: step line connecting real best-value points, distinct shapes & colors,
 *   direct channel count labels.
 * - Grouped specification matrix: channel groupings with expandable sampling rate sub-rows,
 *   explicit failure reasons, ± standard deviation display.
 * ============================================================================
 */

// Global Dashboard State
const state = {
  minSensitivity: 75,          // Default 75% min sensitivity (Phase 1)
  maxReferrals: 30,            // Default 30 max extra referrals per 100 healthy (Phase 1)
  simulateNoise: false,        // Illustrative toggle: lowers sensitivity by 4.0%
  noisePenalty: 4.0,           // Constant penalty amount when noise is simulated
  isDemoData: false,           // Default false: load real run results by default (Phase 1)
  sortColumn: 'cost',          // Active column for sorting specs table
  sortAscending: true,         // Sort direction
  chart: null,                 // Chart.js instance reference
  customFileName: null,        // Name of uploaded CSV file (if any)
  datasetTitle: 'ds004504 (Real Run)',
  expandedChannels: { 8: true }, // Default expand 8-channel group in table
  
  // Camp Calculator parameters (Phase 3)
  campSeniors: 1000,
  campDementiaRate: 7.4,
  campHeadsets: 100
};

// ============================================================================
// 1. INITIALIZATION & DOM BINDINGS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Ensure default results are set to real data on start
  RESULTS = JSON.parse(JSON.stringify(REAL_RESULTS));
  
  // Bind UI control elements
  initControls();
  
  // Populate cost inputs from default model
  initCostInputs();

  // Bind Camp Calculator inputs
  initCampCalculatorInputs();

  // Attach CSV upload and download listeners
  initCsvHandlers();
  
  // Attach quick action listeners and presets
  initActionButtons();

  // Update banner text for real data default
  updateBanner();

  // Initial dashboard calculation & render
  updateDashboard();
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
    updateSliderDisplays();
    updateDashboard();
  });

  // Extra Referrals Slider Listener
  sliderReferrals.addEventListener('input', (e) => {
    state.maxReferrals = Number(e.target.value);
    updateSliderDisplays();
    updateDashboard();
  });

  // Simulate Noisier Sensors Toggle Listener
  if (toggleNoise) {
    toggleNoise.addEventListener('change', (e) => {
      state.simulateNoise = e.target.checked;
      updateDashboard();
    });
  }

  updateSliderDisplays();
}

/**
 * Updates text next to and below sliders.
 */
function updateSliderDisplays() {
  const valSens = document.getElementById('valSensitivity');
  const sensDesc = document.getElementById('sensitivityMeaningDesc');
  const valRef = document.getElementById('valReferrals');
  const refDesc = document.getElementById('referralsMeaningDesc');

  if (valSens) valSens.textContent = `${state.minSensitivity}%`;
  if (sensDesc) {
    const missed = 100 - state.minSensitivity;
    sensDesc.textContent = `${state.minSensitivity}% = up to ${missed} of 100 dementia patients missed`;
  }

  if (valRef) valRef.textContent = `${state.maxReferrals} / 100 healthy`;
  if (refDesc) {
    refDesc.textContent = `${state.maxReferrals} = up to ${state.maxReferrals} healthy seniors per 100 sent for clinic follow-up`;
  }
}

/**
 * Connects Camp Calculator inputs.
 */
function initCampCalculatorInputs() {
  const inputSeniors = document.getElementById('calcSeniorsScreened');
  const inputRate = document.getElementById('calcDementiaRate');
  const inputHeadsets = document.getElementById('calcHeadsets');

  if (inputSeniors) {
    inputSeniors.addEventListener('input', (e) => {
      state.campSeniors = Math.max(1, Number(e.target.value) || 1000);
      updateDashboard();
    });
  }
  if (inputRate) {
    inputRate.addEventListener('input', (e) => {
      state.campDementiaRate = Math.max(0.1, Math.min(100, Number(e.target.value) || 7.4));
      updateDashboard();
    });
  }
  if (inputHeadsets) {
    inputHeadsets.addEventListener('input', (e) => {
      state.campHeadsets = Math.max(1, Number(e.target.value) || 100);
      updateDashboard();
    });
  }
}

/**
 * Initializes editable cost input fields.
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

/**
 * Updates top banner based on active dataset (real run vs demo vs uploaded CSV).
 */
function updateBanner() {
  const badge = document.getElementById('bannerBadge');
  const text = document.getElementById('bannerText');
  const btnToggle = document.getElementById('btnToggleDataSource');
  const datasetNameContainer = document.getElementById('datasetNameContainer');

  if (state.customFileName) {
    if (badge) badge.textContent = 'UPLOADED CSV';
    if (text) text.textContent = `Loaded from file: ${state.customFileName}`;
    if (datasetNameContainer) datasetNameContainer.classList.remove('hidden');
    if (btnToggle) btnToggle.textContent = 'Restore real run data';
  } else if (state.isDemoData) {
    if (badge) badge.textContent = 'DEMO DATA';
    if (text) text.textContent = 'DEMO DATA, not measured';
    if (datasetNameContainer) datasetNameContainer.classList.add('hidden');
    if (btnToggle) btnToggle.textContent = 'Load real run data';
  } else {
    if (badge) badge.textContent = 'REAL RUN';
    if (text) text.textContent = 'Real run: ds004504, 88 people, cross-validated. Pre-screen support, not a diagnosis.';
    if (datasetNameContainer) datasetNameContainer.classList.add('hidden');
    if (btnToggle) btnToggle.textContent = 'Load demo data';
  }
}

// ============================================================================
// 2. MATHEMATICAL & LOGICAL CALCULATIONS
// ============================================================================

/**
 * Evaluates all specs against current cost model, noise settings, and constraints.
 */
function evaluateSpecifications() {
  const penalty = state.simulateNoise ? state.noisePenalty : 0;

  // 1. Calculate effective metrics for each specification
  const evaluated = RESULTS.map((spec, index) => {
    const effectiveSensitivity = Math.max(0, Number((spec.sensitivity_pct - penalty).toFixed(1)));
    const cost = calculateSpecCost(spec.channels, spec.sampling_rate_hz);
    const referrals = Number(spec.extra_referrals_per_100_healthy);
    
    // Check constraints
    const meetsSensitivity = effectiveSensitivity >= state.minSensitivity;
    const meetsReferrals = referrals <= state.maxReferrals;
    const meetsLimits = meetsSensitivity && meetsReferrals;

    // Reason for failure (Phase 1 #5)
    let failureReason = '';
    if (!meetsLimits) {
      const sensShortfall = (state.minSensitivity - effectiveSensitivity).toFixed(1);
      const refExcess = (referrals - state.maxReferrals).toFixed(1);

      if (!meetsSensitivity && !meetsReferrals) {
        failureReason = `Fails both: misses sens by ${sensShortfall} pts, referrals +${refExcess}`;
      } else if (!meetsSensitivity) {
        failureReason = `Misses sensitivity by ${sensShortfall} pts (${effectiveSensitivity}% < ${state.minSensitivity}%)`;
      } else {
        failureReason = `Too many referrals by +${refExcess} (${referrals} > ${state.maxReferrals})`;
      }
    }

    return {
      id: index,
      channels: spec.channels,
      sampling_rate_hz: spec.sampling_rate_hz,
      raw_sensitivity: spec.sensitivity_pct,
      sensitivity_std: spec.sensitivity_std || null,
      effective_sensitivity: effectiveSensitivity,
      extra_referrals: referrals,
      extra_referrals_std: spec.extra_referrals_std || null,
      cost: cost,
      meetsSensitivity,
      meetsReferrals,
      meetsLimits,
      failureReason,
      isPareto: false
    };
  });

  // 2. Compute Pareto Frontier (Best-Value Options: Cost vs. Sensitivity)
  // Dominated if another spec has Cost(B) <= Cost(A) and Sens(B) >= Sens(A) with at least one strict inequality.
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
 * Prioritizes lowest cost among specs meeting both constraints.
 * Tie-break rule (Phase 2 #8):
 * 1. Lower cost
 * 2. Higher sensitivity
 * 3. Fewer referrals
 * 4. Lower sampling rate
 */
function findRecommendation(evaluatedSpecs) {
  const qualifyingSpecs = evaluatedSpecs.filter(s => s.meetsLimits);

  if (qualifyingSpecs.length > 0) {
    qualifyingSpecs.sort((a, b) => {
      // 1. Lower cost
      if (a.cost !== b.cost) return a.cost - b.cost;
      // 2. Higher sensitivity
      if (b.effective_sensitivity !== a.effective_sensitivity) {
        return b.effective_sensitivity - a.effective_sensitivity;
      }
      // 3. Fewer referrals
      if (a.extra_referrals !== b.extra_referrals) {
        return a.extra_referrals - b.extra_referrals;
      }
      // 4. Deterministic sampling rate: higher sampling rate preferred when tied
      return b.sampling_rate_hz - a.sampling_rate_hz;
    });

    return {
      success: true,
      spec: qualifyingSpecs[0],
      totalQualifying: qualifyingSpecs.length
    };
  }

  // Fallback (Phase 1 #3): No spec meets both limits. Find the closest option.
  let closestSpec = null;
  let lowestPenalty = Infinity;

  evaluatedSpecs.forEach(spec => {
    const sensShortfall = Math.max(0, state.minSensitivity - spec.effective_sensitivity);
    const refExcess = Math.max(0, spec.extra_referrals - state.maxReferrals);
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

  renderRecommendationCard(recommendation, evaluatedSpecs);
  renderCampCalculator(recommendation.spec);
  renderScatterChart(evaluatedSpecs);
  renderComparisonTable(evaluatedSpecs, recommendation.spec);
}

/**
 * Renders Hero Recommendation Block with Cost Gaps and Exclusions Note.
 */
function renderRecommendationCard(recResult, allSpecs) {
  const card = document.getElementById('recommendationCard');
  if (!card) return;

  if (recResult.success) {
    const spec = recResult.spec;
    card.className = 'recommendation-block';

    // Calculate cost gaps against benchmark specs (Phase 2 #7)
    const spec19 = allSpecs.find(s => s.channels === 19);
    const cost19 = spec19 ? spec19.cost : 23224;
    const savingsVs19 = cost19 - spec.cost;

    const cheaperSpecs = allSpecs.filter(s => s.cost < spec.cost);
    let cheaperNote = '';
    if (cheaperSpecs.length > 0) {
      // Find highest sensitivity among cheaper specs
      const nextCheaper = cheaperSpecs.sort((a, b) => b.cost - a.cost)[0];
      const costDiff = spec.cost - nextCheaper.cost;
      cheaperNote = `The cheaper alternative (${nextCheaper.channels} channels at ₹${nextCheaper.cost.toLocaleString('en-IN')}, saving ₹${costDiff.toLocaleString('en-IN')}) fails your limits: ${nextCheaper.failureReason.toLowerCase()}.`;
    } else {
      cheaperNote = 'This is the lowest-cost configuration available in the evaluation matrix.';
    }

    card.innerHTML = `
      <div class="rec-meta-row">
        <span class="rec-kicker">Recommended Specification</span>
        <span class="rec-tag">Qualifies on limits</span>
      </div>

      <h2 class="rec-headline">
        ${spec.channels} Channels @ ${spec.sampling_rate_hz} Hz &mdash; ₹${spec.cost.toLocaleString('en-IN')} (chip + electrodes only)
      </h2>

      <div class="rec-gap-highlight">
        <strong>Cost Advantage:</strong> Saves <strong>₹${savingsVs19.toLocaleString('en-IN')} per unit</strong> compared to a 19-channel clinical montage. ${cheaperNote}
      </div>

      <p class="rec-plain-sentence">
        At your specified targets (min ${state.minSensitivity}% sensitivity, max ${state.maxReferrals} referrals per 100 healthy), 
        <strong>${spec.channels} channels at ${spec.sampling_rate_hz} Hz</strong> provides the optimal balance. 
        Sampling rate does not alter hardware cost in this model.
      </p>

      <div class="rec-exclusions-note">
        * Cost excludes PCB, enclosure, battery, leads, and reference/bias electrodes.
      </div>

      <div class="rec-metrics-row">
        <div class="rec-metric-item">
          <span class="rec-metric-label">Screening Sensitivity</span>
          <span class="rec-metric-val">${spec.effective_sensitivity}%</span>
          <span class="rec-metric-sub">${spec.sensitivity_std ? `±${spec.sensitivity_std}% SD` : 'Patients flagged'}</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Extra Referrals</span>
          <span class="rec-metric-val">${spec.extra_referrals}</span>
          <span class="rec-metric-sub">${spec.extra_referrals_std ? `±${spec.extra_referrals_std} SD` : 'per 100 healthy'}</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Unit Cost (Headline)</span>
          <span class="rec-metric-val">₹${spec.cost.toLocaleString('en-IN')}</span>
          <span class="rec-metric-sub">chip + electrodes</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Best-Value Option</span>
          <span class="rec-metric-val">${spec.isPareto ? 'Yes' : 'No'}</span>
          <span class="rec-metric-sub">${spec.isPareto ? 'On Pareto frontier' : 'Dominated'}</span>
        </div>
      </div>
    `;
  } else {
    // Empty state (Phase 1 #3)
    const closest = recResult.spec;
    card.className = 'recommendation-block fallback-mode';

    let missExplanation = '';
    const sensShortfall = (state.minSensitivity - closest.effective_sensitivity).toFixed(1);
    const refExcess = (closest.extra_referrals - state.maxReferrals).toFixed(1);

    if (!closest.meetsSensitivity && !closest.meetsReferrals) {
      missExplanation = `Misses sensitivity by ${sensShortfall} pts and too many referrals by +${refExcess}`;
    } else if (!closest.meetsSensitivity) {
      missExplanation = `Misses sensitivity by ${sensShortfall} pts`;
    } else {
      missExplanation = `Too many referrals by +${refExcess}`;
    }

    card.innerHTML = `
      <div class="rec-meta-row">
        <span class="rec-kicker rec-kicker-warn">No spec meets your limits</span>
      </div>

      <h2 class="rec-headline">
        No spec meets your limits &mdash; Closest option: ${closest.channels} Channels @ ${closest.sampling_rate_hz} Hz (₹${closest.cost.toLocaleString('en-IN')} chip + electrodes)
      </h2>

      <p class="rec-plain-sentence">
        <strong>${missExplanation}.</strong> 
        Achieved sensitivity is <strong>${closest.effective_sensitivity}%</strong> (target: &ge;${state.minSensitivity}%) 
        with <strong>${closest.extra_referrals} extra referrals</strong> per 100 healthy (ceiling: &le;${state.maxReferrals}).
        Consider relaxing constraints or choosing the closest option.
      </p>

      <div class="rec-metrics-row">
        <div class="rec-metric-item">
          <span class="rec-metric-label">Closest Sensitivity</span>
          <span class="rec-metric-val">${closest.effective_sensitivity}%</span>
          <span class="rec-metric-sub">Target was ${state.minSensitivity}%</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Referrals / 100 healthy</span>
          <span class="rec-metric-val">${closest.extra_referrals}</span>
          <span class="rec-metric-sub">Ceiling was ${state.maxReferrals}</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Unit Cost</span>
          <span class="rec-metric-val">₹${closest.cost.toLocaleString('en-IN')}</span>
          <span class="rec-metric-sub">chip + electrodes</span>
        </div>
        <div class="rec-metric-item">
          <span class="rec-metric-label">Shortfall</span>
          <span class="rec-metric-val">${missExplanation.replace('Misses sensitivity by ', '-')}</span>
          <span class="rec-metric-sub">Gap to requirement</span>
        </div>
      </div>
    `;
  }
}

/**
 * SECTION: Camp Calculator (Phase 3 Main Feature)
 * Inputs: Seniors screened (N), Assumed dementia rate (p), Headsets (H)
 * Outputs: Cases caught, healthy referred, precision (% dementia), total hardware cost.
 */
function renderCampCalculator(selectedSpec) {
  if (!selectedSpec) return;

  const targetTag = document.getElementById('calcTargetSpecTag');
  if (targetTag) {
    targetTag.textContent = `${selectedSpec.channels} Channels @ ${selectedSpec.sampling_rate_hz} Hz (₹${selectedSpec.cost.toLocaleString('en-IN')})`;
  }

  const N = state.campSeniors;
  const p = state.campDementiaRate / 100; // e.g. 0.074
  const H = state.campHeadsets;

  // True population counts
  const totalDementia = N * p;
  const totalHealthy = N * (1 - p);

  // Screening performance for selected spec
  const sensitivity = selectedSpec.effective_sensitivity / 100;
  const referralRatePerHealthy = selectedSpec.extra_referrals / 100;

  const patientsCaught = Math.round(totalDementia * sensitivity);
  const healthyReferred = Math.round(totalHealthy * referralRatePerHealthy);
  const totalReferrals = patientsCaught + healthyReferred;

  // Precision: fraction of referrals who truly have dementia
  const precision = totalReferrals > 0 ? (patientsCaught / totalReferrals) : 0;
  const precisionPct = (precision * 100).toFixed(1);
  
  // Ratio format: "about 1 in X referrals has dementia"
  const ratioX = precision > 0 ? Math.round(1 / precision) : 0;
  const ratioText = ratioX > 0 ? `about 1 in ${ratioX}` : '0 in 1';

  // Total hardware investment
  const totalHardware = H * selectedSpec.cost;

  // Update plain sentence output (Phase 3 #13)
  const sentenceBox = document.getElementById('calcResultSentence');
  if (sentenceBox) {
    sentenceBox.innerHTML = `
      <strong>Screening Projection:</strong> Catches about <strong>${patientsCaught}</strong>, 
      sends about <strong>${healthyReferred}</strong> healthy people to clinics; 
      <strong>${ratioText}</strong> referrals has dementia (${precisionPct}% precision). 
      Total hardware: <strong>₹${totalHardware.toLocaleString('en-IN')}</strong> (chip + electrodes only).
    `;
  }

  // Update granular cards
  const caughtVal = document.getElementById('calcCaughtVal');
  const caughtSub = document.getElementById('calcCaughtSub');
  const referredVal = document.getElementById('calcReferredVal');
  const referredSub = document.getElementById('calcReferredSub');
  const precVal = document.getElementById('calcPrecisionVal');
  const precSub = document.getElementById('calcPrecisionSub');
  const hwVal = document.getElementById('calcTotalHardwareVal');
  const hwSub = document.getElementById('calcTotalHardwareSub');

  if (caughtVal) caughtVal.textContent = patientsCaught.toLocaleString();
  if (caughtSub) caughtSub.textContent = `of ~${Math.round(totalDementia)} true cases (${(sensitivity * 100).toFixed(1)}%)`;

  if (referredVal) referredVal.textContent = healthyReferred.toLocaleString();
  if (referredSub) referredSub.textContent = `from ${Math.round(totalHealthy)} healthy (${(referralRatePerHealthy * 100).toFixed(1)}%)`;

  if (precVal) precVal.textContent = `${precisionPct}%`;
  if (precSub) precSub.textContent = `${ratioText} clinic referrals`;

  if (hwVal) hwVal.textContent = `₹${totalHardware.toLocaleString('en-IN')}`;
  if (hwSub) hwSub.textContent = `${H} headsets @ ₹${selectedSpec.cost.toLocaleString('en-IN')}`;
}

// ============================================================================
// 4. CHART.JS SCATTER & BEST-VALUE (PARETO) PLOT
// ============================================================================

/**
 * Custom Chart.js plugin to draw horizontal minimum sensitivity target line.
 */
const targetLinePlugin = {
  id: 'targetLinePlugin',
  afterDraw: (chart) => {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y) return;

    const yVal = scales.y.getPixelForValue(state.minSensitivity);
    
    if (yVal >= chartArea.top && yVal <= chartArea.bottom) {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#B5532A'; // Burnt orange line
      ctx.lineWidth = 1.5;
      ctx.moveTo(chartArea.left, yVal);
      ctx.lineTo(chartArea.right, yVal);
      ctx.stroke();

      ctx.fillStyle = '#B5532A';
      ctx.font = '500 11px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Target: ${state.minSensitivity}% min`, chartArea.right - 8, yVal - 4);
      ctx.restore();
    }
  }
};

/**
 * Custom Chart.js plugin to draw channel labels next to each point (Phase 4 #17).
 */
const channelLabelPlugin = {
  id: 'channelLabelPlugin',
  afterDatasetsDraw: (chart) => {
    const { ctx, scales } = chart;
    if (!scales.x || !scales.y) return;

    ctx.save();
    ctx.font = '600 10.5px IBM Plex Mono, monospace';
    ctx.fillStyle = '#1F2933';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Track drawn positions to avoid overlapping duplicate channel labels at same point
    const drawn = new Set();

    chart.data.datasets.forEach(dataset => {
      if (dataset.type !== 'scatter') return;
      dataset.data.forEach(pt => {
        const raw = pt.rawSpec;
        if (!raw) return;
        const key = `${pt.x}_${pt.y}`;
        if (drawn.has(key)) return;
        drawn.add(key);

        const xPx = scales.x.getPixelForValue(pt.x);
        const yPx = scales.y.getPixelForValue(pt.y);

        ctx.fillText(`${raw.channels}ch`, xPx + 10, yPx - 2);
      });
    });

    ctx.restore();
  }
};

/**
 * Renders Chart.js scatter plot with stepped Pareto line and distinct shapes/colors.
 */
function renderScatterChart(evaluatedSpecs) {
  const canvas = document.getElementById('specScatterChart');
  if (!canvas) return;

  // Best-value (Pareto) points only (sorted by cost)
  const paretoSpecs = evaluatedSpecs.filter(s => s.isPareto).sort((a, b) => a.cost - b.cost);
  
  // Real spec points for connecting line (No interpolated points, Phase 2 #9)
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
      // Step line connecting real best-value points (Phase 2 #9)
      {
        type: 'line',
        label: 'Best-Value Step Line',
        data: paretoLineData,
        showLine: true,
        stepped: 'before',
        fill: false,
        borderColor: '#B5532A',
        borderWidth: 1.75,
        pointRadius: 0,
        hoverRadius: 0,
        order: 3
      },
      // Best-Value (Meets limits): Burnt orange solid star (Phase 4 #17)
      {
        type: 'scatter',
        label: 'Best-Value (Meets Limits)',
        data: paretoQualPoints,
        backgroundColor: '#B5532A',
        borderColor: '#B5532A',
        borderWidth: 1.5,
        pointRadius: 8,
        pointHoverRadius: 11,
        pointStyle: 'star',
        order: 1
      },
      // Best-Value (Outside limits): Burnt orange hollow triangle (Phase 4 #17)
      {
        type: 'scatter',
        label: 'Best-Value (Outside Limits)',
        data: paretoFailPoints,
        backgroundColor: '#F6F3EC',
        borderColor: '#B5532A',
        borderWidth: 2,
        pointRadius: 8,
        pointHoverRadius: 11,
        pointStyle: 'triangle',
        order: 1
      },
      // Standard (Meets limits): Deep teal filled rectangle/square
      {
        type: 'scatter',
        label: 'Meets Limits',
        data: qualifiedPoints,
        backgroundColor: '#1F6F6B',
        borderColor: '#1F6F6B',
        borderWidth: 1,
        pointRadius: 6,
        pointHoverRadius: 9,
        pointStyle: 'rectRot',
        order: 2
      },
      // Standard (Outside limits): Muted grey hollow circle
      {
        type: 'scatter',
        label: 'Outside Limits',
        data: failingPoints,
        backgroundColor: '#FAF8F5',
        borderColor: '#6E695F',
        borderWidth: 1.5,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointStyle: 'circle',
        order: 2
      }
    ]
  };

  if (state.chart) {
    state.chart.data = chartData;
    state.chart.update('none');
    return;
  }

  const ctx = canvas.getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'scatter',
    data: chartData,
    plugins: [targetLinePlugin, channelLabelPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: true
      },
      plugins: {
        legend: {
          display: false
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
              const sdSens = raw.sensitivity_std ? ` ±${raw.sensitivity_std}% SD` : '';
              const sdRef = raw.extra_referrals_std ? ` ±${raw.extra_referrals_std} SD` : '';
              return [
                `Est. Cost: ₹${raw.cost.toLocaleString('en-IN')} (chip + electrodes)`,
                `Sensitivity: ${raw.effective_sensitivity}%${sdSens}`,
                `Extra Referrals: ${raw.extra_referrals}${sdRef} per 100 healthy`,
                `Status: ${raw.meetsLimits ? 'Qualifies' : raw.failureReason}`,
                `Best-Value Option: ${raw.isPareto ? 'Yes (on frontier)' : 'No'}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Unit Hardware Cost — Chip + Electrodes (INR ₹)',
            font: { family: 'IBM Plex Sans, sans-serif', size: 12, weight: '500' },
            color: '#36332E'
          },
          grid: {
            color: '#E2DDD5',
            borderDash: [2, 2],
            drawBorder: false
          },
          ticks: {
            font: { family: 'IBM Plex Mono, monospace', size: 11 },
            color: '#36332E',
            callback: (val) => '₹' + Number(val).toLocaleString('en-IN')
          }
        },
        y: {
          title: {
            display: true,
            text: 'Screening Sensitivity (%)',
            font: { family: 'IBM Plex Sans, sans-serif', size: 12, weight: '500' },
            color: '#36332E'
          },
          min: 65,
          max: 98,
          grid: {
            color: '#E2DDD5',
            borderDash: [2, 2],
            drawBorder: false
          },
          ticks: {
            stepSize: 5,
            font: { family: 'IBM Plex Mono, monospace', size: 11 },
            color: '#36332E',
            callback: (val) => val + '%'
          }
        }
      }
    }
  });
}

// ============================================================================
// 5. COMPARISON TABLE RENDERING (GROUPED WITH EXPANDABLE SUB-ROWS)
// ============================================================================

/**
 * Groups specs by channel count and renders primary rows with expandable sub-rows.
 */
function renderComparisonTable(evaluatedSpecs, recommendedSpec) {
  const tbody = document.getElementById('specsTableBody');
  const countBadge = document.getElementById('qualifyingCountBadge');
  if (!tbody) return;

  const qualifyingCount = evaluatedSpecs.filter(s => s.meetsLimits).length;
  countBadge.textContent = `${qualifyingCount} of ${evaluatedSpecs.length} qualify`;

  // Group by channel count (19, 8, 4, 2)
  const channelGroups = {};
  evaluatedSpecs.forEach(spec => {
    if (!channelGroups[spec.channels]) {
      channelGroups[spec.channels] = [];
    }
    channelGroups[spec.channels].push(spec);
  });

  // Unique channel counts sorted
  let channelKeys = Object.keys(channelGroups).map(Number);
  if (state.sortColumn === 'channels') {
    channelKeys.sort((a, b) => state.sortAscending ? a - b : b - a);
  } else if (state.sortColumn === 'cost') {
    channelKeys.sort((a, b) => {
      const costA = channelGroups[a][0].cost;
      const costB = channelGroups[b][0].cost;
      return state.sortAscending ? costA - costB : costB - costA;
    });
  } else {
    // Default channels descending (19, 8, 4, 2)
    channelKeys.sort((a, b) => b - a);
  }

  let html = '';

  channelKeys.forEach(ch => {
    const specsInGroup = channelGroups[ch];
    // Sort sub-rates (default rate descending: 500, 250, 125)
    specsInGroup.sort((a, b) => b.sampling_rate_hz - a.sampling_rate_hz);

    const isExpanded = !!state.expandedChannels[ch];
    const groupHasRecommended = recommendedSpec && (recommendedSpec.channels === ch);
    const qualifyingInGroup = specsInGroup.filter(s => s.meetsLimits).length;
    const primarySpec = specsInGroup[0]; // 500 Hz spec or representative

    const groupRowClass = groupHasRecommended ? 'row-recommended group-header-row' : 'group-header-row';
    const chevron = isExpanded ? '&#9660;' : '&#9654;';

    // Primary group row
    html += `
      <tr class="${groupRowClass}" data-channel="${ch}">
        <td class="col-expand">
          <button class="btn-expand-toggle" data-channel="${ch}" title="Toggle sampling rates for ${ch} channels" aria-expanded="${isExpanded}">
            <span class="expand-icon">${chevron}</span>
          </button>
        </td>
        <td class="col-num font-bold">
          ${ch} Channels
          ${groupHasRecommended ? '<span class="best-rec-indicator">Recommended</span>' : ''}
        </td>
        <td class="col-num font-mono">
          ${primarySpec.sampling_rate_hz} Hz <span class="sub-rate-hint">(${specsInGroup.length} rates)</span>
        </td>
        <td class="col-num font-mono">₹${primarySpec.cost.toLocaleString('en-IN')}</td>
        <td class="col-num font-mono">
          ${primarySpec.effective_sensitivity}%
          ${primarySpec.sensitivity_std ? `<span class="sd-text">±${primarySpec.sensitivity_std}%</span>` : ''}
        </td>
        <td class="col-num font-mono">
          ${primarySpec.extra_referrals}
          ${primarySpec.extra_referrals_std ? `<span class="sd-text">±${primarySpec.extra_referrals_std}</span>` : ''}
        </td>
        <td class="col-status">
          ${primarySpec.meetsLimits 
            ? `<span class="status-qualifies">✓ Qualifies</span>` 
            : `<span class="status-fails">${primarySpec.failureReason}</span>`}
          ${primarySpec.isPareto ? '<span class="table-pareto-tag">[Best-Value]</span>' : ''}
        </td>
      </tr>
    `;

    // Expandable sub-rows for all sampling rates
    if (isExpanded) {
      specsInGroup.forEach((spec, idx) => {
        const isRecSub = recommendedSpec && (spec.channels === recommendedSpec.channels && spec.sampling_rate_hz === recommendedSpec.sampling_rate_hz);
        const subRowClass = `sub-row ${isRecSub ? 'sub-row-recommended' : ''}`;

        html += `
          <tr class="${subRowClass}">
            <td class="col-expand sub-indent-cell">&boxur;</td>
            <td class="col-num sub-text-muted">${spec.channels} ch</td>
            <td class="col-num font-mono font-bold">${spec.sampling_rate_hz} Hz</td>
            <td class="col-num font-mono">₹${spec.cost.toLocaleString('en-IN')}</td>
            <td class="col-num font-mono">
              ${spec.effective_sensitivity}%
              ${spec.sensitivity_std ? `<span class="sd-text">±${spec.sensitivity_std}%</span>` : ''}
            </td>
            <td class="col-num font-mono">
              ${spec.extra_referrals}
              ${spec.extra_referrals_std ? `<span class="sd-text">±${spec.extra_referrals_std}</span>` : ''}
            </td>
            <td class="col-status">
              ${spec.meetsLimits 
                ? `<span class="status-qualifies">✓ Qualifies</span>` 
                : `<span class="status-fails">${spec.failureReason}</span>`}
              ${spec.isPareto ? '<span class="table-pareto-tag">[Best-Value]</span>' : ''}
            </td>
          </tr>
        `;
      });
    }
  });

  tbody.innerHTML = html;

  // Bind row expansion click handlers
  tbody.querySelectorAll('.btn-expand-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ch = Number(btn.getAttribute('data-channel'));
      state.expandedChannels[ch] = !state.expandedChannels[ch];
      renderComparisonTable(evaluatedSpecs, recommendedSpec);
    });
  });

  // Allow clicking anywhere on group header row to toggle
  tbody.querySelectorAll('.group-header-row').forEach(row => {
    row.addEventListener('click', () => {
      const ch = Number(row.getAttribute('data-channel'));
      state.expandedChannels[ch] = !state.expandedChannels[ch];
      renderComparisonTable(evaluatedSpecs, recommendedSpec);
    });
  });

  // Update header sort glyphs
  document.querySelectorAll('#specsTable th.sortable').forEach(th => {
    const col = th.getAttribute('data-sort');
    const indicator = th.querySelector('.sort-glyph');
    if (indicator) {
      if (col === state.sortColumn) {
        indicator.textContent = state.sortAscending ? '▲' : '▼';
        indicator.style.color = '#1F6F6B';
      } else {
        indicator.textContent = '↕';
        indicator.style.color = '#6E695F';
      }
    }
  });

  // Attach header sort click listeners (once)
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

function initCsvHandlers() {
  const fileInput = document.getElementById('csvFileInput');
  const feedback = document.getElementById('uploadFeedback');
  const datasetNameInput = document.getElementById('datasetNameInput');

  if (fileInput) {
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

          RESULTS = parsedRows;
          state.customFileName = file.name;
          state.datasetTitle = file.name.replace(/\.[^/.]+$/, "");
          state.isDemoData = false;

          updateBanner();

          if (feedback) {
            feedback.className = 'upload-feedback success';
            feedback.textContent = `✓ Successfully loaded ${parsedRows.length} specifications from "${file.name}".`;
          }

          updateDashboard();
        } catch (err) {
          if (feedback) {
            feedback.className = 'upload-feedback error';
            feedback.textContent = `Upload Error: ${err.message}`;
          }
        }
      };

      reader.readAsText(file);
    });
  }

  if (datasetNameInput) {
    datasetNameInput.addEventListener('input', (e) => {
      state.datasetTitle = e.target.value;
    });
  }
}

/**
 * Parses CSV text supporting standard columns and optional standard deviations.
 */
function parseResultsCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must have a header line followed by at least one data row.');
  }

  const headerParts = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const reqCols = ['channels', 'sampling_rate_hz', 'sensitivity_pct', 'extra_referrals_per_100_healthy'];
  
  for (const col of reqCols) {
    if (!headerParts.includes(col)) {
      throw new Error(`Missing required column "${col}". Expected header: ${reqCols.join(', ')}`);
    }
  }

  const colIdx = {
    channels: headerParts.indexOf('channels'),
    sampling_rate_hz: headerParts.indexOf('sampling_rate_hz'),
    sensitivity_pct: headerParts.indexOf('sensitivity_pct'),
    extra_referrals_per_100_healthy: headerParts.indexOf('extra_referrals_per_100_healthy'),
    sensitivity_std: headerParts.indexOf('sensitivity_std'),
    extra_referrals_std: headerParts.indexOf('extra_referrals_std')
  };

  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(val => val.trim().replace(/['"]/g, ''));
    if (row.length < headerParts.length) continue;

    const channels = parseInt(row[colIdx.channels], 10);
    const samplingRate = parseInt(row[colIdx.sampling_rate_hz], 10);
    const sensitivity = parseFloat(row[colIdx.sensitivity_pct]);
    const referrals = parseFloat(row[colIdx.extra_referrals_per_100_healthy]);
    const sensStd = colIdx.sensitivity_std !== -1 ? parseFloat(row[colIdx.sensitivity_std]) : null;
    const refStd = colIdx.extra_referrals_std !== -1 ? parseFloat(row[colIdx.extra_referrals_std]) : null;

    if (isNaN(channels) || isNaN(samplingRate) || isNaN(sensitivity) || isNaN(referrals)) {
      throw new Error(`Invalid numeric data on row ${i + 1}.`);
    }

    parsed.push({
      channels: channels,
      sampling_rate_hz: samplingRate,
      sensitivity_pct: sensitivity,
      sensitivity_std: !isNaN(sensStd) ? sensStd : null,
      extra_referrals_per_100_healthy: referrals,
      extra_referrals_std: !isNaN(refStd) ? refStd : null
    });
  }

  return parsed;
}

// ============================================================================
// 7. UTILITY, PRESETS & ACTION BUTTONS
// ============================================================================

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
      state.minSensitivity = 75;
      state.maxReferrals = 30;
      state.simulateNoise = false;
      state.isDemoData = false;
      state.customFileName = null;
      state.campSeniors = 1000;
      state.campDementiaRate = 7.4;
      state.campHeadsets = 100;

      const sliderSens = document.getElementById('sliderSensitivity');
      const sliderRef = document.getElementById('sliderReferrals');
      const toggleNoise = document.getElementById('toggleNoise');
      const csvInput = document.getElementById('csvFileInput');
      const feedback = document.getElementById('uploadFeedback');

      if (sliderSens) sliderSens.value = 75;
      if (sliderRef) sliderRef.value = 30;
      if (toggleNoise) toggleNoise.checked = false;
      if (csvInput) csvInput.value = '';
      if (feedback) feedback.textContent = '';

      const inputSeniors = document.getElementById('calcSeniorsScreened');
      const inputRate = document.getElementById('calcDementiaRate');
      const inputHeadsets = document.getElementById('calcHeadsets');
      if (inputSeniors) inputSeniors.value = 1000;
      if (inputRate) inputRate.value = 7.4;
      if (inputHeadsets) inputHeadsets.value = 100;

      COSTS = JSON.parse(JSON.stringify(DEFAULT_COSTS));
      initCostInputs();

      RESULTS = JSON.parse(JSON.stringify(REAL_RESULTS));
      updateBanner();
      updateSliderDisplays();
      updateDashboard();
    });
  }

  // 3. Toggle Demo vs Real Data Button
  const btnToggle = document.getElementById('btnToggleDataSource');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      if (state.customFileName) {
        // Switch back to real run
        state.customFileName = null;
        state.isDemoData = false;
        RESULTS = JSON.parse(JSON.stringify(REAL_RESULTS));
      } else if (state.isDemoData) {
        // Switch to real run
        state.isDemoData = false;
        RESULTS = JSON.parse(JSON.stringify(REAL_RESULTS));
      } else {
        // Switch to demo data
        state.isDemoData = true;
        RESULTS = JSON.parse(JSON.stringify(DEMO_RESULTS));
      }

      updateBanner();
      updateDashboard();
    });
  }

  // 4. Presets (Phase 3 #14)
  const presetGeriatrician = document.getElementById('presetGeriatrician');
  const presetStrict = document.getElementById('presetStrict');
  const presetBudget = document.getElementById('presetBudget');

  if (presetGeriatrician) {
    presetGeriatrician.addEventListener('click', () => {
      state.minSensitivity = 80;
      state.maxReferrals = 30;
      document.getElementById('sliderSensitivity').value = 80;
      document.getElementById('sliderReferrals').value = 30;
      updateSliderDisplays();
      updateDashboard();
    });
  }

  if (presetStrict) {
    presetStrict.addEventListener('click', () => {
      state.minSensitivity = 90;
      state.maxReferrals = 25;
      document.getElementById('sliderSensitivity').value = 90;
      document.getElementById('sliderReferrals').value = 25;
      updateSliderDisplays();
      updateDashboard();
    });
  }

  if (presetBudget) {
    presetBudget.addEventListener('click', () => {
      state.minSensitivity = 75;
      state.maxReferrals = 50;
      document.getElementById('sliderSensitivity').value = 75;
      document.getElementById('sliderReferrals').value = 50;
      updateSliderDisplays();
      updateDashboard();
    });
  }

  // 5. Print / Save PDF
  const btnPrint = document.getElementById('btnPrint');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // 6. Download Sample CSV Template
  const btnDownloadSample = document.getElementById('btnDownloadSample');
  if (btnDownloadSample) {
    btnDownloadSample.addEventListener('click', () => {
      downloadSampleCsv();
    });
  }
}

/**
 * Downloads pre-formatted CSV template.
 */
function downloadSampleCsv() {
  const csvContent = [
    'channels,sampling_rate_hz,sensitivity_pct,extra_referrals_per_100_healthy',
    '19,500,78.0,23.8',
    '19,250,78.0,24.8',
    '19,125,78.0,24.8',
    '8,500,77.8,29.7',
    '8,250,77.8,29.7',
    '8,125,77.8,29.7',
    '4,500,78.5,45.5',
    '4,250,78.5,45.9',
    '4,125,78.5,45.9',
    '2,500,78.6,35.2',
    '2,250,78.6,34.8',
    '2,125,78.6,34.8'
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
