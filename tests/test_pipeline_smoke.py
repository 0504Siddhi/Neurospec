"""
tests/test_pipeline_smoke.py - Verification & Smoke Tests for NeuroSpec

Includes:
1. Feature extraction & logistic regression pipeline smoke test on SYNTHETIC data.
2. Schema & bounds verification for research/results/dashboard_results.csv.
3. Multi-lingual number validation tests for ai/generate_brief.py (EN/HI/MR, Devanagari & commas).
4. ai/briefs.json structural and source integrity verification.
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
import mne
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

# Add repo root to Python path
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from research.eeg_analysis import extract_features, BANDS, CHANNEL_SETS
from ai.generate_brief import validate_text_numbers, get_allowed_number_tokens, calculate_derived_metrics


def test_synthetic_feature_extraction_and_classifier_smoke():
    """
    Smoke test: Generates a small synthetic array (SYNTHETIC DATA, NOT REAL EEG)
    and verifies that Welch PSD extraction and classification run cleanly.
    """
    ch_names = CHANNEL_SETS["19_channels"]
    sfreq = 125.0
    duration_sec = 25.0  # 2 full 10-second windows
    n_samples = int(sfreq * duration_sec)
    
    # Generate SYNTHETIC signal: combination of sine waves and noise
    # Clearly marked: THIS IS SYNTHETIC DATA, NOT REAL EEG
    rng = np.random.default_rng(42)
    t = np.linspace(0, duration_sec, n_samples, endpoint=False)
    synthetic_data = np.zeros((len(ch_names), n_samples))
    for i in range(len(ch_names)):
        # 10 Hz alpha wave + 2 Hz delta wave + noise
        synthetic_data[i] = (
            5.0 * np.sin(2 * np.pi * 10.0 * t) +
            3.0 * np.sin(2 * np.pi * 2.0 * t) +
            rng.normal(0, 1.0, n_samples)
        )

    info = mne.create_info(ch_names=ch_names, sfreq=sfreq, ch_types="eeg")
    raw_synthetic = mne.io.RawArray(synthetic_data, info, verbose="ERROR")

    # Run feature extraction on synthetic data
    features, channels_found, n_windows, fs = extract_features(raw_synthetic, target_sfreq=125)

    assert n_windows == 2
    assert fs == 125.0
    assert len(channels_found) == 19
    assert "Fp1_alpha_logpower" in features
    assert "Fp1_alpha_relative" in features
    assert "Fp2_theta_logpower" in features

    # Verify classification pipeline on a synthetic multi-subject table
    synthetic_rows = []
    for subj_idx in range(10):
        # 5 controls (0), 5 dementia (1)
        label = 1 if subj_idx >= 5 else 0
        row = {"label": label}
        for k, v in features.items():
            # Add synthetic subject variance
            row[k] = v + rng.normal(0, 0.1)
        synthetic_rows.append(row)

    df_synthetic = pd.DataFrame(synthetic_rows)
    X = df_synthetic.drop(columns=["label"])
    y = df_synthetic["label"].to_numpy()

    clf = make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=500, random_state=42)
    )
    clf.fit(X, y)
    preds = clf.predict(X)
    assert len(preds) == 10
    assert set(preds).issubset({0, 1})


def test_dashboard_results_csv_schema():
    """
    Verifies that research/results/dashboard_results.csv exists,
    contains the required columns, and holds valid numeric ranges.
    """
    csv_path = REPO_ROOT / "research" / "results" / "dashboard_results.csv"
    assert csv_path.exists(), f"Missing {csv_path}"

    df = pd.read_csv(csv_path)
    expected_cols = {
        "channels",
        "sampling_rate_hz",
        "sensitivity_pct",
        "extra_referrals_per_100_healthy"
    }
    assert expected_cols.issubset(df.columns), f"Columns missing from {df.columns}"

    assert set(df["channels"].unique()).issubset({19, 8, 4, 2})
    assert set(df["sampling_rate_hz"].unique()).issubset({500, 250, 125})

    assert (df["sensitivity_pct"] >= 0).all() and (df["sensitivity_pct"] <= 100).all()
    assert (df["extra_referrals_per_100_healthy"] >= 0).all() and (df["extra_referrals_per_100_healthy"] <= 100).all()


def test_brief_number_validation_multilingual():
    """
    Verifies that validate_text_numbers:
    - Normalizes comma thousands separators (5,000 -> 5000, 2,39,700 -> 239700)
    - Normalizes Devanagari numerals (०१२३४५६७८९ -> 0123456789)
    - Accepts authorized tokens across EN, HI, MR
    - Flags unauthorized or hallucinated numbers
    """
    class MockArgs:
        channels = 8
        rate = 500
        cost = 9588
        sensitivity = 77.8
        sensitivity_std = 3.4
        referrals = 29.7
        referrals_std = 7.4
        seniors = 5000
        prevalence = 7.4
        headsets = 25

    metrics = calculate_derived_metrics(MockArgs())
    allowed = get_allowed_number_tokens(metrics)

    # 1. English sample with commas
    en_sample = (
        "In a camp of 5,000 seniors (7.4% prevalence, 25 headsets), "
        "the 8-channel headset at 500 Hz costs ₹9,588, catching 288 cases "
        "and referring 1,375 healthy seniors. Cost per case: ₹832."
    )
    unauthorized_en = validate_text_numbers(en_sample, allowed)
    assert unauthorized_en == [], f"Unexpected unauthorized numbers in English: {unauthorized_en}"

    # 2. Hindi sample with standard numerals and percentage
    hi_sample = (
        "5,000 वरिष्ठ नागरिकों के शिविर में (7.4% प्रसार अनुमान, 25 हेडसेट), "
        "यह प्रणाली लगभग 288 वास्तविक मामलों की पहचान करती है और 1,375 स्वस्थ व्यक्तियों को "
        "द्वितीयक क्लीनिक में रेफर करती है। प्रति वास्तविक मामले पर लागत ₹832 है।"
    )
    unauthorized_hi = validate_text_numbers(hi_sample, allowed)
    assert unauthorized_hi == [], f"Unexpected unauthorized numbers in Hindi: {unauthorized_hi}"

    # 3. Marathi sample with Devanagari numerals
    mr_sample_devanagari = (
        "५,००० ज्येष्ठ नागरिकांच्या शिबिरात (७.४% गृहीत प्रमाण, २५ हेडसेट), "
        "ही यंत्रणा अंदाजे २८८ प्रत्यक्ष व्यक्ती शोधते आणि १,३७५ निरोगी व्यक्तींना "
        "पुढील क्लिनिक तपासणीसाठी रेफर करते. प्रति प्रत्यक्ष प्रकरणासाठी हार्डवेअर खर्च ₹८३२ आहे."
    )
    unauthorized_mr = validate_text_numbers(mr_sample_devanagari, allowed)
    assert unauthorized_mr == [], f"Unexpected unauthorized numbers in Devanagari Marathi: {unauthorized_mr}"

    # 4. Unauthorized / hallucinated number detection
    bad_sample_en = "This device caught 999 patients in a group of 5,000 seniors."
    unauth = validate_text_numbers(bad_sample_en, allowed)
    assert "999" in unauth

    bad_sample_devanagari = "यात ९९९ नवीन रुग्णांची नोंद झाली आहे."
    unauth_dev = validate_text_numbers(bad_sample_devanagari, allowed)
    assert "999" in unauth_dev


def test_briefs_json_structure_and_source():
    """
    Verifies that ai/briefs.json exists, contains language-level source markers,
    and includes all required brief sections.
    """
    import json
    briefs_path = REPO_ROOT / "ai" / "briefs.json"
    assert briefs_path.exists(), f"Missing {briefs_path}"

    with open(briefs_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data.get("status") == "success"
    assert "briefs" in data

    for lang in ("en", "hi", "mr"):
        assert lang in data["briefs"], f"Missing language {lang}"
        brief = data["briefs"][lang]
        assert "source" in brief, f"Missing source tag in {lang}"
        assert brief["source"] in {"template", "llm"}, f"Invalid source {brief['source']}"
        assert "title" in brief
        assert "summary" in brief
        assert "logistics" in brief
        assert "clinical_boundaries" in brief

