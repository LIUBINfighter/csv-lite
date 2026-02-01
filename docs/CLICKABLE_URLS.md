# Clickable URLs Feature

## Overview

The Clickable URLs feature automatically detects and renders plain-text URLs and Markdown-style links in CSV cells as clickable links. This makes it easy to navigate to external resources directly from your CSV data while keeping your tables clean and readable.

## How It Works

### URL Detection

The plugin detects two types of links:

**1. Plain URLs:**
- `http://example.com`
- `https://example.com`
- URLs with paths: `https://example.com/path/to/page`
- URLs with query parameters: `https://example.com?param=value`
- URLs with fragments: `https://example.com#section`

**2. Markdown-style Links:**
- `[GitHub](https://github.com)` - Displays as "GitHub" but links to the URL
- `[Documentation](https://docs.example.com)` - Clean, readable link text
- Mixed content: `Visit [our site](https://example.com) for more` - Text with embedded Markdown links

### Display Modes

Each cell with a URL has two modes:

1. **Display Mode** (default)
   - URLs are rendered as clickable links
   - Links open in a new browser tab
   - Click the cell (not the link) to enter edit mode

2. **Edit Mode**
   - Shows the plain text input field
   - Allows editing the URL text
   - Automatically switches back to display mode on blur

### Implementation Details

#### Files Created/Modified

1. **`src/utils/url-utils.ts`** (new)
   - `containsUrl()`: Detects if text contains URLs
   - `parseTextWithUrls()`: Parses text into segments (URL and non-URL)
   - `createUrlDisplay()`: Creates DOM elements with clickable links

2. **`src/view/table-render.ts`** (modified)
   - Integrated URL display layer
   - Toggle between display and edit modes
   - Dynamic URL detection on input changes

3. **`styles.css`** (modified)
   - Added styles for `.csv-cell-display`
   - Added styles for `.csv-cell-link` with hover effects

#### Architecture

```
Cell Structure:
├── <td>
    ├── <div class="csv-cell-display"> (shown when not editing)
    │   ├── <span>Plain text</span>
    │   ├── <a href="..." class="csv-cell-link">URL</a>
    │   └── <span>More text</span>
    └── <input class="csv-cell-input"> (shown when editing)
```

### User Experience

1. **Viewing**: URLs appear as underlined, colored links
2. **Clicking a link**: Opens in new browser tab (Ctrl/Cmd + Click for background tab)
3. **Editing**: Click anywhere in the cell (including the display area, but not on the link itself) to enter edit mode
4. **Saving**: Changes are saved automatically when you blur the input

### Click Behavior

- **Click on link**: Opens URL in new tab
- **Click on cell (anywhere except link)**: Enters edit mode and focuses the input
- **Hover over cell**: Shows background highlight to indicate it's editable
- **Hover over link**: Shows link-specific hover effect

### Styling

The links use CSS variables for theming:
- `--link-color`: Link color
- `--link-color-hover`: Hover state color
- Transitions for smooth hover effects

### Testing

Unit tests are provided in `test/url-utils.test.ts`:
- URL detection accuracy
- Text parsing with single/multiple URLs
- Edge cases (URLs at start/end, with special characters)

### Demo

Sample CSV files are provided for testing:
- `test/url-test-sample.csv` - Plain URLs
- `test/markdown-links-sample.csv` - Markdown-style links

### Examples

**Plain URLs:**
```csv
name,website
GitHub,https://github.com
```
Displays: GitHub | https://github.com (as clickable link)

**Markdown Links:**
```csv
name,website
GitHub,[Visit GitHub](https://github.com)
```
Displays: GitHub | Visit GitHub (as clickable link, cleaner!)

**Mixed Content:**
```csv
description
Check [our docs](https://docs.example.com) and https://example.com
```
Both links are clickable, with Markdown link showing as "our docs"

## Future Enhancements

Possible improvements:
- Support for other URL formats (ftp://, file://, etc.)
- URL validation and error indicators
- Custom link styling per column
- Option to disable auto-linking for specific columns
- Support for Obsidian internal links (`[[note]]`)
- Support for Wiki-style links
