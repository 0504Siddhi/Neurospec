/**
 * data.js - NeuroSpec Prototype Data Store
 * 
 * ============================================================================
 * PURPOSE & DISCLAIMER:
 * This file contains strictly FAKE, ILLUSTRATIVE PLACEHOLDER numbers.
 * NeuroSpec is an engineering & budget planning tool to help cognitive healthcare
 * programs evaluate pre-screening sensor trade-offs.
 * It is NOT a medical device, nor does it make clinical diagnoses.
 * ============================================================================
 */

// 1. PLACEHOLDER RESULTS DATASET
// Each record represents a candidate hardware specification and its simulated screening support performance.
// Note: Sensitivity gently drops as channel count and sampling rate decrease,
// with a visible drop at 62 Hz and 2 channels.
const DEFAULT_RESULTS = [
  // --- 19 CHANNELS (Standard full clinical montage equivalent) ---
  { channels: 19, sampling_rate_hz: 500, sensitivity_pct: 93.5, extra_referrals_per_100_healthy: 12.0 },
  { channels: 19, sampling_rate_hz: 250, sensitivity_pct: 92.0, extra_referrals_per_100_healthy: 14.2 },
  { channels: 19, sampling_rate_hz: 125, sensitivity_pct: 89.8, extra_referrals_per_100_healthy: 16.5 },
  { channels: 19, sampling_rate_hz: 62,  sensitivity_pct: 83.5, extra_referrals_per_100_healthy: 22.0 },

  // --- 8 CHANNELS (Reduced clinical headset) ---
  { channels: 8,  sampling_rate_hz: 500, sensitivity_pct: 90.5, extra_referrals_per_100_healthy: 15.0 },
  { channels: 8,  sampling_rate_hz: 250, sensitivity_pct: 89.0, extra_referrals_per_100_healthy: 17.5 },
  { channels: 8,  sampling_rate_hz: 125, sensitivity_pct: 86.5, extra_referrals_per_100_healthy: 20.0 },
  { channels: 8,  sampling_rate_hz: 62,  sensitivity_pct: 80.2, extra_referrals_per_100_healthy: 26.5 },

  // --- 4 CHANNELS (Frontal / temporal headband) ---
  { channels: 4,  sampling_rate_hz: 500, sensitivity_pct: 87.2, extra_referrals_per_100_healthy: 21.0 },
  { channels: 4,  sampling_rate_hz: 250, sensitivity_pct: 85.8, extra_referrals_per_100_healthy: 23.5 },
  { channels: 4,  sampling_rate_hz: 125, sensitivity_pct: 82.0, extra_referrals_per_100_healthy: 27.2 },
  { channels: 4,  sampling_rate_hz: 62,  sensitivity_pct: 74.8, extra_referrals_per_100_healthy: 34.0 },

  // --- 2 CHANNELS (Ultra-portable forehead strip) ---
  { channels: 2,  sampling_rate_hz: 500, sensitivity_pct: 82.0, extra_referrals_per_100_healthy: 28.0 },
  { channels: 2,  sampling_rate_hz: 250, sensitivity_pct: 79.5, extra_referrals_per_100_healthy: 31.0 },
  { channels: 2,  sampling_rate_hz: 125, sensitivity_pct: 73.8, extra_referrals_per_100_healthy: 38.5 },
  // Visible steep drop at 62 Hz and 2 channels:
  { channels: 2,  sampling_rate_hz: 62,  sensitivity_pct: 66.5, extra_referrals_per_100_healthy: 47.0 }
];

// Active copy of RESULTS that can be replaced if the user loads a real CSV
let RESULTS = JSON.parse(JSON.stringify(DEFAULT_RESULTS));

// 2. PLACEHOLDER HARDWARE COST MODEL (in Indian Rupees - INR ₹)
// Component-level engineering estimates.
// Cost per configuration = front-end chip + ESP32 board + electrodes (price per electrode x 1 electrode per channel) + other items.
const DEFAULT_COSTS = {
  // Front-end chip cost lookup table keyed by channel count (tag: listing price)
  frontEndChipCostByChannels: {
    2: 4297.39,   // 1 x ADS1299-4
    4: 4297.39,   // 1 x ADS1299-4
    8: 8971.19,   // 1 x ADS1299 8-channel
    19: 22239.77  // 2 x 8-channel + 1 x ADS1299-4
  },
  // Fixed ESP32 board (tag: listing price, to confirm)
  esp32BoardINR: 349.00,
  // Electrode price per unit (1 electrode per channel, tag: listing price)
  electrodeCostPerUnitINR: 33.44,
  // Other items (tag: not yet priced)
  batteryINR: 0,
  leadsINR: 0,
  refBiasElectrodesINR: 0
};

// Active editable copy of COSTS
let COSTS = JSON.parse(JSON.stringify(DEFAULT_COSTS));

/**
 * Calculates estimated unit hardware cost in INR for a given spec.
 * Cost depends on channel count only (in steps). Sampling rate does not change cost.
 * Formula: Front-end chip + ESP32 board + electrodes (price per electrode x 1 electrode per channel) + other items
 * 
 * @param {number} channels - Number of electrode channels (e.g., 2, 4, 8, 19)
 * @param {number} [samplingRate] - Sampling frequency in Hz (does not affect cost)
 * @returns {number} Estimated cost in INR
 */
function calculateSpecCost(channels, samplingRate) {
  const chipCost = (COSTS.frontEndChipCostByChannels && Number(COSTS.frontEndChipCostByChannels[channels])) || 0;
  const esp32 = Number(COSTS.esp32BoardINR) || 0;
  const electrodes = (Number(COSTS.electrodeCostPerUnitINR) || 0) * channels;
  const battery = Number(COSTS.batteryINR) || 0;
  const leads = Number(COSTS.leadsINR) || 0;
  const refBias = Number(COSTS.refBiasElectrodesINR) || 0;
  return Math.round(chipCost + esp32 + electrodes + battery + leads + refBias);
}

