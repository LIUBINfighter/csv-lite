/**
 * Utility functions for URL detection and rendering
 */

// URL regex pattern that matches common URL formats
const URL_PATTERN = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

// Markdown link pattern: [text](url)
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

// 复用同一组正则做「是否包含链接」判定：
// - 不带 g，避免 test() 的 lastIndex 状态问题；
// - 不再每次调用都 new RegExp（大表渲染时 containsUrl 会被调上万次，issue #51）。
const URL_TEST_PATTERN = new RegExp(URL_PATTERN.source, "i");
const MARKDOWN_LINK_TEST_PATTERN = new RegExp(MARKDOWN_LINK_PATTERN.source, "i");

/**
 * Detect if text contains URLs or Markdown links
 */
export function containsUrl(text: string): boolean {
  // 两种链接都必然包含 "http"，先做一次极廉价的剪枝
  if (!text.includes("http")) return false;
  return URL_TEST_PATTERN.test(text) || MARKDOWN_LINK_TEST_PATTERN.test(text);
}

/**
 * Parse text and return segments with URL information
 */
export interface TextSegment {
  text: string;
  isUrl: boolean;
  url?: string;
  displayText?: string; // For Markdown links
}

export function parseTextWithUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  
  // Find all matches (both URLs and Markdown links) with their positions
  interface Match {
    index: number;
    length: number;
    displayText: string;
    url: string;
  }
  
  const matches: Match[] = [];
  
  // Find Markdown links first (they take precedence)
  const markdownRegex = new RegExp(MARKDOWN_LINK_PATTERN);
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = markdownRegex.exec(text)) !== null) {
    matches.push({
      index: mdMatch.index,
      length: mdMatch[0].length,
      displayText: mdMatch[1], // The text inside [...]
      url: mdMatch[2] // The URL inside (...)
    });
  }
  
  // Find plain URLs (but skip those inside Markdown links)
  const urlRegex = new RegExp(URL_PATTERN);
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(text)) !== null) {
    // Check if this URL is already part of a Markdown link
    const isPartOfMarkdown = matches.some(m => 
      urlMatch!.index >= m.index && urlMatch!.index < m.index + m.length
    );
    
    if (!isPartOfMarkdown) {
      matches.push({
        index: urlMatch.index,
        length: urlMatch[0].length,
        displayText: urlMatch[0],
        url: urlMatch[0]
      });
    }
  }
  
  // Sort matches by position
  matches.sort((a, b) => a.index - b.index);
  
  // Build segments
  let lastIndex = 0;
  for (const match of matches) {
    // Add text before this match
    if (match.index > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, match.index),
        isUrl: false
      });
    }
    
    // Add URL/link segment
    segments.push({
      text: match.displayText,
      isUrl: true,
      url: match.url,
      displayText: match.displayText
    });
    
    lastIndex = match.index + match.length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.substring(lastIndex),
      isUrl: false
    });
  }
  
  // If no URLs found, return the whole text as one segment
  if (segments.length === 0) {
    segments.push({
      text: text,
      isUrl: false
    });
  }
  
  return segments;
}

/**
 * 在 parent 里创建带可点击链接的显示层（编辑按钮可选）。
 * 用 Obsidian 的 createDiv/createSpan 而不是 document.createElement。
 */
export function createUrlDisplay(
  parent: HTMLElement,
  text: string,
  onClick?: () => void
): HTMLElement {
  const display = parent.createDiv({
    cls: 'csv-cell-display csv-cell-display-has-url',
  });
  // 截断时用原生 tooltip 展示完整内容，避免 hover 展开造成行高跳动（issue #53）
  display.title = text;

  const segments = parseTextWithUrls(text);

  for (const segment of segments) {
    if (segment.isUrl && segment.url) {
      const link = display.createEl('a', {
        cls: 'csv-cell-link',
        text: segment.displayText || segment.text,
        attr: {
          href: segment.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      });

      // Prevent link click from triggering cell edit
      link.onclick = (e) => {
        e.stopPropagation();
      };
    } else {
      display.createSpan({ text: segment.text });
    }
  }

  // Add an edit button for cells that are entirely URLs (no other clickable area)
  if (onClick) {
    const editBtn = display.createSpan({
      cls: 'csv-cell-edit-btn',
      text: '✎',
    });
    editBtn.title = 'Click to edit';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
  }

  return display;
}
