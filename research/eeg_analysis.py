
from pathlib import Path
import os
import warnings

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


# --------------------------------------------------
# 2. Extract features from one EEG recording
# --------------------------------------------------

def extract_features(set_file):
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
            features, channels, n_windows, fs = (
                extract_features(set_file)
            )

            row = {
                "participant_id": subject,
                "Group": group,
                "label": int(participant["label"]),
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
                f"Processed {subject} ({group}) - "
                f"{len(channels)} channels, "
                f"{n_windows} windows"
            )

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
    print("Participants processed:", len(features_df))
    print(
        "Features per participant:",
        len(features_df.columns) - 3,
    )
    print("Group counts:")
    print(features_df["Group"].value_counts().to_string())
    print("Feature file:", features_path)

    # --------------------------------------------------
    # 4. Evaluate reduced channel configurations
    # --------------------------------------------------

    feature_columns = [
        col for col in features_df.columns
        if col not in {
            "participant_id",
            "Group",
            "label",
        }
    ]

    X_all = features_df[feature_columns]
    y = features_df["label"].to_numpy()

    if len(np.unique(y)) != 2:
        raise RuntimeError(
            "Both binary classes are required."
        )

    class_counts = np.bincount(y)

    if class_counts.min() < 5:
        raise RuntimeError(
            "At least five participants per class are needed "
            "for five-fold cross-validation."
        )

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    # Reuse identical folds for each channel configuration.
    splits = list(cv.split(X_all, y))

    results = []

    for config_name, selected_channels in CHANNEL_SETS.items():
        selected_columns = [
            col for col in feature_columns
            if col.split("_", 1)[0] in selected_channels
        ]

        if not selected_columns:
            print(
                f"SKIP {config_name}: no matching features"
            )
            continue

        X = X_all[selected_columns]

        model = make_pipeline(
            StandardScaler(),
            LogisticRegression(
                max_iter=3000,
                class_weight="balanced",
                random_state=42,
            ),
        )

        # Generate out-of-fold probabilities for each participant.
        probabilities = cross_val_predict(
            model,
            X,
            y,
            cv=splits,
            method="predict_proba",
        )[:, 1]

        predictions = (
            probabilities >= 0.5
        ).astype(int)

        tn, fp, fn, tp = confusion_matrix(
            y,
            predictions,
            labels=[0, 1],
        ).ravel()

        sensitivity = (
            tp / (tp + fn)
            if (tp + fn)
            else np.nan
        )

        specificity = (
            tn / (tn + fp)
            if (tn + fp)
            else np.nan
        )

        results.append({
            "configuration": config_name,
            "channels_used": len(selected_channels),
            "features_used": len(selected_columns),
            "accuracy": accuracy_score(y, predictions),
            "balanced_accuracy": balanced_accuracy_score(
                y, predictions
            ),
            "roc_auc": roc_auc_score(y, probabilities),
            "sensitivity": sensitivity,
            "specificity": specificity,
            "true_positive": int(tp),
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "participants": len(y),
        })

        print(f"\n{config_name}")
        print("Channels:", len(selected_channels))
        print("Features:", len(selected_columns))
        print(f"Accuracy:          {results[-1]['accuracy']:.3f}")
        print(
            "Balanced accuracy: "
            f"{results[-1]['balanced_accuracy']:.3f}"
        )
        print(f"ROC-AUC:           {results[-1]['roc_auc']:.3f}")
        print(f"Sensitivity:       {sensitivity:.3f}")
        print(f"Specificity:       {specificity:.3f}")

    results_df = pd.DataFrame(results)

    results_path = OUTPUT / "channel_comparison.csv"
    results_df.to_csv(results_path, index=False)

    print("\n" + "=" * 55)
    print("CHANNEL REDUCTION RESULTS")
    print("=" * 55)

    print(
        results_df.to_string(
            index=False,
            float_format=lambda x: f"{x:.3f}",
        )
    )

    print("\nSaved results to:", results_path)
    print(
        "Saved processing audit to:",
        OUTPUT / "processing_audit.csv",
    )
    print("\nResearch prototype only; not for clinical diagnosis.")


if __name__ == "__main__":
    main()
