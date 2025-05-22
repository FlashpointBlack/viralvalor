// Helper function to adjust image paths within an HTML string to ensure they are correctly prefixed.
const ensureImagePath = (htmlString) => {
  if (!htmlString) return null;
  // Regex to find src attribute: src="([^"]*)"
  // It captures the content of src attribute
  return htmlString.replace(/src="([^"]*)"/g, (match, currentSrc) => {
    if (currentSrc.startsWith('http://') || currentSrc.startsWith('https://') || currentSrc.startsWith('data:')) {
      return match; // It's an absolute URL or data URI, leave it
    }
    if (currentSrc.startsWith('/images/')) {
      return match; // Already correctly prefixed with /images/
    }
    if (currentSrc.startsWith('/')) {
      // Absolute path not starting with /images/, e.g., "/uploads/file.jpg"
      // Prepend "/images" to make it "/images/uploads/file.jpg"
      return `src="/images${currentSrc}"`;
    }
    // Relative path, e.g., "file.jpg" or "uploads/file.jpg"
    // Prepend "/images/" to make it "/images/file.jpg" or "/images/uploads/file.jpg"
    return `src="/images/${currentSrc}"`;
  });
};

// Helper function to extract src from an HTML string or return if already a URL
const extractImageSrc = (htmlOrUrlString) => {
  if (!htmlOrUrlString) return null;
  // Check if it's a simple URL (basic check, can be improved if needed)
  if (!htmlOrUrlString.includes('<') && !htmlOrUrlString.includes('>')) {
    // Assume it's a URL, apply ensureImagePath logic to it directly if it's not absolute
    // This part is tricky because ensureImagePath expects to replace src="...",
    // but if it's just a URL, we need to construct the "src=" part or adapt ensureImagePath.
    // For simplicity now, if it's a plain URL, we'll assume ensureImagePath can handle it
    // or it's already absolute. This might need refinement.
    // A simpler approach: ensureImagePath is for HTML. If it's a plain URL, pass it directly.
    if (htmlOrUrlString.startsWith('http') || htmlOrUrlString.startsWith('/') || htmlOrUrlString.startsWith('data:')) {
      return htmlOrUrlString;
    }
    // If relative path like "file.jpg", prefix with /images/
    return `/images/${htmlOrUrlString}`;
  }
  // Attempt to find src attribute in an <img> tag
  const match = htmlOrUrlString.match(/<img[^>]+src="([^">]+)"/);
  if (match && match[1]) {
    // We found a src, now ensure its path is correct for preloading
    const src = match[1];
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return src;
    }
    if (src.startsWith('/images/')) {
      return src;
    }
    if (src.startsWith('/')) {
      return `/images${src}`;
    }
    return `/images/${src}`;
  }
  return null; // No valid URL or <img> tag with src found
};

export { ensureImagePath, extractImageSrc }; 