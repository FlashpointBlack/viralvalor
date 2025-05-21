import React from 'react';
import PropTypes from 'prop-types';
// import './PresentationControls.css'; // Or './EducatorPanel.css' if styles are shared

const PresentationControls = ({
  // Props for route navigation and poll results
  isPresentationActive,
  isPollRunning,
  pollOptions,      // EncounterRoutes: for titles, navigation, and result bars
  navigateToRoute,
  voteCounts,         // For result bars (percentage)
  voteCountsAbsolute, // For result bars (absolute count)
  finalVoteCounts,
  finalVoteCountsAbsolute,
  hasFinalResults,
  currentEncounter, // To ensure there's an encounter to interact with

  // Props for Send/End Poll button
  sendPoll,
  endPoll,
}) => {
  console.log('[PresentationControls] Rendering with props - currentEncounter:', currentEncounter, 'pollOptions:', pollOptions, 'isPresentationActive:', isPresentationActive);
  // Render only if we have a valid encounter selected. We still allow rendering when the presentation
  // hasn't started so educators can review route options. The Send Poll button remains disabled
  // when `isPresentationActive` is false via its own `disabled` prop logic.
  if (!currentEncounter) {
    return null;
  }

  return (
    <div className="presentation-controls-wrapper" style={{ marginTop: '10px' }}>
      {/* Route choices and poll result bars */}
      <div className="poll-options">
        {pollOptions && pollOptions.length > 0 ? (
          <div className="poll-options-compact-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {pollOptions.map((option, index) => (
              <React.Fragment key={option.ID || `pc-route-${index}`}>
                <div className="poll-option-row" style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
                  {/* Route Navigation Button */}
                  <button
                    className="btn poll-route-button"
                    onClick={() => navigateToRoute(option)}
                    disabled={!option.RelID_Encounter_Receiving || isPollRunning}
                    title={
                      isPollRunning ? "Cannot navigate while poll is active" :
                        option.RelID_Encounter_Receiving ?
                          `Navigate to encounter #${option.RelID_Encounter_Receiving}` :
                          "This route has no destination encounter"
                    }
                    style={{
                      minHeight: '25px',
                      width: '180px',
                      whiteSpace: 'normal',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0'
                    }}
                  >
                    {option.Title || `Option ${index + 1}`}
                  </button>

                  {/* Poll Result Bar */}
                  <div className="option-bar-container" style={{ margin: '0', flexGrow: 1 }}>
                    <div
                      className="option-bar"
                      style={{
                        height: '100%',
                        width: `${hasFinalResults ?
                          (finalVoteCounts[index] || 0) :
                          (voteCounts[index] || 0)}%`
                      }}
                    />
                    <span className="vote-counts">
                      {hasFinalResults ?
                        `${finalVoteCountsAbsolute[index] || 0} votes (${finalVoteCounts[index] || 0}%)` :
                        `${voteCountsAbsolute[index] || 0} votes (${voteCounts[index] || 0}%)`}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p>No routes available for this scenario to use as poll options.</p>
        )}
      </div>

      {/* Send/End Poll Button */}
      <div className="poll-specific-controls" style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
        <button
          className="btn"
          onClick={isPollRunning ? endPoll : () => sendPoll(currentEncounter?.Text || "Poll from current encounter")}
          disabled={isPollRunning ? false : !(pollOptions && pollOptions.length > 0) || !isPresentationActive}
          title={!isPresentationActive ? 'Start a presentation to send polls.' 
                 : !(pollOptions && pollOptions.length > 0) ? 'No poll options available for the current encounter.' 
                 : (isPollRunning ? 'End the current poll.' : 'Start a new poll using current encounter options.')}
        >
          {isPollRunning ? 'End Poll' : 'Send Poll'}
        </button>
      </div>
    </div>
  );
};

PresentationControls.propTypes = {
  isPresentationActive: PropTypes.bool.isRequired,
  isPollRunning: PropTypes.bool.isRequired,
  pollOptions: PropTypes.arrayOf(PropTypes.object).isRequired,
  navigateToRoute: PropTypes.func.isRequired,
  voteCounts: PropTypes.arrayOf(PropTypes.number).isRequired,
  voteCountsAbsolute: PropTypes.arrayOf(PropTypes.number).isRequired,
  finalVoteCounts: PropTypes.arrayOf(PropTypes.number).isRequired,
  finalVoteCountsAbsolute: PropTypes.arrayOf(PropTypes.number).isRequired,
  hasFinalResults: PropTypes.bool.isRequired,
  currentEncounter: PropTypes.object, // Important for context and checks
  sendPoll: PropTypes.func.isRequired,
  endPoll: PropTypes.func.isRequired,
};

export default PresentationControls; 