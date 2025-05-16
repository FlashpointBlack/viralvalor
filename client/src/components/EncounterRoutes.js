import React, { useState } from 'react';
import './EncounterRoutes.css';

const EncounterRoutes = ({ 
  routes, 
  onPersistChoice,
  onDeleteChoice, 
  onLinkEncounter, 
  onCreateNewEncounter,
  fetchUnlinkedEncounters,
  onFollowLink
}) => {
  const [unlinkedEncounters, setUnlinkedEncounters] = useState([]);
  const [isSelectingFor, setIsSelectingFor] = useState(null);
  
  if (!routes || routes.length === 0) {
    return (
      <div className="no-routes">
        <p>No choices available. Click "Add Choice" to create a story branch.</p>
      </div>
    );
  }

  const handleShowLinkOptions = async (routeId) => {
    try {
      const encounters = await fetchUnlinkedEncounters();
      console.log('Unlinked encounters received:', encounters);
      setUnlinkedEncounters(encounters);
      setIsSelectingFor(routeId);
    } catch (error) {
      console.error('Failed to fetch unlinked encounters:', error);
    }
  };

  const handleLinkEncounter = (receivingEncounterId) => {
    if (!isSelectingFor) return;
    
    onLinkEncounter(isSelectingFor, receivingEncounterId);
    setIsSelectingFor(null);
    setUnlinkedEncounters([]);
  };

  const handleTitleBlur = (e, routeId) => {
    const newValue = e.target.value;
    onPersistChoice(routeId, newValue);
  };

  const handleFollowLink = (encounterId) => {
    onFollowLink(encounterId);
  };

  const handleUnlinkEncounter = (routeId) => {
    onLinkEncounter(routeId, null);
  };

  return (
    <div className="encounter-routes">
      <h3>Story Choices</h3>
      
      {routes.map(route => (
        <div key={route.ID} className="encounter-route">
          <div className="route-content">
            <input
              type="text"
              className="route-title-input"
              defaultValue={route.Title || ""}
              onBlur={(e) => handleTitleBlur(e, route.ID)}
              placeholder="Enter choice text"
            />
            
            <div className="route-actions">
              {route.RelID_Encounter_Receiving ? (
                <>
                  <button 
                    onClick={() => handleFollowLink(route.RelID_Encounter_Receiving)}
                    className="btn"
                  >
                    Follow
                  </button>
                  <button 
                    onClick={() => handleUnlinkEncounter(route.ID)}
                    className="btn"
                  >
                    Unlink
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => onCreateNewEncounter(route.ID)}
                    className="btn"
                  >
                    New
                  </button>
                </>
              )}
              <button 
                onClick={() => onDeleteChoice(route.ID)}
                className="btn"
              >
                Delete
              </button>
            </div>
          </div>
          
          {isSelectingFor === route.ID && unlinkedEncounters.length > 0 && (
            <div className="unlinked-encounters-list">
              <h4>Select an encounter to link:</h4>
              <div className="unlinked-options">
                {unlinkedEncounters.map(encounter => (
                  <button 
                    key={encounter.ID}
                    onClick={() => handleLinkEncounter(encounter.ID)}
                    className="btn"
                  >
                    {encounter.Title || `Encounter #${encounter.ID}`}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setIsSelectingFor(null)}
                className="btn"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default EncounterRoutes; 