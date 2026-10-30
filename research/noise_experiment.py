#!/usr/bin/env python3
"""
research/noise_experiment.py - Simulated Sensor Noise Sensitivity Analysis for NeuroSpec

Evaluates how additive Gaussian noise (at multiple Signal-to-Noise Ratio levels: 20 dB, 10 dB, 5 dB)
affects dementia screening sensitivity and extra clinic referrals across EEG hardware configurations.

MANDATORY LABELING:
All output metrics and console messages are explicitly labeled:
"SIMULATED NOISE, not measured on dry electrodes"
This is a computational simulation and does NOT represent measured dry electrode impedance.
"""

from pathlib import Path
import os
import sys
import argparse
import warnings
import numpy as np
import pandas as pd
import mne

from scipy.signal import welch
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix

warnings.filterwarnings("ignore", category=RuntimeWarning)

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from research.eeg_analysis import (
    ROOT as DEFAULT_ROOT,
    BANDS,
    WINDOW_SECONDS,
    CHANNEL_SETS
)

RESULTS_DIR = Path(__file__).resolve().parent / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_CSV = RESULTS_DIR / "noise_sensitivity.csv"


def add_gaussian_noise(data, snr_db, seed=42):
    """
    Adds Gaussian noise to multi-channel EEG data to achieve target SNR in dB.
    SIMULATED NOISE, not measured on dry electrodes.
    """
    if snr_db is None:
        return data.copy()

    rng = np.random.default_rng(seed)
    signal_power = np.mean(data ** 2, axis=-1, keepdims=True)
    snr_linear = 10.0 ** (snr_db / 10.0)
    noise_power = signal_power / np.maximum(snr_linear, 1e-12)
    noise_std = np.sqrt(noise_power)
    noise = rng.normal(0, noise_std, size=data.shape)
    return data + noise


def extract_features_from_data(data, fs, channel_names):
    """
    Extracts Welch PSD bandpower features from a 2D EEG array (channels x samples).
    """
    window_samples = int(WINDOW_SECONDS * fs)
    n_windows = data.shape[1] // window_samples
    if n_windows < 1:
        raise ValueError("Recording shorter than one 10-second window.")

    windows = np.stack([
        data[:, i * window_samples:(i + 1) * window_samples]
        for i in range(n_windows)
    ], axis=1)

    frequencies, psd = welch(
        windows,
        fs=fs,
        axis=-1,
        nperseg=min(int(4 * fs), window_samples),
    )

    band_values = {}
    for band_name, (low, high) in BANDS.items():
        mask = (frequencies >= low) & (frequencies < high)
        if not np.any(mask):
            raise ValueError(f"No PSD bins found for {band_name}")
        power = np.trapezoid(psd[:, :, mask], x=frequencies[mask], axis=-1)
        band_values[band_name] = np.median(power, axis=1)

    total_mask = (frequencies >= 1.0) & (frequencies < 45.0)
    total_power = np.trapezoid(psd[:, :, total_mask], x=frequencies[total_mask], axis=-1)
    total_power = np.median(total_power, axis=1)
    total_power = np.maximum(total_power, 1e-30)

    features = {}
    for band_name, powers in band_values.items():
        relative_power = powers / total_power
        for i, channel in enumerate(channel_names):
            features[f"{channel}_{band_name}_logpower"] = float(np.log10(max(powers[i], 1e-30)))
            features[f"{channel}_{band_name}_relative"] = float(relative_power[i])

    return features


