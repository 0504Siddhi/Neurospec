
from pathlib import Path
import os
import warnings
import itertools
import random

import numpy as np
import pandas as pd
import mne

from scipy.signal import welch
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    balanced_accuracy_score,
    accuracy_score,
    roc_auc_score,
    confusion_matrix,
)

warnings.filterwarnings("ignore", category=RuntimeWarning)

# --------------------------------------------------
# 1. Configuration
# --------------------------------------------------

# Dataset location can be configured using an environment variable.
ROOT = Path(
    os.environ.get(
        "NEUROSPEC_EEG_ROOT",
        r"C:\neurospec_data\ds004504-data",
    )
)

# Output location can be configured independently.
OUTPUT = Path(
    os.environ.get(
        "NEUROSPEC_EEG_OUTPUT",
        r"C:\neurospec_data\results",
    )
)

OUTPUT.mkdir(parents=True, exist_ok=True)

PARTICIPANTS_FILE = ROOT / "participants.tsv"

BANDS = {
    "delta": (1, 4),
    "theta": (4, 8),
    "alpha": (8, 13),
    "beta": (13, 30),
    "gamma": (30, 45),
}

WINDOW_SECONDS = 10

CHANNEL_SETS = {
    "19_channels": [
        "Fp1", "Fp2", "F3", "F4", "C3", "C4",
        "P3", "P4", "O1", "O2", "F7", "F8",
        "T3", "T4", "T5", "T6", "Fz", "Cz", "Pz",
    ],
    "8_channels": [
        "Fp1", "Fp2", "F3", "F4",
        "C3", "C4", "P3", "P4",
    ],
    "4_channels": ["Fp1", "Fp2", "C3", "C4"],
    "2_channels": ["Fp1", "Fp2"],
}

# Sampling rates to evaluate (in Hz).
# Note: 62 Hz is not included. The gamma band goes up to 45 Hz, and a 62 Hz rate can only
# represent up to 31 Hz (Nyquist limit = 62 / 2 = 31 Hz), so the existing check
# (fs <= 2 * BANDS["gamma"][1], where 2 * 45 = 90 Hz) would fail.
SAMPLING_RATES = [500, 250, 125]


# --------------------------------------------------
# 2. Extract features from one EEG recording
# --------------------------------------------------

def extract_features(set_file, target_sfreq=None):
    if isinstance(set_file, mne.io.BaseRaw):
        raw = set_file.copy()
    else:
        raw = mne.io.read_raw_eeglab(
            str(set_file),
            preload=True,
            verbose="ERROR",
        )

        # Keep EEG channels only.
        raw.pick_types(eeg=True)

        # Standardize channel labels for matching.
        raw.rename_channels(lambda name: name.strip())

        fs = float(raw.info["sfreq"])

        if fs <= 2 * BANDS["gamma"][1]:
            raise ValueError(
                f"Sampling frequency {fs} Hz is insufficient "
                "for the selected frequency bands."
            )

        # Research preprocessing: band-pass filter from 1 to 45 Hz.
        raw.filter(
            l_freq=1.0,
            h_freq=45.0,
            verbose="ERROR",
        )

    # Before cutting the recordings into 10-second windows, resample each recording
    # using raw.resample (MNE applies an anti-alias filter).
    if target_sfreq is not None and target_sfreq != raw.info["sfreq"]:
        raw.resample(target_sfreq, verbose="ERROR")

    fs = float(raw.info["sfreq"])

    if fs <= 2 * BANDS["gamma"][1]:
        raise ValueError(
            f"Sampling frequency {fs} Hz is insufficient "
            "for the selected frequency bands."
        )

    data = raw.get_data()
    channel_names = raw.ch_names

    window_samples = int(WINDOW_SECONDS * fs)
    n_windows = data.shape[1] // window_samples

    if n_windows < 1:
        raise ValueError(
            "Recording is shorter than one window."
        )

    # Divide recording into complete, non-overlapping windows.
    # Shape: channels x windows x samples.
    windows = np.stack([
        data[:, i * window_samples:(i + 1) * window_samples]
        for i in range(n_windows)
    ], axis=1)

    # Welch power spectral density.
    frequencies, psd = welch(
        windows,
        fs=fs,
        axis=-1,
        nperseg=min(int(4 * fs), window_samples),
    )

    # PSD shape: channels x windows x frequency bins.
    band_values = {}

    for band_name, (low, high) in BANDS.items():
        mask = (
            (frequencies >= low)
            & (frequencies < high)
        )

        if not np.any(mask):
            raise ValueError(
                f"No PSD bins found for {band_name}"
            )

        power = np.trapezoid(
            psd[:, :, mask],
            x=frequencies[mask],
            axis=-1,
        )

        # Median power across windows.
        band_values[band_name] = np.median(
            power,
            axis=1,
        )

    # Total power in the 1–45 Hz range.
    total_mask = (
        (frequencies >= 1.0)
        & (frequencies < 45.0)
    )

    total_power = np.trapezoid(
        psd[:, :, total_mask],
        x=frequencies[total_mask],
        axis=-1,
    )

    total_power = np.median(total_power, axis=1)
    total_power = np.maximum(total_power, 1e-30)

    features = {}

    for band_name, powers in band_values.items():
        relative_power = powers / total_power

        for i, channel in enumerate(channel_names):
            features[
                f"{channel}_{band_name}_logpower"
            ] = float(
                np.log10(max(powers[i], 1e-30))
            )

            features[
                f"{channel}_{band_name}_relative"
            ] = float(relative_power[i])

    return features, channel_names, n_windows, fs


