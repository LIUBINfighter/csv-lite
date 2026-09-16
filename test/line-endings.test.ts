import { CSVUtils } from '../src/utils/csv-utils';

// Mock the i18n module
jest.mock('../src/i18n', () => ({
  i18n: {
    t: jest.fn((key: string) => key)
  }
}));

/**
 * Simulates the exact pipeline used by CSVView:
 *   parse -> drop synthetic trailing rows -> normalize -> unparse -> re-append trailing newline
 */
function roundTrip(raw: string): string {
  const trailing = CSVUtils.getTrailingNewline(raw);
  const parsed = CSVUtils.parseCSV(raw);
  const trimmed = CSVUtils.dropTrailingRows(parsed, trailing.rowCount);
  const normalized = CSVUtils.normalizeTableData(trimmed);
  const body = CSVUtils.unparseCSV(normalized, {
    delimiter: CSVUtils.detectDelimiter(raw),
    newline: CSVUtils.detectNewline(raw)
  } as any);
  return body + trailing.newline;
}

describe('Line ending handling (issue #52)', () => {
  describe('detectNewline', () => {
    test('detects CRLF files', () => {
      expect(CSVUtils.detectNewline('a,b\r\nc,d\r\n')).toBe('\r\n');
    });

    test('detects LF files', () => {
      expect(CSVUtils.detectNewline('a,b\nc,d\n')).toBe('\n');
    });

    test('defaults to LF for newline-less or empty content', () => {
      expect(CSVUtils.detectNewline('a,b')).toBe('\n');
      expect(CSVUtils.detectNewline('')).toBe('\n');
    });
  });

  describe('getTrailingNewline', () => {
    test('returns empty for files without trailing newline', () => {
      expect(CSVUtils.getTrailingNewline('a,b')).toEqual({
        newline: '',
        rowCount: 0
      });
    });

    test('captures a single trailing newline', () => {
      expect(CSVUtils.getTrailingNewline('a,b\n')).toEqual({
        newline: '\n',
        rowCount: 1
      });
    });

    test('captures multiple trailing newlines', () => {
      expect(CSVUtils.getTrailingNewline('a,b\n\n\n')).toEqual({
        newline: '\n\n\n',
        rowCount: 3
      });
    });

    test('counts CRLF as a single row terminator', () => {
      expect(CSVUtils.getTrailingNewline('a,b\r\nc,d\r\n')).toEqual({
        newline: '\r\n',
        rowCount: 1
      });
    });
  });

  describe('dropTrailingRows', () => {
    test('removes the synthetic row produced by a trailing newline', () => {
      expect(CSVUtils.dropTrailingRows([['a', 'b'], ['']], 1)).toEqual([
        ['a', 'b']
      ]);
    });

    test('never removes the last remaining row', () => {
      expect(CSVUtils.dropTrailingRows([['']], 1)).toEqual([['']]);
    });

    test('is a no-op when there is nothing to drop', () => {
      expect(CSVUtils.dropTrailingRows([['a']], 0)).toEqual([['a']]);
    });
  });

  describe('round trip fidelity', () => {
    const cases: Array<[string, string]> = [
      ['plain LF file with trailing newline', 'a,b\nc,d\n'],
      ['plain LF file without trailing newline', 'a,b\nc,d'],
      ['CRLF file with trailing newline', 'a,b\r\nc,d\r\n'],
      ['CRLF file without trailing newline', 'a,b\r\nc,d'],
      ['single line with trailing newline', 'a,b\n'],
      ['empty trailing lines', 'a,b\n\n'],
      ['multiple empty trailing lines', 'a,b\n\n\n'],
      ['intentionally empty multi-column record', 'x,y\n,\n'],
      ['blank-only file', '\n\n'],
      ['empty file', ''],
      ['single cell', 'a'],
      ['quoted multiline field', 'name,desc\n"x\ny",z\n']
    ];

    test.each(cases)('%s round-trips byte-for-byte', (_name, raw) => {
      expect(roundTrip(raw)).toBe(raw);
    });

    test('does not add phantom comma-only rows', () => {
      // Previously "a,b\n" became "a,b\n,\n" because the synthetic empty row was padded to 2 columns.
      expect(roundTrip('a,b\n')).not.toContain(',\n');
    });
  });
});
