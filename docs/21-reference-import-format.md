# Reference Portfolio Import Format

The normalized JSON import format is intentionally simple so the same validation engine can receive CSV, XLSX and JSON adapters.

```json
{
  "datasetKey": "geography",
  "format": "json",
  "filename": "geography-release.json",
  "rows": [
    {
      "code": "EXAMPLE",
      "name": "Example",
      "type": "region",
      "parent_code": null,
      "status": "active",
      "metadata": {}
    }
  ]
}
```

For CSV/XLSX adapters, map the source columns into these normalized fields before validation.

Do not put credentials, personal records, payment records, biometric data or uploaded identity documents into reference-data imports.
