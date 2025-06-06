import { CSVUtils } from '../src/utils/csv-utils';

// Mock the i18n module
jest.mock('../src/i18n', () => ({
  i18n: {
    t: jest.fn((key: string) => key)
  }
}));

describe('CSV Parser Core Tests', () => {
  describe('Basic CSV Parsing', () => {
    test('should parse simple comma-separated values', () => {
      const csvData = 'name,age,email\nJohn,25,john@example.com\nJane,30,jane@example.com';
      const result = CSVUtils.parseCSV(csvData);
      
      expect(result).toEqual([
        ['name', 'age', 'email'],
        ['John', '25', 'john@example.com'],
        ['Jane', '30', 'jane@example.com']
      ]);
    });

    test('should handle quoted fields with commas (main bug fix)', () => {
      const csvData = 'name,description\n"John Doe","A person, with comma"\n"Jane","Normal description"';
      const result = CSVUtils.parseCSV(csvData);
      
      expect(result).toEqual([
        ['name', 'description'],
        ['John Doe', 'A person, with comma'],
        ['Jane', 'Normal description']
      ]);
    });

    test('should handle escaped quotes inside quoted fields', () => {
      const csvData = 'name,description\n"Alice ""Wonder"" Land","Contains ""quotes"" inside"';
      const result = CSVUtils.parseCSV(csvData);
      
      expect(result).toEqual([
        ['name', 'description'],
        ['Alice "Wonder" Land', 'Contains "quotes" inside']
      ]);
    });
  });

  describe('Custom Delimiter Support', () => {
    test('should handle semicolon delimiter', () => {
      const csvData = 'name;age;email\nJohn;25;john@example.com';
      const result = CSVUtils.parseCSV(csvData, { delimiter: ';' });
      
      expect(result).toEqual([
        ['name', 'age', 'email'],
        ['John', '25', 'john@example.com']
      ]);
    });

    test('should handle tab delimiter (TSV)', () => {
      const csvData = 'name\tage\temail\nJohn\t25\tjohn@example.com';
      const result = CSVUtils.parseCSV(csvData, { delimiter: '\t' });
      
      expect(result).toEqual([
        ['name', 'age', 'email'],
        ['John', '25', 'john@example.com']
      ]);
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiline content within quotes', () => {
      const csvData = 'name,description\n"Charlie\nMulti-line","This description\nspans multiple lines"';
      const result = CSVUtils.parseCSV(csvData);
      
      expect(result).toEqual([
        ['name', 'description'],
        ['Charlie\nMulti-line', 'This description\nspans multiple lines']
      ]);
    });

    test('should handle empty fields', () => {
      const csvData = 'name,age,email\nBob,,bob@mail.com\n,40,empty@name.com';
      const result = CSVUtils.parseCSV(csvData);
      
      expect(result).toEqual([
        ['name', 'age', 'email'],
        ['Bob', '', 'bob@mail.com'],
        ['', '40', 'empty@name.com']
      ]);
    });

    test('should handle complex test data from test-sample.csv', () => {
      const complexCsvData = `name,age,email,description,notes
John Doe,25,john@example.com,Simple record,No special characters
"Jane Smith",30,"jane@test.com","Contains, comma","Normal quoted field"
"Alice ""Wonder"" Land",28,alice@wonder.com,"Contains ""quotes"" inside","Escaped quotes test"`;
      
      const result = CSVUtils.parseCSV(complexCsvData);
      
      expect(result).toEqual([
        ['name', 'age', 'email', 'description', 'notes'],
        ['John Doe', '25', 'john@example.com', 'Simple record', 'No special characters'],
        ['Jane Smith', '30', 'jane@test.com', 'Contains, comma', 'Normal quoted field'],
        ['Alice "Wonder" Land', '28', 'alice@wonder.com', 'Contains "quotes" inside', 'Escaped quotes test']
      ]);
    });
  });

  describe('Data Normalization', () => {
    test('should normalize irregular table data', () => {
      const data = [
        ['name', 'age', 'email'],
        ['John', '25'],
        ['Jane', '30', 'jane@example.com', 'extra']
      ];
      
      const result = CSVUtils.normalizeTableData(data);
      
      expect(result).toEqual([
        ['name', 'age', 'email', ''],
        ['John', '25', '', ''],
        ['Jane', '30', 'jane@example.com', 'extra']
      ]);
    });

    test('should handle empty input gracefully', () => {
      expect(CSVUtils.normalizeTableData([])).toEqual([['']]);
      expect(CSVUtils.normalizeTableData(null as any)).toEqual([['']]);
    });
  });

  describe('CSV Generation', () => {
    test('should convert 2D array back to CSV string', () => {
      const data = [
        ['name', 'age', 'email'],
        ['John', '25', 'john@example.com'],
        ['Jane', '30', 'jane@example.com']
      ];
      
      const result = CSVUtils.unparseCSV(data);
      const expected = 'name,age,email\nJohn,25,john@example.com\nJane,30,jane@example.com';
      
      expect(result).toBe(expected);
    });
  });
});
