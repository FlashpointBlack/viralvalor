import React, { useRef } from 'react';
import sanitize from '../utils/sanitizeHtml'; // Assuming sanitizeHtml is used for HTML content
import useTextAutosize from '../hooks/useTextAutosize'; // Import the hook
import ChoiceButtons from './ChoiceButtons';

// This helper function adjusts image paths within an HTML string to ensure they are correctly prefixed.
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

// lockedFontSizes: optionally provide { title: '16px', desc: '12px' } to lock sizes (used for exiting slides)
const SharedEncounterView = ({ encounterData, autosize = true, lockedFontSizes = null, routes = null, onSelectRoute = null }) => {
  // Create refs for the elements that useTextAutosize will interact with
  const contentRef = useRef(null);
  const titleRef = useRef(null);
  const descRef = useRef(null);

  // Determine if we should run autosize logic. If lockedFontSizes are provided, we skip autosize entirely.
  const shouldAutosize = autosize && !lockedFontSizes;

  // Call the hook with refs when appropriate
  useTextAutosize(contentRef, titleRef, descRef, encounterData?.Encounter, shouldAutosize);

  if (!encounterData || !encounterData.Encounter) {
    // Or some placeholder/loading state if appropriate for a purely presentational component
    return <div className="encounter-view empty">No encounter data provided.</div>;
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
    <div className="shared-encounter-view-container encounter-display">
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