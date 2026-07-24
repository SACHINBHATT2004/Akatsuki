Spreadsheet libraries
=====================

The website first checks this vendor folder for local browser bundles.
If a local bundle is not present, it loads the pinned CDN version.

For fully offline use, save these files here:

1. vendor/exceljs.min.js
   ExcelJS 4.4.0 browser bundle
   Used to read modern XLSX/XLSM files and create the final formatted XLSX report.

2. vendor/xlsx.full.min.js
   SheetJS CE 0.20.3 full browser bundle
   Used to read legacy and alternate formats such as XLS, XLSB, ODS, FODS,
   Numbers, Spreadsheet XML, SYLK, DIF, DBF and Lotus spreadsheet files.

CSV, TSV and TXT uploads have a built-in parser and do not need SheetJS for reading.
Report download still needs ExcelJS.

Keep the applicable upstream license files with any locally copied library bundle.
