import { useState, useCallback, useEffect, useRef } from 'react';
import socket from '../socket'; // Assuming socket is configured and exported from here
import { useAuth0 } from '@auth0/auth0-react';
import { v4 as uuidv4 } from 'uuid';

const DEBUG_MODE = true; // Or get from a central config
const debugLog = (...args) => {
  if (DEBUG_MODE) {
    console.log('[usePresentationManager]', ...args);
  }
};

const usePresentationManager = (
    initialGameId, 
    openDisplayWindowCallback, 
    addToastCallback,
    currentEncounter // Added to know what to load when presentation starts
) => {
  const { user } = useAuth0();
  const [isPresentationActive, setIsPresentationActive] = useState(false);
  const [currentGameId, setCurrentGameId] = useState(initialGameId);
  const [presentationStartTime, setPresentationStartTime] = useState(null);
    
  // This ref will hold the latest currentEncounter.ID, critical for starting presentation with context
  const currentEncounterRef = useRef(currentEncounter); 

  useEffect(() => {
    currentEncounterRef.current = currentEncounter;
  }, [currentEncounter]);

  const startPresentation = useCallback(async (displayWindowRef) => {
    debugLog('Attempting to start presentation...');
    let gameIdToUse = currentGameId;
    if (!gameIdToUse) {
      gameIdToUse = uuidv4();
      setCurrentGameId(gameIdToUse);
      debugLog(`Generated new game ID: ${gameIdToUse}`);
    } else {
      debugLog(`Using existing game ID: ${gameIdToUse}`);
    }

    let windowOpenedSuccessfully = true;
    if (!displayWindowRef.current || displayWindowRef.current.closed) {
      if (openDisplayWindowCallback) {
        windowOpenedSuccessfully = openDisplayWindowCallback(); // Get success status
        if (windowOpenedSuccessfully) {
          // Give the window a moment to open and set up, especially if it was just created.
          // This also allows displayWindowRef.current to be correctly populated by the callback.
          await new Promise(resolve => setTimeout(resolve, 1500)); // Increased timeout from 500 to 1500
        }
      } else {
        if (addToastCallback) addToastCallback('Display window open callback not provided.', 'error');
        return;
      }
    }

    debugLog(`[Pre-Error Check] windowOpenedSuccessfully: ${windowOpenedSuccessfully}`);
    if (displayWindowRef) {
        debugLog(`[Pre-Error Check] displayWindowRef.current exists: ${!!displayWindowRef.current}`);
        if (displayWindowRef.current) {
            debugLog(`[Pre-Error Check] displayWindowRef.current.closed: ${displayWindowRef.current.closed}`);
        }
    } else {
        debugLog(`[Pre-Error Check] displayWindowRef itself is null/undefined.`);
    }

    // Check again if the window is truly available and if the open attempt was successful
    if (!windowOpenedSuccessfully || !displayWindowRef.current || displayWindowRef.current.closed) {
      if (addToastCallback && windowOpenedSuccessfully) {
         // If open callback succeeded but window is still not usable, it's a different error
         addToastCallback('Display window was not available after opening. Presentation cannot start.', 'error');
      } else if (addToastCallback && !windowOpenedSuccessfully) {
        // If open callback itself failed (e.g., pop-up blocked), it would have shown its own toast.
        // This is a fallback toast, though openDisplayWindowCallback should have handled it.
        addToastCallback('Display window could not be opened. Presentation cannot start.', 'error');
      }
      return;
    }
    
    setIsPresentationActive(true);
    setPresentationStartTime(Date.now());
    
    const encounterIdForStart = currentEncounterRef.current?.Encounter?.ID || null;
    debugLog(`Starting presentation with game ID: ${gameIdToUse}, encounter ID: ${encounterIdForStart}`);

    if (displayWindowRef.current && !displayWindowRef.current.closed) {
        // Message to show in display window upon start. If no encounter, prompt to select one.
        const message = encounterIdForStart 
            ? { type: 'LOAD_ENCOUNTER', encounterId: encounterIdForStart, gameId: gameIdToUse, displayMode: 'educator' }
            : { type: 'SHOW_MESSAGE', message: 'Presentation started. Please select a scenario or encounter to begin.' };
        
        // Ensure message is sent using the correct postMessage utility if available or directly
        // Assuming a global sendMessageToWindow or one passed via props if needed
        try {
            const origin = window.location.origin || '*';
            displayWindowRef.current.postMessage(message, origin);
            debugLog('Message sent to display window:', message);
        } catch (error) {
            debugLog('Error sending message to display window:', error);
            if (addToastCallback) addToastCallback('Error communicating with display window.', 'error');
        }
    }

    socket.emit('startPresentation', {
      gameId: gameIdToUse,
      scenarioId: currentEncounterRef.current?.Scenario?.ID || null, // Assuming scenario info is part of currentEncounter object if available
      encounterId: encounterIdForStart,
      educatorId: user?.sub,
    });

    if (addToastCallback) addToastCallback(`Presentation started! ${!encounterIdForStart ? 'Please select an encounter.' : ''}`, 'success');

  }, [currentGameId, user?.sub, openDisplayWindowCallback, addToastCallback, currentEncounterRef]);

  const endPresentation = useCallback((displayWindowRef) => {
    debugLog('Ending presentation...');
    if (!currentGameId) {
        debugLog('No current game ID, cannot end presentation effectively.');
        // still set local active to false
        setIsPresentationActive(false);
        setPresentationStartTime(null);
        if (addToastCallback) addToastCallback('Presentation ended (no game active).', 'info');
        return;
    }

    setIsPresentationActive(false);
    setPresentationStartTime(null);
    
    socket.emit('presentation ended', { gameId: currentGameId, educatorId: user?.sub });

    if (displayWindowRef.current && !displayWindowRef.current.closed) {
        try {
            const origin = window.location.origin || '*';
            displayWindowRef.current.postMessage({ type: 'PRESENTATION_ENDED' }, origin);
            displayWindowRef.current.postMessage({ type: 'SHOW_MESSAGE', message: 'The presentation has ended.' }, origin);
            debugLog('Sent PRESENTATION_ENDED and SHOW_MESSAGE to display window.');
        } catch (error) {
            debugLog('Error sending PRESENTATION_ENDED message to display window:', error);
        }
    }
    if (addToastCallback) addToastCallback('Presentation ended.', 'info');
  }, [currentGameId, user?.sub, addToastCallback]);

  // Socket event handlers
  useEffect(() => {
    const handlePresentationStarted = (data) => {
      debugLog('Socket event: presentationStarted', data);
      if (data.gameId) {
        setCurrentGameId(data.gameId);
      }
      setIsPresentationActive(true);
      setPresentationStartTime(data.startTime || Date.now()); // Use server startTime if provided
      if (addToastCallback) addToastCallback('Presentation has started.', 'info');
    };

    const handlePresentationEnded = (data) => {
      debugLog('Socket event: presentationEnded', data);
      setIsPresentationActive(false);
      setPresentationStartTime(null);
      // Optionally, clear currentGameId if the server indicates the game is truly over
      // if (data.clearGameId) setCurrentGameId(null); 
      if (addToastCallback) addToastCallback('Presentation has ended.', 'info');
    };
    
    // Handler for when an encounter changes during an active presentation
    // This might be duplicative if `currentEncounter` prop is already updating `currentEncounterRef`
    // However, this handles cases where the change is initiated by server or another educator
    const handleEncounterChanged = (data) => {
        debugLog('Socket event: TravelToID (aliased as encounterChanged in hook)', data);
        if (isPresentationActive && data.gameId === currentGameId) {
            // Potentially update a local currentEncounterForPresentation state if needed
            // For now, assume parent component updates `currentEncounter` prop which updates `currentEncounterRef`
            debugLog('Encounter changed during active presentation:', data.encounterId);
            // If the display window needs to be explicitly told:
            // if (displayWindowRef.current && !displayWindowRef.current.closed) {
            //   sendMessageToWindow(displayWindowRef.current, { type: 'LOAD_ENCOUNTER', encounterId: data.encounterId, gameId: data.gameId });
            // }
        }
    };

    socket.on('presentationStarted', handlePresentationStarted);
    socket.on('presentationEnded', handlePresentationEnded);
    socket.on('TravelToID', handleEncounterChanged); // Listen to TravelToID, keep internal handler name same for clarity

    return () => {
      socket.off('presentationStarted', handlePresentationStarted);
      socket.off('presentationEnded', handlePresentationEnded);
      socket.off('TravelToID', handleEncounterChanged); // Unsubscribe from TravelToID
    };
  }, [socket, addToastCallback, isPresentationActive, currentGameId]); // Added dependencies

  return {
    isPresentationActive,
    currentGameId,
    presentationStartTime,
    startPresentation,
    endPresentation,
    setCurrentGameId, // Expose if EducatorPanel needs to set it (e.g., from URL param)
  };
};

export default usePresentationManager; 