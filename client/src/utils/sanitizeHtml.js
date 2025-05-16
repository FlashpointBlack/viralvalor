import DOMPurify from 'dompurify';

/**
 * Safely sanitises an HTML string so it can be injected via
 * dangerouslySetInnerHTML without XSS risk.
 *
 * The default DOMPurify settings are already conservative; we expose this
 * utility to centralise the dependency and keep component code tidy.
 */
export default function sanitizeHtml(html = '') {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
} 