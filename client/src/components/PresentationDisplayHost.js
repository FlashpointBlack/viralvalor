import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import PresentationLanding from './PresentationLanding';
import SharedEncounterView from './SharedEncounterView';
import PresentationEnd from './PresentationEnd';
import './PresentationTransitions.css'; // Add this new CSS file we'll create
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth
import usePresentationEncounterManager from '../hooks/usePresentationEncounterManager'; // Import the new hook
import ChoiceButtons from './ChoiceButtons';
import '../styles/single-player-game.css';

// Debug helper - add to top of file
const DEBUG_TRANSITIONS = true;
const debug = (...args) => {
  if (DEBUG_TRANSITIONS) {
    console.log('[TRANSITION DEBUG]', ...args);
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
  const [currentView, setCurrentView] = useState('welcome'); // keep default but render differs for single-player
  const [previousView, setPreviousView] = useState(null); // Track previous view for transitions
  const [previousViewData, setPreviousViewData] = useState(null); // Data for the exiting slide
  const [isTransitioning, setIsTransitioning] = useState(false); // Track when transitions are happening
  const [currentEncounterId, setCurrentEncounterId] = useState(null); // Stored as number or null
  const [gameId, setGameId] = useState(null);
  const [presenterHostSub, setPresenterHostSub] = useState(null); // For the end screen

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

  const location = useLocation();
  const containerRef = useRef(null); // For fullscreen functionality

  // Track latest values in refs to avoid stale closures inside event listeners
  const currentEncounterIdRef = useRef(null);
  const gameIdRef = useRef(null);

  // Refs for values needed in handleMessage but shouldn't cause listener re-init
  const currentViewRef = useRef(currentView);
  const isTransitioningRef = useRef(isTransitioning);

  // Transition duration in ms (should match CSS)
  const TRANSITION_DURATION = 1500;

  const { user } = useAuth(); // Get user from AuthContext
  const userSub = user?.sub;

  // Update refs when their corresponding state changes
  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);
  useEffect(() => { isTransitioningRef.current = isTransitioning; }, [isTransitioning]);
  useEffect(() => { currentEncounterIdRef.current = currentEncounterId; }, [currentEncounterId]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const newGameId = searchParams.get('gameId');
    if (newGameId) {
      setGameId(newGameId);
      // Default to welcome screen when a new gameId is set.
      // This also handles the initial load.
      setCurrentView('welcome');
      setCurrentEncounterId(null);
      setPresenterHostSub(null);
    }
  }, [location.search]);

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

  // Helper to extract image urls from simple HTML snippets (e.g. <img src="/path" />)
  const extractImageUrls = useCallback((htmlString) => {
    if (!htmlString) return [];
    const urls = [];
    const regex = /src="([^\"]+)"/g;
    let match;
    while ((match = regex.exec(htmlString)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }, []);

  // Generic pre-loader that resolves when all images either load or timeout
  const preloadImages = useCallback((urls, timeoutMs = 3000) => {
    return new Promise((resolve) => {
      if (!urls || urls.length === 0) {
        resolve();
        return;
      }

      let loaded = 0;
      const done = () => {
        loaded += 1;
        if (loaded === urls.length) {
          clearTimeout(globalTimeout);
          resolve();
        }
      };

      const globalTimeout = setTimeout(() => {
        // Give up after timeout – continue regardless
        resolve();
      }, timeoutMs);

      urls.forEach((u) => {
        const img = new Image();
        const singleTimeout = setTimeout(done, 1500);
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
    try {
      let urls = [];

      if (view === 'welcome') {
        urls.push('/images/QRCode.png');
      }

      if (view === 'encounter' && encounterId) {
        // Data should be available from the hook if successfully loaded
        const data = currentEncounterDataFromHook;
        const enc = data?.Encounter;
        if (enc && data.Encounter.ID === parseInt(encounterId, 10)) {
          urls.push(...extractImageUrls(enc.BackdropImage));
          urls.push(...extractImageUrls(enc.Character1Image));
          urls.push(...extractImageUrls(enc.Character2Image));
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
    } catch (err) {
      // Swallow errors – we don't block transition if preloading fails
      console.warn('[PresentationDisplayHost] Image verification encountered an error but will continue:', err);
    }
  };

  // Let's make verifyImagesLoadedForSlide stable with useCallback
  const stableVerifyImagesLoadedForSlide = useCallback(verifyImagesLoadedForSlide, [currentEncounterDataFromHook, extractImageUrls, preloadImages]);

  // Add render counter to help debug re-renders
  const renderCount = useRef(0);

  // Re-define transitionToView with debugging
  const stableTransitionToView = useCallback(async (newView, options = {}) => {
    const incomingEncounterId = options.encounterId ? parseInt(options.encounterId, 10) : null;
    debug(`TRANSITION START: ${currentViewRef.current} -> ${newView}`, { 
      incomingEncounterId, 
      currentEncounterId: currentEncounterIdRef.current,
      isTransitioning: isTransitioningRef.current
    });

    // If already transitioning, don't start another one
    if (isTransitioningRef.current) {
      debug('Already in transition, ignoring new request');
      return;
    }

    if (newView === currentViewRef.current && incomingEncounterId === currentEncounterIdRef.current && newView !== 'welcome') {
      debug('No change needed, skipping transition');
      return;
    }

    // 1. Identify old view details
    const oldViewName = currentViewRef.current;
    const oldEncounterId = currentEncounterIdRef.current;
    const oldHostSub = presenterHostSub;
    
    debug('Step 1: Old view details', { oldViewName, oldEncounterId });

    // 2. Snapshot data for OLD view - UNCONDITIONALLY
    let dataForPrevSnapshot;
    if (oldViewName === 'encounter') {
      // UNCONDITIONALLY DEEP CLONE THE CURRENT DATA - Even if ID doesn't match
      const clonedData = currentEncounterDataFromHook ? 
        JSON.parse(JSON.stringify(currentEncounterDataFromHook)) : 
        null;
      
      debug('Step 2: Encounter snapshot');

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
      debug('Step 2: Welcome snapshot');
      dataForPrevSnapshot = { viewName: 'welcome', encounterId: null, encounterData: null, hostSub: null };
    } else if (oldViewName === 'end') {
      debug('Step 2: End screen snapshot');
      dataForPrevSnapshot = { viewName: 'end', encounterId: null, encounterData: null, hostSub: oldHostSub };
    }

    // IMPORTANT: Set transition state AFTER snapshot but BEFORE loading new data
    setPreviousViewData(dataForPrevSnapshot);
    setPreviousView(oldViewName);
    setIsTransitioning(true);
    debug('Step 3: Transition state activated (isTransitioning = true)');

    // 3. Load data for the NEW view - Do this AFTER transition state is set
    if (newView === 'encounter' && incomingEncounterId !== null) {
      debug('Step 4: Loading new encounter data', { incomingEncounterId });
      const fetchedPayload = await loadEncounter(incomingEncounterId);
      if (!fetchedPayload || encounterError) {
        debug('Failed to load new encounter data, aborting transition', { error: encounterError });
        // Clean up transition state on error
        setIsTransitioning(false);
        setPreviousView(null);
        setPreviousViewData(null);
        return; 
      }
      debug('Successfully loaded new encounter data');
    }
    
    // 4. Preload images - Only after data is loaded
    debug('Step 5: Preloading images');
    await stableVerifyImagesLoadedForSlide(newView, { ...options, encounterId: incomingEncounterId });
    
    // 5. Update current view state IMMEDIATELY after data and images are ready
    debug('Step 6: Updating to new view immediately', { newView, incomingEncounterId });
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
      debug('Step 7: Cleanup after transition duration');
      setIsTransitioning(false);
      setPreviousView(null);
      setPreviousViewData(null);
    }, TRANSITION_DURATION);
  }, [
    loadEncounter, 
    encounterError, 
    stableVerifyImagesLoadedForSlide, 
    currentEncounterDataFromHook,
    presenterHostSub,
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
        
        if (data.gameId && data.gameId !== gameIdRef.current) {
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
          case 'LOAD_ENCOUNTER_IN_DISPLAY':
            if (!data.encounterId) {
              console.warn('[PresentationDisplayHost] LOAD_ENCOUNTER_IN_DISPLAY message missing encounterId.');
              break;
            }
            // Parse encounterId from message data to number for comparison
            const incomingEncounterIdFromMessage = parseInt(data.encounterId, 10);
            
            // currentEncounterIdRef.current holds a number (or null)
            if (incomingEncounterIdFromMessage === currentEncounterIdRef.current && currentViewRef.current === 'encounter' && !isTransitioningRef.current) {
              console.log('[PresentationDisplayHost] Duplicate LOAD_ENCOUNTER_IN_DISPLAY ignored – already displaying this numeric encounter.');
              break;
            }
            stableTransitionToView('encounter', { encounterId: data.encounterId }); 
            break;
          case 'SHOW_END_SCREEN':
            console.log('[PresentationDisplayHost] Setting view to END SCREEN');
            // Set presenterHostSub state here directly, stableTransitionToView will use it for snapshotting if 'end' is previous,
            // and can also use options.hostSub to set it for the new 'end' view.
            setPresenterHostSub(data.hostSub); 
            stableTransitionToView('end', { hostSub: data.hostSub });
            setCurrentEncounterId(null); // Ensure encounter ID is cleared if moving to end screen
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
  }, [isSinglePlayerMode, gameId, stableTransitionToView]);

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
        return <PresentationLanding key="welcome" />;
      case 'encounter':
        if (!currentEncounterId || isEncounterLoading) { 
          // TODO: Better loading state UI
          return <div className="encounter-loading-placeholder">Loading Encounter...</div>;
        }
        if (encounterError) {
          // TODO: Better error state UI
          return <div className="encounter-error-placeholder">Error: {encounterError.message}</div>;
        }
        // LOG THE DATA BEING PASSED TO SharedEncounterView
        if (currentEncounterDataFromHook && currentEncounterDataFromHook.Encounter) {
          console.log('[PresentationDisplayHost] Data for SharedEncounterView:', JSON.parse(JSON.stringify(currentEncounterDataFromHook.Encounter)));
        } else {
          console.log('[PresentationDisplayHost] No currentEncounterDataFromHook.Encounter to pass to SharedEncounterView.');
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
          console.warn(`[PresentationDisplayHost] Mismatch: currentEncounterId is ${currentEncounterId} (type: ${typeof currentEncounterId}), but hook data ID is ${currentEncounterDataFromHook.Encounter.ID} (type: ${typeof currentEncounterDataFromHook.Encounter.ID}). Waiting for correct data.`);
          return <div className="encounter-loading-placeholder">Loading Encounter Data...</div>;
        }
        return <div className="encounter-loading-placeholder">Preparing Encounter...</div>;
      case 'end':
        return <PresentationEnd key="end" hostSub={presenterHostSub} />;
      default:
        return null;
    }
  };

  const renderPreviousView = useCallback(() => {
    debug('Rendering previous view', { 
      previousViewName: previousViewData?.viewName,
      previousEncounterId: previousViewData?.encounterId,
      hasEncounterData: !!(previousViewData?.encounterData?.Encounter)
    });

    if (!previousViewData || !previousViewData.viewName) {
      debug('No previous view data, returning placeholder');
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
        return <PresentationLanding key="prev-welcome" />;
      case 'encounter':
        if (previousViewData.encounterData && previousViewData.encounterData.Encounter) {
          debug('Rendering previous encounter with data', { 
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
        debug('Previous encounter data missing, using placeholder');
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
    debug('State update - will this render show transition?', { 
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
  debug(`Rendering component (${renderCount.current})`, {
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