# --------------------------------------------------
# 3. Load metadata and find EEG recordings
# --------------------------------------------------

def main():
    if not ROOT.exists():
        raise FileNotFoundError(
            f"Dataset directory does not exist: {ROOT}"
        )

    if not PARTICIPANTS_FILE.exists():
        raise FileNotFoundError(
            f"Missing participants file: {PARTICIPANTS_FILE}"
        )

    participants = pd.read_csv(
        PARTICIPANTS_FILE,
        sep="\t",
    )

    required_columns = {"participant_id", "Group"}

    if not required_columns.issubset(participants.columns):
        raise ValueError(
            f"participants.tsv must contain {required_columns}"
        )

    participants["Group"] = (
        participants["Group"].astype(str).str.strip()
    )

    participants = participants[
        participants["Group"].isin(["A", "F", "C"])
    ].copy()

    # Positive class: A + F. Negative class: C.
    participants["label"] = (
        participants["Group"].isin(["A", "F"])
    ).astype(int)

    feature_rows = []
    audit_rows = []

    print("Searching for EEG recordings...")
    print("Dataset:", ROOT)
    print("Output:", OUTPUT)

    for _, participant in participants.iterrows():
        subject = participant["participant_id"]
        group = participant["Group"]

        eeg_folder = ROOT / subject / "eeg"

        if not eeg_folder.exists():
            print(f"SKIP {subject}: EEG folder not found")
            continue

        set_files = sorted(eeg_folder.glob("*.set"))

        if not set_files:
            print(f"SKIP {subject}: no .set files")
            continue

        # Use one recording per participant.
        if len(set_files) > 1:
            print(
                f"NOTE {subject}: found {len(set_files)} recordings; "
                f"using {set_files[0].name}"
            )

        set_file = set_files[0]

        try:
            # Preload and filter recording once per participant, then resample for each rate
            raw_orig = mne.io.read_raw_eeglab(
                str(set_file),
                preload=True,
                verbose="ERROR",
            )
            raw_orig.pick_types(eeg=True)
            raw_orig.rename_channels(lambda name: name.strip())

            fs_orig = float(raw_orig.info["sfreq"])
            if fs_orig <= 2 * BANDS["gamma"][1]:
                raise ValueError(
                    f"Sampling frequency {fs_orig} Hz is insufficient "
                    "for the selected frequency bands."
                )

            raw_orig.filter(
                l_freq=1.0,
                h_freq=45.0,
                verbose="ERROR",
            )

            # Compute features once per (recording, rate) across 500, 250, and 125 Hz
            for rate in SAMPLING_RATES:
                try:
                    features, channels, n_windows, fs = (
                        extract_features(raw_orig, target_sfreq=rate)
                    )

                    row = {
                        "participant_id": subject,
                        "Group": group,
                        "label": int(participant["label"]),
                        "sampling_rate_hz": int(rate),
                    }

                    row.update(features)
                    feature_rows.append(row)

                    audit_rows.append({
                        "participant_id": subject,
                        "Group": group,
                        "file": str(set_file),
                        "sampling_frequency_hz": fs,
                        "channels": len(channels),
                        "windows": n_windows,
                        "status": "success",
                        "error": "",
                    })

                    print(
                        f"Processed {subject} ({group}) @ {rate} Hz - "
                        f"{len(channels)} channels, "
                        f"{n_windows} windows"
                    )

                except Exception as exc:
                    print(f"ERROR {subject} @ {rate} Hz: {exc}")

                    audit_rows.append({
                        "participant_id": subject,
                        "Group": group,
                        "file": str(set_file),
                        "sampling_frequency_hz": rate,
                        "channels": "",
                        "windows": "",
                        "status": "failed",
                        "error": str(exc),
                    })

        except Exception as exc:
            print(f"ERROR {subject}: {exc}")

            audit_rows.append({
                "participant_id": subject,
                "Group": group,
                "file": str(set_file),
                "sampling_frequency_hz": "",
                "channels": "",
                "windows": "",
                "status": "failed",
                "error": str(exc),
            })

    # Save processing audit outside the Git repository by default.
    pd.DataFrame(audit_rows).to_csv(
        OUTPUT / "processing_audit.csv",
        index=False,
    )

    if not feature_rows:
        raise RuntimeError(
            "No EEG features were extracted."
        )

    features_df = pd.DataFrame(feature_rows)

    features_path = OUTPUT / "eeg_features.csv"
    features_df.to_csv(features_path, index=False)

    print("\nFeature extraction complete.")
    print("Participants processed:", features_df["participant_id"].nunique())
    print("Total (participant, rate) feature rows:", len(features_df))
    print(
        "Features per row:",
        len(features_df.columns) - 4,
    )
    print("Sampling rate counts:")
    print(features_df["sampling_rate_hz"].value_counts().to_string())
    print("Feature file:", features_path)

    # --------------------------------------------------
    # 4. Evaluate reduced channel configurations across sampling rates
    # --------------------------------------------------

    feature_columns = [
        col for col in features_df.columns
        if col not in {
            "participant_id",
            "Group",
            "label",
            "sampling_rate_hz",
        }
    ]

    # Reference subset to create cross-validation splits.
    # Because each sampling rate has the exact same participants in the exact same order,
    # generating splits on this reference subset guarantees that all channel configurations
    # and all sampling rates are evaluated on the exact same folds for every repeat.
    ref_rate = SAMPLING_RATES[0]
    ref_df = features_df[features_df["sampling_rate_hz"] == ref_rate].copy()
    y_ref = ref_df["label"].to_numpy()

    if len(np.unique(y_ref)) != 2:
        raise RuntimeError(
            "Both binary classes are required."
        )

    class_counts = np.bincount(y_ref)

    if class_counts.min() < 5:
        raise RuntimeError(
            "At least five participants per class are needed "
            "for five-fold cross-validation."
        )

    # Change explanation:
    # Instead of running a single 5-fold cross-validation, we repeat it 10 times
    # with 10 different random seeds to get reliable mean and standard deviation
    # estimates of model performance across different data splits.
    n_repeats = 10
    random_seeds = [42 + i for i in range(n_repeats)]

    # Change explanation:
    # We pre-generate the 5-fold splits for each of the 10 repeats on the reference
    # participant set beforehand. This guarantees that all channel configurations
    # and all sampling rates are tested on the exact same folds for each repeat.
    repeat_splits = [
        list(
            StratifiedKFold(
                n_splits=5,
                shuffle=True,
                random_state=seed,
            ).split(ref_df, y_ref)
        )
        for seed in random_seeds
    ]

    results = []

    # Run every channel configuration at every sampling rate.
    # Features were computed once per (recording, rate) above,
    # and are reused across channel sets by selecting columns.
    for config_name, selected_channels in CHANNEL_SETS.items():
        # Change explanation:
        # Channel subsets are predefined based on clinical montage layouts.
        # Channels are NOT selected using test-fold labels to avoid bias.
        selected_columns = [
            col for col in feature_columns
            if col.split("_", 1)[0] in selected_channels
        ]

        if not selected_columns:
            print(
                f"SKIP {config_name}: no matching features"
            )
            continue

        for rate in SAMPLING_RATES:
            rate_df = features_df[features_df["sampling_rate_hz"] == rate].copy()
            if rate_df.empty:
                print(f"SKIP {config_name} @ {rate} Hz: no feature data")
                continue

            X = rate_df[selected_columns]
            y = rate_df["label"].to_numpy()

            # Lists to store performance metrics across the 10 repeats for threshold 0.5
            repeat_sensitivities_05 = []
            repeat_specificities_05 = []
            repeat_balanced_accs_05 = []
            repeat_extra_referrals_05 = []

            # Lists to store metrics for the target 80% sensitivity threshold (chosen on training data only)
            repeat_sensitivities_80 = []
            repeat_specificities_80 = []
            repeat_balanced_accs_80 = []
            repeat_extra_referrals_80 = []
            repeat_thresholds_80 = []

            # Change explanation:
            # Loop over the 10 pre-computed splits to repeat the 5-fold cross-validation 10 times.
            for repeat_idx, splits in enumerate(repeat_splits):
                oof_preds_05 = np.zeros(len(y), dtype=int)
                oof_preds_80 = np.zeros(len(y), dtype=int)
                fold_thresholds_80 = []

                for fold_idx, (train_idx, test_idx) in enumerate(splits):
                    X_train, y_train = X.iloc[train_idx], y[train_idx]
                    X_test, y_test = X.iloc[test_idx], y[test_idx]

                    # Change explanation:
                    # StandardScaler is kept inside the sklearn pipeline so scaling parameters
                    # are fit strictly on the training fold and applied to the test fold (no data leakage).
                    model = make_pipeline(
                        StandardScaler(),
                        LogisticRegression(
                            max_iter=3000,
                            class_weight="balanced",
                            random_state=42,
                        ),
                    )

                    # 1. For each outer training fold, get out-of-fold predicted probabilities
                    # on that training set using an inner cross-validation.
                    inner_cv = StratifiedKFold(
                        n_splits=5,
                        shuffle=True,
                        random_state=42,
                    )
                    inner_probs = cross_val_predict(
                        model,
                        X_train,
                        y_train,
                        cv=inner_cv,
                        method="predict_proba",
                    )[:, 1]

                    # 2. From those, choose the highest threshold that still gives sensitivity
                    # of at least 0.80 on the training set.
                    # CRITICAL: Test-fold labels are NEVER used to choose the threshold.
                    # The threshold is determined solely using out-of-fold predictions on the training set.
                    candidate_thresholds = np.sort(
                        np.unique(np.concatenate([[0.0], inner_probs]))
                    )
                    valid_thresholds = [
                        t for t in candidate_thresholds
                        if (
                            np.sum((inner_probs >= t) & (y_train == 1))
                            / max(np.sum(y_train == 1), 1)
                        ) >= 0.80
                    ]
                    thresh_80 = max(valid_thresholds) if valid_thresholds else 0.5
                    fold_thresholds_80.append(thresh_80)

                    # 3. Fit the model on the full outer training fold, then apply that threshold
                    # to the outer test fold.
                    model.fit(X_train, y_train)
                    test_probs = model.predict_proba(X_test)[:, 1]

                    oof_preds_05[test_idx] = (test_probs >= 0.5).astype(int)
                    oof_preds_80[test_idx] = (test_probs >= thresh_80).astype(int)

                # Metrics for default 0.5 threshold
                tn_05, fp_05, fn_05, tp_05 = confusion_matrix(
                    y,
                    oof_preds_05,
                    labels=[0, 1],
                ).ravel()
                sens_05 = tp_05 / (tp_05 + fn_05) if (tp_05 + fn_05) else np.nan
                spec_05 = tn_05 / (tn_05 + fp_05) if (tn_05 + fp_05) else np.nan
                bal_acc_05 = balanced_accuracy_score(y, oof_preds_05)
                extra_referrals_05 = (1.0 - spec_05) * 100.0

                repeat_sensitivities_05.append(sens_05)
                repeat_specificities_05.append(spec_05)
                repeat_balanced_accs_05.append(bal_acc_05)
                repeat_extra_referrals_05.append(extra_referrals_05)

                # Metrics for target 80% sensitivity threshold
                tn_80, fp_80, fn_80, tp_80 = confusion_matrix(
                    y,
                    oof_preds_80,
                    labels=[0, 1],
                ).ravel()
                sens_80 = tp_80 / (tp_80 + fn_80) if (tp_80 + fn_80) else np.nan
                spec_80 = tn_80 / (tn_80 + fp_80) if (tn_80 + fp_80) else np.nan
                bal_acc_80 = balanced_accuracy_score(y, oof_preds_80)
                extra_referrals_80 = (1.0 - spec_80) * 100.0

                repeat_sensitivities_80.append(sens_80)
                repeat_specificities_80.append(spec_80)
                repeat_balanced_accs_80.append(bal_acc_80)
                repeat_extra_referrals_80.append(extra_referrals_80)
                repeat_thresholds_80.append(float(np.mean(fold_thresholds_80)))

            # Summary statistics across 10 repeats for threshold = 0.50
            sens_05_mean = float(np.mean(repeat_sensitivities_05))
            sens_05_std = float(np.std(repeat_sensitivities_05))
            spec_05_mean = float(np.mean(repeat_specificities_05))
            spec_05_std = float(np.std(repeat_specificities_05))
            bal_acc_05_mean = float(np.mean(repeat_balanced_accs_05))
            bal_acc_05_std = float(np.std(repeat_balanced_accs_05))
            extra_referrals_05_mean = float((1.0 - spec_05_mean) * 100.0)
            extra_referrals_05_std = float(np.std(repeat_extra_referrals_05))

            # Summary statistics across 10 repeats for target 80% sensitivity threshold
            sens_80_mean = float(np.mean(repeat_sensitivities_80))
            sens_80_std = float(np.std(repeat_sensitivities_80))
            spec_80_mean = float(np.mean(repeat_specificities_80))
            spec_80_std = float(np.std(repeat_specificities_80))
            bal_acc_80_mean = float(np.mean(repeat_balanced_accs_80))
            bal_acc_80_std = float(np.std(repeat_balanced_accs_80))
            extra_referrals_80_mean = float((1.0 - spec_80_mean) * 100.0)
            extra_referrals_80_std = float(np.std(repeat_extra_referrals_80))
            thresh_80_mean = float(np.mean(repeat_thresholds_80))
            thresh_80_std = float(np.std(repeat_thresholds_80))

            results.append({
                "configuration": config_name,
                "sampling_rate_hz": rate,
                "channels_used": len(selected_channels),
                "features_used": len(selected_columns),
                # 0.5 threshold results
                "sensitivity_mean": sens_05_mean,
                "sensitivity_std": sens_05_std,
                "specificity_mean": spec_05_mean,
                "specificity_std": spec_05_std,
                "balanced_accuracy_mean": bal_acc_05_mean,
                "balanced_accuracy_std": bal_acc_05_std,
                "extra_referrals_per_100_healthy": extra_referrals_05_mean,
                "extra_referrals": extra_referrals_05_mean,
                "extra_referrals_std": extra_referrals_05_std,
                # Target ~80% sensitivity threshold results (chosen on training data only)
                "sensitivity_target80_mean": sens_80_mean,
                "sensitivity_target80_std": sens_80_std,
                "specificity_target80_mean": spec_80_mean,
                "specificity_target80_std": spec_80_std,
                "balanced_accuracy_target80_mean": bal_acc_80_mean,
                "balanced_accuracy_target80_std": bal_acc_80_std,
                "extra_referrals_target80_per_100_healthy": extra_referrals_80_mean,
                "threshold_target80_mean": thresh_80_mean,
                "threshold_target80_std": thresh_80_std,
                # Aliases
                "sensitivity_80_mean": sens_80_mean,
                "specificity_80_mean": spec_80_mean,
            })

            print(f"\n{config_name} @ {rate} Hz (across {n_repeats} repeats of 5-fold CV)")
            print("Channels:", len(selected_channels))
            print("Sampling rate (Hz):", rate)
            print("Features:", len(selected_columns))
            print(f"Threshold = 0.50:")
            print(f"  Sensitivity:       {sens_05_mean:.3f} ± {sens_05_std:.3f}")
            print(f"  Specificity:       {spec_05_mean:.3f} ± {spec_05_std:.3f}")
            print(f"  Balanced accuracy: {bal_acc_05_mean:.3f} ± {bal_acc_05_std:.3f}")
            print(f"  Extra referrals:   {extra_referrals_05_mean:.1f} ± {extra_referrals_05_std:.1f}")
            print(f"Target 80% sensitivity threshold (mean T = {thresh_80_mean:.3f}):")
            print(f"  Sensitivity:       {sens_80_mean:.3f} ± {sens_80_std:.3f}")
            print(f"  Specificity:       {spec_80_mean:.3f} ± {spec_80_std:.3f}")
            print(f"  Balanced accuracy: {bal_acc_80_mean:.3f} ± {bal_acc_80_std:.3f}")
            print(f"  Extra referrals:   {extra_referrals_80_mean:.1f} ± {extra_referrals_80_std:.1f}")

    results_df = pd.DataFrame(results)

    # Change explanation:
    # Save the mean and standard deviation of sensitivity, specificity, balanced accuracy,
    # and extra referrals to channel_comparison_repeated.csv, including sampling_rate_hz.
    results_path = OUTPUT / "channel_comparison_repeated.csv"
    results_df.to_csv(results_path, index=False)

    # Format and save dashboard-compatible CSV
    # Columns: channels, sampling_rate_hz, sensitivity_pct, extra_referrals_per_100_healthy
    dashboard_rows = []
    for _, r in results_df.iterrows():
        dashboard_rows.append({
            "channels": int(r["channels_used"]),
            "sampling_rate_hz": int(r["sampling_rate_hz"]),
            "sensitivity_pct": round(float(r["sensitivity_target80_mean"]) * 100.0, 1),
            "extra_referrals_per_100_healthy": round(float(r["extra_referrals_target80_per_100_healthy"]), 1),
        })
    dashboard_df = pd.DataFrame(dashboard_rows)

    repo_results_dir = Path(__file__).resolve().parent / "results"
    repo_results_dir.mkdir(parents=True, exist_ok=True)
    dashboard_path = repo_results_dir / "dashboard_results.csv"
    dashboard_df.to_csv(dashboard_path, index=False)
    dashboard_df.to_csv(OUTPUT / "dashboard_results.csv", index=False)

    print("\n" + "=" * 55)
    print("REPEATED CHANNEL & SAMPLING RATE RESULTS")
    print("=" * 55)

    print(
        results_df.to_string(
            index=False,
            float_format=lambda x: f"{x:.3f}",
        )
    )

    print("\nSaved repeated CV results to:", results_path)
    print("Saved dashboard results to:", dashboard_path)
    print(
        "Saved processing audit to:",
        OUTPUT / "processing_audit.csv",
    )
    print("\nResearch prototype only; not for clinical diagnosis.")

    # --------------------------------------------------
    # 5. Evaluate random channel pairs (separate analysis)
    # --------------------------------------------------
    # Does not change main results.
    evaluate_random_channel_pairs(
        features_df=features_df,
        feature_columns=feature_columns,
        n_pairs=20,
        random_seed=42,
    )


