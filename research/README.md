# NeuroSpec EEG Channel-Reduction Experiment

## Objective

This research prototype investigates whether reducing the number of EEG channels and lowering the sampling rate can preserve useful classification performance when distinguishing participants with dementia diagnoses from healthy controls.

The experiment supports NeuroSpec's broader goal of exploring EEG hardware configurations and their potential trade-offs between clinical screening performance and procurement cost.

## Dataset

- Dataset: ds004504
- Original sampling rate: 500 Hz
- Original EEG channels: 19
- Diagnostic groups: Alzheimer's disease (A), frontotemporal dementia (F), and healthy controls (C)
- Participants processed: 88

The binary classification task groups A and F together (positive class) and compares them against C (negative class).

## Method

1. Load EEG recordings and apply a 1.0 to 45.0 Hz band-pass filter.
2. Resample recordings to test multiple target sampling rates (500 Hz, 250 Hz, and 125 Hz).
3. Divide recordings into 10-second non-overlapping windows.
4. Extract Welch power spectral density features, calculating absolute log power and relative power for five frequency bands: delta (1-4), theta (4-8), alpha (8-13), beta (13-30), and gamma (30-45).
5. Aggregate features at the participant level using median power across windows.
6. Evaluate predefined channel configurations (19, 8, 4, and 2 channels) across all sampling rates.
7. Train a logistic regression model using feature scaling and a repeated stratified 5-fold cross-validation pipeline (10 repeats to generate uncertainty estimates).
8. Calibrate the decision threshold dynamically on out-of-fold training predictions to target an 80% minimum sensitivity.
9. Evaluate a separate subset of 20 randomly selected channel pairs for benchmarking.

## Preliminary Results

The outputs of this pipeline are saved in the `results/` directory:
- `channel_comparison_repeated.csv`: Contains the mean and standard deviation metrics (sensitivity, specificity, balanced accuracy, and extra referrals) across the 10 cross-validation repeats for all channel and sampling rate combinations.
- `dashboard_results.csv`: A formatted subset of the results designed to integrate with the NeuroSpec UI.
- `random_pairs.csv`: Benchmarking results for the randomly selected two-channel combinations.

These results are preliminary and should not be interpreted as proof that fewer EEG channels are sufficient for reliable dementia detection.

## Current Scope

Implemented:
- EEG feature extraction and participant-level aggregation
- Predefined channel-count comparison (19, 8, 4, 2)
- Systematic sampling-rate reduction (500 Hz, 250 Hz, 125 Hz)
- Repeated stratified cross-validation (10 repeats of 5 folds) with uncertainty estimates (standard deviation)
- Dynamic threshold calibration targeting 80% sensitivity
- Random channel pair benchmarking

Not yet implemented or validated:
- Noise and lower-bit-depth simulation
- Permutation testing
- Clinical validation
- Integration of experiment results into the live NeuroSpec interface

## Limitations and Responsible Use

This is a research prototype, not a clinically validated dementia screening or diagnostic system.

Classification results depend on the dataset, preprocessing, participant distribution, validation design, and selected channels. They do not establish clinical utility or generalizability to new populations.

The reported results are preliminary. Further checks are needed to confirm that channel selection and all preprocessing steps avoid information leakage during cross-validation.

## Reproducibility

The analysis script is `eeg_analysis.py`. Review its input and output paths before running it on another computer. Install the required Python dependencies in an appropriate environment before execution.

Raw EEG recordings and participant-level feature files are intentionally excluded from this repository pending review of dataset terms and privacy considerations.

## Relationship to NeuroSpec

This experiment is a separate research component. It does not yet establish the cheapest hardware configuration meeting NeuroSpec's sensitivity and extra-referral constraints, and it is not yet integrated into the live demonstration.
