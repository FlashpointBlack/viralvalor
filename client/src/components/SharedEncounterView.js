import React, { useRef, useEffect } from 'react';
// import PropTypes from 'prop-types'; // Removed as it's not used and was added unintentionally
import sanitize from '../utils/sanitizeHtml'; // Assuming sanitizeHtml is used for HTML content
import useTextAutosize from '../hooks/useTextAutosize'; // Import the hook
import ChoiceButtons from './ChoiceButtons';
import './SharedEncounterView.css'; // Import the new CSS file
import { ensureImagePath, extractImageSrc } from '../utils/imageHelpers'; // Import helpers

// lockedFontSizes: optionally provide { title: '16px', desc: '12px' } to lock sizes (used for exiting slides)
const SharedEncounterView = ({ 
  encounterData, 
  autosize = true, 
  lockedFontSizes = null, 
  routes = null, 
  onSelectRoute = null,
  onImagesLoaded, // New prop
  className: propClassName = '', // New prop for additional class names
  style: propStyle = {}        // New prop for additional inline styles
}) => {
  // Create refs for the elements that useTextAutosize will interact with
  const contentRef = useRef(null);
  const titleRef = useRef(null);
  const descRef = useRef(null);

  // Determine if we should run autosize logic. If lockedFontSizes are provided, we skip autosize entirely.
  const shouldAutosize = autosize && !lockedFontSizes;

  // Call the hook with refs when appropriate
  useTextAutosize(contentRef, titleRef, descRef, encounterData?.Encounter, shouldAutosize);

  useEffect(() => {
    if (!encounterData || !encounterData.Encounter) {
      if (onImagesLoaded) {
        onImagesLoaded();
      }
      return;
    }

    const imagesToLoad = [];
    const { BackdropImage, Character1Image, Character2Image } = encounterData.Encounter;

    const backdropSrc = extractImageSrc(BackdropImage);
    const char1Src = extractImageSrc(Character1Image);
    const char2Src = extractImageSrc(Character2Image);

    if (backdropSrc) imagesToLoad.push(backdropSrc);
    if (char1Src) imagesToLoad.push(char1Src);
    if (char2Src) imagesToLoad.push(char2Src);

    if (imagesToLoad.length === 0) {
      if (onImagesLoaded) {
        onImagesLoaded();
      }
      return;
    }

    let loadedImages = 0;
    const handleImageLoad = () => {
      loadedImages++;
      if (loadedImages === imagesToLoad.length) {
        if (onImagesLoaded) {
          onImagesLoaded();
        }
      }
    };

    imagesToLoad.forEach(src => {
      const img = new Image();
      img.onload = handleImageLoad;
      img.onerror = handleImageLoad; // Call on error too, to not block indefinitely
      img.src = src;
    });

    // Cleanup function in case the component unmounts before images are loaded,
    // or if encounterData changes, to avoid calling onImagesLoaded for a previous encounter.
    // We don't have explicit cleanup for the Image objects (img.onload = null, etc.)
    // because they are local to this effect execution. If they load after unmount/re-run,
    // their callbacks won't call the onImagesLoaded of the *current* effect instance.
  }, [encounterData, onImagesLoaded]); // Removed extractImageSrc from dependencies

  if (!encounterData || !encounterData.Encounter) {
    // Or some placeholder/loading state if appropriate for a purely presentational component
    return <div className={`encounter-view empty ${propClassName}`} style={propStyle}>No encounter data provided.</div>;
  }

  const { Title, Description, BackdropImage, Character1Image, Character2Image } = encounterData.Encounter;

  // Adjust image paths before sanitizing and rendering
  const finalBackdropImage = ensureImagePath(BackdropImage);
  const finalCharacter1Image = ensureImagePath(Character1Image);
  const finalCharacter2Image = ensureImagePath(Character2Image);

  // Inline styles are removed. We will rely on external CSS, primarily from EncounterDisplay.css
  // by using its class names on our elements.

  return (
    // Add 'encounter-display' class to the root to potentially pick up global styles.
    // Keep 'shared-encounter-view-container' for any specific overrides if needed later, or remove if redundant.
    <div 
      className={`shared-encounter-view-container encounter-display ${propClassName}`.trim()}
      style={propStyle}
    >
      {/* Backdrop Image */}
      {finalBackdropImage && (
        <div
          className="encounter-backdrop" // Class from EncounterDisplay.css
          dangerouslySetInnerHTML={{ __html: sanitize(finalBackdropImage) }}
        />
      )}

      {/* Character Images */}
      {finalCharacter1Image && (
        <div
          className="encounter-character character-1" // Classes from EncounterDisplay.css
          dangerouslySetInnerHTML={{ __html: sanitize(finalCharacter1Image) }}
        />
      )}
      {finalCharacter2Image && (
        <div
          className="encounter-character character-2" // Classes from EncounterDisplay.css
          dangerouslySetInnerHTML={{ __html: sanitize(finalCharacter2Image) }}
        />
      )}

      {/* Text Content - uses classes also found in EncounterDisplay.css */}
      <div className="encounter-content" ref={contentRef}>
        {Title && <h1 className="encounter-title" ref={titleRef} style={lockedFontSizes ? { fontSize: lockedFontSizes.title } : undefined}>{Title}</h1>}
        {Description && (
          <div
            className="encounter-description"
            ref={descRef}
            style={lockedFontSizes ? { fontSize: lockedFontSizes.desc } : undefined}
            dangerouslySetInnerHTML={{ __html: sanitize(Description) }}
          />
        )}
        {/* Optional choice buttons for single-player mode */}
        {routes && routes.length > 0 && (
          onSelectRoute ? (
            <ChoiceButtons routes={routes} onSelectRoute={onSelectRoute} broadcast={false} fontSize={lockedFontSizes ? lockedFontSizes.desc : null} />
          ) : (
            <ChoiceButtons routes={routes} onSelectRoute={() => {}} broadcast={false} fontSize={lockedFontSizes ? lockedFontSizes.desc : null} />
          )
        )}
      </div>
    </div>
  );
};

export default SharedEncounterView; 