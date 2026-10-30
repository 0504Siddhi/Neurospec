# NeuroSpec Architecture & Pipeline Specification

This document details the end-to-end architecture of NeuroSpec, tracing data flow from clinical EEG recordings through feature extraction, machine learning classification, results storage, the frontend decision dashboard, and executive program brief generation.

---

## High-Level Pipeline Diagram

```
+-----------------------------------------------------------------------------------+
| 1. RAW EEG DATA INGESTION                                                         |
|    - participants.tsv (Subject IDs & Group: A, F, C)                              |
|    - Clinical EEG recordings (.set files: 19 channels, 500 Hz)                    |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
| 2. SIGNAL PREPROCESSING & RESAMPLING (eeg_analysis.py)                            |
|    - MNE: 1.0–45.0 Hz bandpass filter                                             |
|    - Anti-aliased downsampling: 500 Hz, 250 Hz, 125 Hz                            |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
| 3. SPECTRAL FEATURE EXTRACTION (eeg_analysis.py)                                  |
|    - 10-second non-overlapping windows                                            |
|    - SciPy Welch Power Spectral Density (PSD)                                     |
|    - 5 Frequency Bands: delta (1-4), theta (4-8), alpha (8-13), beta (13-30),     |
|      gamma (30-45 Hz)                                                             |
|    - Extracted: log10 absolute power & relative power                             |
|    - Participant-level aggregation: window median                                 |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
| 4. SUBJECT-WISE CROSS-VALIDATION & CALIBRATION (eeg_analysis.py)                  |
|    - Channel Subsets: 19 ch, 8 ch, 4 ch, 2 ch + 20 random channel pairs           |
|    - 10-repeat stratified 5-fold CV (no participant leakage across train/test)    |
|    - StandardScaler + LogisticRegression pipeline (fit strictly on training folds)|
|    - Dynamic threshold calibration: out-of-fold training targeting >=80% sens     |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
| 5. RESULTS STORAGE                                                                |
|    - dashboard_results.csv (Channels, Rate, Sensitivity, Referrals)               |
|    - channel_comparison.csv (Accuracy, Balanced Acc, ROC-AUC)                     |
|    - random_pairs.csv (Random 2-channel benchmarks)                               |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
| 6. FRONTEND DATA STORE & UNIT ECONOMICS (data.js)                                 |
|    - REAL_RESULTS: empirical cross-validation metrics (Mean +/- SD)               |
|    - DEMO_RESULTS: illustrative mock values (isolated behind warning banner)      |
|    - Hardware Cost Model: ADS1299-4 / ADS1299-8 + ESP32 + electrodes              |
|    - Scope: chip + electrodes only (listing prices to confirm, date not recorded) |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
| 7. CLIENT-SIDE DASHBOARD (index.html, style.css, app.js)                          |
|    - Pareto Optimization: Identifies non-dominated best-value sensor builds       |
|    - Recommendation Engine: 1-SD rule (cheapest within 1 SD of best qualifying)  |
|    - Camp Calculator: Illustrative scenario (5,000 seniors, 25 headsets,         |
|      7.4% prevalence assumption)                                                  |
|    - Scatter Plot (Chart.js): Cost vs Sensitivity with Pareto step-line           |
|    - Grouped Specs Matrix: Expandable sampling rate sub-rows                      |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
| 8. EXECUTIVE PROGRAM BRIEFS (generate_brief.py, briefs.json)                      |
|    - Derived Metrics calculation: cases caught, healthy referred, cost/case       |
|    - Number Verification: normalizes Devanagari numerals and comma separators;    |
|      rejects unauthorized/hallucinated numbers                                    |
|    - Shipped Output: briefs.json (EN, HI, MR) marked as template-generated        |
+------------------------------------------+----------------------------------------+
```

---

## Detailed Pipeline Stages and File Inventory

