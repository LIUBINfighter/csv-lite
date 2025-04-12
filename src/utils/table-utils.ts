import { Notice } from 'obsidian';

export class TableUtils {
    /**
     * 计算表格列宽
     * @param tableData 表格数据
     * @param containerWidth 容器宽度，如果提供则会尝试适应容器宽度
     * @param minColWidth 最小列宽，默认为40px
     */
    static calculateColumnWidths(tableData: string[][], containerWidth?: number, minColWidth: number = 40): number[] {
        if (!tableData || tableData.length === 0 || !tableData[0]) return [];

        const colCount = tableData[0].length;

        // 如果列数很多，调整最小列宽，但不要调整得太小
        if (colCount > 10) {
            // 最多减小到10px，确保最小列宽不会小于30px
            minColWidth = Math.max(30, minColWidth - Math.min(10, Math.floor(colCount / 15) * 2));
        }

        // 初始化所有列为默认宽度
        const columnWidths = tableData[0].map(() => 100);

        // 根据内容长度进行调整
        tableData.forEach(row => {
            row.forEach((cell, index) => {
                // 根据内容长度估算合适的宽度
                // 使用更精确的计算方法，考虑中文字符宽度
                const charCount = cell.length;
                const chineseCharCount = (cell.match(/[\u4e00-\u9fa5]/g) || []).length;
                const effectiveLength = charCount + chineseCharCount * 0.5; // 中文字符宽度权重更高

                const estimatedWidth = Math.max(minColWidth, Math.min(300, effectiveLength * 8));
                columnWidths[index] = Math.max(columnWidths[index], estimatedWidth);
            });
        });

        // 如果提供了容器宽度，尝试适应容器宽度
        if (containerWidth && containerWidth > 0) {
            const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);

            // 如果总宽度超过容器宽度，按比例缩小
            if (totalWidth > containerWidth) {
                const ratio = containerWidth / totalWidth;
                columnWidths.forEach((width, index) => {
                    columnWidths[index] = Math.max(minColWidth, Math.floor(width * ratio));
                });
            }
        }

        return columnWidths;
    }

    /**
     * 添加新行
     */
    static addRow(tableData: string[][]): string[][] {
        const colCount = tableData.length > 0 ? tableData[0].length : 1;
        const newRow = Array(colCount).fill("");
        return [...tableData, newRow];
    }

    /**
     * 删除最后一行
     */
    static deleteRow(tableData: string[][]): string[][] {
        if (tableData.length <= 1) {
            new Notice("至少需要保留一行");
            return tableData;
        }

        return tableData.slice(0, -1);
    }

    /**
     * 添加新列
     */
    static addColumn(tableData: string[][]): string[][] {
        return tableData.map(row => [...row, ""]);
    }

    /**
     * 删除最后一列
     */
    static deleteColumn(tableData: string[][]): string[][] {
        if (!tableData[0] || tableData[0].length <= 1) {
            new Notice("至少需要保留一列");
            return tableData;
        }

        return tableData.map(row => row.slice(0, -1));
    }

    /**
     * 获取列标签 (A, B, C, ..., Z, AA, AB, ...)
     */
    static getColumnLabel(index: number): string {
        let label = '';
        let n = index;

        while (n >= 0) {
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26) - 1;
        }

        return label;
    }

    /**
     * 获取单元格地址标识（例如A1, B2）
     */
    static getCellAddress(rowIndex: number, colIndex: number): string {
        const colAddress = this.getColumnLabel(colIndex);
        const rowAddress = rowIndex + 1;
        return `${colAddress}${rowAddress}`;
    }
}
