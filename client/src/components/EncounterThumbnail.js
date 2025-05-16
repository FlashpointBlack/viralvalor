import React, { useEffect, useCallback, useRef } from 'react';

const EncounterThumbnail = ({ encounter }) => {
  const containerRef = useRef(null);

  const fitText = useCallback(() => {
    if (!containerRef.current) return;

    const boxEl   = containerRef.current.querySelector('.thumbnail-content');
    const titleEl = boxEl?.querySelector('.thumbnail-title');
    const descEl  = boxEl?.querySelector('.thumbnail-description');
    if (!titleEl || !descEl || !boxEl) return;

    // reset
    titleEl.style.fontSize = '';
    descEl.style.fontSize  = '';

    let titleSize = parseFloat(window.getComputedStyle(titleEl).fontSize);
    let descSize  = parseFloat(window.getComputedStyle(descEl ).fontSize);

    const MIN_TITLE = 1;
    const MIN_DESC  = 1;
    const MAX_ITER = 20;

    let iter = 0;
    while (iter < MAX_ITER && (boxEl.scrollHeight > boxEl.clientHeight || boxEl.scrollWidth > boxEl.clientWidth)) {
      iter++;
      const heightRatio = boxEl.clientHeight / boxEl.scrollHeight;
      const widthRatio  = boxEl.clientWidth  / boxEl.scrollWidth;
      const ratio = Math.min(heightRatio, widthRatio, 0.9); // more aggressive shrink
      if (ratio >= 0.99) break;

      titleSize = Math.max(titleSize * ratio, MIN_TITLE);
      descSize  = Math.max(descSize  * ratio, MIN_DESC);

      titleEl.style.fontSize = `${titleSize}px`;
      descEl.style.fontSize  = `${descSize}px`;
    }

    // If still overflowing, force to minimum size
    if (boxEl.scrollHeight > boxEl.clientHeight || boxEl.scrollWidth > boxEl.clientWidth) {
      titleEl.style.fontSize = `${MIN_TITLE}px`;
      descEl.style.fontSize = `${MIN_DESC}px`;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(fitText, 50);
    window.addEventListener('resize', fitText);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', fitText);
    };
  }, [encounter, fitText]);

  if (!encounter) return null;

  const { Title, Description, BackdropImage, Character1Image, Character2Image } = encounter;

  // Replace CR/LF with <br> for thumbnail rendering
  const formattedDescription = Description ? Description.replace(/\r\n|\n/g, '<br/>') : '';

  return (
    <div className="encounter-thumbnail" ref={containerRef}>
      <div className="thumbnail-container">
        {/* Main content box */}
        <div className="thumbnail-content" title={`${Title}\n\n${Description}`}>
          <h4 className="thumbnail-title">{Title}</h4>
          <div className="thumbnail-description" dangerouslySetInnerHTML={{ __html: formattedDescription }} />
        </div>

        {/* Background and characters */}
        {BackdropImage && (
          <div
            className="thumbnail-backdrop"
            dangerouslySetInnerHTML={{ __html: BackdropImage }}
          />
        )}
        {Character1Image && (
          <div
            className="thumbnail-character character-left"
            dangerouslySetInnerHTML={{ __html: Character1Image }}
          />
        )}
        {Character2Image && (
          <div
            className="thumbnail-character character-right"
            dangerouslySetInnerHTML={{ __html: Character2Image }}
          />
        )}
      </div>
    </div>
  );
};

export default EncounterThumbnail; 