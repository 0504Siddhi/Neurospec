# NeuroSpec

A planning tool that helps a district health programme choose the cheapest EEG headset specification (number of channels and sampling rate) that still meets its own limits for first-stage dementia pre-screening.

**Team NeuroWell**, PVG's College of Engineering, Technology & Management (PVG COET), Pune.

Built for **Hack for Social Cause (VBYLD 2027)**, theme: Elderly Care & Healthy Ageing.

> **Screening support only. Not a diagnosis.** NeuroSpec does not diagnose dementia and is not clinically validated.

---

## Problem and who it is for

About 8.8 million Indians aged 60 or older are estimated to live with dementia, around 7.4% of that age group (Lee et al., 2023, *Alzheimer's & Dementia*, LASI-DAD). A district programme that wants to screen older adults at community camps with EEG headsets must decide how many channels to buy and at what sampling rate. Each choice changes the unit cost and how many healthy seniors are sent to clinics, but the buyer has no easy way to see that trade-off.

NeuroSpec is built for programme managers and public health procurement teams. For each setup from 2 to 19 channels it shows the cost, how many people with dementia are flagged, and how many healthy seniors are referred unnecessarily. An illustrative district camp in Maharashtra is used as the example setting.

---

## What the tool does

- **Set your limits:** a minimum sensitivity and a maximum number of extra referrals per 100 healthy seniors.
- **Recommendation rule:** picks the cheapest setup whose sensitivity is within 1 standard deviation (SD) of the best qualifying setup. The rule is explained on screen.
- **Evidence:** a cost-vs-sensitivity chart with a step line connecting best-value options, and a full specification table.
- **Camp calculator:** for a chosen number of seniors, headsets and an assumed prevalence, it shows cases caught, healthy people referred, referral precision, total hardware cost, cost per true case found, and referrals per true case.
- **Program Brief** in English, Hindi and Marathi (see below).
- **Editable costs** and **CSV upload**, so a programme can use its own trial results.
- **Real results by default.** Illustrative demo data is available only behind an explicit toggle, with a persistent red banner.

---

## Results at a glance

Source: OpenNeuro `ds004504`, 88 participants, repeated stratified 5-fold cross-validation (10 repeats), 500 Hz. Costs are chip + electrodes only.

| Channels | Unit cost (INR) | Sensitivity | Extra referrals per 100 healthy |
|---|---|---|---|
| 2  | 4,713  | 78.6% ± 2.0 | 35.2 ± 6.7 |
| 4  | 4,780  | 78.5% ± 3.5 | 45.5 ± 3.2 |
| 8  | 9,588  | 77.8% ± 3.4 | 29.7 ± 7.4 |
| 19 | 23,224 | 78.0% ± 2.7 | 23.8 ± 5.3 |

Results at 250 Hz and 125 Hz are in `research/results/dashboard_results.csv` and are very close to these.

How to read this:

- Sensitivity is about 78% in every setup, because the decision threshold is calibrated on training folds to target at least 80% sensitivity. What differs between setups is the number of unnecessary referrals.
- With the default limits (at least 75% sensitivity, at most 30 extra referrals per 100 healthy), the tool recommends **8 channels at 500 Hz**: INR 9,588 per unit, which saves INR 13,636 per unit compared with 19 channels.
- The 8-channel setup meets the referral limit by only 0.3, and its result overlaps with the 19-channel result within one SD.
- The 2- and 4-channel setups miss the referral limit under the default settings.

Camp calculator example (defaults: 5,000 seniors, 25 headsets, 7.4% prevalence, 8 channels): about 288 of roughly 370 people with dementia are flagged, 1,375 healthy people are referred, and about 17.3% of referrals have dementia. Hardware costs INR 2,39,700 (chip + electrodes only), or INR 832 per true case found. These are illustrative scenario inputs, not measured data.

---

## Quick start (dashboard)

No build step and no Node.js needed. From the repository root:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/index.html` in a browser. Opening `index.html` directly also works.

---

## Python setup

Requires Python 3.10 or newer (tested on Python 3.12).

```bash
git clone https://github.com/0504Siddhi/Neurospec.git
cd Neurospec

python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### Run the tests

```bash
pytest tests/ -v
```

The tests use synthetic data and the committed results files, so they do not need the EEG dataset.

---

## Dataset (OpenNeuro ds004504)

- **Source:** OpenNeuro `ds004504`, licence CC0. DOI: 10.18112/openneuro.ds004504.v1.0.7
- **Recorded at:** 2nd Department of Neurology, AHEPA General University Hospital of Thessaloniki, Aristotle University of Thessaloniki, Greece.
- **Participants:** 88 in total: 36 Alzheimer's disease (`A`), 23 frontotemporal dementia (`F`), 29 healthy controls (`C`).
- **Recording:** Nihon Kohden EEG 2100, 19 scalp electrodes (10-20 system), resting state, eyes closed, wet conductive paste (skin impedance below 5 kOhm), 500 Hz.

The raw dataset is not stored in this repository. To download it and point the pipeline at it:

```bash
pip install openneuro-py
openneuro-py download --dataset ds004504 --target-dir ds004504-data

# Tell the pipeline where it is (use the full path):
# Linux/macOS:
export NEUROSPEC_EEG_ROOT="$PWD/ds004504-data"
# Windows PowerShell:
$env:NEUROSPEC_EEG_ROOT="$PWD\ds004504-data"
```

The folder contains `participants.tsv` (subject IDs and groups) and `sub-XXX/eeg/*.set` (EEGLAB recordings).

---

## Re-running the analysis

```bash
python research/eeg_analysis.py
```

Pipeline:

1. **Input:** 19-channel `.set` recordings from `ds004504`.
2. **Preprocessing:** 1-45 Hz band-pass filter and anti-aliased resampling to 500, 250 and 125 Hz.
3. **Features:** 10-second non-overlapping windows; Welch power spectral density in the delta, theta, alpha, beta and gamma bands (absolute log power and relative power); one feature vector per participant (median across windows).
4. **Validation:** logistic regression with repeated stratified 5-fold cross-validation (10 repeats) on participant-level features, so no participant appears in both training and test folds. Setups with 19, 8, 4 and 2 channels are compared.
5. **Output:** `research/results/dashboard_results.csv`, `channel_comparison.csv` and `random_pairs.csv`.
6. **Dashboard:** the numbers in `dashboard_results.csv` are stored in `data.js` as `REAL_RESULTS`; `app.js` uses them for the recommendation, chart and camp calculator.

More detail: [`research/README.md`](research/README.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Program Brief (English, Hindi, Marathi)

The dashboard includes a short brief for programme managers that restates the selected setup and the camp numbers in plain language. It only explains numbers computed by the tool. It does not compute new figures.

```bash
# Template mode (default, no API key needed):
python ai/generate_brief.py

# Optional LLM mode (key read from an environment variable, never stored in the code):
export BRIEF_API_KEY="your_key"          # Linux/macOS
$env:BRIEF_API_KEY="your_key"            # Windows PowerShell
python ai/generate_brief.py
```

Output is written to `ai/briefs.json`. In LLM mode, every number in the generated text is checked against the input values, and the text is rejected if any number does not match. The briefs that ship with this repository are **template-generated**, and the dashboard labels them "Template-generated summary". Hindi and Marathi text should be reviewed by a fluent reader before use.

---

## Limitations and honest scope

- **Pre-screening only.** Not a diagnostic device and not clinically validated. It does not replace a physician's examination.
- **One dataset, one population.** All results come from a single hospital dataset recorded in Greece. They are not validated on Indian populations, and there is no external validation.
- **Wet electrodes.** The recordings used conductive paste and skin preparation in a hospital. Low-cost dry or semi-dry sensors will have higher contact impedance and more movement artefacts, so real-world performance is likely lower. The dashboard's "simulate noisier sensors" option applies a flat -4.0% sensitivity. It is an assumption, not a measurement.
- **Prevalence is an assumption.** The default 7.4% is the national estimate for adults aged 60+ in India (Lee et al., 2023, *Alzheimer's & Dementia*; LASI-DAD). Other studies report different values, for example 8.44% (Jin et al., 2023, *Neuroepidemiology*). It is editable.
- **Scenario inputs are illustrative.** The camp size (5,000 seniors) and headset count (25) are example values, not measured data.
- **Cost scope.** Headline costs are chip + electrodes only, from listing prices to be confirmed (check date not recorded). The 2-channel build uses a 4-channel chip, and the 19-channel build uses 20 channels of chip capacity. Sampling rate does not change cost in this model. Costs exclude PCB, enclosure, battery, leads, reference electrodes and operating costs.
- **Comparison with free tests.** Paper-and-pencil tests such as MMSE and Mini-Cog have near-zero hardware cost. The added value of EEG over these tests is not shown here.

---

## Repository layout

| Path | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js`, `data.js` | Dashboard: interface, recommendation logic, charts, results data |
| `research/` | EEG analysis pipeline and results CSVs |
| `ai/` | Program Brief generator and generated briefs |
| `docs/ARCHITECTURE.md` | Pipeline description and file map |
| `tests/` | Smoke tests and a sample CSV for the upload feature |

---

## Licence

MIT. See [LICENSE](LICENSE).
