import { TableHistoryManager } from "../src/utils/history-manager";
import { Notice } from "obsidian";
import { i18n } from "../src/i18n";

beforeEach(() => {
  // reset Notice mock
  (Notice as any).mockClear && (Notice as any).mockClear();
});

test('undo on empty history shows noMoreUndo message', () => {
  const hm = new TableHistoryManager([["a"]], 10);
  // Initially only one state, cannot undo
  const res = hm.undo();
  expect(res).toBeNull();
  expect(Notice).toHaveBeenCalledTimes(1);
  expect((Notice as any).mock.calls[0][0]).toBe(i18n.t('notifications.noMoreUndo'));
});

test('undo when available shows undo message', () => {
  const hm = new TableHistoryManager([["a"]], 10);
  hm.push([["b"]]);
  // Now we can undo
  const res = hm.undo();
  expect(res).toEqual([["a"]]);
  expect(Notice).toHaveBeenCalledTimes(1);
  expect((Notice as any).mock.calls[0][0]).toBe(i18n.t('notifications.undo'));
});

test('redo on no-op shows noMoreRedo message', () => {
  const hm = new TableHistoryManager([["a"]], 10);
  // Nothing to redo
  const res = hm.redo();
  expect(res).toBeNull();
  expect(Notice).toHaveBeenCalledTimes(1);
  expect((Notice as any).mock.calls[0][0]).toBe(i18n.t('notifications.noMoreRedo'));
});

test('redo when available shows redo message', () => {
  const hm = new TableHistoryManager([["a"]], 10);
  hm.push([["b"]]);
  // undo back to first
  const u = hm.undo();
  expect(u).toEqual([["a"]]);
  // redo
  const r = hm.redo();
  expect(r).toEqual([["b"]]);
  // Two notices were called (undo, redo)
  expect(Notice).toHaveBeenCalledTimes(2);
  expect((Notice as any).mock.calls[1][0]).toBe(i18n.t('notifications.redo'));
});
