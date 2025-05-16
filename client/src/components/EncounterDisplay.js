import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import socket from '../socket'; // We'll create this shared socket file
import { gameExists, getCurrentEncounter } from '../utils/multiplayerGameManager';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext'; // Add AuthContext

// Debug mode can be controlled via URL or localStorage
const getDebugMode = () => {
  // Check URL params first
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('debug')) return true;
  
  // Check localStorage
  return localStorage.getItem('encounterDisplayDebug') === 'true';
};

// Enable debug mode globally
const DEBUG_MODE = getDebugMode();

// Create a log function that respects debug mode
const debugLog = (...args) => {
  if (DEBUG_MODE) {
    console.log('[EncounterDisplay Debug]', ...args);
  }
};

// Error tracking
const errors = [];
const logError = (message, error) => {
  const errorInfo = { message, error, timestamp: new Date() };
  console.error('[EncounterDisplay Error]', errorInfo);
  errors.push(errorInfo);
  if (errors.length > 20) errors.shift(); // Keep only last 20 errors
};

// Add a transition timeout - if transition takes too long, we'll force it to complete
const TRANSITION_TIMEOUT_MS = 5000; // 5 seconds
const MAX_TRANSITION_RETRIES = 2;
// Duration for cross-fade (must match --fade-duration in CSS, currently 1.5s)
const FADE_TRANSITION_DURATION_MS = 1500;

// Custom event for encounter transitions
const ENCOUNTER_TRANSITION_EVENT = 'encounter-transition-event';

// Create a global message listener for window-level debugging
window.addEventListener('message', (event) => {
  console.log(`GLOBAL: Window received message:`, event.data);
});

// Local implementation of the message listener utility
const createMessageListener = (handler) => {
  return (event) => {
    try {
      // Log all received messages at the listener level
      debugLog(`MessageListener: Received message from ${event.origin}:`, event.data);
      
      // Validate origin (allow same origin or localhost during development)
      const isSameOrigin = event.origin === window.location.origin;
      const isLocalhost = event.origin.includes('localhost') || event.origin.includes('127.0.0.1');
      
      if (!isSameOrigin && !isLocalhost) {
        logError(`Ignoring message from unauthorized origin: ${event.origin}`, { data: event.data });
        return;
      }

      // Validate message structure
      if (!event.data || typeof event.data !== 'object' || !event.data.type) {
        logError(`Ignoring invalid message format`, { data: event.data });
        return;
      }

      // Call the handler with the validated message
      handler(event.data, event);
    } catch (err) {
      logError('Error in message listener', err);
    }
  };
};

