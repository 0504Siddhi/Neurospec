# NeuroSpec Dashboard

A hardware-aware software engine and planning tool designed to help cognitive healthcare programs evaluate sensor specifications and procurement trade-offs for EEG-based dementia pre-screening.

**Status: Functional UI Prototype.** The application defaults to **REAL RUN RESULTS** from OpenNeuro dataset `ds004504` (88 participants, repeated 5-fold cross-validation). Illustrative "DEMO DATA" is kept strictly behind an explicit toggle with a persistent red warning banner.

---

## Core Features

* **Empirical Default View:** Loads real run cross-validated test results directly from `research/results/dashboard_results.csv`.
* **Hardware Recommendation Rule:** Automatically selects the *cheapest hardware configuration whose sensitivity is within 1 Standard Deviation (SD) of the best qualifying configuration*, balancing clinical diagnostic yield with hardware budget.
* **Cost & Clinical Burden Metrics:**
  * **Cost per True Case Found:** Hardware capital investment required per confirmed true positive case caught in the cohort.
  * **Referrals per True Case:** Total second-stage clinic referrals required to identify one true positive case (informing clinic burden).
* **Field Deployment Simulation (Camp Calculator):**
  * Inputs: Cohort size (Seniors screened), dementia prevalence, and headsets deployed.
  * **Maharashtra District Camp Preset:** Quick-load configuration (5,000 seniors, 25 headsets, 7.4% prevalence).
  * **Assumption Labeling:** Prevalence is explicitly labeled `ASSUMPTION` with citation to the Longitudinal Ageing Study in India (LASI) Wave 1, and remains fully editable for local adjustments.
* **AI Program Briefs (EN / HI / MR):** Executive briefings in English, Hindi (हिन्दी), and Marathi (मराठी) generated with strict numerical verification and no medical claims.
* **Editable Unit Economics:** Input listing prices for front-end chips (ADS1299), ESP32 boards, electrodes, batteries, and leads to instantly recalculate unit BOM costs.
* **Performance Visualization:** Interactive Chart.js scatter plot mapping Unit Hardware Cost vs. Screening Sensitivity with a Pareto step-line.

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

## Dataset Download (OpenNeuro ds004504)

The EEG feature extraction and channel-reduction pipeline evaluates OpenNeuro dataset **ds004504** ("A dataset of EEG recordings from Alzheimer's disease, Frontotemporal dementia and Healthy Control subjects").

1. Install the OpenNeuro CLI client:
   ```bash
   pip install openneuro-py
   ```
2. Download the dataset:
   ```bash
   openneuro-py download --dataset ds004504 --target-dir C:\neurospec_data\ds004504-data
   ```
   *(Or set a custom location and define the environment variable `NEUROSPEC_EEG_ROOT`)*.
3. Dataset contents:
   - `participants.tsv`: Subject IDs and diagnostic groups (`A` = Alzheimer's, `F` = Frontotemporal, `C` = Healthy Control).
   - `sub-XXX/eeg/*.set`: 19-channel EEG EEGLAB recordings.

---

## Run Commands

### 1. Web Dashboard
No external build steps or Node.js runtime required:
```bash
# Start a local HTTP server
python -m http.server 8080
```
Open `http://localhost:8080/index.html` in any modern web browser.

### 2. EEG Channel-Reduction Pipeline
To re-run signal filtering, Welch PSD extraction, and repeated stratified 5-fold cross-validation:
```bash
python research/eeg_analysis.py
```
Outputs:
- `research/results/dashboard_results.csv`
- `research/results/channel_comparison.csv`
- `research/results/random_pairs.csv`

### 3. AI Program Brief Generator
Generates localized executive briefings in English, Hindi, and Marathi:
```bash
# Template mode (no API key required):
python ai/generate_brief.py

# LLM-assisted mode:
set BRIEF_API_KEY=your_api_key_here  # Windows CMD
$env:BRIEF_API_KEY="your_api_key_here" # PowerShell
export BRIEF_API_KEY="your_api_key_here" # Linux/macOS
python ai/generate_brief.py
```
Output is validated and written to `ai/briefs.json`.

---

## AI Feature & Safety Boundaries

The AI briefing script (`ai/generate_brief.py`) and UI Program Brief panel include strict guardrails:
1. **Zero Secret Leakage:** The API key is read strictly from `os.environ.get("BRIEF_API_KEY")` and is never logged or committed.
2. **Strict Number Validation:** Every numerical token in the generated output is checked against the input metrics. If any unauthorized or hallucinated number is detected, the generation is rejected and retried once; if it fails again, it falls back to a verified deterministic template.
3. **No Medical / Diagnostic Claims:** Prompt guidelines and templates forbid diagnostic or therapeutic claims. The system is strictly framed as a pre-screening logistics, clinic referral burden, and hardware procurement engine.

---

## Clinical Context & Limitations

* **Pre-Screening Only:** Designed solely to assist community screening logistics and hardware budgeting. It does not provide medical diagnoses or replace clinical examinations.
* **Electrode Contact Impedance:** Dataset `ds004504` was collected in hospital conditions with wet electrodes and scalp preparation. Low-cost dry or semi-dry field electrodes will experience higher contact impedance and movement artifacts.
* **Comparative Yield:** Standard cognitive tests (MMSE, Mini-Cog) have near-zero hardware costs. EEG hardware investments must justify themselves through objective automation and referral compliance.
* **Cost Estimate Scope:** Headline costs reflect front-end chips and electrodes only (excluding PCB fabrication, enclosures, batteries, and leads).

---

## License

This project is licensed under the [MIT License](LICENSE).
