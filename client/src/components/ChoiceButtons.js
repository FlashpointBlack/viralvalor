import React from 'react';
import { useSocket } from '../contexts/SocketContext';

const ChoiceButtons = ({ routes, onSelectRoute, broadcast = true, fontSize = null }) => {
  const { selectEncounter } = useSocket();

  const handleSelectRoute = (routeId) => {
    onSelectRoute(routeId);
    if (broadcast) {
      selectEncounter(routeId);
    }
  };

  if (!routes || routes.length === 0) {
    return <div className="no-choices">End of this story path.</div>;
  }

  return (
    <div className="choice-buttons" style={fontSize ? { fontSize } : undefined}>
      {routes.map((route) => (
        <button
          key={route.ID}
          className="btn btn-primary btn-block"
          onClick={() => handleSelectRoute(route.RelID_Encounter_Receiving)}
          style={fontSize ? { fontSize } : undefined}
        >
          {route.Title}
        </button>
      ))}
    </div>
  );
};

export default ChoiceButtons; 