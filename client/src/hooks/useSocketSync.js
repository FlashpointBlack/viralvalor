import { useEffect, useRef } from 'react';
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
  controlledByHost = false,
}) {
  let hookFetchCounter = 0; // Counter specific to this hook instance

  // useRef to store last processed TravelToID to suppress floods. Persists across re-renders.
  const lastTravelToIDProcessed = useRef({ id: null, gameId: null, time: 0 });

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
      hookFetchCounter++;
      const now = Date.now();
      debugLog(`FETCH_TRACE (useSocketSync - ${hookFetchCounter}): handleTravelToID received. ID: ${encounterId}, GameID: ${gameId}, Controlled: ${controlledByHost}. Caller:`, new Error().stack.split('\n')[2].trim());

      // If controlled by host, this hook should not initiate data fetches or transitions.
      // It might still sync gameId if necessary, or log, but primary control is elsewhere.
      if (controlledByHost) {
        debugLog(`[useSocketSync] Controlled by host. TravelToID for ${encounterId} will not trigger fetch/transition from here.`);
        // Minimal gameId sync if needed
        if (gameId && !currentGameId) {
          debugLog(`[useSocketSync] (Controlled) Adopting game ID from socket event: ${gameId}`);
          setCurrentGameId(gameId);
          setDebugInfo((prev) => ({ ...prev, gameId }));
        }
        return; // Stop further processing in this handler
      }

      // Throttle duplicate TravelToID events for same encounter within 500ms
      if (
        encounterId === lastTravelToIDProcessed.current.id &&
        (gameId || null) === (lastTravelToIDProcessed.current.gameId || null) && // ensure gameId also matches
        now - lastTravelToIDProcessed.current.time < 500 // Increased throttle window slightly
      ) {
        debugLog('Ignoring duplicate TravelToID for same encounter within throttle window');
        return;
      }
      lastTravelToIDProcessed.current = { id: encounterId, gameId, time: now };

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

      // If the encounter is already current or being transitioned to, just ensure data is fresh once
      if (encounterId === currentId || isTransitioning) {
        debugLog('TravelToID matches current / in-progress encounter - refreshing data if necessary');
        // Avoid fetching if a transition is already happening for this ID, as PresentationDisplayHost might be driving it.
        if (!isTransitioning) {
          debugLog(`FETCH_TRACE (useSocketSync - ${hookFetchCounter}): handleTravelToID -> fetchEncounterData for ID ${encounterId} (already current, not transitioning).`);
          fetchEncounterData(encounterId, false);
        }
        return;
      }

      debugLog(`Proceeding with transition to encounter ${encounterId}`);
      debugLog(`FETCH_TRACE (useSocketSync - ${hookFetchCounter}): handleTravelToID -> handleEncounterTransition for ID ${encounterId} (NOT host controlled).`);
      handleEncounterTransition(encounterId);
    };

    socket.on('TravelToID', handleTravelToID);

    return () => {
      socket.off('TravelToID', handleTravelToID);
    };
  }, [
    currentGameId, currentId, isTransitioning, 
    debugLog, setCurrentGameId, setDebugInfo, 
    fetchEncounterData, handleEncounterTransition, 
    setIsTransitioning, setPreviousEncounter,
    controlledByHost
  ]);
} 