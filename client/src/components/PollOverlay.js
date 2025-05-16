import React from 'react';

/**
 * PollOverlay – simple visual component displayed while a poll is active.
 * The parent decides when it is rendered. A future enhancement can pass a
 * live timer value. For now we default to "0:00" if no time is provided.
 */
const PollOverlay = ({ pollTime = '0:00' }) => (
  <div className="poll-overlay">
    <div className="poll-timer">
      <h2>A POLL HAS BEEN RUNNING FOR {pollTime}</h2>
    </div>
  </div>
);

export default PollOverlay; 