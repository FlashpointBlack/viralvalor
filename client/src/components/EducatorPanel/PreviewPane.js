import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
// import EncounterThumbnail from '../EncounterThumbnail'; // Adjust path as needed
import SharedEncounterView from '../SharedEncounterView'; // Import SharedEncounterView
import './PreviewPane.css'; // We will create this CSS file

const PreviewPane = ({ 
  currentEncounter, // From useScenarioManager hook via EducatorPanel
  isPresentationActive, // From EducatorPanel state
  // gameId, // Prop from EducatorPanel, currently unused in PreviewPane directly
  // onOpenDisplayWindow, // Prop from EducatorPanel, currently unused
  // displayWindowReady, // Prop from EducatorPanel, currently unused
}) => {
  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => {
    // Reset imagesReady when the encounter changes, to allow fade-in for the new encounter
    setImagesReady(false);
  }, [currentEncounter?.ID]);

  const handleImagesLoaded = () => {
    setImagesReady(true);
  };

  return (
    <div className="encounter-preview-section">
      {isPresentationActive ? (
        currentEncounter && currentEncounter.ID ? ( // Check for a core property of the encounter itself
          <div className="preview-content-wrapper">
            <SharedEncounterView 
              key={currentEncounter.ID} // Add key for remount-based animation
              encounterData={{ Encounter: currentEncounter }} 
              autosize={true} 
              onImagesLoaded={handleImagesLoaded} // Pass the callback
              className={`preview-scaled-content ${imagesReady ? 'preview-content-fade-in' : ''}`} // Conditional class
            />
          </div>
        ) : (
          <p className="preview-message">
            Please select a scenario from the dropdown menu above to load content for your presentation.
          </p>
        )
      ) : (
        <p className="preview-message">
          Start the presentation to display the QR code, allow students to join, and enable hosting controls.
        </p>
      )}
    </div>
  );
};

PreviewPane.propTypes = {
  currentEncounter: PropTypes.shape({
    ID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    Title: PropTypes.string,
    Description: PropTypes.string,
    BackdropImage: PropTypes.string,
    Character1Image: PropTypes.string,
    Character2Image: PropTypes.string,
    routes: PropTypes.array, // from useScenarioManager structure
    // ... other direct properties of an encounter object from useScenarioManager
  }), // Can be null initially
  isPresentationActive: PropTypes.bool.isRequired,
  // gameId: PropTypes.string, // Optional, if it were to be used
  // onOpenDisplayWindow: PropTypes.func, // Optional
  // displayWindowReady: PropTypes.bool, // Optional
};

PreviewPane.defaultProps = {
  currentEncounter: null,
  isPresentationActive: false,
  // gameId: null,
  // onOpenDisplayWindow: () => {},
  // displayWindowReady: false,
};

export default PreviewPane; 