const EncounterDisplay = ({ encounterIdForDisplay = null, gameId: gameIdProp = null }) => {
  const { id: urlId, gameId: urlGameId } = useParams(); // Get encounter ID and game ID from URL
  // Determine the initial IDs based on props or URL parameters
  const initialEncounterId = encounterIdForDisplay || urlId;
  const initialGameId      = gameIdProp           || urlGameId;

  const [currentId, setCurrentId] = useState(initialEncounterId); // Track current encounter ID
  const [currentGameId, setCurrentGameId] = useState(initialGameId); // Track game ID
  const navigate = useNavigate();
  const location = useLocation();
  const [encounter, setEncounter] = useState(null);
  const [previousEncounter, setPreviousEncounter] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [pollActive, setPollActive] = useState(false);
  const [pollTime, setPollTime] = useState('0:00');
  const [isEducatorDisplay, setIsEducatorDisplay] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState('fade');
  const displayRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const [newEncounterData, setNewEncounterData] = useState(null);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const messageListenerRef = useRef(null);
  const componentIdRef = useRef(`encounter-display-${Date.now()}`); // Unique ID for this component instance
  const [transitionError, setTransitionError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({
    transitions: 0,
    lastTransitionFrom: null,
    lastTransitionTo: null,
    messageCount: 0,
    status: 'initialized',
    transitionRetries: 0,
    gameId: null
  });
  const [showDebug, setShowDebug] = useState(DEBUG_MODE);
  const transitionTimeoutSafetyRef = useRef(null);
  const [transitionRetryCount, setTransitionRetryCount] = useState(0);
  const imagePreloadingRef = useRef(new Map()); // Cache for preloaded images
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Add AuthContext state
  const { user } = useAuth();
  const userSub = user?.sub;

  // NEW: detect if running inside PresentationDisplayHost route (presentation display window)
  const inPresentationDisplay = location.pathname.startsWith('/presentation-display');

  // ------------------------
  // Sync with prop changes
  // ------------------------
  useEffect(() => {
    if (encounterIdForDisplay && encounterIdForDisplay !== currentId) {
      debugLog(`[EncounterDisplay] Prop encounterIdForDisplay changed to ${encounterIdForDisplay}. Updating currentId.`);
      setCurrentId(encounterIdForDisplay);
    }
  }, [encounterIdForDisplay]);

  useEffect(() => {
    if (gameIdProp && gameIdProp !== currentGameId) {
      debugLog(`[EncounterDisplay] Prop gameId changed to ${gameIdProp}. Updating currentGameId.`);
      setCurrentGameId(gameIdProp);
    }
  }, [gameIdProp]);

  // Log state changes for debugging
  useEffect(() => {
    debugLog(`Current ID updated:`, currentId);
  }, [currentId]);

  useEffect(() => {
    debugLog(`URL ID updated:`, urlId);
  }, [urlId]);

  useEffect(() => {
    debugLog(`Game ID updated:`, currentGameId);
  }, [currentGameId]);

  // Extract game ID from URL query parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const gameIdParam = urlParams.get('gameId');
    
    if (gameIdParam && gameIdParam !== currentGameId) {
      debugLog(`Found game ID in URL params: ${gameIdParam}`);
      setCurrentGameId(gameIdParam);
      
      // Update debug info 
      setDebugInfo(prev => ({
        ...prev,
        gameId: gameIdParam
      }));
      
      // If we have a valid game ID, check if there's a current encounter for this game
      if (gameExists(gameIdParam)) {
        const currentEncounter = getCurrentEncounter(gameIdParam);
        if (currentEncounter && currentEncounter !== currentId) {
          debugLog(`Loading current encounter for game: ${currentEncounter}`);
          setCurrentId(currentEncounter);
          fetchEncounterData(currentEncounter);
        }
      }
    }
  }, [location.search, currentGameId, currentId]);

  // Define fetchEncounterData FIRST before any functions that use it
  const fetchEncounterData = useCallback(async (encounterId, isTransition = false) => {
    // Guard: Do not fetch if encounterId is missing
    if (!encounterId) {
      debugLog('[EncounterDisplay] fetchEncounterData aborted: encounterId is missing.');
      setEncounter(null);
      setRoutes([]);
      setError('No encounter ID specified.'); // Set specific error
      return null; // Return null to indicate failure
    }
    
    // Guard: Ensure userSub is available
    if (!userSub) {
      debugLog('[EncounterDisplay] fetchEncounterData aborted: userSub is missing.');
      setEncounter(null);
      setRoutes([]);
      setError('Authentication required to load encounter.');
      return null; // Return null to indicate failure
    }

    debugLog(`Fetching data for encounter ${encounterId}, isTransition: ${isTransition}`);
    setDebugInfo(prev => ({ ...prev, status: `Fetching data for encounter ${encounterId}` }));
    setLoading(true); // Set loading true here
    setError(null); // Clear previous errors
    
    try {
      const response = await axios({
        method: 'get',
        url: `/GetEncounterData/${encounterId}`,
        withCredentials: true, 
        headers: { 'x-user-sub': userSub },
        params: { _t: new Date().getTime() } 
      });

      if (!response.data || !response.data.Encounter) {
        throw new Error(`Invalid data structure received for encounter ${encounterId}`);
      }
      
      const encounterData = response.data.Encounter;
      const routesData = response.data.EncounterRoutes || [];

      // Fix image paths...
      if (encounterData.BackdropImage) encounterData.BackdropImage = encounterData.BackdropImage.replace('src="images/', 'src="/images/');
      if (encounterData.Character1Image) encounterData.Character1Image = encounterData.Character1Image.replace('src="images/', 'src="/images/');
      if (encounterData.Character2Image) encounterData.Character2Image = encounterData.Character2Image.replace('src="images/', 'src="/images/');
      
      debugLog(`Successfully fetched encounter data for ID ${encounterId}`);
      
      if (isTransition) {
        // For transitions, store data for preloading/later application
        setNewEncounterData({ Encounter: encounterData, EncounterRoutes: routesData });
      } else {
        // For direct loads, update state immediately
        setEncounter(encounterData);
        setRoutes(routesData);
        // Ensure currentId reflects what was loaded
        if (currentId !== encounterId) {
             debugLog(`Updating currentId from ${currentId} to ${encounterId} after direct fetch.`);
             setCurrentId(encounterId);
        }
      }
      return response.data; // Return the fetched data
      
    } catch (error) {
      const statusCode = error.response?.status;
      const responseData = error.response?.data;
      const errorMsg = `Error fetching encounter ${encounterId}: ${error.message}`; 
      logError(errorMsg, { statusCode, responseData, error });
      
      // Set specific error messages based on status code
      if (statusCode === 404) {
        setError(`Encounter Not Found (ID: ${encounterId})`);
      } else if (statusCode === 403) {
        setError(`Permission Denied to access encounter ${encounterId}`);
      } else if (statusCode === 401) {
        setError(`Authentication failed when fetching encounter ${encounterId}`);
      } else {
        setError(`Failed to load encounter data (${statusCode || 'Network Error'})`);
      }
      
      // Clear encounter state on error
      setEncounter(null);
      setRoutes([]);
      setNewEncounterData(null); 
      setDebugInfo(prev => ({ ...prev, status: `ERROR: ${errorMsg}` }));
      return null; // Indicate failure
    } finally {
      setLoading(false); // Ensure loading is always turned off
    }
  }, [userSub, currentId]);

  // Function to extract image URLs from any HTML (src or background url())
  const extractImageUrls = useCallback((htmlString) => {
    if (!htmlString) return [];
    const urls = [];
    // Match src="..." patterns
    const srcRegex = /src="([^"]+)"/g;
    let match;
    while ((match = srcRegex.exec(htmlString)) !== null) {
      urls.push(match[1]);
    }
    // Match style="background-image:url('...')" (single or double quotes optional)
    const bgRegex = /url\(['\"]?([^'\")]+)['\"]?\)/g;
    while ((match = bgRegex.exec(htmlString)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }, []);

  // Gather image URLs from every string field in the encounter object
  const gatherImageUrlsFromEncounter = useCallback((enc) => {
    if (!enc || typeof enc !== 'object') return [];
    const urls = [];
    for (const key in enc) {
      if (!Object.prototype.hasOwnProperty.call(enc, key)) continue;
      const val = enc[key];
      if (typeof val === 'string') {
        urls.push(...extractImageUrls(val));
      }
    }
    return urls;
  }, [extractImageUrls]);

  // Function to preload images and track loading status
  const preloadImages = useCallback((imageUrls) => {
    debugLog(`Preloading ${imageUrls.length} images:`, imageUrls);
    
    return new Promise((resolve) => {
      if (!imageUrls || imageUrls.length === 0) {
        debugLog(`No images to preload, resolving immediately`);
        resolve();
        return;
      }

      let loadedCount = 0;
      const totalImages = imageUrls.length;
      const imageCache = imagePreloadingRef.current;
      
      // Set a maximum time to wait for all images (3 seconds)
      const imageLoadTimeout = setTimeout(() => {
        debugLog(`Image preloading timed out after 3 seconds, proceeding anyway with ${loadedCount}/${totalImages} loaded`);
        resolve();
      }, 3000);

      const checkAllLoaded = () => {
        loadedCount++;
        debugLog(`Image loaded: ${loadedCount}/${totalImages}`);
        if (loadedCount === totalImages) {
          debugLog(`All ${totalImages} images loaded successfully`);
          clearTimeout(imageLoadTimeout);
          resolve();
        }
      };

      imageUrls.forEach(url => {
        // Check if image is already in our cache
        if (imageCache.has(url)) {
          debugLog(`Image ${url} already cached`);
          checkAllLoaded();
          return;
        }
        
        const img = new Image();
        
        // Set individual image load timeout (1.5 seconds per image)
        const imgTimeout = setTimeout(() => {
          debugLog(`Individual image timeout for ${url}`);
          checkAllLoaded(); // Count as loaded after timeout to avoid hanging
        }, 1500);
        
        img.onload = () => {
          clearTimeout(imgTimeout);
          imageCache.set(url, img); // Cache the loaded image
          checkAllLoaded();
        };
        
        img.onerror = () => {
          clearTimeout(imgTimeout);
          debugLog(`Failed to load image: ${url}`);
          checkAllLoaded(); // Count errors as loaded to prevent blocking
        };
        
        img.src = url;
      });
    });
  }, []);

  // Function to force reset transition state - this is crucial for recovery
  const forceResetTransition = useCallback(() => {
    debugLog('FORCE RESETTING TRANSITION STATE');
    setTransitionError('Transition timed out - continuing to new encounter...');
    setIsTransitioning(false);
    
    // If we have new encounter data, apply it
    if (newEncounterData) {
      debugLog('Applying pending encounter data during force reset');
      setEncounter(newEncounterData.Encounter);
      setRoutes(newEncounterData.EncounterRoutes || []);
      setNewEncounterData(null);
    } else {
      debugLog('WARNING: No new encounter data available during force reset');
    }
    
    // Always clear the loading state to avoid getting stuck
    setImagesLoaded(false);
    setTransitionRetryCount(0);
    
    // Clear any pending timeouts
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    
    if (transitionTimeoutSafetyRef.current) {
      clearTimeout(transitionTimeoutSafetyRef.current);
      transitionTimeoutSafetyRef.current = null;
    }
    
    setDebugInfo(prev => ({
      ...prev,
      status: 'Force reset completed - applied new encounter data',
      transitionRetries: 0
    }));
    
    // Automatically hide error after 3 seconds
    setTimeout(() => {
      setTransitionError(null);
    }, 3000);
  }, [newEncounterData]);

  // Function to handle failed transitions by retrying
  const handleTransitionFailure = useCallback((encounterId, error) => {
    // Log the failure
    logError(`Transition to ${encounterId} failed`, error);
    
    // Don't show error messages for normal operation issues
    const isNetworkError = error.message && (
      error.message.includes('network') || 
      error.message.includes('failed to fetch')
    );
    
    if (!isNetworkError) {
      setTransitionError(`Error loading encounter: ${error.message}`);
      
      // Auto-hide error after 3 seconds to avoid lingering messages
      setTimeout(() => {
        setTransitionError(null);
      }, 3000);
    }
    
    // If we haven't hit the max retries yet, try again
    if (transitionRetryCount < MAX_TRANSITION_RETRIES) {
      const newRetryCount = transitionRetryCount + 1;
      setTransitionRetryCount(newRetryCount);
      
      debugLog(`Retrying transition (attempt ${newRetryCount}/${MAX_TRANSITION_RETRIES})`);
      setDebugInfo(prev => ({
        ...prev,
        status: `Retrying transition to ${encounterId} (${newRetryCount}/${MAX_TRANSITION_RETRIES})`,
        transitionRetries: newRetryCount
      }));
      
      // Wait a bit then retry
      setTimeout(() => {
        debugLog(`Executing retry for encounterId ${encounterId}`);
        fetchEncounterData(encounterId, true)
          .then(data => {
            if (!data) {
              throw new Error('Failed to fetch encounter data during retry');
            }
            setNewEncounterData(data);
            // Skip image loading and immediately apply the data
            setImagesLoaded(true);
          })
          .catch(retryError => {
            logError(`Retry ${newRetryCount} failed`, retryError);
            if (newRetryCount >= MAX_TRANSITION_RETRIES) {
              setTransitionError(`All transition attempts failed. Trying to continue anyway...`);
              // Force transition completion even if we failed
              if (newEncounterData) {
                setEncounter(newEncounterData.Encounter);
                setRoutes(newEncounterData.EncounterRoutes || []);
                setNewEncounterData(null);
              }
              setIsTransitioning(false);
            } else {
              handleTransitionFailure(encounterId, retryError);
            }
          });
      }, 500);
    } else {
      // We've hit max retries, give up but try to continue with whatever data we have
      const errorMsg = `Failed to transition after ${MAX_TRANSITION_RETRIES} attempts`;
      setTransitionError(errorMsg);
      setDebugInfo(prev => ({
        ...prev,
        status: `ERROR: ${errorMsg}`
      }));
      
      // If we have any data from previous attempts, use it
      if (newEncounterData) {
        debugLog('Using available encounter data despite failure');
        setEncounter(newEncounterData.Encounter);
        setRoutes(newEncounterData.EncounterRoutes || []);
        setNewEncounterData(null);
      }
      
      // Make sure we're not stuck in transitioning state
      setIsTransitioning(false);
      setImagesLoaded(false);
    }
  }, [transitionRetryCount, forceResetTransition, fetchEncounterData, newEncounterData]);

  // Modify handleEncounterTransition to improve transition flow
  const handleEncounterTransition = useCallback(async (newEncounterId) => { // Make async
    try {
      // Prevent transitions to the current ID
      if (newEncounterId === currentId) {
        debugLog(`Already at requested encounter ${newEncounterId}, ignoring transition request`);
        return;
      }
      
      // Always clear any previous errors or transition state
      setError(null);
      // Don't reset isTransitioning, keep any existing transition going until the new one is ready
      // setIsTransitioning(false);
      
      // Update the current ID immediately
      debugLog(`Transition to encounter ID: ${newEncounterId} (from: ${currentId})`);
      // Update currentId state - this triggers the useEffect that might fetch data if needed
      setCurrentId(newEncounterId); 
      
      // Log the transition in debug info
      setDebugInfo(prev => ({ ...prev, transitions: prev.transitions + 1, lastTransitionFrom: currentId, lastTransitionTo: newEncounterId, status: `Starting transition to ${newEncounterId}` }));
      
      // Clear poll data 
      socket.emit('clear poll data');
      setPollActive(false);
      
      // Show a loading indicator
      setLoading(true); // Use the main loading state
      setError(null); // Clear previous errors
      
      // Fetch data for the new encounter, marking it as a transition
      const fetchedData = await fetchEncounterData(newEncounterId, true);
      
      // If fetch failed or returned invalid data, fetchEncounterData already set the error state and setLoading(false).
      if (!fetchedData || !fetchedData.Encounter) {
        debugLog(`Fetch failed or returned invalid data for transition to ${newEncounterId}. Error state should be set by fetchEncounterData.`);
        // setLoading(false) is handled by fetchEncounterData's finally block.
        return; 
      }
      
      // Preload images 
      const imagesToLoad = gatherImageUrlsFromEncounter(fetchedData.Encounter);
      debugLog(`Encounter preload list built (${imagesToLoad.length} images)`);
      await preloadImages(imagesToLoad); // This is the promise-based utility
       
      // Preloading done, start visual transition
      
      // Only set previous if we have something to transition from
      if (encounter) { // current old encounter, for fade-out effect
        setPreviousEncounter(encounter);
      }

      // Apply the new data using `fetchedData` directly.
      // This avoids potential stale closures if relying on `newEncounterData` state here.
      // `fetchEncounterData` already set the `newEncounterData` state variable,
      // which the image preloading useEffect can use.
      setEncounter(fetchedData.Encounter);
      setRoutes(fetchedData.EncounterRoutes || []);
      
      // Clear newEncounterData state. This signals that this specific batch of data
      // has been processed for the main encounter display. The image preloading useEffect
      // (which depends on newEncounterData state) would have used the value of newEncounterData 
      // that was set by fetchEncounterData.
      setNewEncounterData(null); 
      
      // Now start the transition - put the previous encounter on top with fade-out effect
      setIsTransitioning(true);
      setError(null); // Clear any loading message

      // End transition after fade duration
      setTimeout(() => {
        setIsTransitioning(false);
        setPreviousEncounter(null);
        debugLog(`Transition complete to encounter ID: ${newEncounterId}`);
        setDebugInfo(prev => ({ ...prev, status: `Transition complete to encounter ID: ${newEncounterId}` }));
      }, FADE_TRANSITION_DURATION_MS + 100);

    } catch (error) { // Catch errors within this function's logic
      const errorMsg = `Error handling transition logic: ${error.message}`;
      logError(errorMsg, error);
      setError(errorMsg);
      setIsTransitioning(false);
      setLoading(false); // Ensure loading is off
    }
  }, [currentId, encounter, fetchEncounterData, newEncounterData, gatherImageUrlsFromEncounter, preloadImages]); // Dependencies

  // Handle message events - simplified approach
  const handleMessage = useCallback((data) => {
    try {
      debugLog(`Processing message:`, data);
      
      if (data.type === 'LOAD_ENCOUNTER_IN_DISPLAY') {
        const { encounterId, gameId } = data;

        // If we already have a game context, ignore messages that target
        // a different game.  This prevents the display from reacting to
        // stale broadcasts left over from a previous presentation.
        if (currentGameId && gameId && gameId !== currentGameId) {
          debugLog(`Ignoring LOAD_ENCOUNTER for mismatched gameId. Expected ${currentGameId}, received ${gameId}`);
          return;
        }

        // Adopt gameId if we don't yet have one assigned
        if (gameId && !currentGameId) {
          debugLog(`Adopting game ID from message: ${gameId}`);
          setCurrentGameId(gameId);
          setDebugInfo(prev => ({ ...prev, gameId }));
        }

        // Proceed with transition only if this is a new encounter
        if (encounterId && encounterId !== currentId) {
          debugLog(`Received message to load encounter ID: ${encounterId}`);
          handleEncounterTransition(encounterId);
        }
      } else if (data.type === 'DEBUG_TOGGLE') {
        setShowDebug(prev => !prev);
      } else if (data.type === 'FORCE_RESET') {
        debugLog('Received force reset command');
        setIsTransitioning(false);
        setPreviousEncounter(null);
        setTransitionError(null);
      }
      
      // Update debug info
      setDebugInfo(prev => ({
        ...prev,
        messageCount: prev.messageCount + 1,
        status: `Processed message: ${data.type}`,
      }));
    } catch (error) {
      logError('Error handling message', error);
    }
  }, [currentId, currentGameId, handleEncounterTransition]);

  // Setup message listener
  useEffect(() => {
    debugLog(`Setting up message listener for encounter ID: ${currentId}`);
    
    // Clean up previous listener if it exists
    if (messageListenerRef.current) {
      debugLog(`Removing previous message listener`);
      window.removeEventListener('message', messageListenerRef.current);
    }
    
    // Create and attach a new message listener
    messageListenerRef.current = createMessageListener(handleMessage);
    window.addEventListener('message', messageListenerRef.current);
    debugLog(`New message listener attached`);
    
    return () => {
      if (messageListenerRef.current) {
        debugLog(`Cleanup: removing message listener`);
        window.removeEventListener('message', messageListenerRef.current);
      }
    };
  }, [handleMessage, currentId]);

  // Listen for custom DOM events for encounter transitions
  useEffect(() => {
    const handleCustomEvent = (event) => {
      const { encounterId, gameId } = event.detail;
      debugLog(`Received custom event to load encounter ID: ${encounterId}`);
      
      // Skip if we're already transitioning
      if (isTransitioning) {
        debugLog(`Ignoring custom event - already transitioning`);
        return;
      }
      
      // Update game ID if provided
      if (gameId && gameId !== currentGameId) {
        debugLog(`Updating game ID from custom event: ${gameId}`);
        setCurrentGameId(gameId);
        setDebugInfo(prev => ({
          ...prev,
          gameId: gameId
        }));
      }
      
      if (encounterId && encounterId !== currentId) {
        handleEncounterTransition(encounterId);
      }
    };
    
    debugLog(`Setting up custom event listener for ${ENCOUNTER_TRANSITION_EVENT}`);
    document.addEventListener(ENCOUNTER_TRANSITION_EVENT, handleCustomEvent);
    
    return () => {
      document.removeEventListener(ENCOUNTER_TRANSITION_EVENT, handleCustomEvent);
    };
  }, [currentId, currentGameId, handleEncounterTransition, isTransitioning]);

  // Listen for keypress to toggle debug mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+D to toggle debug mode
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setShowDebug(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // -------------------------------------------------------------------
  // Sync with active presentation (game) when component mounts or socket
  // reconnects.  This ensures a freshly-opened display immediately joins
  // the current game session and will start receiving TravelToID events.
  // -------------------------------------------------------------------
  useEffect(() => {
    // Helper to request presenter / active game info from the server
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
        setDebugInfo(prev => ({ ...prev, gameId: infoGameId, status: 'Synced via presenter info' }));
      }
    };

    const handlePresentationStarted = ({ gameId: startedGameId }) => {
      if (startedGameId && startedGameId !== currentGameId) {
        debugLog(`Presentation started for game ${startedGameId} – updating currentGameId`);
        setCurrentGameId(startedGameId);
        setDebugInfo(prev => ({ ...prev, gameId: startedGameId, status: 'Presentation started' }));
      }
    };

    const handlePresentationEnded = ({ gameId: endedGameId }) => {
      if (!endedGameId || endedGameId === currentGameId) {
        debugLog('Presentation ended – clearing currentGameId');
        setCurrentGameId(null);
        setDebugInfo(prev => ({ ...prev, status: 'Presentation ended' }));
      }
    };

    // Wire up socket listeners
    socket.on('presenter info', handlePresenterInfo);
    socket.on('presentation started', handlePresentationStarted);
    socket.on('presentation ended', handlePresentationEnded);
    socket.on('connect', requestPresenterInfo);

    // Immediately request info on mount
    requestPresenterInfo();

    // Cleanup on unmount / re-run
    return () => {
      socket.off('presenter info', handlePresenterInfo);
      socket.off('presentation started', handlePresentationStarted);
      socket.off('presentation ended', handlePresentationEnded);
      socket.off('connect', requestPresenterInfo);
    };
  }, [currentGameId]);

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
      // Load immediately (treat as TravelToID to reuse logic)
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
  }, [currentGameId, encounter, currentId, fetchEncounterData, handleEncounterTransition]);

  // Load initial encounter data
  useEffect(() => {
    // Determine display mode first
    const urlParams = new URLSearchParams(location.search);
    const displayMode = urlParams.get('displayMode');
    setIsEducatorDisplay(displayMode === 'educator');
    debugLog(`Display mode: ${displayMode === 'educator' ? 'educator' : 'standard'}`);

    // Determine game ID
    const gameIdParam = urlParams.get('gameId');
    if (gameIdParam && gameIdParam !== currentGameId) {
      debugLog(`Found game ID in URL: ${gameIdParam}`);
      setCurrentGameId(gameIdParam);
      setDebugInfo(prev => ({ ...prev, gameId: gameIdParam }));
    }

    // Wait for userSub before attempting initial load 
    if (!userSub) {
      debugLog('Initial load waiting for userSub...');
      // Maybe set an error/loading state indicating waiting for auth?
      // setError("Waiting for authentication...");
      return; 
    }
    
    // If we have an encounter ID (from URL or props) and haven't loaded the encounter yet, fetch it.
    const initialId = urlId || encounterIdForDisplay;
    if (initialId && !encounter && !loading) { 
      debugLog(`Initial fetch for encounter ID: ${initialId}`);
      // Use currentId state for consistency, even on initial load
      if (currentId !== initialId) {
         setCurrentId(initialId);
      }
      fetchEncounterData(initialId, false) // Fetch directly, not as transition
        .catch(error => {
          // fetchEncounterData already handles setting error state
          logError(`Error during initial data fetch for ${initialId}: ${error.message}`, error);
        });
    } else if (!urlId) {
      // If no ID in URL, we might not load anything by default or load a specific root
      // For now, we do nothing, waiting for a message or socket event.
      debugLog(`No ID in URL. Waiting for external trigger (message/socket) to load encounter.`);
      // To load a default, you would call fetchRootEncounters first, then fetchEncounterData(defaultId)
    }

    // --- Socket listeners setup remains the same --- 
    debugLog(`Setting up socket listeners`);
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
        setDebugInfo(prev => ({ ...prev, gameId }));
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
    // ... other socket listeners ...
    socket.on('new quiz', () => { setPollActive(true); });
    socket.on('end quiz', () => { setPollActive(false); });
    socket.on('poll started', () => { setPollActive(true); });
    socket.on('poll ended', () => { setPollActive(false); });

    debugLog(`EncounterDisplay (ID: ${currentId}, gameId: ${currentGameId || 'none'}) listening`);
    
    return () => {
      // --- Cleanup remains the same --- 
      debugLog(`Component unmounting - cleaning up socket listeners`);
      socket.off('TravelToID', handleTravelToID);
      socket.off('new quiz');
      socket.off('end quiz');
      socket.off('poll started');
      socket.off('poll ended');
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
    // Depend on urlId to refetch if URL changes, userSub for auth, and other relevant states
  }, [urlId, userSub, currentId, encounter, loading, isTransitioning, currentGameId, fetchEncounterData, handleEncounterTransition]); 

  // Handle toggling fullscreen mode
  const toggleFullscreen = () => {
    try {
      const elem = document.documentElement; // Use the root element for persistent fullscreen
      if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
          elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    } catch (err) {
      logError(`Error toggling fullscreen`, err);
    }
  };

  // Manual transition trigger for testing
  const triggerManualTransition = (id) => {
    debugLog(`Manual transition triggered to ID: ${id}`);
    
    // If we're stuck in a transition state, force reset before trying again
    if (isTransitioning) {
      debugLog('Forcing reset before manual transition');
      forceResetTransition();
      
      // Give a short delay before attempting the new transition
      setTimeout(() => {
        handleEncounterTransition(id);
      }, 100);
    } else {
      handleEncounterTransition(id);
    }
  };

  // Hide transition error after a few seconds
  useEffect(() => {
    let timer;
    if (transitionError) {
      timer = setTimeout(() => {
        setTransitionError(null);
      }, 3000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [transitionError]);

  // Enable/disable route selection buttons based on poll status
  const isButtonDisabled = () => {
    return pollActive; // If poll is active, buttons are disabled
  };

  /* -------------------------------------------------------------
     Auto‐shrink text inside the encounter box so it never overflows
     its 80% height container. It resets styles for each encounter.
  ---------------------------------------------------------------*/
  const adjustTextFit = useCallback(() => {
    const contentEl = document.querySelector('.encounter-content');
    if (!contentEl) return;

    const titleEl = contentEl.querySelector('.encounter-title');
    const descEl  = contentEl.querySelector('.encounter-description');
    if (!descEl || !titleEl) return;

    // Reset any inline sizing first
    titleEl.style.fontSize = '';
    descEl.style.fontSize  = '';

    // Get computed starting sizes (px)
    let titleSize = parseFloat(window.getComputedStyle(titleEl).fontSize);
    let descSize  = parseFloat(window.getComputedStyle(descEl ).fontSize);

    // Shrink stepwise until the content fits or minimum reached
    const MIN_DESC = 6;  // px – no size too small for preview
    const MIN_TITLE = 8;

    const STEP = 0.5;

    // Loop guard – max 100 iterations
    let guard = 0;
    const MAX_ITER = 100;
    while (guard < MAX_ITER && contentEl.scrollHeight > contentEl.clientHeight) {
      guard++;
      if (descSize <= MIN_DESC) break;

      descSize  = Math.max(descSize  - STEP, MIN_DESC);
      titleSize = Math.max(titleSize - STEP, MIN_TITLE);

      titleEl.style.fontSize = `${titleSize}px`;
      descEl.style.fontSize  = `${descSize}px`;
    }
  }, []);

  // Run whenever encounter changes or window resizes
  useEffect(() => {
    // Delay slightly to allow images/fonts to load then measure
    const t = setTimeout(adjustTextFit, 100);

    window.addEventListener('resize', adjustTextFit);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', adjustTextFit);
    };
  }, [encounter, adjustTextFit]);

  // Preload images when new data arrives
  useEffect(() => {
    if (newEncounterData && !imagesLoaded) {
      const { Encounter } = newEncounterData;
      
      debugLog(`Preloading images for new encounter ID ${Encounter.ID}`);
      
      // Gather all image URLs in the encounter object
      const imagesToLoad = gatherImageUrlsFromEncounter(Encounter);
      debugLog(`Encounter preload list built (${imagesToLoad.length} images)`);
      
      // If there are no images to load, mark as loaded immediately
      if (imagesToLoad.length === 0) {
        debugLog(`No images to preload, marking as loaded`);
        setImagesLoaded(true);
        return;
      }
      
      // Load all images and track when they're complete
      debugLog(`Starting preload of ${imagesToLoad.length} images`);
      let loadedCount = 0;
      
      const imageLoadPromises = imagesToLoad.map(url => {
        return new Promise((resolve) => {
          // Check cache first
          if (imagePreloadingRef.current.has(url)) {
            debugLog(`Using cached image for ${url}`);
            loadedCount++;
            resolve();
            return;
          }
          
          const img = new Image();
          img.onload = () => {
            debugLog(`Image loaded: ${url}`);
            imagePreloadingRef.current.set(url, true);
            loadedCount++;
            if (loadedCount === imagesToLoad.length) {
              debugLog(`All ${loadedCount} images loaded`);
              setImagesLoaded(true);
            }
            resolve();
          };
          
          img.onerror = () => {
            debugLog(`Image failed to load: ${url}`);
            loadedCount++;
            if (loadedCount === imagesToLoad.length) {
              debugLog(`All ${loadedCount} images loaded (with errors)`);
              setImagesLoaded(true);
            }
            resolve();
          };
          
          debugLog(`Starting load for image: ${url}`);
          img.src = url;
        });
      });
      
      // Set a timeout to mark as loaded even if images fail
      const timeoutId = setTimeout(() => {
        debugLog(`Image loading timeout reached, marking as loaded anyway`);
        setImagesLoaded(true);
      }, 5000); // 5 second timeout
      
      // When all images are loaded, clear the timeout
      Promise.all(imageLoadPromises).then(() => {
        debugLog(`All image promises resolved`);
        clearTimeout(timeoutId);
      });
      
      return () => clearTimeout(timeoutId);
    }
  }, [newEncounterData, imagesLoaded, gatherImageUrlsFromEncounter]);

  // Render loading state
  if (!encounter && !isTransitioning) {
    return (
      <div className="loading-display">
        <p>Loading encounter...</p>
        {transitionError && <p className="error-message">Error: {transitionError}</p>}
        
        {showDebug && (
          <div className="debug-panel">
            <h3>Debug Info</h3>
            <p>Status: {debugInfo.status}</p>
            <p>Current ID: {currentId || 'none'}</p>
            <p>Game ID: {currentGameId || 'none'}</p>
            <p>Message Count: {debugInfo.messageCount}</p>
            <button onClick={() => setShowDebug(false)}>Hide Debug</button>
          </div>
        )}
      </div>
    );
  }

  // Render the encounter with transitions when needed
  return (
    <div 
      className={`encounter-display ${isEducatorDisplay ? 'educator-mode' : ''}`}
      onDoubleClick={toggleFullscreen}
      ref={displayRef}
      data-current-id={currentId}
      data-game-id={currentGameId}
    >
      {/* Debug panel - show when debug mode is enabled */}
      {showDebug && (
        <div className="debug-panel">
          <h3>Debug Panel (Ctrl+D to toggle)</h3>
          <p><strong>Current Status:</strong> {debugInfo.status}</p>
          <p><strong>Current ID:</strong> {currentId}</p>
          <p><strong>Game ID:</strong> {currentGameId || 'none'}</p>
          <p><strong>Transitions:</strong> {debugInfo.transitions}</p>
          <p><strong>Messages Received:</strong> {debugInfo.messageCount}</p>
          <p><strong>Transitioning:</strong> {isTransitioning ? 'YES' : 'NO'}</p>
          <p><strong>Last From:</strong> {debugInfo.lastTransitionFrom}</p>
          <p><strong>Last To:</strong> {debugInfo.lastTransitionTo}</p>
          
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
              id="manual-transition-id" 
            />
            <button 
              onClick={() => {
                const id = document.getElementById('manual-transition-id').value;
                if (id) handleEncounterTransition(id);
              }}
            >
              Trigger Transition
            </button>
            <button onClick={() => {
              setIsTransitioning(false);
              setPreviousEncounter(null);
              setTransitionError(null);
            }}>Reset Transition State</button>
            <button onClick={() => setShowDebug(false)}>Hide Debug</button>
          </div>
        </div>
      )}

      {/* Status indicator - shows errors and loading status */}
      {transitionError && (
        <div className={`transition-status-indicator ${transitionError.includes('Loading') ? 'loading' : 'error'}`}>
          <p>{transitionError}</p>
        </div>
      )}

      {/* Poll timer overlay - show in both modes */}
      {pollActive && (
        <div className="poll-overlay">
          <div className="poll-timer">
            <h2>A POLL HAS BEEN RUNNING FOR {pollTime}</h2>
          </div>
        </div>
      )}

      {/* Previous encounter (fading out) */}
      {isTransitioning && previousEncounter && (
        <div className="encounter-container previous fade-out">
          {/* Main encounter content */}
          <div className="encounter-content">
            <h1 className="encounter-title">{previousEncounter.Title}</h1>
            <div className="encounter-description">{previousEncounter.Description}</div>
          </div>

          {/* Background and character images */}
          {previousEncounter.BackdropImage && (
            <div 
              className="encounter-backdrop"
              dangerouslySetInnerHTML={{ __html: previousEncounter.BackdropImage }}
            />
          )}
          
          {previousEncounter.Character1Image && (
            <div 
              className="encounter-character character-1"
              dangerouslySetInnerHTML={{ __html: previousEncounter.Character1Image }}
            />
          )}
          
          {previousEncounter.Character2Image && (
            <div 
              className="encounter-character character-2"
              dangerouslySetInnerHTML={{ __html: previousEncounter.Character2Image }}
            />
          )}
        </div>
      )}

      {/* Current encounter (no fade-in; fully visible beneath) */}
      <div className={`encounter-container current ${isTransitioning ? 'fade-in' : ''}`}>
        {/* Main encounter content */}
        <div className="encounter-content">
          <h1 className="encounter-title">{encounter.Title}</h1>
          <div className="encounter-description">{encounter.Description}</div>
          
          {/* Poll options section - only visible during active poll and NOT in educator mode */}
          {pollActive && routes.length > 0 && !isEducatorDisplay && !inPresentationDisplay && (
            <div className="encounter-options">
              {routes.map((route, index) => (
                <div key={index} className="encounter-route-container">
                  <button
                    className="btn"
                    onClick={() => handleEncounterTransition(route.RelID_Encounter_Receiving)}
                    disabled={isButtonDisabled()}
                    style={{
                      opacity: isButtonDisabled() ? 0.5 : 1,
                      cursor: isButtonDisabled() ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {route.Title || 'Untitled Route'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Background and character images */}
        {encounter.BackdropImage && (
          <div 
            className="encounter-backdrop"
            dangerouslySetInnerHTML={{ __html: encounter.BackdropImage }}
          />
        )}
        
        {encounter.Character1Image && (
          <div 
            className="encounter-character character-1"
            dangerouslySetInnerHTML={{ __html: encounter.Character1Image }}
          />
        )}
        
        {encounter.Character2Image && (
          <div 
            className="encounter-character character-2"
            dangerouslySetInnerHTML={{ __html: encounter.Character2Image }}
          />
        )}
      </div>
    </div>
  );
};

// Also update the component CSS to adjust fade duration
document.documentElement.style.setProperty('--fade-duration', '1.5s'); // Set fade duration globally

export default EncounterDisplay; 