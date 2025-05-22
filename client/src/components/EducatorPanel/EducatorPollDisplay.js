import React from 'react';
import PropTypes from 'prop-types'; // Added for prop type validation
import PresentationControls from './PresentationControls'; // IMPORT PresentationControls

// Helper function (can be moved to a utils file if used elsewhere)
const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
};

const EducatorPollDisplay = ({
  // Poll state from useEducatorPolls via EducatorPanel
  isPollRunning,
  elapsedSeconds,
  totalVotes, // Live total votes
  voteCounts, // Live percentages
  voteCountsAbsolute, // Live absolute counts
  pollOptions,
  finalVoteCounts, // Final percentages
  finalTotalVotes, // Final total votes
  finalVoteCountsAbsolute, // Final absolute counts
  hasFinalResults,
  // Poll action handlers from useEducatorPolls via EducatorPanel
  sendPollHandler,
  endPollHandler,

  // Other props from EducatorPanel
  totalUsers, // This seems to come from user management context/state
  isPresentationActive, // From EducatorPanel state
  currentEncounter, // From EducatorPanel state
  navigateToRoute, // From EducatorPanel
  // formatTime, // formatTime is defined locally, or passed if needed from EP
}) => {
  // Debug logs

  return (
    <div className="poll-info-section">
      <div className="poll-time" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '32px' }}>
        <h3 style={{ margin: 0 }}>{isPollRunning
          ? `Poll has been running for ${formatTime(elapsedSeconds)}`
          : (hasFinalResults ? 'Poll ended' : 'No poll running')}
        </h3>
        {(hasFinalResults ? finalTotalVotes : totalVotes) > 0 &&
          <div className="total-votes" style={{ marginLeft: 'auto', fontSize: '14px', whiteSpace: 'nowrap' }}>
            {hasFinalResults ? finalTotalVotes : totalVotes} votes
            {totalUsers > 0 && ` (${Math.round(((hasFinalResults ? finalTotalVotes : totalVotes) / totalUsers) * 100)}% of users)`}
          </div>
        }
      </div>

      {/* Render PresentationControls directly here, passing down relevant props */}
      <PresentationControls 
        isPresentationActive={isPresentationActive}
        isPollRunning={isPollRunning}
        currentEncounter={currentEncounter} // For context, like encounter title for poll
        pollOptions={pollOptions} 
        navigateToRoute={navigateToRoute}
        voteCounts={voteCounts} // Live results
        voteCountsAbsolute={voteCountsAbsolute}
        finalVoteCounts={finalVoteCounts} // Final results
        finalVoteCountsAbsolute={finalVoteCountsAbsolute}
        hasFinalResults={hasFinalResults}
        sendPoll={sendPollHandler} // Pass the handler from EP
        endPoll={endPollHandler}   // Pass the handler from EP
        totalVotes={totalVotes} // Pass live total votes for display within controls if needed
        finalTotalVotes={finalTotalVotes} // Pass final total votes for display
      />
    </div>
  );
};

// Added PropTypes for the remaining props
EducatorPollDisplay.propTypes = {
  isPollRunning: PropTypes.bool.isRequired,
  elapsedSeconds: PropTypes.number.isRequired,
  totalVotes: PropTypes.number.isRequired,
  voteCounts: PropTypes.arrayOf(PropTypes.number).isRequired,
  voteCountsAbsolute: PropTypes.arrayOf(PropTypes.number).isRequired,
  pollOptions: PropTypes.arrayOf(PropTypes.object).isRequired,
  finalVoteCounts: PropTypes.arrayOf(PropTypes.number).isRequired,
  finalTotalVotes: PropTypes.number.isRequired,
  finalVoteCountsAbsolute: PropTypes.arrayOf(PropTypes.number).isRequired,
  hasFinalResults: PropTypes.bool.isRequired,
  sendPollHandler: PropTypes.func.isRequired,
  endPollHandler: PropTypes.func.isRequired,

  totalUsers: PropTypes.number.isRequired,
  isPresentationActive: PropTypes.bool.isRequired,
  currentEncounter: PropTypes.object, // Can be null
  navigateToRoute: PropTypes.func.isRequired,
  // formatTime: PropTypes.func, // if passed as prop
};

export default EducatorPollDisplay; 