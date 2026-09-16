import { isSearchShortcut } from "../src/utils/keyboard-utils";

describe("isSearchShortcut (issue #18)", () => {
	test("matches Ctrl+F on Windows/Linux", () => {
		expect(isSearchShortcut({ key: "f", ctrlKey: true })).toBe(true);
	});

	test("matches Cmd+F on macOS", () => {
		expect(isSearchShortcut({ key: "f", metaKey: true })).toBe(true);
	});

	test("matches uppercase F", () => {
		expect(isSearchShortcut({ key: "F", ctrlKey: true })).toBe(true);
	});

	test("ignores plain f without a modifier", () => {
		expect(isSearchShortcut({ key: "f" })).toBe(false);
	});

	test("ignores Ctrl+Shift+F (Obsidian's search in all files)", () => {
		expect(isSearchShortcut({ key: "f", ctrlKey: true, shiftKey: true })).toBe(
			false
		);
	});

	test("ignores Ctrl+Alt+F", () => {
		expect(isSearchShortcut({ key: "f", ctrlKey: true, altKey: true })).toBe(
			false
		);
	});

	test("ignores other Ctrl/Cmd combinations", () => {
		expect(isSearchShortcut({ key: "z", ctrlKey: true })).toBe(false);
		expect(isSearchShortcut({ key: "s", metaKey: true })).toBe(false);
		expect(isSearchShortcut({ key: "Enter", ctrlKey: true })).toBe(false);
	});
});
