#!/usr/bin/env node
/**
 * 生成大体积 CSV，用于复现 issue #51 的性能问题（原报告者没有提供样本文件）。
 *
 * 用法：
 *   node test/fixtures/generate-large-csv.js [rows] [cols] [outPath]
 *
 * 默认：1000 行 x 27 列（约 250 KB）-> test/fixtures/large-1000x27.csv
 *
 * 生成的数据刻意混入：
 *   - 纯 URL 单元格（触发 URL 显示层与 ✎ 编辑按钮）
 *   - Markdown 链接单元格
 *   - 带逗号的引号字段
 *   - 数字与普通文本
 */
const fs = require("fs");
const path = require("path");

const rows = Number(process.argv[2] || 1000);
const cols = Number(process.argv[3] || 27);
const out =
	process.argv[4] || path.join(__dirname, `large-${rows}x${cols}.csv`);

const words = [
	"alpha", "beta", "gamma", "delta", "epsilon", "zeta",
	"eta", "theta", "iota", "kappa", "lambda", "mu",
];
const domains = [
	"example.com", "obsidian.md", "github.com", "wikipedia.org", "openai.com",
];

function cell(r, c) {
	if (c === 0) return String(r + 1);
	// 纯 URL（触发 URL 显示层）
	if (c % 7 === 3) {
		return `https://${domains[(r + c) % domains.length]}/path/${r}/${c}?q=${(r * c) % 997}`;
	}
	// Markdown 链接
	if (c % 7 === 5) {
		return `[doc ${r}-${c}](https://${domains[c % domains.length]}/docs/${r})`;
	}
	// 带逗号的引号字段
	if (c % 11 === 0) {
		return `"${words[(r + c) % words.length]}, ${words[(r * c) % words.length]}"`;
	}
	// 数字
	if (c % 5 === 0) return String((r * 31 + c) % 100000);
	// 普通文本
	return `${words[(r + c) % words.length]}-${words[(r * c) % words.length]}`;
}

const lines = [];
lines.push(Array.from({ length: cols }, (_, c) => `col_${c + 1}`).join(","));
for (let r = 0; r < rows; r++) {
	lines.push(Array.from({ length: cols }, (_, c) => cell(r, c)).join(","));
}

const content = lines.join("\n") + "\n";
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, content);

const kb = (Buffer.byteLength(content) / 1024).toFixed(1);
console.log(`wrote ${out}`);
console.log(`${rows} rows x ${cols} cols, ${kb} KB, ${rows * cols} cells`);
console.log(
	`旧实现：${rows * cols} 个 <input> + ${rows * cols * 2} 个监听器；A1 之后：1 个共享 <input>。`
);
