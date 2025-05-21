import React from 'react';
import EncounterThumbnail from '../EncounterThumbnail'; // Adjust path as needed

const PreviewPane = ({ isPresentationActive, currentEncounter }) => {
  return (
    <div className="encounter-preview-section" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'250px',textAlign:'center'}}>
      {isPresentationActive ? (
        currentEncounter ? (
          <EncounterThumbnail encounter={currentEncounter} />
        ) : (
          <p style={{color:'#b03a2e',fontSize:'1.4rem',fontWeight:'600',lineHeight:'1.4',maxWidth:'280px',margin:'0 auto'}}>
            Please select a scenario from the dropdown menu above to load content for your presentation.
          </p>
        )
      ) : (
        <p style={{color:'#b03a2e',fontSize:'1.4rem',fontWeight:'600',lineHeight:'1.4',maxWidth:'280px',margin:'0 auto'}}>Start the presentation to display the QR code, allow students to join, and enable hosting controls.</p>
      )}
    </div>
  );
};

export default PreviewPane; 