/**
 * Utility functions for URL detection and rendering
 */

// URL regex pattern that matches common URL formats
const URL_PATTERN = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

// Markdown link pattern: [text](url)
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;

/**
 * Detect if text contains URLs or Markdown links
 */
export function containsUrl(text: string): boolean {
  const urlRegex = new RegExp(URL_PATTERN);
  const markdownRegex = new RegExp(MARKDOWN_LINK_PATTERN);
  return urlRegex.test(text) || markdownRegex.test(text);
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
 * Create a display element with clickable URLs
 */
export function createUrlDisplay(text: string, onClick?: () => void): HTMLElement {
  const display = document.createElement('div');
  display.className = 'csv-cell-display';
  
  const segments = parseTextWithUrls(text);
  
  for (const segment of segments) {
    if (segment.isUrl && segment.url) {
      const link = document.createElement('a');
      link.href = segment.url;
      // Use displayText if available (for Markdown links), otherwise use text
      link.textContent = segment.displayText || segment.text;
      link.className = 'csv-cell-link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      // Prevent link click from triggering cell edit
      link.onclick = (e) => {
        e.stopPropagation();
      };
      
      display.appendChild(link);
    } else {
      const span = document.createElement('span');
      span.textContent = segment.text;
      display.appendChild(span);
    }
  }
  
  // Add an edit button for cells that are entirely URLs (no other clickable area)
  if (onClick) {
    const editBtn = document.createElement('span');
    editBtn.className = 'csv-cell-edit-btn';
    editBtn.textContent = '✎';
    editBtn.title = 'Click to edit';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
    display.appendChild(editBtn);
    
    // Also make display clickable (for areas that aren't links)
    display.onclick = (e) => {
      // Only trigger if not clicking on a link
      if ((e.target as HTMLElement).tagName !== 'A') {
        onClick();
      }
    };
  }
  
  return display;
}
