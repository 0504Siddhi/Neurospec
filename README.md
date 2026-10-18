# NeuroSpec

A planning-tool prototype that helps a health program choose the cheapest EEG sensor specification (channels and sampling rate) that still meets a chosen pre-screening performance level.

**Status: illustrative mockup.** All numbers in the current version are placeholders, not real results.

Team NeuroWell, Pune Vidyarthi Griha's College of Engineering, Technology & Management (PVG COET), Pune. 

## What it does

- Set a minimum sensitivity (patients caught out of 100) and a maximum number of extra referrals per 100 healthy people.
- See the cheapest specification that meets both limits.
- Compare all specifications on a cost vs. sensitivity chart and in a table.
- Edit the cost assumptions and see the recommendation update.
- Load your own results from a CSV with these columns: `channels`, `sampling_rate_hz`, `sensitivity_pct`, `extra_referrals_per_100_healthy`.

## Run it

No installation needed. Download the files and open `index.html` in a browser.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | Styling |
| `app.js` | Recommendation logic and chart |
| `data.js` | Placeholder results and cost assumptions |

## Limitations

- Placeholder data only. No real evaluation has been run in this version.
- Cost figures are estimates, not vendor quotes.
- Intended data source for real runs: OpenNeuro ds004504, a 19-channel, 500 Hz resting-state EEG dataset recorded with wet electrodes in a hospital. Real low-cost sensors may be noisier. https://doi.org/10.18112/openneuro.ds004504.v1.0.7
- Pre-screening support only. Not a diagnosis and not clinically validated.

