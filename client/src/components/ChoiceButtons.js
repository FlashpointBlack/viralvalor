import React from 'react';
import { useSocket } from '../contexts/SocketContext';

const ChoiceButtons = ({ routes, onSelectRoute }) => {
  const { selectEncounter } = useSocket();

  const handleSelectRoute = (routeId) => {
    onSelectRoute(routeId);
    selectEncounter(routeId);
  };

  if (!routes || routes.length === 0) {
    return <div className="no-choices">End of this story path.</div>;
  }

  return (
    <div className="choice-buttons">
      {routes.map((route) => (
        <button
          key={route.ID}
          className="btn btn-primary btn-block"
          onClick={() => handleSelectRoute(route.RelID_Encounter_Receiving)}
        >
          {route.Title}
        </button>
      ))}
    </div>
  );
};

export default ChoiceButtons; 