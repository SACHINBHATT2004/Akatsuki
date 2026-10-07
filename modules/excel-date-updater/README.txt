EXCEL DATE UPDATER (AKATSUKI module)

Upload an Excel sheet, pick the ID column (primary) and the date column (secondary),
then make groups: each group = a list of IDs + one date. Press "Process and Update"
and download the updated Excel once, with every group written.

- IDs can be typed, pasted from Excel, or spoken (mic, Chrome/Edge, English or Hindi).
- Groups can be edited or removed after processing; each run starts again from the
  uploaded file, so nothing is written twice. If an ID is in two groups, the later
  group's date is kept.
- Theme and sound follow the AKATSUKI hub (same localStorage keys:
  akatsuki_hub_theme, akatsuki_hub_sound), in both directions.
- Everything runs in the browser. The Excel file is never uploaded anywhere.

Files
  index.html          page
  css/style.css       base liquid-glass layout
  css/akatsuki.css    AKATSUKI red/black theme layer (colours and artwork only)
  js/core.js          ID parsing, voice-to-text, date maths (unit tested)
  js/sound.js         soft synthesized water-drop sounds
  js/app.js           UI, groups, Excel read/write, download
  tests/core.test.js  node tests/core.test.js
  sample/             sample Excel file for trying it out

Needs internet for SheetJS (cdnjs), and Chrome's speech recognition for voice input.
Cell colours/borders are not kept on export (SheetJS community edition);
values, formulas and number formats are kept.
