import { ensureImagePath, extractImageSrc } from './imageHelpers';

describe('imageHelpers', () => {
  describe('ensureImagePath', () => {
    it('should return null for null or undefined input', () => {
      expect(ensureImagePath(null)).toBeNull();
      expect(ensureImagePath(undefined)).toBeNull();
    });

    it('should not change absolute URLs', () => {
      const html = '<img src="http://example.com/image.jpg">';
      expect(ensureImagePath(html)).toBe(html);
      const httpsHtml = '<img src="https://example.com/image.jpg">';
      expect(ensureImagePath(httpsHtml)).toBe(httpsHtml);
      const dataUriHtml = '<img src="data:image/png;base64,abc">';
      expect(ensureImagePath(dataUriHtml)).toBe(dataUriHtml);
    });

    it('should not change already correctly prefixed /images/ URLs', () => {
      const html = '<img src="/images/path/to/image.jpg">';
      expect(ensureImagePath(html)).toBe(html);
    });

    it('should prefix absolute paths not starting with /images/', () => {
      const html = '<img src="/uploads/file.jpg">';
      expect(ensureImagePath(html)).toBe('<img src="/images/uploads/file.jpg">');
    });

    it('should prefix relative paths', () => {
      const html1 = '<img src="file.jpg">';
      expect(ensureImagePath(html1)).toBe('<img src="/images/file.jpg">');
      const html2 = '<img src="uploads/file.jpg">';
      expect(ensureImagePath(html2)).toBe('<img src="/images/uploads/file.jpg">');
    });

    it('should handle multiple images in one string', () => {
      const html = '<img src="foo.png"> <img src="/bar/baz.jpg">';
      expect(ensureImagePath(html)).toBe('<img src="/images/foo.png"> <img src="/images/bar/baz.jpg">');
    });
  });

  describe('extractImageSrc', () => {
    it('should return null for null or undefined input', () => {
      expect(extractImageSrc(null)).toBeNull();
      expect(extractImageSrc(undefined)).toBeNull();
    });

    it('should return absolute URLs as is', () => {
      expect(extractImageSrc('http://example.com/image.jpg')).toBe('http://example.com/image.jpg');
      expect(extractImageSrc('https://example.com/image.jpg')).toBe('https://example.com/image.jpg');
      expect(extractImageSrc('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    });

    it('should prefix plain relative URLs with /images/', () => {
      expect(extractImageSrc('file.jpg')).toBe('/images/file.jpg');
      expect(extractImageSrc('path/to/image.jpg')).toBe('/images/path/to/image.jpg');
    });
    
    it('should return plain absolute paths starting with / as is', () => {
      expect(extractImageSrc('/images/file.jpg')).toBe('/images/file.jpg');
      expect(extractImageSrc('/other/path/image.jpg')).toBe('/other/path/image.jpg');
    });

    it('should extract src from img tag with absolute URL', () => {
      const html = '<img alt="test" src="http://example.com/img.png">';
      expect(extractImageSrc(html)).toBe('http://example.com/img.png');
    });

    it('should extract and prefix src from img tag with relative URL', () => {
      const html = '<img src="relative/img.png">';
      expect(extractImageSrc(html)).toBe('/images/relative/img.png');
    });
    
    it('should extract and prefix src from img tag with absolute path (not /images/)', () => {
      const html = '<img src="/uploads/img.png">';
      expect(extractImageSrc(html)).toBe('/images/uploads/img.png');
    });

    it('should extract src from img tag with already correct /images/ path', () => {
      const html = '<img src="/images/correct/img.png">';
      expect(extractImageSrc(html)).toBe('/images/correct/img.png');
    });

    it('should return null for string without img tag or plain URL', () => {
      expect(extractImageSrc('ただの文字列')).toBeNull();
      expect(extractImageSrc('<p>No image here</p>')).toBeNull();
    });

    it('should handle complex img tags with other attributes', () => {
      const html = '<img style="width:100%" class="fancy-image" src="/images/complex.jpg" id="mainImg">';
      expect(extractImageSrc(html)).toBe('/images/complex.jpg');
    });

    it('should return the first image if multiple img tags (current behavior)', () => {
      const html = '<img src="first.jpg"><img src="second.jpg">';
      expect(extractImageSrc(html)).toBe('/images/first.jpg');
    });
  });
}); 