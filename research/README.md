\# NeuroSpec EEG Channel-Reduction Experiment



\## Objective



This research prototype investigates whether reducing the number of EEG channels can preserve useful classification performance when distinguishing participants with dementia diagnoses from healthy controls.



The experiment supports NeuroSpec's broader goal of exploring EEG hardware configurations and their potential trade-offs between performance and cost.



\## Dataset



\- Dataset: ds004504

\- Original sampling rate: 500 Hz

\- Original EEG channels: 19

\- Diagnostic groups: Alzheimer's disease (A), frontotemporal dementia (F), and healthy controls (C)

\- Participants processed: 88



The binary classification task groups A and F together and compares them against C.



\## Method



1\. Load EEG recordings.

2\. Divide recordings into 10-second windows.

3\. Extract Welch power spectral density features.

4\. Calculate absolute log power and relative power for five frequency bands: delta, theta, alpha, beta, and gamma.

5\. Aggregate features at the participant level.

6\. Evaluate logistic regression using feature scaling and stratified five-fold cross-validation.

7\. Compare preliminary performance across different channel configurations.



\## Preliminary Results



See `results/channel\_comparison.csv` for the recorded channel-comparison metrics.



These results are preliminary and should not be interpreted as proof that fewer EEG channels are sufficient for reliable dementia detection. In particular, the two-channel configuration's observed performance requires further investigation and validation.



\## Current Scope



Implemented:

\- EEG feature extraction

\- Participant-level feature aggregation

\- Preliminary channel-count comparison



Not yet implemented or validated:

\- Systematic sampling-rate reduction

\- Noise and lower-bit-depth simulation

\- Repeated cross-validation and uncertainty estimates

\- Permutation testing

\- Clinical validation

\- Integration of experiment results into the live NeuroSpec interface



\## Limitations and Responsible Use



This is a research prototype, not a clinically validated dementia screening or diagnostic system.



Classification results depend on the dataset, preprocessing, participant distribution, validation design, and selected channels. They do not establish clinical utility or generalizability to new populations.



The reported results are preliminary. Further checks are needed to confirm that channel selection and all preprocessing steps avoid information leakage during cross-validation.



\## Reproducibility



The analysis script is `eeg\_analysis.py`. Review its input and output paths before running it on another computer. Install the required Python dependencies in an appropriate environment before execution.



Raw EEG recordings and participant-level feature files are intentionally excluded from this repository pending review of dataset terms and privacy considerations.



\## Relationship to NeuroSpec



This experiment is a separate research component. It does not yet establish the cheapest hardware configuration meeting NeuroSpec's sensitivity and extra-referral constraints, and it is not yet integrated into the live demonstration.



