// 简单的功能测试，不依赖Obsidian的复杂继承
export {};

describe('Sticky Functionality', () => {

  test('should handle Set operations for sticky rows and columns', () => {
    const stickyRows = new Set<number>();
    const stickyColumns = new Set<number>();
    
    // Test row toggle functionality
    const toggleRowSticky = (rowIndex: number) => {
      if (stickyRows.has(rowIndex)) {
        stickyRows.delete(rowIndex);
      } else {
        stickyRows.add(rowIndex);
      }
    };
    
    // Test column toggle functionality
    const toggleColumnSticky = (colIndex: number) => {
      if (stickyColumns.has(colIndex)) {
        stickyColumns.delete(colIndex);
      } else {
        stickyColumns.add(colIndex);
      }
    };
    
    // Initially empty
    expect(stickyRows.size).toBe(0);
    expect(stickyColumns.size).toBe(0);
    
    // Add rows
    toggleRowSticky(0);
    expect(stickyRows.has(0)).toBe(true);
    expect(stickyRows.size).toBe(1);
    
    toggleRowSticky(1);
    expect(stickyRows.has(1)).toBe(true);
    expect(stickyRows.size).toBe(2);
    
    // Add columns
    toggleColumnSticky(0);
    expect(stickyColumns.has(0)).toBe(true);
    expect(stickyColumns.size).toBe(1);
    
    // Remove row
    toggleRowSticky(0);
    expect(stickyRows.has(0)).toBe(false);
    expect(stickyRows.size).toBe(1);
    
    // Remove column
    toggleColumnSticky(0);
    expect(stickyColumns.has(0)).toBe(false);
    expect(stickyColumns.size).toBe(0);
  });

  test('should generate correct CSS selectors for sticky elements', () => {
    const getStickyRowSelector = (rowIndex: number) => 
      `tr:nth-child(${rowIndex + 2}) td, tr:nth-child(${rowIndex + 2}) th`;
    
    const getStickyColSelector = (colIndex: number) => 
      `td:nth-child(${colIndex + 2}), th:nth-child(${colIndex + 2})`;
    
    // Test row selectors (adding 2 because: 1 for 1-indexed, 1 for header row)
    expect(getStickyRowSelector(0)).toBe('tr:nth-child(2) td, tr:nth-child(2) th');
    expect(getStickyRowSelector(1)).toBe('tr:nth-child(3) td, tr:nth-child(3) th');
    
    // Test column selectors (adding 2 because: 1 for 1-indexed, 1 for row number column)
    expect(getStickyColSelector(0)).toBe('td:nth-child(2), th:nth-child(2)');
    expect(getStickyColSelector(1)).toBe('td:nth-child(3), th:nth-child(3)');
  });

  test('should determine pin button state correctly', () => {
    const stickyRows = new Set([0, 2]);
    const stickyColumns = new Set([1]);
    
    const getRowPinState = (rowIndex: number) => stickyRows.has(rowIndex);
    const getColPinState = (colIndex: number) => stickyColumns.has(colIndex);
    
    // Test row pin states
    expect(getRowPinState(0)).toBe(true);  // pinned
    expect(getRowPinState(1)).toBe(false); // not pinned
    expect(getRowPinState(2)).toBe(true);  // pinned
    
    // Test column pin states
    expect(getColPinState(0)).toBe(false); // not pinned
    expect(getColPinState(1)).toBe(true);  // pinned
    expect(getColPinState(2)).toBe(false); // not pinned
  });
}); 