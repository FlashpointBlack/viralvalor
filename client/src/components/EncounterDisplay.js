import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import socket from '../socket'; // We'll create this shared socket file
import { gameExists, getCurrentEncounter } from '../utils/multiplayerGameManager';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext'; // Add AuthContext
import DebugPanel from './DebugPanel';
import PollOverlay from './PollOverlay';
import useSocketSync from '../hooks/useSocketSync';
import sanitize from '../utils/sanitizeHtml';
import useMessageBridge from '../hooks/useMessageBridge';
import useTextAutosize from '../hooks/useTextAutosize';

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

let fetchCounter = 0; // Global counter for fetchEncounterData calls

const EncounterDisplay = ({
  encounterIdForDisplay = null, // Used by PresentationDisplayHost to indicate target ID
  gameId: gameIdProp = null,
  encounter: hostProvidedEncounter = null, // Direct encounter object from host
  routes: hostProvidedRoutes = null, // Direct routes array from host
  controlledByHost = false, // If true, this component is dumber and relies on host for data
}) => {
  const { id: urlId, gameId: urlGameId } = useParams(); // Get encounter ID and game ID from URL
  // Determine the initial IDs based on props or URL parameters
  const initialEncounterId = encounterIdForDisplay || urlId;
  const initialGameId      = gameIdProp           || urlGameId;

  const [currentId, setCurrentId] = useState(initialEncounterId); // Track current encounter ID
  const [currentGameId, setCurrentGameId] = useState(initialGameId); // Track game ID
  const location = useLocation();
  const [encounter, setEncounter] = useState(hostProvidedEncounter || null);
  const [previousEncounter, setPreviousEncounter] = useState(null);
  const [routes, setRoutes] = useState(hostProvidedRoutes || []);
  const [pollActive, setPollActive] = useState(false);
  const [isEducatorDisplay, setIsEducatorDisplay] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const displayRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const [newEncounterDataForPreload, setNewEncounterDataForPreload] = useState(null);
  const [imagesLoaded, setImagesLoaded] = useState(false);
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
  const fetchAbortRef = useRef(null);
  // NEW REFS FOR AUTOSIZING
  const contentRef = useRef(null);
  const titleRef = useRef(null);
  const descRef = useRef(null);

  // Add AuthContext state
  const { user } = useAuth();
  const userSub = user?.sub;

  // NEW: detect if running inside PresentationDisplayHost route (presentation display window)
  const inPresentationDisplay = location.pathname.startsWith('/presentation-display');

  // ------------------------
  // Sync with prop changes
  // ------------------------
  useEffect(() => {
    if (controlledByHost && encounterIdForDisplay && encounterIdForDisplay !== currentId) {
      debugLog(`[EncounterDisplay] Prop encounterIdForDisplay changed to ${encounterIdForDisplay}. Updating currentId.`);
      setCurrentId(encounterIdForDisplay);
    } else if (!controlledByHost && encounterIdForDisplay && encounterIdForDisplay !== currentId) {
      // If not controlled, standard behavior
      setCurrentId(encounterIdForDisplay);
    }
  }, [encounterIdForDisplay, currentId, controlledByHost]);

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

  // When host provides new encounter/routes data directly, update our state
  useEffect(() => {
    if (controlledByHost) {
      if (hostProvidedEncounter && hostProvidedEncounter.ID === currentId) {
        setEncounter(hostProvidedEncounter);
      }
      if (hostProvidedRoutes) {
        // Assuming routes are tied to the hostProvidedEncounter
        setRoutes(hostProvidedRoutes);
      }
      // If host provides data, this could be the new source for preloading images
      if (hostProvidedEncounter) {
        setNewEncounterDataForPreload({ Encounter: hostProvidedEncounter, EncounterRoutes: hostProvidedRoutes || [] });
      }
    }
  }, [controlledByHost, hostProvidedEncounter, hostProvidedRoutes, currentId]);

  // Define fetchEncounterData FIRST before any functions that use it
  const fetchEncounterData = useCallback(async (encounterId, isTransition = false) => {
    if (controlledByHost) {
      debugLog(`FETCH_TRACE (${fetchCounter}): fetchEncounterData call SKIPPED - controlled by host. Encounter ID: ${encounterId}`);
      return null; // Do not fetch if controlled by host
    }

    // Guard: Do not fetch if encounterId is missing
    if (!encounterId) {
      fetchCounter++;
      debugLog(`FETCH_TRACE (${fetchCounter}): fetchEncounterData call SKIPPED - encounterId missing. Caller:`, new Error().stack.split('\n')[2].trim());
      debugLog('[EncounterDisplay] fetchEncounterData aborted: encounterId is missing.');
      setEncounter(null);
      setRoutes([]);
      setError('No encounter ID specified.'); // Set specific error
      return null; // Return null to indicate failure
    }
    
    // Guard: Ensure userSub is available
    if (!userSub) {
      fetchCounter++;
      debugLog(`FETCH_TRACE (${fetchCounter}): fetchEncounterData call SKIPPED - userSub missing. Caller:`, new Error().stack.split('\n')[2].trim());
      debugLog('[EncounterDisplay] fetchEncounterData aborted: userSub is missing.');
      setEncounter(null);
      setRoutes([]);
      setError('Authentication required to load encounter.');
      return null; // Return null to indicate failure
    }

    fetchCounter++;
    debugLog(`FETCH_TRACE (${fetchCounter}): fetchEncounterData call START for ID ${encounterId}. isTransition: ${isTransition}. Caller:`, new Error().stack.split('\n')[2].trim());
    debugLog(`Fetching data for encounter ${encounterId}, isTransition: ${isTransition}`);
    setDebugInfo(prev => ({ ...prev, status: `Fetching data for encounter ${encounterId}` }));
    setLoading(true); // Set loading true here
    setError(null); // Clear previous errors
    
    try {
      // Abort any in-flight request
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }

      const controller = new AbortController();
      fetchAbortRef.current = controller;

      const response = await axios({
        method: 'get',
        url: `/encounters/GetEncounterData/${encounterId}`,
        withCredentials: true, 
        headers: { 'x-user-sub': userSub },
        params: { 
          _t: new Date().getTime(),
          scope: 'public', // Allow public-access fetch for display windows
        },
        signal: controller.signal,
      });
      fetchAbortRef.current = null;

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
        setNewEncounterDataForPreload({ Encounter: encounterData, EncounterRoutes: routesData });
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
      // Ignore request if it was aborted in favour of a newer one
      if (axios.isCancel?.(error) || error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
        debugLog('Fetch aborted for encounter', encounterId);
        return null;
      }
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
      setNewEncounterDataForPreload(null); 
      setDebugInfo(prev => ({ ...prev, status: `ERROR: ${errorMsg}` }));
      return null; // Indicate failure
    } finally {
      setLoading(false);
    }
  }, [userSub, currentId, controlledByHost]);

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
    if (newEncounterDataForPreload) {
      debugLog('Applying pending encounter data during force reset');
      setEncounter(newEncounterDataForPreload.Encounter);
      setRoutes(newEncounterDataForPreload.EncounterRoutes || []);
      setNewEncounterDataForPreload(null);
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
  }, [newEncounterDataForPreload]);

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
            setNewEncounterDataForPreload(data);
            // Skip image loading and immediately apply the data
            setImagesLoaded(true);
          })
          .catch(retryError => {
            logError(`Retry ${newRetryCount} failed`, retryError);
            if (newRetryCount >= MAX_TRANSITION_RETRIES) {
              setTransitionError(`All transition attempts failed. Trying to continue anyway...`);
              // Force transition completion even if we failed
              if (newEncounterDataForPreload) {
                setEncounter(newEncounterDataForPreload.Encounter);
                setRoutes(newEncounterDataForPreload.EncounterRoutes || []);
                setNewEncounterDataForPreload(null);
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
      if (newEncounterDataForPreload) {
        debugLog('Using available encounter data despite failure');
        setEncounter(newEncounterDataForPreload.Encounter);
        setRoutes(newEncounterDataForPreload.EncounterRoutes || []);
        setNewEncounterDataForPreload(null);
      }
      
      // Make sure we're not stuck in transitioning state
      setIsTransitioning(false);
      setImagesLoaded(false);
    }
  }, [transitionRetryCount, forceResetTransition, fetchEncounterData, newEncounterDataForPreload]);

  // Modify handleEncounterTransition to improve transition flow
  const handleEncounterTransition = useCallback(async (newEncounterId) => { // Make async
    try {
      fetchCounter++;
      debugLog(`FETCH_TRACE (${fetchCounter}): handleEncounterTransition call START for ID ${newEncounterId}. Caller:`, new Error().stack.split('\n')[2].trim());
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
      // This avoids potential stale closures if relying on `newEncounterDataForPreload` state here.
      // `fetchEncounterData` already set the `newEncounterDataForPreload` state variable,
      // which the image preloading useEffect can use.
      setEncounter(fetchedData.Encounter);
      setRoutes(fetchedData.EncounterRoutes || []);
      
      // Clear newEncounterDataForPreload state. This signals that this specific batch of data
      // has been processed for the main encounter display. The image preloading useEffect
      // (which depends on newEncounterDataForPreload state) would have used the value of newEncounterDataForPreload 
      // that was set by fetchEncounterData.
      setNewEncounterDataForPreload(null); 
      
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
  }, [currentId, encounter, fetchEncounterData, newEncounterDataForPreload, gatherImageUrlsFromEncounter, preloadImages]); // Dependencies

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

  // Attach the window message bridge
  useMessageBridge({ handleMessage, debugLog, logError });

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

  // Tie in shared socket listeners
  useSocketSync({
    currentGameId,
    setCurrentGameId,
    currentId,
    encounter,
    fetchEncounterData,
    handleEncounterTransition,
    setPollActive,
    debugLog,
    logError,
    setDebugInfo,
    isTransitioning,
    setIsTransitioning,
    setPreviousEncounter,
  });

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
    
    // Only fetch if not controlled by host and data is missing
    if (!controlledByHost && initialEncounterId && !encounter && !loading) {
      debugLog(`Initial fetch for encounter ID: ${initialEncounterId}`);
      // Use currentId state for consistency, even on initial load
      if (currentId !== initialEncounterId) {
         setCurrentId(initialEncounterId);
      }
      fetchEncounterData(initialEncounterId, false) // Fetch directly, not as transition
        .catch(error => {
          // fetchEncounterData already handles setting error state
          logError(`Error during initial data fetch for ${initialEncounterId} (not host controlled): ${error.message}`, error);
        });
    } else if (controlledByHost && initialEncounterId && hostProvidedEncounter && hostProvidedEncounter.ID === initialEncounterId) {
      // If controlled by host and data already provided for initialId, set it
      debugLog(`[EncounterDisplay] Controlled by host. Initial data already provided for ${initialEncounterId}. Setting encounter state.`);
      setEncounter(hostProvidedEncounter);
      setRoutes(hostProvidedRoutes || []);
      setNewEncounterDataForPreload({ Encounter: hostProvidedEncounter, EncounterRoutes: hostProvidedRoutes || [] });
    } else if (!controlledByHost && !urlId) {
      // If no ID in URL, we might not load anything by default or load a specific root
      // For now, we do nothing, waiting for a message or socket event.
      debugLog(`No ID in URL. Waiting for external trigger (message/socket) to load encounter.`);
      // To load a default, you would call fetchRootEncounters first, then fetchEncounterData(defaultId)
    }
  }, [controlledByHost, hostProvidedEncounter, hostProvidedRoutes, urlId, userSub, currentId, encounter, loading, isTransitioning, currentGameId, fetchEncounterData, encounterIdForDisplay]); 

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

  // Automatic text autosize
  useTextAutosize(contentRef, titleRef, descRef, encounter);

  // Preload images when new encounter data arrives
  useEffect(() => {
    if (newEncounterDataForPreload && !imagesLoaded) {
      const { Encounter } = newEncounterDataForPreload;

      debugLog(`Preloading images for new encounter ID ${Encounter.ID}`);

      const imagesToLoad = gatherImageUrlsFromEncounter(Encounter);
      debugLog(`Encounter preload list built (${imagesToLoad.length} images)`);

      if (imagesToLoad.length === 0) {
        setImagesLoaded(true);
        return;
      }

      let loadedCount = 0;

      const imageLoadPromises = imagesToLoad.map((url) => {
        return new Promise((resolve) => {
          if (imagePreloadingRef.current.has(url)) {
            loadedCount++;
            resolve();
            return;
          }

          const img = new Image();
          img.onload = () => {
            imagePreloadingRef.current.set(url, true);
            loadedCount++;
            if (loadedCount === imagesToLoad.length) {
              setImagesLoaded(true);
            }
            resolve();
          };
          img.onerror = () => {
            loadedCount++;
            if (loadedCount === imagesToLoad.length) {
              setImagesLoaded(true);
            }
            resolve();
          };
          img.src = url;
        });
      });

      const timeoutId = setTimeout(() => {
        setImagesLoaded(true);
      }, 5000);

      Promise.all(imageLoadPromises).then(() => clearTimeout(timeoutId));

      return () => clearTimeout(timeoutId);
    }
  }, [newEncounterDataForPreload, imagesLoaded, gatherImageUrlsFromEncounter]);

  // Render loading state
  if (!controlledByHost && loading && !encounter && !isTransitioning) {
    return (
      <div className="loading-display">
        <p>Loading encounter...</p>
        {transitionError && <p className="error-message">Error: {transitionError}</p>}
        
        {showDebug && (
          <DebugPanel
            show={showDebug}
            debugInfo={debugInfo}
            currentId={currentId}
            currentGameId={currentGameId}
            isTransitioning={false}
            transitionError={transitionError}
            onHide={() => setShowDebug(false)}
            onTriggerTransition={handleEncounterTransition}
            onResetTransition={() => {
              setIsTransitioning(false);
              setPreviousEncounter(null);
              setTransitionError(null);
            }}
          />
        )}
      </div>
    );
  } else if (controlledByHost && !encounter && !isTransitioning) {
    // If controlled by host and no encounter data yet, it might be fetching or waiting.
    // Display a simple placeholder; PresentationDisplayHost handles the actual loading indicator for its fetch.
    return (
      <div className="loading-display">
        <p>Waiting for presentation data...</p>
        {/* Optionally show transitionError if passed from host or managed here for host errors */}
        {transitionError && <p className="error-message">Error: {transitionError}</p>}
      </div>
    );
  }

  // If encounter is null (e.g. host hasn't provided it yet, or an error occurred), don't try to render its details.
  if (!encounter) {
    // This case should ideally be handled by the loading states above or an error display
    // but as a fallback, if encounter is null post-loading, show minimal UI.
    return (
      <div className="encounter-display placeholder">
        <p>{error || "Encounter data not available."}</p>
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
        <DebugPanel
          show={showDebug}
          debugInfo={debugInfo}
          currentId={currentId}
          currentGameId={currentGameId}
          isTransitioning={isTransitioning}
          transitionError={transitionError}
          onHide={() => setShowDebug(false)}
          onTriggerTransition={handleEncounterTransition}
          onResetTransition={() => {
            setIsTransitioning(false);
            setPreviousEncounter(null);
            setTransitionError(null);
          }}
        />
      )}

      {/* Status indicator - shows errors and loading status */}
      {transitionError && (
        <div className={`transition-status-indicator ${transitionError.includes('Loading') ? 'loading' : 'error'}`}>
          <p>{transitionError}</p>
        </div>
      )}

      {/* Poll timer overlay - show in both modes */}
      {pollActive && <PollOverlay />}

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
              dangerouslySetInnerHTML={{ __html: sanitize(previousEncounter.BackdropImage) }}
            />
          )}
          
          {previousEncounter.Character1Image && (
            <div 
              className="encounter-character character-1"
              dangerouslySetInnerHTML={{ __html: sanitize(previousEncounter.Character1Image) }}
            />
          )}
          
          {previousEncounter.Character2Image && (
            <div 
              className="encounter-character character-2"
              dangerouslySetInnerHTML={{ __html: sanitize(previousEncounter.Character2Image) }}
            />
          )}
        </div>
      )}

      {/* Current encounter (no fade-in; fully visible beneath) */}
      <div className={`encounter-container current ${isTransitioning ? 'fade-in' : ''}`}>
        {/* Main encounter content */}
        <div className="encounter-content" ref={contentRef}>
          <h1 className="encounter-title" ref={titleRef}>{encounter.Title}</h1>
          <div className="encounter-description" ref={descRef}>{encounter.Description}</div>
          
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
            dangerouslySetInnerHTML={{ __html: sanitize(encounter.BackdropImage) }}
          />
        )}
        
        {encounter.Character1Image && (
          <div 
            className="encounter-character character-1"
            dangerouslySetInnerHTML={{ __html: sanitize(encounter.Character1Image) }}
          />
        )}
        
        {encounter.Character2Image && (
          <div 
            className="encounter-character character-2"
            dangerouslySetInnerHTML={{ __html: sanitize(encounter.Character2Image) }}
          />
        )}
      </div>
    </div>
  );
};

// Also update the component CSS to adjust fade duration
document.documentElement.style.setProperty('--fade-duration', '1.5s'); // Set fade duration globally

export default EncounterDisplay; 