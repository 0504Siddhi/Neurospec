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
  
  // Camp Calculator parameters: illustrative district scenario (Maharashtra)
  campSeniors: 5000,
  campDementiaRate: 7.4,
  campHeadsets: 25,

  // Program Brief parameters
  briefLang: 'en',
  briefsData: null,
  briefsSource: 'template'
};

// ============================================================================
// 1. INITIALIZATION & DOM BINDINGS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Ensure default results are set to real data on start
  RESULTS = JSON.parse(JSON.stringify(REAL_RESULTS));
  
  // Check URL query parameters for demo testing
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('demo') === '1' || urlParams.get('demo') === 'true') {
    state.isDemoData = true;
    RESULTS = JSON.parse(JSON.stringify(DEMO_RESULTS));
  }

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

  // Initialize Program Brief panel
  initProgramBrief();

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
    sensDesc.textContent = `${missed} of 100 people with dementia would be missed`;
  }

  if (valRef) valRef.textContent = `${state.maxReferrals} / 100 healthy`;
  if (refDesc) {
    refDesc.textContent = `Up to ${state.maxReferrals} in 100 healthy seniors sent for unnecessary clinic follow-up`;
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
      state.campSeniors = Math.max(1, Number(e.target.value) || 5000);
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
      state.campHeadsets = Math.max(1, Number(e.target.value) || 25);
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
  const banner = document.getElementById('topBanner');
  const badge = document.getElementById('bannerBadge');
  const text = document.getElementById('bannerText');
  const btnToggle = document.getElementById('btnToggleDataSource');
  const datasetNameContainer = document.getElementById('datasetNameContainer');

  if (state.customFileName) {
    if (banner) banner.classList.remove('banner-demo-active');
    if (badge) badge.textContent = 'UPLOADED CSV';
    if (text) text.textContent = `Loaded from file: ${state.customFileName}`;
    if (datasetNameContainer) datasetNameContainer.classList.remove('hidden');
    if (btnToggle) btnToggle.textContent = 'Restore real run data';
  } else if (state.isDemoData) {
    // Persistent red banner when DEMO DATA is active (Task 1)
    if (banner) banner.classList.add('banner-demo-active');
    if (badge) badge.textContent = 'DEMO DATA (SYNTHETIC)';
    if (text) text.textContent = 'CAUTION: DEMO DATA ACTIVE — Illustrative placeholder numbers, not clinical run results.';
    if (datasetNameContainer) datasetNameContainer.classList.add('hidden');
    if (btnToggle) btnToggle.textContent = 'Exit demo data (return to real run)';
  } else {
    if (banner) banner.classList.remove('banner-demo-active');
    if (badge) badge.textContent = 'REAL RUN';
    if (text) text.textContent = 'Real run: ds004504, 88 people, cross-validated. Pre-screen support, not a diagnosis.';
    if (datasetNameContainer) datasetNameContainer.classList.add('hidden');
    if (btnToggle) btnToggle.textContent = 'Demo data';
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
 * Recommendation Rule (Task 3):
 * "Cheapest config whose sensitivity is within 1 SD of the best qualifying config".
 * Tie-break rule:
 * 1. Lower cost
 * 2. Higher sensitivity
 * 3. Fewer referrals
 * 4. Higher sampling rate
 */
function findRecommendation(evaluatedSpecs) {
  const qualifyingSpecs = evaluatedSpecs.filter(s => s.meetsLimits);

  if (qualifyingSpecs.length > 0) {
    // 1. Identify the best qualifying config (highest sensitivity; tie-breaker: fewer referrals, lower cost)
    const sortedBySensitivity = [...qualifyingSpecs].sort((a, b) => {
      if (b.effective_sensitivity !== a.effective_sensitivity) {
        return b.effective_sensitivity - a.effective_sensitivity;
      }
      if (a.extra_referrals !== b.extra_referrals) {
        return a.extra_referrals - b.extra_referrals;
      }
      return a.cost - b.cost;
    });

    const bestQualifying = sortedBySensitivity[0];
    const bestSD = (typeof bestQualifying.sensitivity_std === 'number' && !isNaN(bestQualifying.sensitivity_std))
      ? bestQualifying.sensitivity_std
      : 2.5;

    const thresholdSensitivity = Number((bestQualifying.effective_sensitivity - bestSD).toFixed(1));

    // 2. Filter to configs whose sensitivity is within 1 SD of the best qualifying config
    const candidateSpecs = qualifyingSpecs.filter(s => s.effective_sensitivity >= thresholdSensitivity);

    // 3. Pick the CHEAPEST configuration among those candidates
    candidateSpecs.sort((a, b) => {
      // Primary: Lower cost
      if (a.cost !== b.cost) return a.cost - b.cost;
      // Tie-break 1: Higher sensitivity
      if (b.effective_sensitivity !== a.effective_sensitivity) {
        return b.effective_sensitivity - a.effective_sensitivity;
      }
      // Tie-break 2: Fewer referrals
      if (a.extra_referrals !== b.extra_referrals) {
        return a.extra_referrals - b.extra_referrals;
      }
      // Tie-break 3: Higher sampling rate preferred
      return b.sampling_rate_hz - a.sampling_rate_hz;
    });

    return {
      success: true,
      spec: candidateSpecs[0],
      bestQualifying: bestQualifying,
      bestSD: bestSD,
      thresholdSensitivity: thresholdSensitivity,
      totalQualifying: qualifyingSpecs.length,
      candidateCount: candidateSpecs.length
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
    bestQualifying: null,
    bestSD: 0,
    thresholdSensitivity: 0,
    totalQualifying: 0,
    candidateCount: 0
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
  renderScatterChart(evaluatedSpecs, recommendation.spec);
  renderComparisonTable(evaluatedSpecs, recommendation.spec);
}

/**
 * Renders Hero Recommendation Block with Cost Gaps, Rule Display, and New Metrics.
 */
function renderRecommendationCard(recResult, allSpecs) {
  const card = document.getElementById('recommendationCard');
  if (!card) return;

  const N = state.campSeniors;
  const p = state.campDementiaRate / 100;
  const H = state.campHeadsets;

  if (recResult.success) {
    const spec = recResult.spec;

    // Calculate cost gaps against benchmark specs
    const spec19 = allSpecs.find(s => s.channels === 19);
    const cost19 = spec19 ? spec19.cost : 23224;
    const savingsVs19 = cost19 - spec.cost;

    const cheaperSpecs = allSpecs.filter(s => s.cost < spec.cost);
    let cheaperNote = '';
    if (cheaperSpecs.length > 0) {
      const nextCheaper = cheaperSpecs.sort((a, b) => b.cost - a.cost)[0];
      const costDiff = spec.cost - nextCheaper.cost;
      cheaperNote = `The cheaper alternative (${nextCheaper.channels} channels at ₹${nextCheaper.cost.toLocaleString('en-IN')}, saving ₹${costDiff.toLocaleString('en-IN')}) fails your limits: ${nextCheaper.failureReason.toLowerCase()}.`;
    } else {
      cheaperNote = 'This is the lowest-cost configuration available in the evaluation matrix.';
    }

    card.innerHTML = `
      <div class="rec-meta-row">
        <span class="rec-kicker">Recommended Setup</span>
        <span class="rec-rule-tag">1-SD Rule Selection</span>
      </div>

      <div>
        <h2 class="rec-headline">
          ${spec.channels} Channels @ ${spec.sampling_rate_hz} Hz &mdash; ₹${spec.cost.toLocaleString('en-IN')}
        </h2>
        <p class="rec-rule-short">
          Cheapest setup that still catches at least ${state.minSensitivity} in 100 people with dementia and keeps unnecessary clinic referrals at or below ${state.maxReferrals} per 100 healthy seniors.
        </p>
      </div>

      <div class="rec-metrics-grid">
        <div class="rec-metric-box">
          <span class="rec-metric-lbl">Unit Cost</span>
          <span class="rec-metric-val">₹${spec.cost.toLocaleString('en-IN')}</span>
          <span class="rec-metric-sub">chip + electrodes only</span>
        </div>
        <div class="rec-metric-box">
          <span class="rec-metric-lbl">Screening Sensitivity</span>
          <span class="rec-metric-val">${spec.effective_sensitivity}%</span>
          <span class="rec-metric-sub">${spec.sensitivity_std ? `±${spec.sensitivity_std}% SD` : 'Patients caught'}</span>
        </div>
        <div class="rec-metric-box">
          <span class="rec-metric-lbl">Extra Referrals</span>
          <span class="rec-metric-val">${spec.extra_referrals}</span>
          <span class="rec-metric-sub">${spec.extra_referrals_std ? `±${spec.extra_referrals_std} SD` : 'per 100 healthy'}</span>
        </div>
        <div class="rec-metric-box">
          <span class="rec-metric-lbl">Best-Value Option</span>
          <span class="rec-metric-val">${spec.isPareto ? 'Yes' : 'No'}</span>
          <span class="rec-metric-sub">${spec.isPareto ? 'On Pareto frontier' : 'Dominated'}</span>
        </div>
      </div>

      <div class="rec-advantage-note">
        <strong>Cost Advantage:</strong> Saves <strong>₹${savingsVs19.toLocaleString('en-IN')} per unit</strong> compared to a 19-channel clinical montage. ${cheaperNote}
      </div>

      <details class="rec-rule-details">
        <summary class="rec-rule-summary-btn">
          How was this chosen? (1-SD Rule Details)
        </summary>
        <div class="rec-rule-expanded-content">
          <p>
            <strong>Recommendation Rule:</strong> Selects the cheapest configuration whose sensitivity is within 1 standard deviation of the highest-performing qualifying configuration.
          </p>
          <ul>
            <li><strong>Best qualifying config:</strong> ${recResult.bestQualifying.channels} Channels @ ${recResult.bestQualifying.sampling_rate_hz} Hz (${recResult.bestQualifying.effective_sensitivity}% sensitivity ± ${recResult.bestSD}% SD).</li>
            <li><strong>1-SD margin threshold:</strong> &ge;${recResult.thresholdSensitivity}% sensitivity.</li>
            <li><strong>Selected config:</strong> ${spec.channels} Channels @ ${spec.sampling_rate_hz} Hz meets the &ge;${recResult.thresholdSensitivity}% threshold at ₹${spec.cost.toLocaleString('en-IN')}, achieving ₹${savingsVs19.toLocaleString('en-IN')} savings per headset vs 19 channels.</li>
          </ul>
        </div>
      </details>

      <div class="rec-disclaimer-footnote">
        * Cost reflects chip + electrodes only (listing prices to be confirmed, date not recorded). Excludes PCB, enclosure, battery, leads, and reference/bias electrodes. Sampling rate does not alter hardware cost in this model.
      </div>
    `;
  } else {
    // Empty state / Fallback mode
    const closest = recResult.spec;

    let missExplanation = '';
    const sensShortfall = (state.minSensitivity - closest.effective_sensitivity).toFixed(1);
    const refExcess = (closest.extra_referrals - state.maxReferrals).toFixed(1);

    if (!closest.meetsSensitivity && !closest.meetsReferrals) {
      missExplanation = `Misses sensitivity by ${sensShortfall} pts and exceeds referral ceiling by +${refExcess}`;
    } else if (!closest.meetsSensitivity) {
      missExplanation = `Misses sensitivity by ${sensShortfall} pts (${closest.effective_sensitivity}% < ${state.minSensitivity}%)`;
    } else {
      missExplanation = `Exceeds referral ceiling by +${refExcess} (${closest.extra_referrals} > ${state.maxReferrals})`;
    }

    card.innerHTML = `
      <div class="rec-meta-row">
        <span class="rec-kicker" style="color: var(--color-danger-banner);">No Spec Meets Targets</span>
        <span class="rec-rule-tag" style="background-color: #FEE2E2; border-color: #FCA5A5; color: #991B1B;">Closest Option</span>
      </div>

      <div>
        <h2 class="rec-headline">
          No spec meets targets &mdash; Closest: ${closest.channels} Channels @ ${closest.sampling_rate_hz} Hz (₹${closest.cost.toLocaleString('en-IN')})
        </h2>
        <p class="rec-rule-short">
          <strong>${missExplanation}.</strong> Achieved sensitivity is ${closest.effective_sensitivity}% (target &ge;${state.minSensitivity}%) with ${closest.extra_referrals} extra referrals per 100 healthy (ceiling &le;${state.maxReferrals}).
        </p>
      </div>

      <div class="rec-metrics-grid">
        <div class="rec-metric-box">
          <span class="rec-metric-lbl">Closest Unit Cost</span>
          <span class="rec-metric-val">₹${closest.cost.toLocaleString('en-IN')}</span>
          <span class="rec-metric-sub">chip + electrodes only</span>
        </div>
        <div class="rec-metric-box">
          <span class="rec-metric-lbl">Sensitivity</span>
          <span class="rec-metric-val">${closest.effective_sensitivity}%</span>
          <span class="rec-metric-sub">Target was &ge;${state.minSensitivity}%</span>
        </div>
        <div class="rec-metric-box">
          <span class="rec-metric-lbl">Referrals / 100 healthy</span>
          <span class="rec-metric-val">${closest.extra_referrals}</span>
          <span class="rec-metric-sub">Ceiling was &le;${state.maxReferrals}</span>
        </div>
        <div class="rec-metric-box">
          <span class="rec-metric-lbl">Shortfall</span>
          <span class="rec-metric-val">${!closest.meetsSensitivity ? `-${sensShortfall}%` : `+${refExcess}`}</span>
          <span class="rec-metric-sub">Gap to target</span>
        </div>
      </div>

      <div class="rec-disclaimer-footnote">
        * Consider relaxing targets (e.g. lowering minimum sensitivity or increasing referral ceiling) to qualify configurations.
      </div>
    `;
  }
}

/**
 * SECTION: Camp Calculator (Phase 3 Main Feature)
 * Inputs: Seniors screened (N), Assumed dementia rate (p), Headsets (H)
 * Outputs: Cases caught, healthy referred, precision (% dementia), total hardware cost,
 *          Cost per true case found, Referrals per true case (Task 2).
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

  // Task 2 Metrics: Cost per true case found and referrals per true case
  const costPerTrueCase = patientsCaught > 0 ? Math.round(totalHardware / patientsCaught) : 0;
  const referralsPerTrueCase = patientsCaught > 0 ? (totalReferrals / patientsCaught).toFixed(1) : '0.0';

  // Update plain sentence output
  const sentenceBox = document.getElementById('calcResultSentence');
  if (sentenceBox) {
    sentenceBox.innerHTML = `
      <strong>Screening Projection:</strong> Catches about <strong>${patientsCaught}</strong>, 
      sends about <strong>${healthyReferred}</strong> healthy people to clinics; 
      <strong>${ratioText}</strong> referrals has dementia (${precisionPct}% precision). 
      Hardware cost per true case found: <strong>₹${costPerTrueCase.toLocaleString('en-IN')}</strong>, 
      with <strong>${referralsPerTrueCase}</strong> clinic referrals per true case caught. 
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
  const costCaseVal = document.getElementById('calcCostPerTrueCaseVal');
  const costCaseSub = document.getElementById('calcCostPerTrueCaseSub');
  const refCaseVal = document.getElementById('calcReferralsPerTrueCaseVal');
  const refCaseSub = document.getElementById('calcReferralsPerTrueCaseSub');

  if (caughtVal) caughtVal.textContent = patientsCaught.toLocaleString();
  if (caughtSub) caughtSub.textContent = `of ~${Math.round(totalDementia)} true cases (${(sensitivity * 100).toFixed(1)}%)`;

  if (referredVal) referredVal.textContent = healthyReferred.toLocaleString();
  if (referredSub) referredSub.textContent = `from ${Math.round(totalHealthy)} healthy (${(referralRatePerHealthy * 100).toFixed(1)}%)`;

  if (precVal) precVal.textContent = `${precisionPct}%`;
  if (precSub) precSub.textContent = `${ratioText} clinic referrals`;

  if (hwVal) hwVal.textContent = `₹${totalHardware.toLocaleString('en-IN')}`;
  if (hwSub) hwSub.textContent = `${H} headsets @ ₹${selectedSpec.cost.toLocaleString('en-IN')} (chip + electrodes only)`;

  if (costCaseVal) costCaseVal.textContent = `₹${costPerTrueCase.toLocaleString('en-IN')}`;
  if (costCaseSub) costCaseSub.textContent = `hardware / true case (chip + electrodes only)`;

  if (refCaseVal) refCaseVal.textContent = `${referralsPerTrueCase}`;
  if (refCaseSub) refCaseSub.textContent = `total referrals / case`;

  // Render 100-Person Pictogram
  render100PersonPictogram(p, sensitivity, referralRatePerHealthy);
}

/**
 * Renders the 100-person triage outcome pictogram (10 x 10 grid)
 * scaled per 100 seniors screened, with distinct colours AND symbols for 4 states.
 */
function render100PersonPictogram(p, sensitivity, referralRatePerHealthy) {
  const gridEl = document.getElementById('campPictogramGrid');
  const legendEl = document.getElementById('campPictogramLegend');
  if (!gridEl || !legendEl) return;

  // Scale per 100 seniors screened
  const totalDementia100 = Math.round(100 * p);
  const totalHealthy100 = 100 - totalDementia100;

  const caught100 = Math.min(totalDementia100, Math.round(totalDementia100 * sensitivity));
  const missed100 = Math.max(0, totalDementia100 - caught100);

  const falseRef100 = Math.min(totalHealthy100, Math.round(totalHealthy100 * referralRatePerHealthy));
  const cleanHealthy100 = Math.max(0, totalHealthy100 - falseRef100);

  // Exactly 100 total nodes
  let nodesHtml = '';
  let count = 0;

  // 1. Dementia Caught (Deep teal with checkmark ✓)
  for (let i = 0; i < caught100; i++) {
    count++;
    nodesHtml += `
      <div class="pic-node state-caught" title="Senior #${count}: Dementia caught (flagged for assessment)" role="img" aria-label="Dementia caught">
        <span class="pic-symbol" aria-hidden="true">&#10003;</span>
      </div>`;
  }

  // 2. Dementia Missed (Terracotta with cross ✕)
  for (let i = 0; i < missed100; i++) {
    count++;
    nodesHtml += `
      <div class="pic-node state-missed" title="Senior #${count}: Dementia missed (false negative, screened out)" role="img" aria-label="Dementia missed">
        <span class="pic-symbol" aria-hidden="true">&#10005;</span>
      </div>`;
  }

  // 3. Healthy Referred Unnecessarily (Warm amber with plus +)
  for (let i = 0; i < falseRef100; i++) {
    count++;
    nodesHtml += `
      <div class="pic-node state-false-ref" title="Senior #${count}: Healthy referred unnecessarily (unnecessary clinic visit)" role="img" aria-label="Healthy referred unnecessarily">
        <span class="pic-symbol" aria-hidden="true">+</span>
      </div>`;
  }

  // 4. Healthy Not Referred (Calm muted circle with dot •)
  for (let i = 0; i < cleanHealthy100; i++) {
    count++;
    nodesHtml += `
      <div class="pic-node state-healthy-clean" title="Senior #${count}: Healthy not referred (correct screen out)" role="img" aria-label="Healthy not referred">
        <span class="pic-symbol" aria-hidden="true">&bull;</span>
      </div>`;
  }

  gridEl.innerHTML = nodesHtml;

  // Legend with counts and descriptions
  legendEl.innerHTML = `
    <div class="legend-row">
      <div class="legend-item">
        <span class="legend-swatch state-caught" aria-hidden="true">&#10003;</span>
        <span class="legend-label"><strong>${caught100}</strong> Dementia caught <span class="legend-sub">(flagged for assessment)</span></span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch state-missed" aria-hidden="true">&#10005;</span>
        <span class="legend-label"><strong>${missed100}</strong> Dementia missed <span class="legend-sub">(false negative, screened out)</span></span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch state-false-ref" aria-hidden="true">+</span>
        <span class="legend-label"><strong>${falseRef100}</strong> Healthy referred unnecessarily <span class="legend-sub">(unnecessary clinic load)</span></span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch state-healthy-clean" aria-hidden="true">&bull;</span>
        <span class="legend-label"><strong>${cleanHealthy100}</strong> Healthy not referred <span class="legend-sub">(correctly screened out)</span></span>
      </div>
    </div>
    <div class="legend-note">
      Scaled to 100 seniors at ${state.campDementiaRate}% assumed prevalence (${totalDementia100} with dementia, ${totalHealthy100} healthy).
    </div>
  `;
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
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#C2410C'; // Warm Terracotta line
      ctx.lineWidth = 1.75;
      ctx.moveTo(chartArea.left, yVal);
      ctx.lineTo(chartArea.right, yVal);
      ctx.stroke();

      ctx.fillStyle = '#C2410C';
      ctx.font = '600 12px IBM Plex Sans, sans-serif';
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
    ctx.font = '600 12px IBM Plex Mono, monospace';
    ctx.fillStyle = '#1F2937';
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
function renderScatterChart(evaluatedSpecs, recommendedSpec) {
  // Populate accessible screen reader summary below chart
  const summaryEl = document.getElementById('chartTextSummary');
  if (summaryEl) {
    if (recommendedSpec) {
      summaryEl.innerHTML = `
        <strong>Screen reader summary:</strong> Across 12 evaluated configurations from 2 to 19 channels, hardware cost ranges from ₹3,996 (2 channels) to ₹23,224 (19 channels). At target limits (&ge;${state.minSensitivity}% sensitivity, &le;${state.maxReferrals} extra referrals), the recommended setup is <strong>${recommendedSpec.channels} Channels @ ${recommendedSpec.sampling_rate_hz} Hz</strong> (₹${recommendedSpec.cost.toLocaleString('en-IN')}, ${recommendedSpec.effective_sensitivity}% sensitivity, ${recommendedSpec.extra_referrals} extra referrals). 19-channel setups achieve 78.0% sensitivity at ₹23,224 (+₹${(23224 - recommendedSpec.cost).toLocaleString('en-IN')} higher cost). Low-channel 2- and 4-channel setups fail the referral ceiling (34.8 to 45.9 extra referrals per 100 healthy).
      `;
    } else {
      summaryEl.innerHTML = `
        <strong>Screen reader summary:</strong> No tested configuration meets both the minimum sensitivity of ${state.minSensitivity}% and the maximum referral ceiling of ${state.maxReferrals} per 100 healthy seniors. Relax constraints to view qualifying options.
      `;
    }
  }

  const canvas = document.getElementById('specScatterChart');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js library is not loaded. Skipping chart rendering.');
    return;
  }

  // Best-value (Pareto) points only (sorted by cost)
  const paretoSpecs = evaluatedSpecs.filter(s => s.isPareto).sort((a, b) => a.cost - b.cost);
  
  // Real spec points for connecting line (No interpolated points)
  const paretoLineData = paretoSpecs.map(s => ({
    x: s.cost,
    y: s.effective_sensitivity
  }));

  const recommendedPoints = [];
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

    const isRec = recommendedSpec && (spec.channels === recommendedSpec.channels && spec.sampling_rate_hz === recommendedSpec.sampling_rate_hz);

    if (isRec) {
      recommendedPoints.push(point);
    } else if (spec.isPareto) {
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
      // Step line connecting real best-value points
      {
        type: 'line',
        label: 'Best-Value Step Line',
        data: paretoLineData,
        showLine: true,
        stepped: 'before',
        fill: false,
        borderColor: '#134E4A',
        borderWidth: 1.5,
        pointRadius: 0,
        hoverRadius: 0,
        order: 4
      },
      // Recommended configuration: highlighted with terracotta
      {
        type: 'scatter',
        label: 'Recommended Setup',
        data: recommendedPoints,
        backgroundColor: '#C2410C',
        borderColor: '#9A3412',
        borderWidth: 2,
        pointRadius: 8.5,
        pointHoverRadius: 11,
        pointStyle: 'circle',
        order: 1
      },
      // Best-Value (Meets limits): Deep teal filled rectangle
      {
        type: 'scatter',
        label: 'Best-Value (Meets Limits)',
        data: paretoQualPoints,
        backgroundColor: '#134E4A',
        borderColor: '#134E4A',
        borderWidth: 1.5,
        pointRadius: 6.5,
        pointHoverRadius: 9.5,
        pointStyle: 'rectRot',
        order: 2
      },
      // Best-Value (Outside limits): Deep teal hollow triangle
      {
        type: 'scatter',
        label: 'Best-Value (Outside Limits)',
        data: paretoFailPoints,
        backgroundColor: '#FAF8F5',
        borderColor: '#134E4A',
        borderWidth: 1.5,
        pointRadius: 6.5,
        pointHoverRadius: 9.5,
        pointStyle: 'triangle',
        order: 2
      },
      // Standard (Meets limits): Medium teal
      {
        type: 'scatter',
        label: 'Meets Limits',
        data: qualifiedPoints,
        backgroundColor: '#0F766E',
        borderColor: '#0F766E',
        borderWidth: 1,
        pointRadius: 5.5,
        pointHoverRadius: 8,
        pointStyle: 'rect',
        order: 3
      },
      // Standard (Outside limits): Muted grey hollow circle
      {
        type: 'scatter',
        label: 'Outside Limits',
        data: failingPoints,
        backgroundColor: '#FAF8F5',
        borderColor: '#9CA3AF',
        borderWidth: 1.5,
        pointRadius: 5,
        pointHoverRadius: 7.5,
        pointStyle: 'circle',
        order: 3
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
          backgroundColor: '#1F2937',
          titleColor: '#F9FAFB',
          bodyColor: '#E5E7EB',
          titleFont: { family: 'Source Serif 4, Georgia, serif', size: 14, weight: '600' },
          bodyFont: { family: 'IBM Plex Sans, sans-serif', size: 13 },
          padding: 10,
          cornerRadius: 4,
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
                `Status: ${raw.meetsLimits ? 'Meets limits' : raw.failureReason}`,
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
            font: { family: 'IBM Plex Sans, sans-serif', size: 13, weight: '600' },
            color: '#1F2937'
          },
          grid: {
            color: '#E5E0D8',
            borderDash: [2, 2],
            drawBorder: false
          },
          ticks: {
            font: { family: 'IBM Plex Mono, monospace', size: 12 },
            color: '#4B5563',
            callback: (val) => '₹' + Number(val).toLocaleString('en-IN')
          }
        },
        y: {
          title: {
            display: true,
            text: 'Screening Sensitivity (%)',
            font: { family: 'IBM Plex Sans, sans-serif', size: 13, weight: '600' },
            color: '#1F2937'
          },
          min: 65,
          max: 98,
          grid: {
            color: '#E5E0D8',
            borderDash: [2, 2],
            drawBorder: false
          },
          ticks: {
            stepSize: 5,
            font: { family: 'IBM Plex Mono, monospace', size: 12 },
            color: '#4B5563',
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
 * Formats table status cell text.
 */
function formatStatusCell(spec) {
  if (spec.meetsLimits) {
    return `<span class="status-pass">✓ Meets limits</span>${spec.isPareto ? ' <span class="table-pareto-tag">[Best-Value]</span>' : ''}`;
  }
  const sensShortfall = (state.minSensitivity - spec.effective_sensitivity).toFixed(1);
  const refExcess = (spec.extra_referrals - state.maxReferrals).toFixed(1);

  let msg = '';
  if (!spec.meetsSensitivity && !spec.meetsReferrals) {
    msg = `Misses sensitivity by ${sensShortfall}%, referral limit by ${refExcess}`;
  } else if (!spec.meetsSensitivity) {
    msg = `Misses sensitivity by ${sensShortfall}%`;
  } else {
    msg = `Misses referral limit by ${refExcess}`;
  }
  return `<span class="status-fail">${msg}</span>${spec.isPareto ? ' <span class="table-pareto-tag">[Best-Value]</span>' : ''}`;
}

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
        <td class="col-num col-ch font-bold">
          ${ch} Channels
          ${groupHasRecommended ? '<span class="best-rec-indicator">Recommended</span>' : ''}
        </td>
        <td class="col-num col-rate font-mono">
          ${primarySpec.sampling_rate_hz} Hz <span class="sub-rate-hint">(${specsInGroup.length} rates)</span>
        </td>
        <td class="col-num col-cost font-mono">₹${primarySpec.cost.toLocaleString('en-IN')}</td>
        <td class="col-num col-sens font-mono">
          ${primarySpec.effective_sensitivity}%
          ${primarySpec.sensitivity_std ? `<span class="sd-text">±${primarySpec.sensitivity_std}%</span>` : ''}
        </td>
        <td class="col-num col-ref font-mono">
          ${primarySpec.extra_referrals}
          ${primarySpec.extra_referrals_std ? `<span class="sd-text">±${primarySpec.extra_referrals_std}</span>` : ''}
        </td>
        <td class="col-status">
          ${formatStatusCell(primarySpec)}
        </td>
      </tr>
    `;

    // Expandable sub-rows for all sampling rates
    if (isExpanded) {
      specsInGroup.forEach((spec) => {
        const isRecSub = recommendedSpec && (spec.channels === recommendedSpec.channels && spec.sampling_rate_hz === recommendedSpec.sampling_rate_hz);
        const subRowClass = `sub-row ${isRecSub ? 'sub-row-recommended' : ''}`;

        html += `
          <tr class="${subRowClass}">
            <td class="col-expand sub-indent-cell">&boxur;</td>
            <td class="col-num col-ch sub-text-muted">${spec.channels} ch</td>
            <td class="col-num col-rate font-mono font-bold">
              ${spec.sampling_rate_hz} Hz
              ${isRecSub ? '<span class="best-rec-indicator">Recommended</span>' : ''}
            </td>
            <td class="col-num col-cost font-mono">₹${spec.cost.toLocaleString('en-IN')}</td>
            <td class="col-num col-sens font-mono">
              ${spec.effective_sensitivity}%
              ${spec.sensitivity_std ? `<span class="sd-text">±${spec.sensitivity_std}%</span>` : ''}
            </td>
            <td class="col-num col-ref font-mono">
              ${spec.extra_referrals}
              ${spec.extra_referrals_std ? `<span class="sd-text">±${spec.extra_referrals_std}</span>` : ''}
            </td>
            <td class="col-status">
              ${formatStatusCell(spec)}
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
        indicator.style.color = '#134E4A';
      } else {
        indicator.textContent = '↕';
        indicator.style.color = '#6B7280';
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
      state.campSeniors = 5000;
      state.campDementiaRate = 7.4;
      state.campHeadsets = 25;

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
      if (inputSeniors) inputSeniors.value = 5000;
      if (inputRate) inputRate.value = 7.4;
      if (inputHeadsets) inputHeadsets.value = 25;

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

/**
 * Loads ai/briefs.json and initializes the Program Brief panel (Task 6).
 */
function initProgramBrief() {
  const btnEN = document.getElementById('btnLangEN');
  const btnHI = document.getElementById('btnLangHI');
  const btnMR = document.getElementById('btnLangMR');

  if (btnEN) btnEN.addEventListener('click', () => setBriefLanguage('en'));
  if (btnHI) btnHI.addEventListener('click', () => setBriefLanguage('hi'));
  if (btnMR) btnMR.addEventListener('click', () => setBriefLanguage('mr'));

  // Attempt fetch, fallback to default embedded brief if running offline/file://
  fetch('ai/briefs.json')
    .then(res => {
      if (!res.ok) throw new Error('Network response not ok');
      return res.json();
    })
    .then(data => {
      state.briefsData = data.briefs;
      state.briefsSource = data.source || 'template';
      renderProgramBrief(state.briefLang);
    })
    .catch(err => {
      console.warn('Could not load ai/briefs.json via fetch, using bundled brief:', err);
      state.briefsData = DEFAULT_BRIEFS;
      state.briefsSource = 'template';
      renderProgramBrief(state.briefLang);
    });
}

function setBriefLanguage(lang) {
  state.briefLang = lang;
  ['btnLangEN', 'btnLangHI', 'btnLangMR'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      if (btn.getAttribute('data-lang') === lang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
  renderProgramBrief(lang);
}

function renderProgramBrief(lang) {
  if (!state.briefsData || !state.briefsData[lang]) return;
  const brief = state.briefsData[lang];

  const titleEl = document.getElementById('briefTitle');
  const summaryEl = document.getElementById('briefSummary');
  const logisticsEl = document.getElementById('briefLogistics');
  const boundariesEl = document.getElementById('briefBoundaries');
  const badgeEl = document.getElementById('briefBadge') || document.querySelector('.brief-warning-badge');

  if (badgeEl) {
    const isLLM = brief.source === 'llm' || state.briefsSource === 'llm';
    badgeEl.textContent = isLLM ? 'AI-generated, verify before use.' : 'Template-generated summary';
  }

  if (titleEl) titleEl.textContent = brief.title;
  if (summaryEl) summaryEl.textContent = brief.summary;
  if (logisticsEl) logisticsEl.textContent = brief.logistics;
  if (boundariesEl) boundariesEl.textContent = brief.clinical_boundaries;
}

const DEFAULT_BRIEFS = {
  en: {
    source: "template",
    title: "Executive Brief: 8-Channel EEG Pre-Screening Hardware",
    summary: "Evaluation for community health screening: The recommended 8-channel configuration operating at 500 Hz costs ₹9,588 per unit (chip and electrodes only). In empirical testing, it achieved 77.8% sensitivity (±3.4% SD) with 29.7 extra referrals per 100 healthy individuals (±7.4 SD).",
    logistics: "In a simulated field camp of 5,000 seniors (7.4% assumed prevalence, 25 headsets), this hardware catches approximately 288 true cases while referring 1,375 healthy seniors to secondary clinics. Capital hardware cost per true case identified is ₹832 (chip + electrodes only), with 5.8 total clinic referrals per true case caught.",
    clinical_boundaries: "Screening logistics and hardware budgeting support only. Not a diagnostic device. Does not provide clinical confirmation or replace physician evaluation. Recorded using wet electrodes in hospital settings; field dry sensors will exhibit higher contact noise."
  },
  hi: {
    source: "template",
    title: "कार्यकारी सारांश: 8-चैनल ईईजी पूर्व-स्क्रीनिंग हार्डवेयर",
    summary: "सामुदायिक स्वास्थ्य पूर्व-स्क्रीनिंग मूल्यांकन: अनुशंसित 8-चैनल कॉन्फ़िगरेशन (500 हर्ट्ज़) की प्रति यूनिट हार्डवेयर लागत ₹9,588 है (केवल चिप और इलेक्ट्रोड)। परीक्षण में इसने 77.8% संवेदनशीलता (±3.4% SD) तथा 29.7 अतिरिक्त रेफरल प्रति 100 स्वस्थ व्यक्ति (±7.4 SD) प्राप्त किए।",
    logistics: "5,000 वरिष्ठ नागरिकों के शिविर में (7.4% प्रसार अनुमान, 25 हेडसेट), यह प्रणाली लगभग 288 वास्तविक मामलों की पहचान करती है और 1,375 स्वस्थ व्यक्तियों को द्वितीयक क्लीनिक में रेफर करती है। पहचाने गए प्रति वास्तविक मामले पर हार्डवेयर लागत ₹832 है (केवल चिप और इलेक्ट्रोड), तथा प्रति वास्तविक मामले पर कुल 5.8 क्लिनिकल रेफरल होते हैं।",
    clinical_boundaries: "केवल पूर्व-स्क्रीनिंग लॉजिस्टिक्स और उपकरण बजट योजना सहायता हेतु। यह कोई चिकित्सीय निदान (डायग्नोसिस) नहीं है। यह डॉक्टर के व्यापक परीक्षण का विकल्प नहीं है। अस्पताल में वेट इलेक्ट्रोड द्वारा मूल्यांकित; फील्ड में ड्राई सेंसर में शोर अधिक होगा।"
  },
  mr: {
    source: "template",
    title: "कार्यकारी अहवाल: 8-चॅनेल ईईजी पूर्व-स्क्रीनिंग हार्डवेअर",
    summary: "समुदाय आरोग्य पूर्व-स्क्रीनिंग मूल्यमापन: शिफारस केलेले 8-चॅनेल कॉन्फिगरेशन (500 हर्ट्झ) प्रति युनिट ₹9,588 खर्चात उपलब्ध आहे (फक्त चिप आणि इलेक्ट्रोड्स). चाचणीत याने 77.8% संवेदनशीलता (±3.4% SD) आणि 29.7 अतिरिक्त रेफरल्स प्रति 100 निरोगी व्यक्ती (±7.4 SD) नोंदवले.",
    logistics: "5,000 ज्येष्ठ नागरिकांच्या शिबिरात (7.4% गृहीत प्रमाण, 25 हेडसेट), ही यंत्रणा अंदाजे 288 प्रत्यक्ष व्यक्ती शोधते आणि 1,375 निरोगी व्यक्तींना पुढील क्लिनिक तपासणीसाठी रेफर करते. प्रति प्रत्यक्ष शोधलेल्या प्रकरणासाठी हार्डवेअर खर्च ₹832 असून (फक्त चिप आणि इलेक्ट्रोड्स), प्रति प्रत्यक्ष प्रकरणासाठी एकूण 5.8 क्लिनिकल रेफरल्स होतात.",
    clinical_boundaries: "फक्त पूर्व-स्क्रीनिंग नियोजन आणि उपकरणांच्या बजेटसाठी सहाय्यक. हे कोणतेही वैद्यकीय निदान (diagnosis) नाही. हे तज्ज्ञ डॉक्टरांच्या तपासणीचा पर्याय नाही. ओल्या इलेक्ट्रोड्सवर आधारित; ग्रामीण भागात ड्राय सेन्सर्स अधिक आवाजी (noise) असू शकतात."
  }
};
