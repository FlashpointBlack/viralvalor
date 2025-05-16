import { useEffect, useCallback } from 'react';

/**
 * Automatically shrinks the title/description fonts so the content never
 * overflows its container. Re-implements the earlier adjustTextFit logic but
 * hides the resize listener internals from the component.
 */
export default function useTextAutosize(encounter) {
  // Core algorithm lifted from the previous inline implementation
  const adjustTextFit = useCallback(() => {
    const contentEl = document.querySelector('.encounter-content');
    if (!contentEl) return;

    const titleEl = contentEl.querySelector('.encounter-title');
    const descEl = contentEl.querySelector('.encounter-description');
    if (!descEl || !titleEl) return;

    // Reset any inline sizing first
    titleEl.style.fontSize = '';
    descEl.style.fontSize = '';

    // Get computed starting sizes (px)
    let titleSize = parseFloat(window.getComputedStyle(titleEl).fontSize);
    let descSize = parseFloat(window.getComputedStyle(descEl).fontSize);

    const MIN_DESC = 6;
    const MIN_TITLE = 8;
    const STEP = 0.5;
    const MAX_ITER = 100;
    let guard = 0;

    while (guard < MAX_ITER && contentEl.scrollHeight > contentEl.clientHeight) {
      guard++;
      if (descSize <= MIN_DESC) break;

      descSize = Math.max(descSize - STEP, MIN_DESC);
      titleSize = Math.max(titleSize - STEP, MIN_TITLE);

      titleEl.style.fontSize = `${titleSize}px`;
      descEl.style.fontSize = `${descSize}px`;
    }
  }, []);

  useEffect(() => {
    // Delay slightly to allow images/fonts to load then measure
    const t = setTimeout(adjustTextFit, 100);

    window.addEventListener('resize', adjustTextFit);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', adjustTextFit);
    };
  }, [encounter, adjustTextFit]);
} 