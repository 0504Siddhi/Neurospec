# NeuroSpec Dashboard

A hardware-aware software engine and decision-planning tool designed to help cognitive healthcare programs evaluate sensor specifications and procurement trade-offs for EEG-based dementia pre-screening.

**Hackathon Theme:** Elderly Care & Healthy Ageing  
**Status: Functional UI Prototype.** The application defaults to **REAL RUN RESULTS** from OpenNeuro dataset `ds004504` (88 participants, 10-repeat 5-fold cross-validation). Illustrative "DEMO DATA" is kept strictly behind an explicit toggle with a persistent red warning banner.

---

## Problem Statement & Beneficiary

Older adults in community health camps frequently face under-detection of dementia due to clinical workforce shortages, specialized equipment scarcity, and the subjective variability or literacy dependencies of paper-and-pencil cognitive evaluations (e.g., MMSE, Mini-Cog). NeuroSpec is an engineering and logistics planning engine built for community healthcare directors, geriatric screening organizers, and public health procurement teams—using an illustrative district screening camp in Maharashtra as a concrete operational setting. By modeling the direct trade-off between EEG hardware capital costs (front-end instrumentation chips and electrodes) and diagnostic yield (true positive cases caught versus false alarms burdening secondary memory clinics), NeuroSpec enables programs to identify the most cost-effective sensor specification for community pre-screening without making unsupported diagnostic claims.

---

## Core Features

* **Empirical Default View:** Automatically opens on cross-validated test results directly derived from `research/results/dashboard_results.csv` (OpenNeuro `ds004504`).
* **Hardware Recommendation Rule:** Automatically selects the *cheapest hardware configuration whose sensitivity is within 1 Standard Deviation (SD) of the best qualifying configuration*, balancing diagnostic yield with hardware budget. Under default targets ($\ge 75\%$ sensitivity, $\le 30$ extra referrals per 100 healthy), it selects **8 Channels @ 500 Hz** (₹9,588 unit cost, 77.8% sensitivity $\pm$ 3.4% SD, saving ₹13,636 per unit vs. 19 channels).
* **Cost & Clinical Burden Metrics:**
  * **Cost per True Case Found:** Hardware capital investment required per confirmed true positive case caught in the cohort (chip + electrodes only).
  * **Referrals per True Case:** Total second-stage clinic referrals required to identify one true positive case (informing clinic triage burden).
