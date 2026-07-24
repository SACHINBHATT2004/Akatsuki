CENTERLY - COUNSELOR CENTER FINDER
==================================

What is included
----------------
- Your uploaded counselor-center master list is embedded in counselors.js.
- Raw usable rows in master Excel: 121
- Duplicate rows removed: 17
- Unique counselor-center entries: 104
- Total centers: 32
- New colorful liquid-glass interface with light and dark themes.
- Responsive layout for desktop, tablet, and mobile.

How to run
----------
1. Extract the ZIP.
2. Open index.html in Chrome, Edge, or Firefox.
3. Use the theme toggle in the top-right corner.

Manual counselor search
-----------------------
- Type one or multiple counselor names separated by commas.
- Auto suggestions appear while typing.
- Press Tab or Enter to accept the active suggestion.
- Matching ignores case, extra spaces, punctuation, and titles such as Mr./Mrs./Ms./Dr.
- Minor spelling mistakes are handled conservatively.
- Results can be copied or downloaded as CSV.

Center count module
-------------------
1. Click "Choose Excel" in the "Upload name + count sheet" section.
2. Upload a file where:
   - First column = counselor name
   - Second column = count
   - Column headings can be different.
3. The website will:
   - Match each counselor with the master list.
   - Add counts center-wise.
   - Show center totals in horizontal cards and a table.
   - Show unmatched or invalid rows below.
   - Let you copy the center summary.
   - Download a formatted Excel workbook.

Downloaded Excel workbook
-------------------------
- Center Summary sheet:
  S.No. | Center | Counselors | Total Count
- Not Found sheet:
  Source Row | Input Name | Count | Reason
- Both sheets include styled headers, borders, filters, widths, and frozen headers.

File support
------------
- .csv works fully offline.
- .xlsx/.xls support uses the browser Excel library loaded from CDN.
- If Excel upload is blocked by internet restrictions, save the count file as CSV and upload it.

Files
-----
index.html      Page structure
styles.css      Liquid-glass light/dark interface and responsive layout
app.js          Autocomplete, matching, file processing, totals, animation, and exports
counselors.js   Master counselor-center data from the uploaded Excel
