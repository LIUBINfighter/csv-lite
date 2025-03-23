import { Notice } from 'obsidian';

export class HistoryManager<T> {
    private history: T[] = [];
    private currentIndex: number = -1;
    private maxSize: number;
    
    constructor(initialState?: T, maxSize: number = 50) {
        this.maxSize = maxSize;
        if (initialState) {
            this.push(initialState);
        }
    }
    
    /**
     * 保存新状态到历史记录
     */
    push(state: T): void {
        // 删除当前索引之后的所有历史记录
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }
        
        // 添加新状态
        this.history.push(this.cloneState(state));
        
        // 如果历史记录超过最大限制，删除最早的记录
        if (this.history.length > this.maxSize) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }
    }
    
    /**
     * 撤销到上一个状态
     */
    undo(): T | null {
        if (this.canUndo()) {
            this.currentIndex--;
            new Notice("已撤销上一步操作");
            return this.getCurrentState();
        } else {
            new Notice("没有更多可撤销的操作");
            return null;
        }
    }
    
    /**
     * 重做到下一个状态
     */
    redo(): T | null {
        if (this.canRedo()) {
            this.currentIndex++;
            new Notice("已重做操作");
            return this.getCurrentState();
        } else {
            new Notice("没有更多可重做的操作");
            return null;
        }
    }
    
    /**
     * 获取当前状态
     */
    getCurrentState(): T | null {
        if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
            return this.cloneState(this.history[this.currentIndex]);
        }
        return null;
    }
    
    /**
     * 是否可以撤销
     */
    canUndo(): boolean {
        return this.currentIndex > 0;
    }
    
    /**
     * 是否可以重做
     */
    canRedo(): boolean {
        return this.currentIndex < this.history.length - 1;
    }
    
    /**
     * 重置历史记录
     */
    reset(initialState?: T): void {
        this.history = [];
        this.currentIndex = -1;
        if (initialState) {
            this.push(initialState);
        }
    }
    
    /**
     * 克隆状态（泛型方法，需要在使用时重写）
     */
    protected cloneState(state: T): T {
        // 默认实现，应在子类中重写
        if (Array.isArray(state)) {
            // 处理二维数组情况
            if (state.length > 0 && Array.isArray(state[0])) {
                return state.map(row => [...row]) as unknown as T;
            }
            return [...state] as unknown as T;
        }
        
        // 对象类型尝试深拷贝
        if (typeof state === 'object' && state !== null) {
            return JSON.parse(JSON.stringify(state));
        }
        
        return state;
    }
}

/**
 * 特化版本，专门用于处理CSV表格数据（二维字符串数组）
 */
export class TableHistoryManager extends HistoryManager<string[][]> {
    protected cloneState(state: string[][]): string[][] {
        return state.map(row => [...row]);
    }
}
