import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';

const useEducatorPolls = (initialGameId = null, initialPollOptions = []) => {
  const { socket } = useSocket() || {};

  const [isPollRunning, setIsPollRunning] = useState(false);
  const [pollOptions, setPollOptions] = useState(initialPollOptions);
  const [voteCounts, setVoteCounts] = useState([]); // Percentages
  const [voteCountsAbsolute, setVoteCountsAbsolute] = useState([]); // Absolute numbers
  const [finalVoteCounts, setFinalVoteCounts] = useState([]);
  const [finalVoteCountsAbsolute, setFinalVoteCountsAbsolute] = useState([]);
  const [hasFinalResults, setHasFinalResults] = useState(false);
  const [totalVotes, setTotalVotes] = useState(0);
  const [finalTotalVotes, setFinalTotalVotes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentGameId, setCurrentGameId] = useState(initialGameId);

  // Refs for internal logic, similar to EducatorPanel
  const isPollRunningRef = useRef(isPollRunning);
  const totalVotesRef = useRef(totalVotes);
  const hasFinalResultsRef = useRef(hasFinalResults);
  const voteCountsRef = useRef(voteCounts);
  const voteCountsAbsoluteRef = useRef(voteCountsAbsolute);


  useEffect(() => {
    isPollRunningRef.current = isPollRunning;
    totalVotesRef.current = totalVotes;
    hasFinalResultsRef.current = hasFinalResults;
    voteCountsRef.current = voteCounts;
    voteCountsAbsoluteRef.current = voteCountsAbsolute;
  }, [isPollRunning, totalVotes, hasFinalResults, voteCounts, voteCountsAbsolute]);

  useEffect(() => {
    setPollOptions(initialPollOptions);
    console.log('[useEducatorPolls] initialPollOptions received:', initialPollOptions);
  }, [initialPollOptions]);
  
  useEffect(() => {
    setCurrentGameId(initialGameId);
  }, [initialGameId]);

  const requestResults = useCallback(() => {
    if (socket) {
      console.log('[useEducatorPolls] Emitting request results');
      socket.emit('request results');
    }
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleVoteReceived = (totalVoteCount) => {
      console.log('[useEducatorPolls] Vote received, total votes:', totalVoteCount);
      setIsPollRunning(true); // Ensure poll is marked active
      requestResults();
    };

    const handleResultsUpdated = (results, totalVotesParam, routes) => {
      const running = isPollRunningRef.current;
      const prevTotal = totalVotesRef.current;
      const newTotalVotes = totalVotesParam || 0;

      if (running && newTotalVotes < prevTotal) {
        console.log('[useEducatorPolls] Ignoring stale results update (older totalVotes)', newTotalVotes, '<', prevTotal);
        return;
      }
      console.log('[useEducatorPolls] Results updated:', results, 'Total votes:', newTotalVotes, 'Routes:', routes);
      
      totalVotesRef.current = newTotalVotes; // Update ref immediately

      if (results && Array.isArray(results) && results.length > 0) {
        const newVoteCounts = results.map(r => parseFloat(r));
        let newAbsoluteCounts = [];
        if (newTotalVotes > 0) {
            newAbsoluteCounts = newVoteCounts.map(percentage =>
            Math.round((parseFloat(percentage) / 100) * newTotalVotes)
          );
        } else {
            newAbsoluteCounts = newVoteCounts.map(() => 0);
        }


        if (running) {
          setVoteCounts(newVoteCounts);
          setTotalVotes(newTotalVotes);
          setVoteCountsAbsolute(newAbsoluteCounts);
        } else if (hasFinalResultsRef.current) {
          console.log('[useEducatorPolls] Ignoring result update as we have final results already saved');
        } else {
          console.log('[useEducatorPolls] Poll ended, saving final results:', newVoteCounts);
          setFinalVoteCounts(newVoteCounts);
          setFinalTotalVotes(newTotalVotes);
          setFinalVoteCountsAbsolute(newAbsoluteCounts);
          setHasFinalResults(true);
        }
      } else {
        console.log('[useEducatorPolls] No results or empty results received');
      }

      if (routes && (!pollOptions || pollOptions.length === 0)) {
        console.log('[useEducatorPolls] Updated pollOptions from results (routes):', routes);
        // Ensure standardized structure for poll options from server
        setPollOptions(routes.map(r => ({
          ID: r.ID || r.RelID_Encounter_Receiving, // Use RelID if ID is missing, common for server-sent routes
          Title: r.Title || `Option ${r.RelID_Encounter_Receiving || 'N/A'}`,
          RelID_Encounter_Receiving: r.RelID_Encounter_Receiving,
          ...r // Spread other properties
        })));
      }
    };

    const handlePollStarted = () => {
      console.log('[useEducatorPolls] Socket received poll_started event');
      setIsPollRunning(true);
      setHasFinalResults(false);
      setElapsedSeconds(0);
      setFinalVoteCounts([]);
      setFinalVoteCountsAbsolute([]);
      setFinalTotalVotes(0);
      setVoteCounts([]); // Clear live counts too
      setVoteCountsAbsolute([]);
      setTotalVotes(0);
      requestResults();
    };

    const handlePollEnded = () => {
      console.log('[useEducatorPolls] Socket received poll_ended event');
      // Save current results as final if not already done by 'results updated' when poll was not running
      if (!hasFinalResultsRef.current && voteCountsRef.current.length > 0) {
        console.log('[useEducatorPolls] Poll ended - saving final results from live data');
        setFinalVoteCounts([...voteCountsRef.current]);
        setFinalVoteCountsAbsolute([...voteCountsAbsoluteRef.current]);
        setFinalTotalVotes(totalVotesRef.current);
        setHasFinalResults(true);
      }
      setIsPollRunning(false);
      requestResults(); // Get final definitive results
    };

    const handlePollDataCleared = () => {
      console.log('[useEducatorPolls] Poll data cleared event received');
      setIsPollRunning(false);
      // Optionally clear more state here if needed, e.g., vote counts
      setVoteCounts([]);
      setVoteCountsAbsolute([]);
      setTotalVotes(0);
      // Final results are usually kept until a new poll starts or explicitly cleared by scenario change
    };

    socket.on('vote received', handleVoteReceived);
    socket.on('results updated', handleResultsUpdated);
    socket.on('poll started', handlePollStarted);
    socket.on('poll ended', handlePollEnded);
    socket.on('poll data cleared', handlePollDataCleared);

    return () => {
      socket.off('vote received', handleVoteReceived);
      socket.off('results updated', handleResultsUpdated);
      socket.off('poll started', handlePollStarted);
      socket.off('poll ended', handlePollEnded);
      socket.off('poll data cleared', handlePollDataCleared);
    };
  }, [socket, requestResults, pollOptions]); // Added pollOptions to ensure it's current for setPollOptions in results updated

  // Timer effect for poll duration
  useEffect(() => {
    let timer = null;
    let refreshTimer = null;
    if (isPollRunning) {
      timer = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
      refreshTimer = setInterval(() => {
        requestResults();
      }, 2000); // Consider making this interval configurable or less frequent
    } else {
      setElapsedSeconds(0); // Reset timer when poll is not running
    }
    return () => {
      if (timer) clearInterval(timer);
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [isPollRunning, requestResults]);

  const sendPoll = useCallback((currentEncounterText = "") => {
    if (!socket) return { success: false, message: 'Socket not available.' };
    if (!currentGameId) return { success: false, message: 'Game ID not set.' };
    // Use internal pollOptions state
    if (!pollOptions || pollOptions.length === 0) {
        return { success: false, message: "This scenario doesn't have any poll options configured in the hook." };
    }

    const optionTitles = pollOptions.map(option => option.Title || 'Untitled Option');
    const pollId = Date.now().toString(); // Unique ID for this poll

    console.log('[useEducatorPolls] sendPoll called with internal pollOptions:', pollOptions);

    const quizPayload = {
      text: currentEncounterText, // Use current encounter text or a default
      options: optionTitles,
      id: pollId,
      gameId: currentGameId,
    };

    console.log('[useEducatorPolls] Sending poll with ID:', pollId, 'quiz payload:', quizPayload);

    if (isPollRunningRef.current) { // End existing poll first
      console.log('[useEducatorPolls] Existing poll is running, ending it first.');
      socket.emit('end quiz'); // Server handles state changes and notifications
    }
    
    // Clear local state for the new poll
    setVoteCounts([]);
    setVoteCountsAbsolute([]);
    setTotalVotes(0);
    setFinalVoteCounts([]);
    setFinalVoteCountsAbsolute([]);
    setFinalTotalVotes(0);
    setHasFinalResults(false);
    setElapsedSeconds(0); // Reset timer display

    socket.emit('update quiz', quizPayload);
    socket.emit('send quiz'); // This should trigger 'poll started' on clients

    // Server should ideally send 'poll started' which then requests results.
    // Requesting results here too quickly might be redundant if 'poll started' handles it.
    // setTimeout(requestResults, 500); // Original had this, evaluate if necessary

    return { success: true, message: 'Poll sent successfully.' };
  }, [socket, currentGameId, requestResults, pollOptions]);

  const endPoll = useCallback(() => {
    if (!socket) return { success: false, message: 'Socket not available.' };
    console.log('[useEducatorPolls] Ending poll');
    socket.emit('end quiz');
    // UI will update via 'poll ended' event from server
    // setIsPollRunning(false); // Direct state change was in original, but server should drive this via event
    return { success: true, message: 'End poll request sent.' };
  }, [socket]);
  
  // Function to manually set poll options if they come from encounter data directly
  const setExternalPollOptions = useCallback((options) => {
    console.log('[useEducatorPolls] setExternalPollOptions called with options:', options);
    setPollOptions(options || []);
  }, []);

  const clearPollData = useCallback(() => {
    console.log('[useEducatorPolls] Clearing all poll data.');
    setIsPollRunning(false);
    setVoteCounts([]);
    setVoteCountsAbsolute([]);
    setFinalVoteCounts([]);
    setFinalVoteCountsAbsolute([]);
    setHasFinalResults(false);
    setTotalVotes(0);
    setFinalTotalVotes(0);
    setElapsedSeconds(0);
    // Do not clear pollOptions here, as they might be tied to the current scenario
    // and needed if a poll is started again for the same scenario before navigating away.
  }, []);


  return {
    isPollRunning,
    pollOptions,
    voteCounts,
    voteCountsAbsolute,
    finalVoteCounts,
    finalVoteCountsAbsolute,
    hasFinalResults,
    totalVotes,
    finalTotalVotes,
    elapsedSeconds,
    sendPoll,
    endPoll,
    requestResults, // Expose if components need to manually refresh
    setExternalPollOptions, // To set options from encounter data
    setCurrentGameId, // Allow parent to update gameId
    clearPollData, // Expose function to clear poll data
  };
};

export default useEducatorPolls; 