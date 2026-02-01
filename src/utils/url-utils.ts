/**
 * Utility functions for URL detection and rendering
 */

// URL regex pattern that matches common URL formats
const URL_PATTERN = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

/**
 * Detect if text contains URLs
 */
export function containsUrl(text: string): boolean {
  const urlRegex = new RegExp(URL_PATTERN);
  return urlRegex.test(text);
}

/**
 * Parse text and return segments with URL information
 */
export interface TextSegment {
  text: string;
  isUrl: boolean;
  url?: string;
}

export function parseTextWithUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  
  // Reset regex lastIndex
  const urlRegex = new RegExp(URL_PATTERN);
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before URL
    if (match.index > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, match.index),
        isUrl: false
      });
    }
    
    // Add URL segment
    segments.push({
      text: match[0],
      isUrl: true,
      url: match[0]
    });
    
    lastIndex = urlRegex.lastIndex;
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
      link.textContent = segment.text;
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
