# Export Picker Flow

The export picker provides a single interface for choosing the output format, data scope, date range, and optional asset or bridge filters.

## How it works

1. Open the export picker from the Dashboard.
2. Choose one of the supported formats: CSV, JSON, or Spreadsheet (Excel-friendly CSV).
3. Select the export scope:
   - Analytics
   - Transactions
   - Health metrics
4. Set the start and end dates for the export.
5. Optionally filter by one or more assets and/or bridges.
6. Start the export and monitor the async job status inside the dialog.
7. Download the result once the export completes.

## Persistence

The picker saves format, scope, date range, and selected filters locally in the browser so the next export attempt restores your last-used settings.

## Status feedback

The dialog shows the latest export request for the current session, including:

- export status (pending, processing, completed, failed)
- request timestamp
- error messages when the export fails
- download link after completion
