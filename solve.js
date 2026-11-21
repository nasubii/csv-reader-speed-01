// A fast drop-in replacement for csv-reader 1.0.0: run(input) returns exactly csv-reader's
// reading of {text, header} — {columns, rows, errors} — by the same written policy:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside
//     it one quote, and each CRLF or lone CR inside it read as LF; what follows its closing
//     quote, up to the next comma or line break, is appended as it stands (quote_junk, when
//     the field ends); a quote that never closes is a literal character, and the text after
//     it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings;
//   - columns is the first record when header is true, else null; rows are padded with ""
//     (short_row) or cut (long_row) to the first record's width;
//   - each error is {code, line, row} in the order met.
//
// The reference reads a character at a time and builds every field a character at a time.
// This reader keeps the reference's left-to-right walk but never builds a field a
// character at a time: an unquoted field is one slice of the input between the characters
// that end it, a quoted field is the slices between its quotes, and characters are only
// handled one by one where the policy is about single characters — a stray CR, the line
// breaks inside a quoted field. Nothing is kept from one call to the next.

const COMMA_END = 0;
const BREAK_END = 1;
const TEXT_END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: where its errors point.
  let recordLine = 1;
  let recordRow = null;

  // The field just read, passed back without an object per field.
  let fValue = '';
  let fEnded = TEXT_END;
  let fAdded = 0;

  // Reads an unquoted field starting at pos, on top of `prefix` ('' normally, the opening
  // quote for an unterminated field, the quoted value for junk after a closing quote).
  function unquotedField(prefix) {
    let parts = null;
    let segStart = pos;
    let added = 0;
    let i = pos;
    for (;;) {
      if (i >= n) {
        if (parts === null) fValue = i === segStart && prefix === '' ? '' : prefix + text.slice(segStart, n);
        else {
          if (i > segStart) parts.push(text.slice(segStart, n));
          fValue = parts.join('');
        }
        added += n - segStart;
        fAdded = added;
        pos = n;
        fEnded = TEXT_END;
        return;
      }
      const c = text.charCodeAt(i);
      if (c !== 44 && c > 13) {
        i += 1;
        continue;
      }
      if (c === 44) {
        if (parts === null) fValue = i === segStart ? prefix : prefix + text.slice(segStart, i);
        else {
          if (i > segStart) parts.push(text.slice(segStart, i));
          fValue = parts.join('');
        }
        added += i - segStart;
        fAdded = added;
        pos = i + 1;
        fEnded = COMMA_END;
        return;
      }
      if (c === 10) {
        if (parts === null) fValue = i === segStart ? prefix : prefix + text.slice(segStart, i);
        else {
          if (i > segStart) parts.push(text.slice(segStart, i));
          fValue = parts.join('');
        }
        added += i - segStart;
        fAdded = added;
        pos = i + 1;
        line += 1;
        fEnded = BREAK_END;
        return;
      }
      if (c === 13) {
        if (text.charCodeAt(i + 1) === 10) {
          if (parts === null) fValue = i === segStart ? prefix : prefix + text.slice(segStart, i);
          else {
            if (i > segStart) parts.push(text.slice(segStart, i));
            fValue = parts.join('');
          }
          added += i - segStart;
          fAdded = added;
          pos = i + 2;
          line += 1;
          fEnded = BREAK_END;
          return;
        }
        // A stray CR: keep what stands before it, drop it, read on.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (parts === null) parts = prefix === '' ? [] : [prefix];
        if (i > segStart) {
          parts.push(text.slice(segStart, i));
          added += i - segStart;
        }
        i += 1;
        segStart = i;
        continue;
      }
      i += 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function quotedField() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let parts = null;
    let head = '';
    let segStart = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        pos = open + 1;
        line = openLine;
        unquotedField('"');
        return;
      }
      // The run up to the quote, taken as one slice: its LFs are counted on the slice and
      // a CR in it (read as one LF, a CRLF as one LF) sends it to be rebuilt a character
      // at a time. Scanning the slice, never the text past it, keeps the checks bounded.
      const seg = text.slice(segStart, q);
      if (seg.indexOf('\r') === -1) {
        let lf = 0;
        let p = -1;
        while ((p = seg.indexOf('\n', p + 1)) !== -1) lf += 1;
        line += lf;
        if (seg !== '') {
          if (parts === null && head === '') head = seg;
          else {
            if (parts === null) parts = head === '' ? [] : [head];
            parts.push(seg);
          }
        }
      } else {
        let built = '';
        for (let i = 0; i < seg.length; i++) {
          const c = seg.charCodeAt(i);
          if (c === 13) {
            built += '\n';
            line += 1;
            if (seg.charCodeAt(i + 1) === 10) i += 1;
          } else {
            if (c === 10) line += 1;
            built += seg[i];
          }
        }
        if (parts === null) parts = head === '' ? [] : [head];
        parts.push(built);
      }
      if (text.charCodeAt(q + 1) === 34) {
        if (parts === null) parts = head === '' ? [] : [head];
        parts.push('"');
        pos = q + 2;
        segStart = pos;
        continue;
      }
      pos = q + 1;
      const value = parts === null ? head : parts.join('');
      if (pos >= n) {
        fValue = value;
        fEnded = TEXT_END;
        fAdded = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fValue = value;
        fEnded = COMMA_END;
        fAdded = 0;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fValue = value;
        fEnded = BREAK_END;
        fAdded = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fValue = value;
        fEnded = BREAK_END;
        fAdded = 0;
        return;
      }
      // What follows the closing quote is appended as it stands.
      unquotedField(value);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = width > 0 ? new Array(width) : [];
    let fi = 0;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) quotedField();
      else unquotedField('');
      fields[fi++] = fValue;
    } while (fEnded === COMMA_END);
    fields.length = fi;

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
