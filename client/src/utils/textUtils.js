export function decodeEscaped(str = '') {
  if (typeof str !== 'string') return str;
  try {
    // Wrap in double quotes and parse to decode common escape sequences
    return JSON.parse(`"${str.replace(/"/g, '\\"')}"`);
  } catch (e) {
    // Fallback manual replacements if JSON.parse fails
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
}

export function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value);
    }
    return result;
  }
  if (typeof obj === 'string') return decodeEscaped(obj);
  return obj;
} 