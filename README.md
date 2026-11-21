# csv-reader-speed-01 — a faster drop-in for csv-reader 1.0.0

[![make.fun bounty](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/nasubii/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/nasubii/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

An entry for make.fun's [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121):
`solve.js` exports `run(input)` returning, for every case's `{text, header}`, exactly the
answer csv-reader 1.0.0 returns — `{columns, rows, errors}` under its written broken-row
policy (stray CRs, quote junk, unterminated quotes, short and long rows, all recorded) —
and `main.ts` is the harness driver that reads `/input/cases.json` and writes
`/output/answers.json`.

## How it is faster

The reference reads a character at a time and builds every field a character at a time.
This reader keeps the same left-to-right walk but never builds a field that way:

- an unquoted field is one slice of the input between the characters that end it, found
  by a single scan that watches for comma, LF and CR together;
- a quoted field is the slices between its quotes, found with `indexOf`, with the line
  breaks inside it counted on the slice — a run is rebuilt a character at a time only
  when it holds a CR, the one case where CRLF and a lone CR both read as LF;
- the slow paths (a stray CR inside a field, junk after a closing quote, a quote that
  never closes) are taken only by the fields that need them, and a field's result is
  handed back through shared slots instead of an object per field.

On the kit's practice set (6 cases, 10.2 MB of CSV) it answers in roughly 0.6 s of wall
time end to end where the house baseline takes roughly 1.4 s, byte for byte the same
answers.

## Layout

- `main.ts` — the driver the harness runs (the house baseline's driver, unchanged).
- `solve.js` — the reader itself, a dependency-free ES module.
