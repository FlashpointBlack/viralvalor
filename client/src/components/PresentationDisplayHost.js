import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import PresentationLanding from './PresentationLanding';
import SharedEncounterView from './SharedEncounterView';
import PresentationEnd from './PresentationEnd';
import './PresentationTransitions.css'; // Add this new CSS file we'll create
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth
import usePresentationEncounterManager from '../hooks/usePresentationEncounterManager'; // Import the new hook
// import ChoiceButtons from './ChoiceButtons';
import '../styles/single-player-game.css';
import { extractImageSrc } from '../utils/imageHelpers'; // Import the shared helper

// Debug helper - add to top of file
// const DEBUG_TRANSITIONS = true; // Keep this if used by existing debug()
// const debug = (...args) => { // Keep this if used by existing debug()
//   if (DEBUG_TRANSITIONS) {
//     console.log('[TRANSITION DEBUG]', ...args);
//   }
// };

const PDH_DEBUG_MODE = true; // New specific debug mode for this component
const logPDH = (...args) => {
  if (PDH_DEBUG_MODE) {
    const timestamp = new Date().toISOString();
    console.log(`[PDH ${timestamp}]`, ...args);
  }
};

// INTERNAL helper for single-player scenario dropdown
const ScenarioSelector = ({ scenarios, selectedScenarioId, onChange }) => (
  <div className="scenario-selector">
    <select value={selectedScenarioId} onChange={onChange}>
      <option value="">Select a Scenario</option>
      {scenarios.map((sc) => (
        <option key={sc.ID} value={sc.ID}>
          {sc.Title || `Scenario ${sc.ID}`}
        </option>
      ))}
    </select>
  </div>
);

