# NeuroSpec Test Suite

This directory contains automated verification tests and sample input files for the NeuroSpec project.

---

## Files

1. **`test_pipeline_smoke.py`**:
   - **Feature Extraction & Classifier Smoke Test:** Generates a synthetic multi-channel array (clearly labeled **SYNTHETIC DATA, NOT REAL EEG**) and verifies that Welch PSD bandpower extraction, feature scaling, and logistic regression cross-validation execute without error.
   - **Results CSV Schema Test:** Verifies that `research/results/dashboard_results.csv` exists and contains the expected schema (`channels`, `sampling_rate_hz`, `sensitivity_pct`, `extra_referrals_per_100_healthy`) with valid numerical bounds.
   - **Brief Number Verification Test:** Verifies that `validate_text_numbers` in `ai/generate_brief.py` correctly validates numbers across English, Hindi, and Marathi outputs, properly normalizes Devanagari numerals (`०-९`) and comma thousands separators, and flags unauthorized/hallucinated numbers.

2. **`sample_upload.csv`**:
   Sample file demonstrating the exact format accepted by the dashboard's "Upload Custom Results" feature.

---

## CSV Column Specification

| Column | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `channels` | Integer | Yes | Number of active EEG recording channels (e.g. 19, 8, 4, 2). |
| `sampling_rate_hz` | Integer | Yes | Hardware sampling frequency in Hertz (e.g. 500, 250, 125). |
| `sensitivity_pct` | Float | Yes | Screening sensitivity percentage (% of true cases identified). |
| `extra_referrals_per_100_healthy` | Float | Yes | False referrals per 100 healthy individuals screened ($100 \times [1 - \text{specificity}]$). |
| `sensitivity_std` | Float | Optional | Standard deviation of sensitivity across cross-validation folds. |
| `extra_referrals_std` | Float | Optional | Standard deviation of extra referrals across cross-validation folds. |

---

## Running the Tests

To run the complete test suite:

```bash
pytest tests/ -v
```