def run_noise_experiment(dataset_root, snr_levels=[None, 20, 10, 5], max_subjects=None, n_repeats=3):
    participants_file = dataset_root / "participants.tsv"
    if not participants_file.exists():
        raise FileNotFoundError(f"Participants file not found: {participants_file}")

    participants = pd.read_csv(participants_file, sep="\t")
    participants["Group"] = participants["Group"].astype(str).str.strip()
    participants = participants[participants["Group"].isin(["A", "F", "C"])].copy()
    participants["label"] = participants["Group"].isin(["A", "F"]).astype(int)

    if max_subjects is not None and max_subjects < len(participants):
        # Balanced sampling across both classes
        half = max_subjects // 2
        p_pos = participants[participants["label"] == 1].head(half)
        p_neg = participants[participants["label"] == 0].head(half)
        participants = pd.concat([p_pos, p_neg]).sample(frac=1.0, random_state=42).reset_index(drop=True)

    print("=" * 70)
    print("NeuroSpec Simulated Noise Sensitivity Experiment")
    print("MANDATORY NOTE: SIMULATED NOISE, not measured on dry electrodes")
    print(f"Dataset: {dataset_root} ({len(participants)} subjects: {sum(participants['label']==1)} dementia, {sum(participants['label']==0)} control)")
    print(f"SNR Levels to test: {snr_levels}")
    print("=" * 70)

    # Collect preloaded filtered signals once
    subject_raws = []
    for _, p in participants.iterrows():
        sid = p["participant_id"]
        grp = p["Group"]
        lbl = p["label"]
        eeg_dir = dataset_root / sid / "eeg"
        set_files = sorted(eeg_dir.glob("*.set"))
        if not set_files:
            continue
        try:
            raw = mne.io.read_raw_eeglab(str(set_files[0]), preload=True, verbose="ERROR")
            raw.pick(picks="eeg")
            raw.rename_channels(lambda n: n.strip())
            raw.filter(l_freq=1.0, h_freq=45.0, verbose="ERROR")
            subject_raws.append({
                "id": sid,
                "group": grp,
                "label": lbl,
                "raw": raw
            })
        except Exception as exc:
            print(f"Skipping {sid}: {exc}")

    if not subject_raws:
        raise RuntimeError("No valid EEG recordings found.")

    output_rows = []

    for snr in snr_levels:
        snr_label = "Clean (No added noise)" if snr is None else f"{snr} dB SNR"
        print(f"\nProcessing SNR: {snr_label} [SIMULATED NOISE, not measured on dry electrodes]...")

        feature_rows = []
        for s_idx, item in enumerate(subject_raws):
            raw = item["raw"]
            data = raw.get_data()
            fs = float(raw.info["sfreq"])
            ch_names = raw.ch_names

            # Inject simulated noise
            noisy_data = add_gaussian_noise(data, snr, seed=42 + s_idx)
            feats = extract_features_from_data(noisy_data, fs, ch_names)
            row = {
                "participant_id": item["id"],
                "label": item["label"]
            }
            row.update(feats)
            feature_rows.append(row)

        df_feat = pd.DataFrame(feature_rows)
        y = df_feat["label"].to_numpy()

        for config_name in ["19_channels", "8_channels"]:
            selected_channels = CHANNEL_SETS[config_name]
            sel_cols = [c for c in df_feat.columns if c.split("_", 1)[0] in selected_channels and c not in {"participant_id", "label"}]
            X = df_feat[sel_cols]

            sens_list = []
            spec_list = []
            extra_ref_list = []

            for rep_idx in range(n_repeats):
                n_splits_outer = min(5, min(np.bincount(y)))
                if n_splits_outer < 2:
                    continue
                cv = StratifiedKFold(n_splits=n_splits_outer, shuffle=True, random_state=42 + rep_idx)
                oof_preds = np.zeros(len(y), dtype=int)

                for train_idx, test_idx in cv.split(X, y):
                    X_tr, y_tr = X.iloc[train_idx], y[train_idx]
                    X_te, y_te = X.iloc[test_idx], y[test_idx]

                    clf = make_pipeline(
                        StandardScaler(),
                        LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)
                    )

                    min_class_count = min(np.bincount(y_tr))
                    n_inner = min(5, min_class_count)
                    if n_inner >= 2:
                        inner_cv = StratifiedKFold(n_splits=n_inner, shuffle=True, random_state=42)
                        inner_probs = cross_val_predict(clf, X_tr, y_tr, cv=inner_cv, method="predict_proba")[:, 1]
                        candidate_thresholds = np.sort(np.unique(np.concatenate([[0.0], inner_probs])))
                        valid_t = [
                            t for t in candidate_thresholds
                            if (np.sum((inner_probs >= t) & (y_tr == 1)) / max(np.sum(y_tr == 1), 1)) >= 0.80
                        ]
                        thresh = max(valid_t) if valid_t else 0.5
                    else:
                        thresh = 0.5

                    clf.fit(X_tr, y_tr)
                    test_probs = clf.predict_proba(X_te)[:, 1]
                    oof_preds[test_idx] = (test_probs >= thresh).astype(int)

                tn, fp, fn, tp = confusion_matrix(y, oof_preds, labels=[0, 1]).ravel()
                sens = (tp / (tp + fn)) * 100.0 if (tp + fn) else 0.0
                spec = (tn / (tn + fp)) * 100.0 if (tn + fp) else 0.0
                extra_ref = (100.0 - spec)

                sens_list.append(sens)
                spec_list.append(spec)
                extra_ref_list.append(extra_ref)

            mean_sens = round(float(np.mean(sens_list)), 1) if sens_list else 0.0
            std_sens = round(float(np.std(sens_list)), 1) if sens_list else 0.0
            mean_ref = round(float(np.mean(extra_ref_list)), 1) if extra_ref_list else 0.0
            std_ref = round(float(np.std(extra_ref_list)), 1) if extra_ref_list else 0.0

            output_rows.append({
                "configuration": config_name,
                "channels": len(selected_channels),
                "snr_db": "Clean" if snr is None else snr,
                "sensitivity_pct": mean_sens,
                "sensitivity_std": std_sens,
                "extra_referrals_per_100_healthy": mean_ref,
                "extra_referrals_std": std_ref,
                "noise_condition": "SIMULATED NOISE, not measured on dry electrodes"
            })

            print(f"  {config_name} [{snr_label}]: Sens {mean_sens}% (±{std_sens}%), Extra Ref {mean_ref} (±{std_ref})")

    results_df = pd.DataFrame(output_rows)
    results_df.to_csv(OUTPUT_CSV, index=False)
    print(f"\nSaved noise experiment results to: {OUTPUT_CSV}")
    print("NOTE: These results are labeled 'SIMULATED NOISE, not measured on dry electrodes' and are NOT wired into the live UI.")
    return results_df


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run simulated Gaussian noise experiment on EEG signals.")
    parser.add_argument("--max-subjects", type=int, default=None, help="Limit subjects for quick evaluation")
    parser.add_argument("--repeats", type=int, default=3, help="Number of cross-validation repeats")
    args = parser.parse_args()

    data_root = Path(os.environ.get("NEUROSPEC_EEG_ROOT", str(DEFAULT_ROOT)))
    if data_root.exists():
        run_noise_experiment(data_root, snr_levels=[None, 20, 10, 5], max_subjects=args.max_subjects, n_repeats=args.repeats)
    else:
        print(f"Dataset root {data_root} not found. Please set NEUROSPEC_EEG_ROOT or download ds004504.")