def evaluate_random_channel_pairs(
    features_df,
    feature_columns,
    n_pairs=20,
    random_seed=42,
    rate=500,
    output_path=None,
):
    """
    Evaluates 20 randomly chosen pairs of EEG channels (fixed random seed)
    using the repeated 5-fold cross-validation pipeline.
    Saves the sensitivity and specificity of each pair to research/results/random_pairs.csv.
    Does not modify or interfere with the main channel reduction results.
    """
    all_channels = sorted(
        list(
            set(
                col.split("_", 1)[0]
                for col in feature_columns
            )
        )
    )

    all_pairs = sorted(list(itertools.combinations(all_channels, 2)))
    rng = random.Random(random_seed)
    sampled_pairs = rng.sample(all_pairs, min(n_pairs, len(all_pairs)))

    if "sampling_rate_hz" in features_df.columns:
        df_rate = features_df[features_df["sampling_rate_hz"] == rate].copy()
    else:
        df_rate = features_df.copy()

    y = df_rate["label"].to_numpy()
    n_repeats = 10
    seeds = [42 + i for i in range(n_repeats)]
    repeat_splits = [
        list(
            StratifiedKFold(
                n_splits=5,
                shuffle=True,
                random_state=seed,
            ).split(df_rate, y)
        )
        for seed in seeds
    ]

    pair_results = []
    print(f"\nEvaluating {len(sampled_pairs)} randomly chosen channel pairs (seed={random_seed})...")

    for ch1, ch2 in sampled_pairs:
        pair_name = f"{ch1}-{ch2}"
        selected_cols = [
            c for c in feature_columns
            if c.split("_", 1)[0] in (ch1, ch2)
        ]
        X = df_rate[selected_cols]

        repeat_sens_05, repeat_spec_05 = [], []
        repeat_sens_80, repeat_spec_80 = [], []

        for repeat_idx, splits in enumerate(repeat_splits):
            oof_preds_05 = np.zeros(len(y), dtype=int)
            oof_preds_80 = np.zeros(len(y), dtype=int)

            for fold_idx, (train_idx, test_idx) in enumerate(splits):
                X_train, y_train = X.iloc[train_idx], y[train_idx]
                X_test, y_test = X.iloc[test_idx], y[test_idx]

                model = make_pipeline(
                    StandardScaler(),
                    LogisticRegression(
                        max_iter=3000,
                        class_weight="balanced",
                        random_state=42,
                    ),
                )

                inner_cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
                inner_probs = cross_val_predict(
                    model,
                    X_train,
                    y_train,
                    cv=inner_cv,
                    method="predict_proba",
                )[:, 1]

                candidate_thresholds = np.sort(
                    np.unique(np.concatenate([[0.0], inner_probs]))
                )
                valid_thresholds = [
                    t for t in candidate_thresholds
                    if (
                        np.sum((inner_probs >= t) & (y_train == 1))
                        / max(np.sum(y_train == 1), 1)
                    ) >= 0.80
                ]
                thresh_80 = max(valid_thresholds) if valid_thresholds else 0.5

                model.fit(X_train, y_train)
                test_probs = model.predict_proba(X_test)[:, 1]

                oof_preds_05[test_idx] = (test_probs >= 0.5).astype(int)
                oof_preds_80[test_idx] = (test_probs >= thresh_80).astype(int)

            tn_05, fp_05, fn_05, tp_05 = confusion_matrix(y, oof_preds_05, labels=[0, 1]).ravel()
            repeat_sens_05.append(tp_05 / (tp_05 + fn_05) if (tp_05 + fn_05) else np.nan)
            repeat_spec_05.append(tn_05 / (tn_05 + fp_05) if (tn_05 + fp_05) else np.nan)

            tn_80, fp_80, fn_80, tp_80 = confusion_matrix(y, oof_preds_80, labels=[0, 1]).ravel()
            repeat_sens_80.append(tp_80 / (tp_80 + fn_80) if (tp_80 + fn_80) else np.nan)
            repeat_spec_80.append(tn_80 / (tn_80 + fp_80) if (tn_80 + fp_80) else np.nan)

        pair_results.append({
            "pair": pair_name,
            "channel_1": ch1,
            "channel_2": ch2,
            "sensitivity": round(float(np.mean(repeat_sens_05)), 4),
            "specificity": round(float(np.mean(repeat_spec_05)), 4),
            "sensitivity_std": round(float(np.std(repeat_sens_05)), 4),
            "specificity_std": round(float(np.std(repeat_spec_05)), 4),
            "sensitivity_target80": round(float(np.mean(repeat_sens_80)), 4),
            "specificity_target80": round(float(np.mean(repeat_spec_80)), 4),
        })

    pairs_df = pd.DataFrame(pair_results)

    if output_path is None:
        repo_results_dir = Path(__file__).resolve().parent / "results"
        repo_results_dir.mkdir(parents=True, exist_ok=True)
        output_path = repo_results_dir / "random_pairs.csv"

    pairs_df.to_csv(output_path, index=False)
    print(f"Saved random pairs results to: {output_path}")
    return pairs_df


if __name__ == "__main__":
    main()