### Stage 1: Raw Clinical EEG Data
* **Source:** OpenNeuro `ds004504` (CC0 license).
* **Files:**
  - `participants.tsv`: Participant IDs, clinical diagnosis group (`A` = Alzheimer's disease, `F` = Frontotemporal dementia, `C` = Healthy controls), MMSE scores, age, gender.
  - Clinical EEG recordings (`.set` files): 19 scalp channels recorded using a clinical system at 500 Hz with wet electrodes (skin impedance < 5 kΩ).

### Stage 2: Signal Preprocessing & Multi-Rate Resampling
* **Module:** `eeg_analysis.py`
* **Function:** `extract_features(set_file, target_sfreq)`
* **Steps:**
  1. Standardizes electrode names to standard 10–20 international notation.
  2. Filters raw signals using a zero-phase Butterworth bandpass filter from 1.0 Hz to 45.0 Hz.
  3. Resamples pre-filtered signals using anti-aliased downsampling to evaluate three target sampling frequencies:
     - 500 Hz (original)
     - 250 Hz (2x downsampled)
     - 125 Hz (4x downsampled)

### Stage 3: Spectral Feature Extraction
* **Module:** `eeg_analysis.py`
* **Steps:**
  1. Partitions the filtered continuous signal into 10-second non-overlapping windows.
  2. Computes Welch Power Spectral Density (segment length $\le 4\text{s}$).
  3. Numerically integrates power across 5 physiological bands:
     - Delta: 1.0 – 4.0 Hz
     - Theta: 4.0 – 8.0 Hz
     - Alpha: 8.0 – 13.0 Hz
     - Beta: 13.0 – 30.0 Hz
     - Gamma: 30.0 – 45.0 Hz
  4. Calculates two features per channel per band:
     - Absolute Log Power: $\log_{10}(\text{power})$
     - Relative Power: $\frac{\text{band power}}{\text{total power (1–45 Hz)}}$
  5. Computes participant-level features using the median across all valid 10-second windows.

### Stage 4: Cross-Validation & Dynamic Threshold Calibration
* **Module:** `eeg_analysis.py`
* **Steps:**
  1. Predefined montages evaluated:
     - 19 channels: Full 10–20 montage (`Fp1, Fp2, F3, F4, C3, C4, P3, P4, O1, O2, F7, F8, T3, T4, T5, T6, Fz, Cz, Pz`)
     - 8 channels: Frontal-central-parietal (`Fp1, Fp2, F3, F4, C3, C4, P3, P4`)
     - 4 channels: Frontal-central (`Fp1, Fp2, C3, C4`)
     - 2 channels: Prefrontal forehead strip (`Fp1, Fp2`)
  2. 10 repeats of stratified 5-fold cross-validation.
  3. Data hygiene: Feature scaling is combined in a pipeline with balanced logistic regression. Scaling parameters are learned exclusively on training folds.
  4. Decision threshold: Tuned out-of-fold solely on the training splits targeting $\ge 80\%$ sensitivity, then evaluated on the hold-out test folds.

### Stage 5: Results Serialization
* **Outputs:**
  - `dashboard_results.csv`: Contains `channels`, `sampling_rate_hz`, `sensitivity_pct`, `extra_referrals_per_100_healthy`.
  - `channel_comparison.csv`: Full classification metrics.
  - `random_pairs.csv`: Benchmark data for 20 random two-channel pairs.

### Stage 6: Frontend Data Store & Hardware Cost Model
* **Module:** `data.js`
* **Components:**
  - `REAL_RESULTS`: Direct mirror of empirical repeated CV runs.
  - `DEMO_RESULTS`: Isolated placeholder numbers used exclusively when the synthetic demo toggle is activated.
  - `DEFAULT_COSTS`: Component engineering cost model in Indian Rupees (INR ₹):
    - ADS1299-4 (for 2 and 4 channels): ₹4,297.39
    - ADS1299 8-ch (for 8 channels): ₹8,971.19
    - 2x ADS1299 8-ch + 1x ADS1299-4 (for 19 channels): ₹22,239.77
    - ESP32 Microcontroller: ₹349.00
    - Electrode unit cost: ₹33.44 per channel
    - Cost Scope: Headline numbers reflect chip + electrodes only (listing prices to be confirmed, date not recorded). PCB, enclosure, battery, and leads are excluded.

### Stage 7: Client-Side Dashboard & Decision Engine
* **Files:** `index.html`, `style.css`, `app.js`
* **Core Logic:**
  - **Pareto Best-Value Frontier:** Identifies configurations that are strictly non-dominated on both cost and screening sensitivity.
  - **1-SD Recommendation Engine:** Implements the deterministic rule: selects the cheapest qualifying hardware specification whose sensitivity is within 1 Standard Deviation of the highest-sensitivity qualifying configuration.
  - **Camp Calculator:** Simulates community camp screening operations with user-configurable cohort parameters (default: 5,000 seniors, 25 headsets, 7.4% assumed prevalence).
  - **Scatter Plot (Chart.js):** Displays cost vs. sensitivity trade-offs with distinct Pareto markers and step-lines.
  - **Specification Matrix:** Grouped channel counts with expandable sampling rate rows.

### Stage 8: Verified Executive Brief Generator
* **Files:** `generate_brief.py`, `briefs.json`
* **Integrity Mechanism:**
  - Derives exact cohort logistics numbers from input metrics.
  - Numerical validator: Normalizes Devanagari numerals (`०-९`) and comma thousands separators before extracting and checking every numeric token against allowed inputs.
  - If any unauthorized number is detected or if running offline without an API key, falls back to deterministic, verified templates.
  - Adds language-level `"source": "template"` tags. Shipped briefs render with the UI badge "Template-generated summary".
