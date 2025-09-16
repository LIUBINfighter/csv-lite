import { CSVUtils } from '../src/utils/csv-utils';

describe('Delimiter detection', () => {
  test('detects comma for simple CSV', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6';
    expect(CSVUtils.detectDelimiter(csv)).toBe(',');
  });

  test('detects semicolon for semicolon CSV', () => {
    const csv = 'a;b;c\n1;2;3\n4;5;6';
    expect(CSVUtils.detectDelimiter(csv)).toBe(';');
  });

  test('detects tab for TSV', () => {
    const csv = 'a\tb\tc\n1\t2\t3\n4\t5\t6';
    expect(CSVUtils.detectDelimiter(csv)).toBe('\t');
  });

  test('ignores delimiters inside quotes and detects correctly', () => {
    const csv = 'name,desc\n"Quote, inside",value\n"Another, one",other';
    expect(CSVUtils.detectDelimiter(csv)).toBe(',');
  });

  test('handles multiline quoted fields and selects best delimiter', () => {
    const csv = 'name;notes\n"Multi\nLine; still inside";ok\n"Another\nEntry";good';
    expect(CSVUtils.detectDelimiter(csv)).toBe(';');
  });
});