* **Field Deployment Simulation (Camp Calculator):**
  * Title: *Camp Calculator: illustrative district scenario (Maharashtra)*
  * Defaults: 5,000 seniors screened, 25 headsets deployed, 7.4% prevalence.
  * Note: *Scenario inputs are illustrative, not measured data. All fields are editable.*
  * Prevalence citation: National estimate, adults 60+ in India (Lee et al., 2023, Alzheimer's & Dementia; LASI-DAD). ASSUMPTION, editable. Other estimates differ (e.g. 8.44%, Jin et al., 2023).
* **Executive Program Briefs (EN / HI / MR):** Program briefs in English, Hindi (हिन्दी), and Marathi (मराठी) generated with strict numerical verification against input data and zero diagnostic claims. Shipped defaults are explicitly labeled *Template-generated summary*.
* **Editable Unit Economics:** Input listing prices for front-end chips (ADS1299-4, ADS1299 8-ch), ESP32 boards, electrodes, batteries, and leads to instantly recalculate unit BOM costs. Headline costs reflect chip + electrodes only (listing prices to be confirmed, date not recorded).
* **Performance Visualization:** Interactive Chart.js scatter plot mapping Unit Hardware Cost vs. Screening Sensitivity with a Pareto step-line connecting best-value options.

---

## Quick Start (Web Dashboard)

No Node.js runtime, build steps, or package compilation required. The dashboard runs in any modern browser using Python's built-in HTTP server:

```bash
# Start a local HTTP server from the repository root
python -m http.server 8080
```

Open `http://localhost:8080/index.html` in your web browser.

---

## Python Environment Setup

Requires Python 3.10+ (tested on Python 3.12).

```bash
# 1. Clone the repository
git clone https://github.com/0504Siddhi/Neurospec.git
cd Neurospec

# 2. Create and activate a virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
```

---

## Dataset Provenance & Download (OpenNeuro ds004504)

* **Dataset Provenance:** OpenNeuro dataset `ds004504` (License: CC0). Recorded at the 2nd Department of Neurology, AHEPA General Hospital of Thessaloniki, Aristotle University of Thessaloniki, Thessaloniki, Greece. 88 participants total: 36 Alzheimer's disease (`AD`), 23 Frontotemporal dementia (`FTD`), and 29 Healthy controls (`CN`). Clinical recordings utilized a Nihon Kohden EEG 2100 clinical device with 19 scalp electrodes (10–20 international system) and wet conductive paste (skin impedance < 5 kΩ).

To download the raw dataset:
1. Install the OpenNeuro CLI client:
   ```bash
   pip install openneuro-py
   ```
2. Download the dataset:
   ```bash
   openneuro-py download --dataset ds004504 --target-dir C:\neurospec_data\ds004504-data
   ```
   *(Or set a custom location via environment variable `NEUROSPEC_EEG_ROOT`)*.
3. Dataset structure:
   - `participants.tsv`: Subject IDs and diagnostic groups (`A` = Alzheimer's, `F` = Frontotemporal, `C` = Healthy Control).
   - `sub-XXX/eeg/*.set`: 19-channel EEG EEGLAB recordings.

---

## EEG Analysis Pipeline & How Results Flow

To re-run signal filtering, Welch PSD extraction, and repeated stratified 5-fold cross-validation:

```bash
python research/eeg_analysis.py
```

### Pipeline Flow:
1. **Raw EEG Input:** Loads 19-channel `.set` files from `ds004504`.
2. **Preprocessing:** Applies 1.0–45.0 Hz bandpass filtering and anti-aliased resampling to 500 Hz, 250 Hz, and 125 Hz.
3. **Feature Extraction:** 10-second non-overlapping windows; Welch PSD across $\delta, \theta, \alpha, \beta, \gamma$ frequency bands computing absolute log power and relative power; aggregated via participant-level median.
4. **Validation:** Repeated stratified 5-fold cross-validation (10 repeats) evaluated across 19, 8, 4, and 2-channel configurations. Decision threshold calibrated dynamically on out-of-fold training data to target $\ge 80\%$ sensitivity.
5. **Output Generation:** Writes `research/results/dashboard_results.csv`, `research/results/channel_comparison.csv`, and `research/results/random_pairs.csv`.
6. **Data Store Integration:** Metrics from `dashboard_results.csv` are embedded directly into `data.js` as `REAL_RESULTS`. The dashboard (`app.js`) consumes `REAL_RESULTS` to compute Pareto frontiers, recommendation rules, and camp projections.

---

## Executive Program Brief Generator

Generates verified program briefs in English, Hindi, and Marathi:

```bash
# Template mode (deterministic, no API key required):
python ai/generate_brief.py

# Optional LLM-assisted mode (strictly validates numerical output against inputs):
set BRIEF_API_KEY=your_api_key_here          # Windows CMD
$env:BRIEF_API_KEY="your_api_key_here"       # PowerShell
export BRIEF_API_KEY="your_api_key_here"     # Linux/macOS
python ai/generate_brief.py
```

Output is verified and written to `ai/briefs.json`.

---

## Limitations & Honest Scope

* **Pre-Screening Only:** Not a diagnostic device. Engineered solely to assist community screening logistics and hardware budgeting. Does not provide definitive medical confirmation or replace physician examination.
* **Single Dataset & Population:** Not validated on Indian populations or low-cost dry sensors. Single dataset (`ds004504`), no external validation.
* **Electrode Contact Impedance:** Dataset `ds004504` was collected in hospital conditions with wet gel electrodes and scalp preparation. Low-cost dry or semi-dry field electrodes will experience higher contact impedance and movement artifacts.
* **Prevalence is an Assumption:** The default camp prevalence is 7.4% based on the national estimate for adults 60+ in India (Lee et al., 2023, Alzheimer's & Dementia; LASI-DAD). Other studies report different estimates (e.g. 8.44%, Jin et al., 2023). All scenario inputs are illustrative and fully editable.
* **Cost Estimate Scope:** Headline unit costs reflect front-end instrumentation chips and electrodes only (listing prices to be confirmed, date not recorded). Excludes PCB fabrication, enclosures, batteries, leads, reference electrodes, and operational costs.
* **Comparative Yield:** Standard paper-and-pencil cognitive evaluations (MMSE, Mini-Cog) carry near-zero hardware costs. EEG hardware investments must justify themselves through objective automation, operational reproducibility, and referral triage yield.

---

## License

This project is licensed under the [MIT License](LICENSE).
