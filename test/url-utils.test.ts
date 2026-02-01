import { containsUrl, parseTextWithUrls, createUrlDisplay } from '../src/utils/url-utils';

describe('URL Utils', () => {
  describe('containsUrl', () => {
    it('should detect HTTP URLs', () => {
      expect(containsUrl('http://example.com')).toBe(true);
      expect(containsUrl('Visit http://example.com for more')).toBe(true);
    });

    it('should detect HTTPS URLs', () => {
      expect(containsUrl('https://example.com')).toBe(true);
      expect(containsUrl('Check out https://github.com')).toBe(true);
    });

    it('should detect URLs with paths', () => {
      expect(containsUrl('https://example.com/path/to/page')).toBe(true);
      expect(containsUrl('http://site.com/docs?q=test')).toBe(true);
    });

    it('should detect URLs with query parameters', () => {
      expect(containsUrl('https://example.com?foo=bar&baz=qux')).toBe(true);
    });

    it('should detect URLs with fragments', () => {
      expect(containsUrl('https://example.com#section')).toBe(true);
      expect(containsUrl('https://example.com/page#top')).toBe(true);
    });

    it('should return false for non-URLs', () => {
      expect(containsUrl('Just plain text')).toBe(false);
      expect(containsUrl('example.com')).toBe(false); // No protocol
      expect(containsUrl('www.example.com')).toBe(false); // No protocol
      expect(containsUrl('')).toBe(false);
    });

    it('should handle multiple URLs in text', () => {
      expect(containsUrl('Visit https://site1.com and https://site2.com')).toBe(true);
    });
  });

  describe('parseTextWithUrls', () => {
    it('should parse text with no URLs', () => {
      const result = parseTextWithUrls('Just plain text');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        text: 'Just plain text',
        isUrl: false
      });
    });

    it('should parse text with single URL', () => {
      const result = parseTextWithUrls('Visit https://example.com today');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        text: 'Visit ',
        isUrl: false
      });
      expect(result[1]).toEqual({
        text: 'https://example.com',
        isUrl: true,
        url: 'https://example.com'
      });
      expect(result[2]).toEqual({
        text: ' today',
        isUrl: false
      });
    });

    it('should parse text with multiple URLs', () => {
      const result = parseTextWithUrls('Check https://site1.com and https://site2.com out');
      expect(result).toHaveLength(5);
      expect(result[1].isUrl).toBe(true);
      expect(result[3].isUrl).toBe(true);
    });

    it('should parse URL at start of text', () => {
      const result = parseTextWithUrls('https://example.com is great');
      expect(result[0]).toEqual({
        text: 'https://example.com',
        isUrl: true,
        url: 'https://example.com'
      });
    });

    it('should parse URL at end of text', () => {
      const result = parseTextWithUrls('Visit https://example.com');
      expect(result[result.length - 1]).toEqual({
        text: 'https://example.com',
        isUrl: true,
        url: 'https://example.com'
      });
    });

    it('should parse URL with complex path', () => {
      const url = 'https://example.com/path/to/page?param=value&other=123#section';
      const result = parseTextWithUrls(url);
      expect(result).toHaveLength(1);
      expect(result[0].isUrl).toBe(true);
      expect(result[0].url).toBe(url);
    });
  });

  // Note: createUrlDisplay tests are skipped as they require DOM environment
  // The function is tested through integration tests in the actual plugin
});
