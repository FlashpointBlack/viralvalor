import { useEffect, useCallback } from 'react';

/**
 * Automatically shrinks the title/description fonts so the content never
 * overflows its container. Re-implements the earlier adjustTextFit logic but
 * hides the resize listener internals from the component.
 */
export default function useTextAutosize(contentRef, titleRef, descRef, encounter, enabled = true) {
  const adjustTextFit = useCallback(() => {
    const contentEl = contentRef.current;
    const titleEl = titleRef.current;
    const descEl = descRef.current;

    if (!contentEl || !titleEl || !descEl) return;

    // If the content element is part of an exiting slide, do not make further adjustments.
    // Its size should have been set before it started exiting.
    if (contentEl.closest('.slide-exiting')) {
      return;
    }

    // Reset any inline sizing first
    titleEl.style.fontSize = '';
    descEl.style.fontSize = '';
    const btnElsForReset = contentEl.querySelectorAll('.choice-buttons .btn, .choice-buttons .btn-primary');
    btnElsForReset.forEach(btn => {
      btn.style.fontSize = '';
    });

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
      // Ensure both title and description are above their minimums before breaking if one is too small.
      if (descSize <= MIN_DESC && titleSize <= MIN_TITLE) break;
      
      // Only shrink if above minimum
      if (descSize > MIN_DESC) {
        descSize = Math.max(descSize - STEP, MIN_DESC);
      }
      if (titleSize > MIN_TITLE) {
        titleSize = Math.max(titleSize - STEP, MIN_TITLE);
      }

      // If one dimension is already at min, but container still overflows,
      // allow the other to continue shrinking if it's not at its min.
      // This condition can be complex if text lengths vary wildly.
      // For simplicity, current logic shrinks both if container overflows
      // and at least one is above min.

      titleEl.style.fontSize = `${titleSize}px`;
      descEl.style.fontSize = `${descSize}px`;
      
      // Sync choice-button font sizes (if present) with description size
      const btnElsInLoop = contentEl.querySelectorAll('.choice-buttons .btn, .choice-buttons .btn-primary');
      btnElsInLoop.forEach(btn => {
        btn.style.setProperty('font-size', `${descSize}px`, 'important');
      });

      // If both hit min and still overflowing, we can't do more.
      if (descSize <= MIN_DESC && titleSize <= MIN_TITLE) break;
    }

    // After the loop, get the final computed sizes and set them again to "lock them in".
    const finalComputedTitleSize = window.getComputedStyle(titleEl).fontSize;
    const finalComputedDescSize = window.getComputedStyle(descEl).fontSize;

    titleEl.style.fontSize = finalComputedTitleSize;
    descEl.style.fontSize = finalComputedDescSize;

    // Lock in final button sizes
    const finalDescSize = window.getComputedStyle(descEl).fontSize;
    const btnElsAfterLoop = contentEl.querySelectorAll('.choice-buttons .btn, .choice-buttons .btn-primary');
    btnElsAfterLoop.forEach(btn => {
      btn.style.setProperty('font-size', finalDescSize, 'important');
    });
  }, [contentRef, titleRef, descRef]);

  useEffect(() => {
    if (!enabled || !contentRef.current || !titleRef.current || !descRef.current) {
      return; 
    }
    
    const t = setTimeout(adjustTextFit, 100);

    // Define handleResize within useEffect to capture current refs and adjustTextFit
    const handleResize = () => {
      if (enabled && contentRef.current && titleRef.current && descRef.current) {
        adjustTextFit();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', handleResize);
    };
  }, [encounter, adjustTextFit, enabled, contentRef, titleRef, descRef]);
} 