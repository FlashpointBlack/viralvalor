import React from 'react';

const StartPresentationButtons = ({ 
  isPresentationActive, 
  isPollRunning, 
  startPresentation, 
  endPresentation 
}) => {
  return (
    <>
      {!isPresentationActive && (
        <button
          className="btn"
          onClick={startPresentation}
          disabled={isPollRunning}
          style={{
            opacity: isPollRunning ? 0.5 : 1,
            cursor: isPollRunning ? 'not-allowed' : 'pointer'
          }}
          title={isPollRunning ? "Cannot start presentation while a poll is active" : "Start a new presentation session"}
        >
          Start Presentation
        </button>
      )}

      {isPresentationActive && (
        <button
          className="btn"
          onClick={endPresentation}
          disabled={isPollRunning}
          style={{ 
            opacity: isPollRunning ? 0.5 : 1,
            cursor: isPollRunning ? 'not-allowed' : 'pointer'
          }}
          title={isPollRunning ? "Cannot end presentation while a poll is active" : "End the current presentation session"}
        >
          End Presentation
        </button>
      )}
    </>
  );
};

export default StartPresentationButtons; 