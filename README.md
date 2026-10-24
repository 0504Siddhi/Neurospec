# NeuroSpec Dashboard

A hardware-aware software engine and planning tool designed to help cognitive healthcare programs evaluate sensor specifications and procurement trade-offs for EEG-based dementia pre-screening.

**Status: Functional UI Prototype.** The application defaults to illustrative "DEMO DATA" to demonstrate UI mechanics, but allows users to upload empirical test results via the "Load real run data" (CSV ingestion) tool.

## Core Features

*   **Interactive Constraints & Quick Presets:** 
    *   Users can manually set limits for *Minimum Sensitivity* and *Max Extra Referrals* via sliders.
    *   Includes quick-select presets for common scenarios: "Geriatrician target (≥80%)", "Strict (≥90%)", and "Tight budget".
*   **Automated Hardware Recommendation:** Automatically identifies the lowest-cost hardware configuration that qualifies under the user's limits and calculates the exact cost advantage (savings per unit) compared to a standard 19-channel clinical montage.
*   **Field Deployment Simulation (Camp Calculator):** Translates hardware specs into real-world logistics. Users input the target cohort size (Seniors screened), assumed dementia prevalence (e.g., 7.4% from LASI study), and number of deployed headsets. The tool calculates:
    *   True dementia cases caught
    *   Healthy people unnecessarily referred (clinic burden)
    *   Referral precision (positive predictive value)
    *   Total capital hardware cost for the deployment
*   **Editable Unit Economics:** A dynamic cost-assumption engine where users can input listing prices for front-end chips, ESP32 boards, electrodes, batteries, and leads to instantly recalculate unit costs. *(Note: Sampling rate does not alter hardware cost in this model).*
*   **Performance Visualization:** A scatter chart mapping Hardware Cost vs. Screening Sensitivity, featuring a step-line that visually connects the "Best-Value" options (the Pareto frontier) with inline channel labels.
*   **Collapsible Specification Matrix:** A detailed data table grouped by channel count (expandable sub-rows for sampling rates) that reports cost, sensitivity (including ± Standard Deviation), referral load, and pass/fail status.
*   **Environmental Simulation:** A toggle to "Simulate noisier sensors" which applies a flat penalty to sensitivity to illustrate potential field contact noise.

## Data Ingestion

Users can upload custom cross-validation or hospital trial results via CSV. The tool expects the data to map to channels, sampling rate, sensitivity, and extra referrals.

## Clinical Context & Limitations

*As explicitly stated in the application UI:*

*   **Dataset Limitation:** Evaluated on one clinical dataset (ds004504, 88 participants) recorded with wet electrodes in a hospital setting. Real low-cost dry or semi-dry sensors will experience higher contact impedance and movement artifacts (noise).
*   **Not a Diagnostic Tool:** Engineered solely to assist community screening logistics and hardware budgeting. It does not provide definitive medical confirmation or replace comprehensive clinical workups.
*   **Unproven Baseline Advantage:** EEG's added screening value over zero-cost cognitive paper tests (MMSE, Mini-Cog, GPCOG) is not proven within this tool. Standard paper tests carry near-zero hardware costs; EEG investment must justify itself through higher community compliance, objective automation, or reproducible yield.
*   **Cost Estimate Scope:** Headline costs reflect front-end chips and electrodes only. Estimates currently exclude PCB, enclosure, battery, leads, and reference/bias electrodes.

## How to Run

No installation or server is needed. Download the repository files and open `index.html` in any modern web browser.
