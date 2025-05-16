import { useEffect } from 'react';
import socket from '../socket';

/**
 * useSocketSync – centralises socket listeners that keep the EncounterDisplay
 * in sync with presenter / game state. All business logic remains exactly the
 * same, but lives outside the big component for readability.
 */
export default function useSocketSync({
  currentGameId,
  setCurrentGameId,
  currentId,
  encounter,
  fetchEncounterData,
  handleEncounterTransition,
  setPollActive,
  debugLog = () => {},
  logError = () => {},
  setDebugInfo = () => {},
  isTransitioning = false,
  setIsTransitioning = () => {},
  setPreviousEncounter = () => {},
}) {
  // -------------------------------------------------------------------
  // Sync with active presentation (game) when the socket connects or the
  // component mounts. Ensures a freshly-opened display immediately joins the
  // current game session and will start receiving TravelToID events.
  // -------------------------------------------------------------------
  useEffect(() => {
    const requestPresenterInfo = () => {
      debugLog('Requesting presenter info to sync active game');
      try {
        socket.emit('get presenter', currentGameId || null);
      } catch (err) {
        logError('Failed to emit get presenter', err);
      }
    };

    const handlePresenterInfo = ({ gameId: infoGameId, isActive }) => {
      debugLog('Presenter info received:', { infoGameId, isActive });
      if (infoGameId && isActive && infoGameId !== currentGameId) {
        debugLog(`Syncing currentGameId to ${infoGameId} from presenter info`);
        setCurrentGameId(infoGameId);
        setDebugInfo((prev) => ({ ...prev, gameId: infoGameId, status: 'Synced via presenter info' }));
      }
    };

    const handlePresentationStarted = ({ gameId: startedGameId }) => {
      if (startedGameId && startedGameId !== currentGameId) {
        debugLog(`Presentation started for game ${startedGameId}`);
        setCurrentGameId(startedGameId);
        setDebugInfo((prev) => ({ ...prev, gameId: startedGameId, status: 'Presentation started' }));
      }
    };

    const handlePresentationEnded = ({ gameId: endedGameId }) => {
      if (!endedGameId || endedGameId === currentGameId) {
        debugLog('Presentation ended – clearing currentGameId');
        setCurrentGameId(null);
        setDebugInfo((prev) => ({ ...prev, status: 'Presentation ended' }));
      }
    };

    socket.on('presenter info', handlePresenterInfo);
    socket.on('presentation started', handlePresentationStarted);
    socket.on('presentation ended', handlePresentationEnded);
    socket.on('connect', requestPresenterInfo);

    // Immediately request info on mount
    requestPresenterInfo();

    return () => {
      socket.off('presenter info', handlePresenterInfo);
      socket.off('presentation started', handlePresentationStarted);
      socket.off('presentation ended', handlePresentationEnded);
      socket.off('connect', requestPresenterInfo);
    };
  }, [currentGameId, debugLog, logError, setCurrentGameId, setDebugInfo]);

  // ------------------------------------------------------------
  // When we have a game ID but no encounter yet, ask the server
  // for the current encounter so late joiners sync immediately.
  // ------------------------------------------------------------
  useEffect(() => {
    if (!currentGameId) return;
    if (encounter) return; // already synced

    debugLog(`Requesting current encounter for game ${currentGameId}`);
    try {
      socket.emit('request current encounter', currentGameId);
    } catch (err) {
      logError('Failed to emit request current encounter', err);
    }

    const handleCurrentEncounter = ({ gameId: infoGameId, encounterId }) => {
      debugLog('Current encounter info received:', { infoGameId, encounterId });
      if (!infoGameId || infoGameId !== currentGameId) return; // ignore other games
      if (!encounterId) return; // no encounter chosen yet

      if (encounterId !== currentId) {
        handleEncounterTransition(encounterId);
      } else {
        fetchEncounterData(encounterId, false);
      }
    };

    socket.on('current encounter', handleCurrentEncounter);

    return () => {
      socket.off('current encounter', handleCurrentEncounter);
    };
  }, [currentGameId, encounter, currentId, handleEncounterTransition, fetchEncounterData, debugLog, logError]);

  // ------------------------------------------------------------
  // Poll events helper – simple enable/disable toggle.
  // ------------------------------------------------------------
  useEffect(() => {
    const enablePoll  = () => setPollActive(true);
    const disablePoll = () => setPollActive(false);

    socket.on('new quiz', enablePoll);
    socket.on('end quiz', disablePoll);
    socket.on('poll started', enablePoll);
    socket.on('poll ended', disablePoll);

    return () => {
      socket.off('new quiz', enablePoll);
      socket.off('end quiz', disablePoll);
      socket.off('poll started', enablePoll);
      socket.off('poll ended', disablePoll);
    };
  }, [setPollActive]);

  // ------------------------------------------------------------
  // TravelToID – main presenter navigation event.
  // ------------------------------------------------------------
  useEffect(() => {
    const handleTravelToID = (encounterId, gameId) => {
      debugLog(`Socket event: TravelToID - ${encounterId}, gameId: ${gameId || 'none'}`);

      // Ignore messages for a different active game session
      if (currentGameId && gameId && gameId !== currentGameId) {
        debugLog(`Ignoring TravelToID – mismatched game. Expected ${currentGameId}, received ${gameId}`);
        return;
      }

      // Adopt gameId if we don't have one yet
      if (gameId && !currentGameId) {
        debugLog(`Adopting game ID from socket event: ${gameId}`);
        setCurrentGameId(gameId);
        setDebugInfo((prev) => ({ ...prev, gameId }));
      }

      // Even if this is the current ID, we should refresh the data
      if (encounterId === currentId) {
        debugLog('TravelToID matches current ID - refreshing data');
        fetchEncounterData(encounterId, false);
        return;
      }

      // If we're in the middle of a transition, finish it immediately
      if (isTransitioning) {
        debugLog('TravelToID during transition - forcing completion first');
        setIsTransitioning(false);
        setPreviousEncounter(null);
        debugLog('Ignoring TravelToID – already at this encounter or mid-transition');
        return;
      }

      debugLog(`Proceeding with transition to encounter ${encounterId}`);
      handleEncounterTransition(encounterId);
    };

    socket.on('TravelToID', handleTravelToID);

    return () => {
      socket.off('TravelToID', handleTravelToID);
    };
  }, [currentGameId, currentId, isTransitioning, debugLog, setCurrentGameId, setDebugInfo, fetchEncounterData, handleEncounterTransition, setIsTransitioning, setPreviousEncounter]);
} 