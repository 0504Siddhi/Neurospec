# NeuroSpec Dashboard

A planning-tool prototype that helps a health program choose the cheapest EEG sensor specification (channels and sampling rate) that still meets a chosen pre-screening performance level.

**Status: Functional UI Prototype.** The application defaults to illustrative placeholder numbers to demonstrate the UI mechanics, but users can upload empirical test results via the built-in CSV ingestion tool.

## What it does

- Set a minimum sensitivity (patients caught out of 100) and a maximum number of extra referrals per 100 healthy people.
- Identify the cheapest hardware specification that meets both limits based on a component cost model.
- Compare all specifications on a cost vs. sensitivity scatter chart (highlighting the Pareto frontier) and in a sortable matrix table.
- Edit the hardware cost assumptions and see the recommendations update dynamically.
- Load real testing results from a CSV requiring these exact columns: `channels`, `sampling_rate_hz`, `sensitivity_pct`, `extra_referrals_per_100_healthy`.

## Run it

No installation or server is needed. Download the files and open `index.html` in any modern web browser.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure, layout, and textual guidance |
| `style.css` | Clinical workbook styling, layout grid, and print media queries |
| `app.js` | Recommendation logic, Pareto frontier calculation, Chart.js rendering, and CSV parsing |
| `data.js` | Default placeholder results dataset and initial hardware cost assumptions |

*Note: The machine learning pipeline used to generate real empirical data is located separately in the `research/` directory. That script outputs a `dashboard_results.csv` which can be uploaded directly into this interface.*

## Limitations

- **Default Data:** Upon initial load, the dashboard relies on placeholder data. You must use the "Load Real Results" button to upload empirical data to view actual clinical trade-offs.
- **Cost Model:** Cost figures are basic component estimates (front-end chip, ESP32 board, electrodes) based on supplier listing prices. They are not complete manufacturing vendor quotes.
- **Clinical Boundaries:** This tool is intended for pre-screening logistics and hardware budgeting support only. It is not a diagnostic device and is not clinically validated.