const PresentationDisplayHost = ({ isSinglePlayerMode = false }) => {
  logPDH(`Component rendering. isSinglePlayerMode: ${isSinglePlayerMode}`);

  const [currentView, setCurrentView] = useState('welcome'); // keep default but render differs for single-player
  const [previousView, setPreviousView] = useState(null); // Track previous view for transitions
  const [previousViewData, setPreviousViewData] = useState(null); // Data for the exiting slide
  const [isTransitioning, setIsTransitioning] = useState(false); // Track when transitions are happening
  const [currentEncounterId, setCurrentEncounterId] = useState(null); // Stored as number or null
  const [gameId, setGameId] = useState(null);
  const [presenterHostSub, setPresenterHostSub] = useState(null); // For the end screen

  // Log state changes
  useEffect(() => { logPDH(`State changed: currentView = ${currentView}`); }, [currentView]);
  useEffect(() => { logPDH(`State changed: previousView = ${previousView}`); }, [previousView]);
  useEffect(() => { logPDH(`State changed: currentEncounterId = ${currentEncounterId}`); }, [currentEncounterId]);
  useEffect(() => { logPDH(`State changed: gameId = ${gameId}`); }, [gameId]);
  useEffect(() => { logPDH(`State changed: presenterHostSub = ${presenterHostSub}`); }, [presenterHostSub]);
  useEffect(() => { logPDH(`State changed: isTransitioning = ${isTransitioning}`); }, [isTransitioning]);

  // ---------------- Single-player specific state ----------------
  const [scenarios, setScenarios] = useState([]);              // list of root scenarios
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [historyStack, setHistoryStack] = useState([]);        // simple back navigation
  // ----------------------------------------------------------------

  // Use the new hook for encounter data management
  const {
    encounterData: currentEncounterDataFromHook, // Renaming to avoid clash if needed, though local state for this will be removed
    isLoading: isEncounterLoading,
    error: encounterError,
    loadEncounter,
  } = usePresentationEncounterManager();

  // Log hook values
  useEffect(() => {
    logPDH(`Hook values: isEncounterLoading = ${isEncounterLoading}, encounterError = ${encounterError ? encounterError.message : null}, currentEncounterDataFromHook ID = ${currentEncounterDataFromHook?.Encounter?.ID}`);
  }, [isEncounterLoading, encounterError, currentEncounterDataFromHook]);

  const location = useLocation();
  const containerRef = useRef(null); // For fullscreen functionality

  // Track latest values in refs to avoid stale closures inside event listeners
  const currentEncounterIdRef = useRef(null);
  const gameIdRef = useRef(null);

  // Refs for values needed in handleMessage but shouldn't cause listener re-init
  const currentViewRef = useRef(currentView);
  const isTransitioningRef = useRef(isTransitioning);
  const queuedTransitionRef = useRef(null); // ADDED: For queuing LOAD_ENCOUNTER

  // Transition duration in ms (should match CSS)
  const TRANSITION_DURATION = 1500;

  const { user } = useAuth(); // Get user from AuthContext
  // const userSub = user?.sub;

  // Update refs when their corresponding state changes
  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);
  useEffect(() => { isTransitioningRef.current = isTransitioning; }, [isTransitioning]);
  useEffect(() => { currentEncounterIdRef.current = currentEncounterId; }, [currentEncounterId]);

  useEffect(() => {
    logPDH('Component did mount');
    return () => {
      logPDH('Component will unmount');
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const newGameId = searchParams.get('gameId');
    logPDH(`location.search effect: newGameId from URL = ${newGameId}, current gameId state = ${gameId}`);
    if (newGameId) {
      if (newGameId !== gameId) {
        logPDH(`Setting gameId from URL: ${newGameId}. Resetting view to 'welcome', currentEncounterId to null.`);
        setGameId(newGameId);
        setCurrentView('welcome');
        setCurrentEncounterId(null);
        setPresenterHostSub(null);
      } else {
        logPDH('gameId from URL matches current state, no change.');
      }
    }
  }, [location.search, gameId]); // Added gameId to dependency to prevent re-runs if newGameId is same as current gameId state

  useEffect(() => {
    if (!isSinglePlayerMode) return;
    const fetchScenarios = async () => {
      try {
        const { data } = await axios.get('encounters/root-encounters', {
          params: { _t: new Date().getTime(), scope: 'public' },
        });
        setScenarios(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[PresentationDisplayHost] Failed to fetch root scenarios:', err);
        setScenarios([]);
      }
    };
    fetchScenarios();
  }, [isSinglePlayerMode]);

  // Generic pre-loader that resolves when all images either load or timeout
  const preloadImages = useCallback((urls, timeoutMs = 1500) => {
    const startTime = performance.now();
    logPDH(`[PRELOAD] Starting preload for ${urls?.length || 0} images. Timeout: ${timeoutMs}ms`);
    return new Promise((resolve) => {
      if (!urls || urls.length === 0) {
        logPDH('[PRELOAD] No URLs provided, resolving immediately.');
        resolve();
        return;
      }

      let loaded = 0;
      const done = () => {
        loaded += 1;
        if (loaded === urls.length) {
          clearTimeout(globalTimeout);
          const totalMs = Math.round(performance.now() - startTime);
          logPDH(`[PRELOAD] Completed image preload for ${urls.length} images in ${totalMs}ms`);
          resolve();
        }
      };

      const globalTimeout = setTimeout(() => {
        // Give up after timeout – continue regardless
        resolve();
      }, timeoutMs);

      urls.forEach((u) => {
        const img = new Image();
        const singleTimeout = setTimeout(done, 800);
        img.onload = () => {
          clearTimeout(singleTimeout);
          done();
        };
        img.onerror = () => {
          clearTimeout(singleTimeout);
          done();
        };
        img.src = u;
      });
    });
  }, []);

  // Main verification routine – fetches any dynamic data required, then pre-loads discovered images
  const verifyImagesLoadedForSlide = async (view, { encounterId, hostSub } = {}) => {
    const t0 = performance.now();
    logPDH(`[VERIFY] Begin verifyImagesLoadedForSlide for view="${view}" encounterId=${encounterId}`);
    try {
      let urls = [];

      if (view === 'welcome') {
        urls.push('/images/QRCode.png');
      }

      if (view === 'encounter' && encounterId) {
        const data = currentEncounterDataFromHook;
        const enc = data?.Encounter;
        if (enc && data.Encounter.ID === parseInt(encounterId, 10)) {
          const backdropSrc = extractImageSrc(enc.BackdropImage);
          const char1Src = extractImageSrc(enc.Character1Image);
          const char2Src = extractImageSrc(enc.Character2Image);
          if (backdropSrc) urls.push(backdropSrc);
          if (char1Src) urls.push(char1Src);
          if (char2Src) urls.push(char2Src);
        }
      }

      if (view === 'end' && hostSub) {
        // Resolve presenter picture URL
        const idResp = await axios.get(`/user/by-sub/${encodeURIComponent(hostSub)}`);
        const userId = idResp?.data?.id;
        if (userId) {
          const userResp = await axios.get(`/users/${userId}`);
          const pic = userResp?.data?.picture_url;
          if (pic) {
            urls.push(pic.startsWith('/') ? pic : `/${pic}`);
          }
        }
      }

      if (urls.length === 0) return; // Nothing to preload

      await preloadImages(urls);
      const duration = Math.round(performance.now() - t0);
      logPDH(`[VERIFY] Finished verifyImagesLoadedForSlide in ${duration}ms (view="${view}")`);
    } catch (err) {
      // Swallow errors – we don't block transition if preloading fails
      console.warn('[PresentationDisplayHost] Image verification encountered an error but will continue:', err);
    }
  };

  // Let's make verifyImagesLoadedForSlide stable with useCallback
  const stableVerifyImagesLoadedForSlide = useCallback(verifyImagesLoadedForSlide, [currentEncounterDataFromHook, preloadImages]);

  // Add render counter to help debug re-renders
  const renderCount = useRef(0);

  // Re-define transitionToView with debugging
  const stableTransitionToView = useCallback(async (newView, options = {}) => {
    const incomingEncounterId = options.encounterId ? parseInt(options.encounterId, 10) : null;
    logPDH(`TRANSITION START: ${currentViewRef.current} -> ${newView}`, {
      incomingEncounterId,
      currentEncounterId: currentEncounterIdRef.current,
      isTransitioning: isTransitioningRef.current,
      isEncounterLoading // ADDED for context
    });

    // ADDED: If trying to load the same encounter that's already loading, bail.
    if (newView === 'encounter' && 
        incomingEncounterId === currentEncounterIdRef.current && 
        isEncounterLoading) {
      logPDH('Transition to same encounter ID that is currently loading - aborting to prevent re-entrant load.');
      return;
    }

    // If already transitioning, defer or queue non-critical transitions.
    if (isTransitioningRef.current) {
      logPDH('Already in transition, ignoring new request UNLESS IT IS LOAD_ENCOUNTER (will be queued)');
      // MODIFIED: Allow queuing for LOAD_ENCOUNTER, otherwise return
      if (newView !== 'encounter') {
        return;
      }
      // If it IS an encounter, it will be handled by the queue logic in handleMessage
      // or processed if this is the call from the queue itself.
    }

    if (newView === currentViewRef.current && incomingEncounterId === currentEncounterIdRef.current && newView !== 'welcome') {
      logPDH('No change needed, skipping transition');
      return;
    }

    // 1. Identify old view details
    const oldViewName = currentViewRef.current;
    const oldEncounterId = currentEncounterIdRef.current;
    const oldHostSub = presenterHostSub;
    
    logPDH('Step 1: Old view details', { oldViewName, oldEncounterId });

    // 2. Snapshot data for OLD view - UNCONDITIONALLY
    let dataForPrevSnapshot;
    if (oldViewName === 'encounter') {
      // UNCONDITIONALLY DEEP CLONE THE CURRENT DATA - Even if ID doesn't match
      const clonedData = currentEncounterDataFromHook ? 
        JSON.parse(JSON.stringify(currentEncounterDataFromHook)) : 
        null;
      
      logPDH('Step 2: Encounter snapshot');

      // Capture computed font sizes for title and description so exiting slide preserves its appearance
      let lockedFonts = null;
      try {
        const activeSlide = document.querySelector('.slide-active');
        if (activeSlide) {
          const titleEl = activeSlide.querySelector('.encounter-title');
          const descEl = activeSlide.querySelector('.encounter-description');
          if (titleEl && descEl) {
            const titleSize = window.getComputedStyle(titleEl).fontSize;
            const descSize = window.getComputedStyle(descEl).fontSize;
            lockedFonts = { title: titleSize, desc: descSize };
          }
        }
      } catch (err) {
        console.warn('[PresentationDisplayHost] Failed to capture font sizes for snapshot:', err);
      }

      dataForPrevSnapshot = {
        viewName: 'encounter',
        encounterId: oldEncounterId,
        encounterData: clonedData, // Use cloned data even if null
        hostSub: null,
        lockedFontSizes: lockedFonts
      };
    } else if (oldViewName === 'welcome') {
      logPDH('Step 2: Welcome snapshot');
      dataForPrevSnapshot = { viewName: 'welcome', encounterId: null, encounterData: null, hostSub: null };
    } else if (oldViewName === 'end') {
      logPDH('Step 2: End screen snapshot');
      dataForPrevSnapshot = { viewName: 'end', encounterId: null, encounterData: null, hostSub: oldHostSub };
    }

    // IMPORTANT: Set transition state AFTER snapshot but BEFORE loading new data
    setPreviousViewData(dataForPrevSnapshot);
    setPreviousView(oldViewName);
    setIsTransitioning(true);
    logPDH('Step 3: Transition state activated (isTransitioning = true)');

    // 3. Load data for the NEW view - Do this AFTER transition state is set
    if (newView === 'encounter' && incomingEncounterId !== null) {
      logPDH('Step 4: Loading new encounter data', { incomingEncounterId });
      const fetchStart = performance.now();
      const fetchedPayload = await loadEncounter(incomingEncounterId);
      logPDH(`[TIMING] loadEncounter finished in ${Math.round(performance.now() - fetchStart)}ms`);
      if (!fetchedPayload || encounterError) {
        logPDH('Failed to load new encounter data, aborting transition', { error: encounterError });
        // Clean up transition state on error
        setIsTransitioning(false);
        setPreviousView(null);
        setPreviousViewData(null);
        return; 
      }
      logPDH('Successfully loaded new encounter data');
    }
    
    // 4. Preload images - Only after data is loaded
    const preloadStart = performance.now();
    logPDH('Step 5: Preloading images');
    await stableVerifyImagesLoadedForSlide(newView, { ...options, encounterId: incomingEncounterId });
    logPDH(`[TIMING] Image verification & preload finished in ${Math.round(performance.now() - preloadStart)}ms`);
    
    // 5. Update current view state IMMEDIATELY after data and images are ready
    logPDH('Step 6: Updating to new view immediately', { newView, incomingEncounterId });
    setCurrentView(newView);
    if (newView === 'encounter' && incomingEncounterId !== null) {
      setCurrentEncounterId(incomingEncounterId);
    } else if (newView === 'welcome') {
      setCurrentEncounterId(null);
      setPresenterHostSub(null);
    } else if (newView === 'end') {
      setCurrentEncounterId(null);
      if (options.hostSub !== undefined && presenterHostSub !== options.hostSub) {
        setPresenterHostSub(options.hostSub);
      }
    }
    
    // 6. Clean up after transition duration
    setTimeout(() => {
      logPDH('Step 7: Cleanup after transition duration');
      setIsTransitioning(false);
      setPreviousView(null);
      setPreviousViewData(null);

      // ADDED: Process queued transition if any, BUT only if not currently loading an encounter
      if (queuedTransitionRef.current && !isEncounterLoading) {
        logPDH('Processing queued transition (and not currently loading an encounter):', queuedTransitionRef.current);
        const { view: qView, options: qOptions } = queuedTransitionRef.current;
        queuedTransitionRef.current = null; // Clear queue before starting next
        stableTransitionToView(qView, qOptions); // This will re-evaluate conditions
      } else if (queuedTransitionRef.current && isEncounterLoading) {
        logPDH('Queue has an item, but an encounter is currently loading. Deferring queue processing.');
      }
    }, TRANSITION_DURATION);
  }, [
    loadEncounter,
    encounterError,
    stableVerifyImagesLoadedForSlide,
    currentEncounterDataFromHook,
    presenterHostSub,
    isEncounterLoading // ADDED dependency
  ]);

  useEffect(() => {
    const handleMessage = (event) => {
      // Basic security: check origin
      // IMPORTANT: For production, uncomment and set a specific origin or check against a list of allowed origins
      // if (event.origin !== window.location.origin) { // Example: Allow only same origin
      //   console.warn(`[PresentationDisplayHost] Message from untrusted origin '${event.origin}' ignored.`);
      //   return;
      // }

      const { data } = event;
      console.log('[PresentationDisplayHost] Raw message event received:', event);

      // Update refs with latest state from closure *before* processing logic
      // This ensures the checks inside the switch use the most up-to-date values.
      currentEncounterIdRef.current = currentEncounterId;
      gameIdRef.current = gameId;

      if (data && data.type) {
        console.log(`[PresentationDisplayHost] Processing message type: ${data.type}, for gameId: ${data.gameId}. Current host gameId: ${gameIdRef.current}`);
        
        // Adopt the gameId from the first valid message if we don't have one yet
        if (!gameIdRef.current && data.gameId) {
          logPDH(`[MESSAGE] Adopting gameId "${data.gameId}" from first incoming message type ${data.type}`);
          setGameId(data.gameId);
          // also update ref so subsequent checks use the new value within this tick
          gameIdRef.current = data.gameId;
        } else if (data.gameId && data.gameId !== gameIdRef.current) {
          console.warn('[PresentationDisplayHost] Ignoring message due to gameId mismatch.');
          return;
        }

        console.log('[PresentationDisplayHost] Accepted message:', data);

        switch (data.type) {
          case 'SHOW_WELCOME':
            console.log('[PresentationDisplayHost] Setting view to WELCOME');
            stableTransitionToView('welcome');
            setCurrentEncounterId(null);
            setPresenterHostSub(null);
            break;
          case 'LOAD_ENCOUNTER':
          case 'LOAD_ENCOUNTER_IN_DISPLAY': // Combined logic for both
            if (!data.encounterId) {
              console.warn(`[PresentationDisplayHost] ${data.type} message missing encounterId.`);
              break;
            }
            { // Scope for incomingEncId
              const incomingEncId = parseInt(data.encounterId, 10);
              if (
                incomingEncId === currentEncounterIdRef.current &&
                currentViewRef.current === 'encounter' &&
                !isTransitioningRef.current // Not transitioning
              ) {
                console.log(`[PresentationDisplayHost] Duplicate ${data.type} ignored – already displaying this encounter and not transitioning.`);
                break;
              }
              // If already displaying but a transition is happening (e.g. from welcome), queue might still be useful.
            }

            // MODIFIED: Queue if transitioning OR if an encounter is currently loading
            if (isTransitioningRef.current || (currentViewRef.current === 'encounter' && isEncounterLoading)) {
              logPDH(`Queueing ${data.type} for encounter ${data.encounterId} (transitioning: ${isTransitioningRef.current}, loading: ${isEncounterLoading})`);
              queuedTransitionRef.current = { view: 'encounter', options: { encounterId: data.encounterId } };
            } else {
              stableTransitionToView('encounter', { encounterId: data.encounterId });
            }
            break;
          case 'SHOW_END_SCREEN':
            console.log('[PresentationDisplayHost] Setting view to END SCREEN');
            // Set presenterHostSub state here directly, stableTransitionToView will use it for snapshotting if 'end' is previous,
            // and can also use options.hostSub to set it for the new 'end' view.
            setPresenterHostSub(data.hostSub); 
            stableTransitionToView('end', { hostSub: data.hostSub });
            setCurrentEncounterId(null); // Ensure encounter ID is cleared if moving to end screen
            break;
          case 'SHOW_MESSAGE':
            console.log('[PresentationDisplayHost] SHOW_MESSAGE received – transitioning to welcome with message overlay');
            // For now, just transition to welcome; PresentationLanding can read optional message via state if implemented
            // Future enhancement: set a dedicated state for overlay message
            stableTransitionToView('welcome');
            break;
          case 'FORCE_RESET':
            console.log('[PresentationDisplayHost] FORCE_RESET received – clearing state and showing welcome');
            setGameId(null);
            setCurrentEncounterId(null);
            setPresenterHostSub(null);
            stableTransitionToView('welcome');
            break;
          case 'PRESENTATION_ENDED':
            console.log('[PresentationDisplayHost] PRESENTATION_ENDED received – transitioning to end screen');
            stableTransitionToView('end');
            setCurrentEncounterId(null);
            break;
          default:
            console.warn('[PresentationDisplayHost] Unknown message type received:', data.type);
        }
      } else {
        console.warn('[PresentationDisplayHost] Received message with no data or no type property.', data);
      }
    };

    window.addEventListener('message', handleMessage);
    console.log('[PresentationDisplayHost] Initialized and listening for postMessage events');

    // Cleanup on unmount or deps change
    return () => {
      window.removeEventListener('message', handleMessage);
      console.log('[PresentationDisplayHost] Cleaned up postMessage listener');
    };
  }, [isSinglePlayerMode, gameId, stableTransitionToView, isEncounterLoading]); // ADDED isEncounterLoading to deps of handleMessage effect

  // Fullscreen toggle helper (double-click anywhere)
  const toggleFullscreen = () => {
    try {
      const elem = containerRef.current || document.documentElement;
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
      console.error('[PresentationDisplayHost] Error toggling fullscreen:', err);
    }
  };

  // Scenario dropdown change
  const handleScenarioChange = (e) => {
    const scenarioId = e.target.value;
    setSelectedScenarioId(scenarioId);
    setHistoryStack([]); // fresh storyline
    if (scenarioId) {
      stableTransitionToView('encounter', { encounterId: scenarioId });
    }
  };

  // Handle route selection within an encounter
  const handleSelectRoute = (routeId) => {
    if (!routeId) return;
    if (currentEncounterId) {
      setHistoryStack((prev) => [...prev, currentEncounterId]);
    }
    stableTransitionToView('encounter', { encounterId: routeId });
  };

  // Back button handler
  const handleGoBack = () => {
    if (historyStack.length === 0) return;
    const lastId = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, prev.length - 1));
    stableTransitionToView('encounter', { encounterId: lastId });
  };

  // Helper to render a given view name
  const renderView = (view) => {
    switch (view) {
      case 'welcome':
        if (isSinglePlayerMode) {
          return (
            <div className="single-player-intro" key="sp-welcome">
              Please select a scenario to begin...
            </div>
          );
        }
        return <PresentationLanding key="welcome" disableAutoNavigate />;
      case 'encounter':
        if (!currentEncounterId || isEncounterLoading) {
          logPDH('[renderView] Showing loading placeholder', {
            currentEncounterId,
            isEncounterLoading,
            hasData: !!currentEncounterDataFromHook,
            encounterError: encounterError ? encounterError.message : null
          });
          return <div className="encounter-loading-placeholder">Loading Encounter...</div>;
        }

        if (encounterError) {
          logPDH('[renderView] Showing error placeholder', {
            currentEncounterId,
            errorMsg: encounterError.message
          });
          return <div className="encounter-error-placeholder">Error: {encounterError.message}</div>;
        }

        // LOG THE DATA BEING PASSED TO SharedEncounterView
        if (currentEncounterDataFromHook && currentEncounterDataFromHook.Encounter) {
          logPDH('[renderView] Rendering SharedEncounterView with data', {
            hookEncounterId: currentEncounterDataFromHook.Encounter.ID,
            currentEncounterId
          });
        } else {
          logPDH('[renderView] No encounter data available in hook yet.', {
            currentEncounterId,
            hasData: !!currentEncounterDataFromHook
          });
        }

        if (currentEncounterDataFromHook && currentEncounterDataFromHook.Encounter && currentEncounterDataFromHook.Encounter.ID === currentEncounterId) {
          const routesForButtons = currentEncounterDataFromHook?.EncounterRoutes || [];

          return (
            <SharedEncounterView
              key={`shared-enc-${currentEncounterId}`}
              encounterData={currentEncounterDataFromHook}
              routes={isSinglePlayerMode ? routesForButtons : null}
              onSelectRoute={isSinglePlayerMode ? handleSelectRoute : null}
            />
          );
        } else if (currentEncounterDataFromHook && currentEncounterDataFromHook.Encounter && currentEncounterDataFromHook.Encounter.ID !== currentEncounterId) {
          logPDH('[renderView] Encounter ID mismatch, waiting for correct data.', {
            hookEncounterId: currentEncounterDataFromHook.Encounter.ID,
            currentEncounterId
          });
          return <div className="encounter-loading-placeholder">Loading Encounter Data...</div>;
        }

        logPDH('[renderView] Fallback: preparing encounter (no data yet after checks)', {
          currentEncounterId,
          isEncounterLoading,
          hasData: !!currentEncounterDataFromHook
        });
        return <div className="encounter-loading-placeholder">Preparing Encounter...</div>;
      case 'end':
        return <PresentationEnd key="end" hostSub={presenterHostSub} />;
      default:
        return null;
    }
  };

  const renderPreviousView = useCallback(() => {
    logPDH('Rendering previous view', { 
      previousViewName: previousViewData?.viewName,
      previousEncounterId: previousViewData?.encounterId,
      hasEncounterData: !!(previousViewData?.encounterData?.Encounter)
    });

    if (!previousViewData || !previousViewData.viewName) {
      logPDH('No previous view data, returning placeholder');
      return <div className="encounter-placeholder-missing">Missing previous view data</div>;
    }

    switch (previousViewData.viewName) {
      case 'welcome':
        if (isSinglePlayerMode) {
          return (
            <div className="single-player-intro" key="prev-welcome-sp">
              Please select a scenario to begin...
            </div>
          );
        }
        return <PresentationLanding key="prev-welcome" disableAutoNavigate />;
      case 'encounter':
        if (previousViewData.encounterData && previousViewData.encounterData.Encounter) {
          logPDH('Rendering previous encounter with data', { 
            id: previousViewData.encounterId,
            title: previousViewData.encounterData.Encounter.Title
          });
          return (
            <SharedEncounterView
              key={`prev-shared-enc-${previousViewData.encounterId}`}
              encounterData={previousViewData.encounterData}
              autosize={false}
              lockedFontSizes={previousViewData.lockedFontSizes}
              routes={isSinglePlayerMode ? (previousViewData.encounterData?.EncounterRoutes || []) : null}
            />
          );
        }
        // ALWAYS return something for encounter, never null
        logPDH('Previous encounter data missing, using placeholder');
        return (
          <div className="encounter-placeholder-exiting" key={`prev-enc-fallback-${previousViewData.encounterId}`}>
            <div className="encounter-content">
              <h1 className="encounter-title">Previous Encounter</h1>
              <div className="encounter-description">
                Transitioning to new content...
              </div>
            </div>
          </div>
        );
      case 'end':
        return <PresentationEnd key="prev-end" hostSub={previousViewData.hostSub} />;
      default:
        // ALWAYS return something, never null
        return <div className="unknown-previous-view">Unknown previous view</div>;
    }
  }, [previousViewData, isSinglePlayerMode]);

  // Log right before render
  useEffect(() => {
    logPDH('State update - will this render show transition?', { 
      isTransitioning, 
      hasPreviousView: !!previousView, 
      hasPreviousViewData: !!previousViewData,
      renderCondition: !!(previousView && isTransitioning && previousViewData),
      currentView,
      currentEncounterId
    });
  }, [isTransitioning, previousView, previousViewData, currentView, currentEncounterId]);

  // Increment render counter
  renderCount.current += 1;
  logPDH(`Rendering component (${renderCount.current})`, {
    currentView, 
    previousView, 
    isTransitioning,
    showingOldSlide: !!(previousView && isTransitioning && previousViewData)
  });

  // Apply body class for single-player mode (for CSS scoping)
  useEffect(() => {
    if (isSinglePlayerMode) {
      document.body.classList.add('single-player-game-active');
      return () => document.body.classList.remove('single-player-game-active');
    }
  }, [isSinglePlayerMode]);

  return (
    <div
      className="presentation-display-container"
      ref={containerRef}
      onDoubleClick={toggleFullscreen}
    >
      {/* Single-player controls (dropdown + back) */}
      {isSinglePlayerMode && (
        <>
          <div className="singleplayer-controls">
            <ScenarioSelector
              scenarios={scenarios}
              selectedScenarioId={selectedScenarioId}
              onChange={handleScenarioChange}
            />
          </div>
          {selectedScenarioId && (
            <button className="btn back-btn singleplayer-back-btn" onClick={handleGoBack} disabled={historyStack.length === 0}>
              ← Back
            </button>
          )}
        </>
      )}

      {/* Current/incoming slide */}
      <div
        key={currentView + (currentEncounterId || 'key')}
        className={`slide-container ${
          isTransitioning && previousView 
            ? 'slide-entering'
            : 'slide-active'
        }`}
      >
        {renderView(currentView)}
      </div>

      {/* ALWAYS render the previous view container during transition, 
          and let renderPreviousView handle edge cases */}
      {previousView && isTransitioning && (
        <div
          key={`prev-${previousView}-${previousViewData?.encounterId || 'unknown'}`}
          className="slide-container slide-exiting"
        >
          {renderPreviousView()}
        </div>
      )}
    </div>
  );
};

export default PresentationDisplayHost;