# Publisher & Counsellor Report Builder

This is a browser-based website for converting an uploaded student/admission spreadsheet into the required summary table:

| Type | Publisher/Counsellor | Enquiry | Registration | Admission |
|---|---|---:|---:|---:|

The Serial No. column is intentionally not included.

## Start the website

### Windows
Double-click `OPEN_WEBSITE.bat` or open `index.html` in Chrome/Edge.

### macOS
Double-click `OPEN_WEBSITE.command` or open `index.html` in Chrome/Safari.

## Supported upload formats

The upload box accepts the common spreadsheet formats below:

- Excel: `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.xlt`, `.xltx`, `.xltm`
- Text tables: `.csv`, `.tsv`, `.txt`
- Other spreadsheets: `.ods`, `.fods`, `.numbers`, Spreadsheet XML, `.slk` / `.sylk`, `.dif`, `.dbf`, Lotus `.wk1` / `.wk3` / `.wks` / `.123`, and spreadsheet HTML

CSV/TSV/TXT files are read directly in the browser. The parser supports quoted commas, quoted line breaks, escaped quotes, comma/semicolon/tab/pipe delimiter detection, UTF-8, UTF-16 and common Windows text encoding fallback.

Modern `.xlsx` / `.xlsm` files use ExcelJS. Older and alternate spreadsheet formats use the full SheetJS reader. When the libraries are not stored locally, the website loads pinned browser builds from their CDN.

For fully offline use, place:

- ExcelJS 4.4.0 at `vendor/exceljs.min.js`
- SheetJS 0.20.3 full browser build at `vendor/xlsx.full.min.js`


## UI, themes and sound

- Dark theme is the default; the top-right theme button switches to light mode.
- The sound button enables or mutes local Web Audio effects for hover, click, upload, report generation, success, error and download actions.
- No audio files or external sound assets are required. Browsers allow sound only after the first user interaction.
- The layout is responsive for desktop, tablet and mobile.

## Exact processing logic

1. **Enquiry**
   - Every non-empty uploaded row is treated as an enquiry for its `Publisher`.
   - Repeated Publisher names are grouped and counted.

2. **Registration — counted independently from enquiry ownership**
   - The website scans every qualifying row in the complete uploaded sheet; it does not first filter by Publisher.
   - A row is a registration when `Registration Fee Approval Date` / `Approval Date` contains a real value. Blank markers such as `NA`, `N/A`, `null` and `(blank)` are not counted.
   - Attribution name = `User Name FEE` when filled, even when a different Publisher created the enquiry.
   - When `User Name FEE` is empty, the registration count stays with `Publisher`.
   - A person who appears only in `User Name FEE` is still added to the output with `Enquiry = 0`.

3. **Admission — counted independently from enquiry ownership**
   - The website scans every qualifying row in the complete uploaded sheet; it does not first filter by Publisher.
   - A row is an admission when the selected Enrollment/Admission Status column contains an accepted Yes-value.
   - Default accepted values: `Yes, Y, True, 1, Enrolled, Admitted, Confirmed`.
   - Attribution name = `User Name Token Fee` when filled, even when a different Publisher created the enquiry.
   - When `User Name Token Fee` is empty, the admission count stays with `Publisher`.
   - A person who appears only in `User Name Token Fee` is still added to the output with `Enquiry = 0`.

**Example:** If Consultant A created the enquiry, but Shalini collected the application fee and token fee, Consultant A keeps the enquiry count. Shalini receives the registration/admission counts. Consultant A receives those later-stage counts only where the corresponding FEE/Token user cell is blank.

4. **Detailed Type**
   - First priority: `Counsellor_Center.xlsx`, where the Center column is treated as Detailed Type.
   - Second priority: `Complete_Data_Counsellors_Consultants.xlsx`, using its Detailed Type column.
   - Matching ignores case, extra spaces, common title prefixes, punctuation and compact-name differences such as `CGS Kotdwar` vs `CGSKotdwar`.
   - Unknown names appear as `Not Mapped`. Their Detailed Type can be assigned in the website and is saved in that browser.

5. **Output**
   - One unique row per resolved Publisher/Counsellor/Consultant name.
   - Sorted by Detailed Type and then name.
   - Bold header, black cell boundaries, fixed widths, frozen header and Excel filter.
   - Optional audit sheets can be enabled before download.

## Expected uploaded columns

The website auto-detects headings and also provides manual dropdown mapping for:

- Publisher — required
- Registration Fee Approval Date / Approval Date — required
- User Name FEE / APP Fee — required column; a blank cell falls back to Publisher
- Enrollment Status / Admission Status — required
- User Name Token Fee — required column; a blank cell falls back to Publisher

The blank-template button also includes `Enrollment Fee`, `Registration`, and `Registration Fee` because these columns may exist in the source report, although the current counting rules do not depend on them.

## Reference data included

- `reference_sources/Counsellor_Center.xlsx`
- `reference_sources/Complete_Data_Counsellors_Consultants.xlsx`
- An embedded browser-ready copy in `js/reference-data.js`

The embedded mapping currently contains **357 unique names**.

## Deploy as a static website

No backend and no database are required.

- **GitHub Pages:** upload the complete folder and publish the repository root.
- **Render Static Site:** build command can be blank; publish directory is `.`.
- **Netlify/Vercel static deployment:** upload the folder as-is.

Uploaded student data is processed in the browser and is not sent to a server by this code.

## Verification

Run the included core tests with Node.js:

```bash
node tests/core.test.js
```

The tests verify reference precedence, name normalization, independent cross-Publisher registration/admission ownership, FEE/Token-only output rows, Publisher fallback, unmapped-name handling and filename sanitization.


## Latest update
Downloaded reports include a second sheet named **Type Summary** with a pie chart and a type-wise table. This uses the broad `Type` from the Complete Counsellor/Consultant reference data, not the Detailed Type.


## Universal upload update

The file picker and drag-and-drop area now accept CSV and the other supported spreadsheet formats. Existing report calculations, Type Summary sheet, chart, reference mapping, themes and sounds are unchanged.
