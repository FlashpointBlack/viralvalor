import React, { useState } from 'react';

/**
 * DebugPanel – A presentational component that exposes live debug information
 * and test controls for EncounterDisplay.
 *
 * All behaviour is driven by props so the panel can be embedded anywhere
 * without owning application state.
 */
const DebugPanel = ({
  show,
  debugInfo = {},
  currentId = null,
  currentGameId = null,
  isTransitioning = false,
  transitionError = null,
  onHide = () => {},
  onTriggerTransition = () => {},
  onResetTransition = () => {},
}) => {
  const [manualEncounterId, setManualEncounterId] = useState('');

  if (!show) return null;

  return (
    <div className="debug-panel">
      <h3>Debug Panel (Ctrl+D to toggle)</h3>

      <p>
        <strong>Current Status:</strong> {debugInfo.status || 'n/a'}
      </p>
      <p>
        <strong>Current ID:</strong> {currentId || 'none'}
      </p>
      <p>
        <strong>Game ID:</strong> {currentGameId || 'none'}
      </p>
      <p>
        <strong>Transitions:</strong> {debugInfo.transitions ?? 0}
      </p>
      <p>
        <strong>Messages Received:</strong> {debugInfo.messageCount ?? 0}
      </p>
      <p>
        <strong>Transitioning:</strong> {isTransitioning ? 'YES' : 'NO'}
      </p>
      <p>
        <strong>Last From:</strong> {debugInfo.lastTransitionFrom ?? '—'}
      </p>
      <p>
        <strong>Last To:</strong> {debugInfo.lastTransitionTo ?? '—'}
      </p>

      {transitionError && (
        <div className="debug-error">
          <h4>Error</h4>
          <p>{transitionError}</p>
        </div>
      )}

      <h4>Test Controls</h4>
      <div className="debug-controls">
        <input
          type="number"
          placeholder="Encounter ID"
          value={manualEncounterId}
          onChange={(e) => setManualEncounterId(e.target.value)}
        />
        <button
          onClick={() => {
            if (manualEncounterId) {
              onTriggerTransition(manualEncounterId);
            }
          }}
        >
          Trigger Transition
        </button>

        <button onClick={onResetTransition}>Reset Transition State</button>
        <button onClick={onHide}>Hide Debug</button>
      </div>
    </div>
  );
};

export default DebugPanel; 