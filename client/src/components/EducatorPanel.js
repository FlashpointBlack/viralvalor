import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './EducatorPanel.css'; // Import component CSS
import socket from '../socket'; // We'll create this file to handle socket.io connections
import { createMultiplayerGame, updateGameEncounter, gameExists } from '../utils/multiplayerGameManager';
import TopHeader from './TopHeader';
import EncounterThumbnail from './EncounterThumbnail';
import MainNavTabs from './MainNavTabs';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext'; // Add AuthContext
import { useSocket } from '../contexts/SocketContext';
import { useChat } from '../contexts/ChatContext';
import { useAuth0 } from '@auth0/auth0-react';
import { useToast } from '../contexts/ToastContext';
import EducatorPollDisplay from './EducatorPanel/EducatorPollDisplay'; // Added import
import UserManagementPanel from './EducatorPanel/UserManagementPanel'; // Added import
import InstructionManager from './EducatorPanel/InstructionManager'; // ADDED InstructionManager
import PreviewPane from './EducatorPanel/PreviewPane'; // ADDED PreviewPane
import StartPresentationButtons from './EducatorPanel/StartPresentationButtons'; // ADDED StartPresentationButtons
import ScenarioExplorer from './EducatorPanel/ScenarioExplorer'; // Added import
import BreadcrumbTrail from './EducatorPanel/BreadcrumbTrail'; // ADDED BreadcrumbTrail
import useUserManagement from '../hooks/useUserManagement';
import useEducatorPolls from '../hooks/useEducatorPolls'; // Import the new hook
import { v4 as uuidv4 } from 'uuid';

const EMPTY_INITIAL_POLL_OPTIONS = [];

// Debug mode can be controlled via URL or localStorage
const getDebugMode = () => {
  // Check URL params first
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('debug')) return true;
  
  // Check localStorage
  return localStorage.getItem('educatorPanelDebug') === 'true';
};

// Enable debug mode globally
const DEBUG_MODE = getDebugMode();

// Create a log function that respects debug mode
const debugLog = (...args) => {
  if (DEBUG_MODE) {
    console.log('[EducatorPanel Debug]', ...args);
  }
};

// Error tracking
const errors = [];
const logError = (message, error) => {
  const errorInfo = { message, error, timestamp: new Date() };
  console.error('[EducatorPanel Error]', errorInfo);
  errors.push(errorInfo);
  if (errors.length > 20) errors.shift(); // Keep only last 20 errors
};

// Custom event for encounter transitions
const ENCOUNTER_TRANSITION_EVENT = 'encounter-transition-event';

// Create a local version of the utility function
const sendMessageToWindow = (targetWindow, message) => {
  if (!targetWindow || targetWindow.closed) {
    debugLog('Target window is not available');
    return false;
  }

  try {
    // Use the current origin for security
    const origin = window.location.origin || '*';
    targetWindow.postMessage(message, origin);
    debugLog('Message sent to window:', message);
    return true;
  } catch (error) {
    logError('Error sending message to window', error);
    return false;
  }
};

// Utility to trigger encounter transitions via multiple methods for redundancy
const triggerEncounterTransition = (encounterId, gameId, displayWindow) => {
  debugLog(`Triggering encounter transition to ID: ${encounterId}, gameId: ${gameId} using multiple methods`);
  
  let success = false;
  
  // Method 0: Force reset first to recover from any stuck state
  try {
    const resetMessage = {
      type: 'FORCE_RESET',
      timestamp: Date.now()
    };
    
    if (displayWindow && !displayWindow.closed) {
      sendMessageToWindow(displayWindow, resetMessage);
      debugLog('Sent force reset before transition');
    }
    
    // Short delay before sending the actual transition message
    setTimeout(() => {
      // Method 1: Use postMessage if window reference is valid
      if (displayWindow && !displayWindow.closed) {
        try {
          const message = {
            type: 'LOAD_ENCOUNTER',
            encounterId: encounterId,
            gameId: gameId,
            displayMode: 'educator',
            timestamp: Date.now()
          };
          
          // Send message with window reference
          success = sendMessageToWindow(displayWindow, message);
          debugLog(`Method 1 (postMessage): ${success ? 'Succeeded' : 'Failed'}`);
        } catch (e) {
          logError('Method 1 failed with error', e);
        }
      } else {
        debugLog('Method 1 skipped: Display window not available');
      }
      
      // Method 2: Use custom DOM event that the other window will listen for
      try {
        const customEvent = new CustomEvent(ENCOUNTER_TRANSITION_EVENT, { 
          detail: { 
            encounterId, 
            gameId,
            source: 'educator-panel',
            timestamp: Date.now() 
          } 
        });
        
        document.dispatchEvent(customEvent);
        debugLog('Method 2 (custom event): Dispatched event to document');
        
        // If we have a window reference, try to dispatch to that document as well
        if (displayWindow && !displayWindow.closed) {
          try {
            displayWindow.document.dispatchEvent(customEvent);
            debugLog('Method 2 (custom event): Dispatched event to display window document');
          } catch (err) {
            logError('Could not dispatch event to display window document', err);
          }
        }
      } catch (e) {
        logError('Method 2 failed with error', e);
      }
      
      // Method 3: Fallback - broadcast via socket
      try {
        socket.emit('TravelToID', encounterId, gameId);
        debugLog('Method 3 (socket): Emitted TravelToID event with gameId');
      } catch (e) {
        logError('Method 3 failed with error', e);
      }
    }, 100); // Short delay to allow reset to take effect
  } catch (e) {
    logError('Error in triggerEncounterTransition', e);
  }
  
  return success;
};

// Helper to derive user friendly display name from auth0 style identifiers
const getDisplayName = (raw) => {
  if (!raw) return '';
  if (raw.includes('|')) {
    const parts = raw.split('|');
    return parts[parts.length - 1] || raw;
  }
  return raw;
};

// Extract provider|uuid (first two segments) so the API recognises the sub
const getPureSub = (identifier) => {
  if (!identifier) return identifier;
  if (identifier.includes('|')) {
    const segments = identifier.split('|');
    if (segments.length >= 2) {
      return `${segments[0]}|${segments[1]}`;
    }
  }
  return identifier;
};

const EducatorPanel = ({ embedded = false }) => {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [currentEncounter, setCurrentEncounter] = useState(null);
  const [encounterPath, setEncounterPath] = useState([]);
  const [encounterCache, setEncounterCache] = useState({});
  const [currentGameId, setCurrentGameId] = useState(null);
  const [isPresentationActive, setIsPresentationActive] = useState(false);
  const { addToast } = useToast();

  // Instantiate the useEducatorPolls hook
  const {
    isPollRunning: hookIsPollRunning,
    pollOptions: hookPollOptions,
    voteCounts: hookVoteCounts,
    voteCountsAbsolute: hookVoteCountsAbsolute,
    finalVoteCounts: hookFinalVoteCounts,
    finalVoteCountsAbsolute: hookFinalVoteCountsAbsolute,
    hasFinalResults: hookHasFinalResults,
    totalVotes: hookTotalVotes,
    finalTotalVotes: hookFinalTotalVotes,
    elapsedSeconds: hookElapsedSeconds,
    sendPoll: hookSendPoll,
    endPoll: hookEndPoll,
    setExternalPollOptions: hookSetExternalPollOptions,
    setCurrentGameId: hookSetCurrentPollGameId,
    clearPollData: hookClearPollData,
  } = useEducatorPolls(currentGameId, EMPTY_INITIAL_POLL_OPTIONS);

  const [scenarioLocked, setScenarioLocked] = useState(false);
  const [activeInstruction, setActiveInstruction] = useState(null);
  const [presentationInfoChecked, setPresentationInfoChecked] = useState(false);

  // Debug and Communication State
  const [showDebug, setShowDebug] = useState(DEBUG_MODE);
  const [debugInfo, setDebugInfo] = useState({});
  const [displayCommunicationStatus, setDisplayCommunicationStatus] = useState('');
  const [displayError, setDisplayError] = useState(null);

  // Breadcrumb and Scenario Navigation State
  const [breadcrumbsLoading, setBreadcrumbsLoading] = useState(false);
  const [longestPath, setLongestPath] = useState([]);
  const [allPaths, setAllPaths] = useState([]);
  const [scenarioMaxDepth, setScenarioMaxDepth] = useState(0);

  // Chat State (placeholders, to be managed by useChat or similar later)
  const [chatMessages, setChatMessages] = useState([]);
  const [openChats, setOpenChats] = useState({});
  const [lastViewedByConv, setLastViewedByConv] = useState({});
  
  // Display Window Ref
  const displayWindowRef = useRef(null);

  const fetchEncounterDataRef = useRef();
  const prefetchFutureEncountersRef = useRef();
  const calculateLongestPathRef = useRef();
  const loadEncounterInDisplayRef = useRef();

  const { user: authUser } = useAuth0();
  const userSub = authUser?.sub;

  useEffect(() => {
    console.log('[EducatorPanel] Component Did Mount. Initial isPresentationActive:', isPresentationActive, 'Initial currentGameId:', currentGameId);
  }, []);

  useEffect(() => {
    hookSetCurrentPollGameId(currentGameId);
  }, [currentGameId, hookSetCurrentPollGameId]);

  useEffect(() => {
    if (currentEncounter && currentEncounter.Routes) {
      const optionsForHook = currentEncounter.Routes.map(route => ({
        ID: route.ID,
        Title: route.Title || `Option ${route.RelID_Encounter_Receiving || 'N/A'}`,
        RelID_Encounter_Receiving: route.RelID_Encounter_Receiving,
        ...route
      }));
      console.log('[EducatorPanel] useEffect for currentEncounter.Routes - calculated optionsForHook:', optionsForHook);
      hookSetExternalPollOptions(optionsForHook);
    } else {
      console.log('[EducatorPanel] useEffect for currentEncounter.Routes - currentEncounter has NO Routes or currentEncounter is null. currentEncounter:', currentEncounter);
      hookSetExternalPollOptions([]);
    }
  }, [currentEncounter, hookSetExternalPollOptions]);

  const handlePresenterInfo = useCallback(({ gameId: infoGameId, isActive }) => {
    debugLog('EducatorPanel: presenter info received', { infoGameId, isActive });
    if (isActive && infoGameId) {
      setCurrentGameId(prev => prev || infoGameId);
      setIsPresentationActive(true);
    }
    setPresentationInfoChecked(true);
  }, [setCurrentGameId, setIsPresentationActive, setPresentationInfoChecked]);

  const handleCurrentEncounter = useCallback(({ gameId: infoGameId, encounterId }) => {
    debugLog('EducatorPanel: current encounter response', { infoGameId, encounterId });
    if (currentGameId && infoGameId !== currentGameId) return;
    if (!encounterId) return;
    fetchEncounterDataRef.current?.(encounterId);
  }, [currentGameId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        // setShowDebug(prev => !prev); // setShowDebug will be undefined
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!presentationInfoChecked || isPresentationActive) return;
    if (!currentGameId) {
      const newGameId = createMultiplayerGame();
      setCurrentGameId(newGameId);
    } else {
      const CGE_exists = gameExists(currentGameId);
      if (!CGE_exists) {
        const newGameId = createMultiplayerGame();
        setCurrentGameId(newGameId);
      }
    }
  }, [currentGameId, presentationInfoChecked, isPresentationActive]);

  // Monitor socket connection status
  useEffect(() => {
    const handleConnect = () => {
      debugLog('Socket connected');
      setDebugInfo(prev => ({
        ...prev,
        isConnected: true
      }));
      setDisplayCommunicationStatus('connected');
    };

    const handleDisconnect = () => {
      debugLog('Socket disconnected');
      setDebugInfo(prev => ({
        ...prev,
        isConnected: false
      }));
      setDisplayCommunicationStatus('disconnected');
    };

    const handleConnectError = (error) => {
      logError('Socket connection error', error);
      setDebugInfo(prev => ({
        ...prev,
        isConnected: false
      }));
      setDisplayCommunicationStatus('error');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // Set initial state
    setDebugInfo(prev => ({
      ...prev,
      isConnected: socket.connected
    }));
    setDisplayCommunicationStatus(socket.connected ? 'connected' : 'disconnected');

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, []);

  // Reset communication status after a delay - don't show error unless connection is really lost
  useEffect(() => {
    let timer;
    
    if (displayCommunicationStatus === 'error' || displayCommunicationStatus === 'loading') {
      timer = setTimeout(() => {
        if (socket.connected) {
          setDisplayCommunicationStatus('connected');
        }
      }, 3000);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [displayCommunicationStatus]);

  // Add effect to recalculate longest path when encounter cache changes
  useEffect(() => {
    // If we have a current encounter and it's in the cache, recalculate the path
    if (currentEncounter && currentEncounter.ID && encounterCache[currentEncounter.ID]) {
      // Use ref to avoid TDZ if calculateLongestPath is not yet initialized
      calculateLongestPathRef.current?.(currentEncounter.ID);
    }
  }, [encounterCache]);
  
  // Add effect to trigger prefetching when current encounter changes
  useEffect(() => {
    if (currentEncounter && currentEncounter.ID) {
      debugLog(`Current encounter changed to ${currentEncounter.ID}, starting deep prefetch`);
      // Since this is a new encounter, we want to prefetch all possible future paths
      prefetchFutureEncountersRef.current?.(currentEncounter.ID);
    }
  }, [currentEncounter?.ID]);

  // Add effect to update longestPath state without recreating the entire array
  useEffect(() => {
    // If there's no current encounter, exit early
    if (!currentEncounter || !currentEncounter.ID) {
      return;
    }

    // This calculation runs after encounterCache changes
    if (Object.keys(encounterCache).length > 0 && !breadcrumbsLoading) {
      // Instead of replacing the entire array, we'll update the existing items
      setLongestPath(prevPath => {
        // Only update colors without changing the array structure 
        if (prevPath.length === 0) return prevPath; // Let the calculateLongestPath handle initial creation
        
        // Update each item's status based on current state
        const currentEncounterId = encounterPath.length > 0 
          ? encounterPath[encounterPath.length - 1] 
          : selectedScenarioId;
          
        return prevPath.map(item => {
          // Is this the current encounter?
          const isCurrent = item.id === currentEncounterId;
          
          // An encounter is only considered "visited" if:
          // 1. It's in our path of visited encounters AND
          // 2. It's NOT the current encounter
          const visited = encounterPath.includes(item.id) && !isCurrent;
          
          // Return the updated item without changing its identity
          return {
            ...item,
            isCurrent,
            visited
          };
        });
      });
    }
  }, [encounterPath, currentEncounter, selectedScenarioId, encounterCache, breadcrumbsLoading]);

  // Fetch scenarios when component mounts and userSub is available
  useEffect(() => {
    if (userSub) {
      fetchScenarios();
    }
  }, [userSub]); // Depend only on userSub

  // Listen for presentation status updates
  useEffect(() => {
    const handlePresentationStarted = ({ gameId, hostSub }) => {
      if (gameId === currentGameId) {
        setIsPresentationActive(true);
      }
    };

    const handlePresentationEnded = ({ gameId }) => {
      if (gameId === currentGameId) {
        setIsPresentationActive(false);
      }
    };

    socket.on('presentation started', handlePresentationStarted);
    socket.on('presentation ended', handlePresentationEnded);

    return () => {
      socket.off('presentation started', handlePresentationStarted);
      socket.off('presentation ended', handlePresentationEnded);
    };
  }, [currentGameId]);

  // ------------------------------------------------------------------
  // Instruction sync: keep activeInstruction in sync with broadcasts
  // from any educator panel and make sure late-joiners pick up the
  // current instruction state.
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleInstructionBroadcast = (payload = {}) => {
      setActiveInstruction(payload);
    };

    const handleInstructionClose = () => {
      setActiveInstruction(null);
    };

    // Listen for instruction events from server
    socket.on('instruction_broadcast', handleInstructionBroadcast);
    socket.on('instruction_close', handleInstructionClose);

    // On mount (or socket reconnect) ask the server if an instruction
    // is currently active so our UI starts in the correct state.
    socket.emit('request current instruction');

    // Also request again whenever the socket reconnects to cover
    // temporary disconnections.
    const handleReconnect = () => {
      socket.emit('request current instruction');
    };
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('instruction_broadcast', handleInstructionBroadcast);
      socket.off('instruction_close', handleInstructionClose);
      socket.off('connect', handleReconnect);
    };
  }, []);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const fetchEncounterData = useCallback(async (encounterId, attempt = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 500; // base delay, will be multiplied by attempt index

    console.log('[EducatorPanel] fetchEncounterData CALLED with encounterId:', encounterId, 'attempt:', attempt);
    if (!encounterId) {
      console.log('[EducatorPanel] fetchEncounterData: encounterId is null/undefined, calling setCurrentEncounter(null)');
      setCurrentEncounter(null);
      return;
    }

    try {
      debugLog(`[fetchEncounterData] Fetching encounter ${encounterId}, attempt ${attempt}`);
      // Indicate loading state for the display connection (optional visual cue)
      setDisplayCommunicationStatus('loading');

      // Use the freshest Auth0 user sub each time the function runs
      const headers = userSub ? { 'x-user-sub': userSub } : undefined;
      const apiUrl = `/encounters/GetEncounterData/${encounterId}`;
      console.log('[EducatorPanel] Fetching URL:', apiUrl, 'with headers:', headers, 'and params:', { _t: Date.now() }, 'attempt:', attempt); // Log the URL and params
      const response = await axios.get(apiUrl, {
        withCredentials: true,
        headers,
        params: { _t: Date.now() }
      });
      const data = response.data;

      // Assume we are successfully connected to backend once a response is received
      setDisplayCommunicationStatus('connected');

      if (data && data.Encounter) {
        // Cache the encounter and its routes so other helpers (e.g. breadcrumbs) can use them
        setEncounterCache(prev => ({
          ...prev,
          [encounterId]: {
            encounter: data.Encounter,
            routes: data.EncounterRoutes || []
          }
        }));

        // Create a new object that includes the Routes for currentEncounter state
        const encounterWithRoutes = {
          ...data.Encounter,
          Routes: data.EncounterRoutes || [] // Ensure Routes property is part of currentEncounter
        };

        // Update the main encounter state so UI refreshes
        setCurrentEncounter(encounterWithRoutes); // USE THE MERGED OBJECT
        console.log('[EducatorPanel] fetchEncounterData: setCurrentEncounter CALLED with:', encounterWithRoutes);

        // In parallel, update the external display (if any)
        loadEncounterInDisplayRef.current?.(encounterId);

        // Kick off prefetching of downstream encounters so breadcrumb/path logic has data
        prefetchFutureEncountersRef.current?.(encounterId);
      } else {
        const msg = `Encounter data malformed or missing for id ${encounterId}`;
        logError(msg);
        setDisplayError(msg);
      }
    } catch (error) {
      const status = error?.response?.status;
      const shouldRetry = status && status >= 500 && status < 600 && attempt < MAX_RETRIES;
      const errMsg = `Failed to fetch encounter ${encounterId}: ${error.message}${shouldRetry ? ` (will retry ${attempt + 1}/${MAX_RETRIES})` : ''}`;
      logError(errMsg, error);
      setDisplayError(errMsg);
      setDisplayCommunicationStatus('error');

      if (shouldRetry) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        console.log(`[EducatorPanel] Retry #${attempt + 1} for encounter ${encounterId} in ${delay}ms`);
        setTimeout(() => fetchEncounterData(encounterId, attempt + 1), delay);
      }
    }
  }, [debugLog, setCurrentEncounter, setEncounterCache, setDisplayError, setDisplayCommunicationStatus, userSub]);

  useEffect(() => {
    fetchEncounterDataRef.current = fetchEncounterData;
  }, [fetchEncounterData]);

  const calculateLongestPath = (currentEncounterId) => {
    debugLog(`Calculating longest path from encounter ${currentEncounterId}`);
    
    // If we don't have a selected scenario, we can't calculate a path
    if (!selectedScenarioId) {
      setLongestPath([]);
      return;
    }
    
    // Ensure we're using the actual current encounter ID (last item in path if available)
    const actualCurrentEncounterId = (encounterPath.length > 0)
      ? encounterPath[encounterPath.length - 1]
      : selectedScenarioId;

    debugLog("Current encounter:", actualCurrentEncounterId);
    
    // Define what encounters have been visited:
    // 1. If this is a fresh scenario with only one node, nothing is "visited" yet - the first node is "current"
    // 2. If we have a path with multiple encounters, all but the latest are "visited"
    let visitedPath;
    if (encounterPath.length <= 1) {
      // Only root or not even that - nothing is visited yet
      visitedPath = [];
    } else {
      // We have a path, so everything except the current encounter is "visited"
      visitedPath = [...encounterPath.slice(0, -1)];
    }
    
    debugLog("Visited path:", visitedPath);
    
    // Start traversing from the current encounter to find future paths
    const findAllPaths = (encounterId, path = [], visited = new Set(), allPaths = []) => {
      // Mark this encounter as visited to avoid cycles
      visited.add(encounterId);
      
      // Get routes for this encounter from cache if available
      const cachedData = encounterCache[encounterId];
      if (!cachedData || !cachedData.routes || cachedData.routes.length === 0) {
        // If no further routes, this is a leaf node - add the path to our collection
        allPaths.push([...path, encounterId]);
        return allPaths;
      }
      
      // Find all possible next encounters from this one
      const nextEncounters = cachedData.routes
        .filter(route => route.RelID_Encounter_Receiving && !visited.has(route.RelID_Encounter_Receiving))
        .map(route => route.RelID_Encounter_Receiving);
      
      if (nextEncounters.length === 0) {
        // No further valid paths, this is a leaf node
        allPaths.push([...path, encounterId]);
        return allPaths;
      }
      
      // Otherwise, recursively explore all possible branches
      for (const nextEncounterId of nextEncounters) {
        const newVisited = new Set(visited);
        findAllPaths(nextEncounterId, [...path, encounterId], newVisited, allPaths);
      }
      
      return allPaths;
    };
    
    // Find all possible future paths from current encounter
    const allPossiblePaths = findAllPaths(actualCurrentEncounterId, [], new Set(), []);
    
    // Find the longest future path
    const futureLongestPath = allPossiblePaths.reduce((longest, current) => 
      current.length > longest.length ? current : longest, 
      []
    );
    
    // Build the combined path = visited + current + futureLongestPath
    let combinedPath = [...visitedPath];

    // Add current encounter if not already present
    if (!combinedPath.includes(actualCurrentEncounterId)) {
      combinedPath.push(actualCurrentEncounterId);
    }

    // Append future path encounters (skip the first one, which is the current)
    if (futureLongestPath.length > 1) {
      for (let i = 1; i < futureLongestPath.length; i++) {
        if (!combinedPath.includes(futureLongestPath[i])) {
          combinedPath.push(futureLongestPath[i]);
        }
      }
    }

    // ------------------------------------------------------------------
    // Determine the maximum depth for this scenario.
    // ------------------------------------------------------------------
    // Compute once per scenario; afterwards keep the stored value unchanged
    let maxDepthForScenario;
    const computedMaxDepth = computeScenarioMaxDepth(selectedScenarioId);
    if (scenarioMaxDepth === null || computedMaxDepth > scenarioMaxDepth) {
      setScenarioMaxDepth(computedMaxDepth);
      maxDepthForScenario = computedMaxDepth;
    } else {
      maxDepthForScenario = scenarioMaxDepth;
    }

    debugLog(`Max depth for scenario ${selectedScenarioId}:`, maxDepthForScenario);

    // ------------------------------------------------------------------
    // Pad the breadcrumb trail with placeholders so its length is exactly
    // the scenario's maximum depth (maxDepthForScenario).
    // ------------------------------------------------------------------
    const placeholderPrefix = 'placeholder-';
    let placeholderCounter = 1;
    while (combinedPath.length < maxDepthForScenario) {
      combinedPath.push(`${placeholderPrefix}${placeholderCounter++}`);
    }

    // Trim if we somehow exceeded the maximum (shouldn't normally happen)
    if (combinedPath.length > maxDepthForScenario) {
      combinedPath = combinedPath.slice(0, maxDepthForScenario);
    }

    debugLog('Combined path after padding:', combinedPath);

    // Determine the furthest index that is reachable from the current position
    const currentIndexInCombined = combinedPath.indexOf(actualCurrentEncounterId);
    const maxReachableIndex = currentIndexInCombined + futureLongestPath.length - 1;

    // Map combinedPath to breadcrumb metadata for rendering
    setLongestPath(
      combinedPath.map((id, idx) => {
        const isPlaceholder = typeof id === 'string' && id.startsWith(placeholderPrefix);
        const isCurrent = !isPlaceholder && id === actualCurrentEncounterId;
        const visited = !isPlaceholder && visitedPath.includes(id) && !isCurrent;
        // Unreachable if placeholder OR beyond maxReachableIndex
        const unreachable = isPlaceholder || idx > maxReachableIndex;

        return {
          id,
          visited,
          isCurrent,
          unreachable
        };
      })
    );

    debugLog(`Longest path calculated (depth ${maxDepthForScenario}):`, combinedPath);
    debugLog('Visited encounters:', visitedPath);
  };

  // Keep the ref pointing at latest implementation each render
  calculateLongestPathRef.current = calculateLongestPath;

  // A silent version of fetchEncounterData that doesn't update UI state
  const fetchEncounterDataSilently = async (encounterId) => {
    try {
      debugLog(`Silently fetching data for encounter ${encounterId}`);
      const response = await axios.get(`encounters/GetEncounterData/${encounterId}`);
      const data = response.data;
      
      if (data && data.Encounter) {
        // Only update the cache
        setEncounterCache(prev => ({
          ...prev,
          [encounterId]: {
            encounter: data.Encounter,
            routes: data.EncounterRoutes || []
          }
        }));
        return data;
      }
      return null;
    } catch (error) {
      logError(`Silent fetch error for ID ${encounterId}:`, error);
      return null;
    }
  };

  const MAX_PREFETCH_DEPTH = 10; // prevent runaway recursion
  const prefetchFutureEncounters = useCallback(async (encounterId, depth = 0, visited = new Set()) => {
    if (visited.has(encounterId) || depth > MAX_PREFETCH_DEPTH) return;
    
    // Set breadcrumbs to loading state while prefetching
    if (depth === 0) {
      setBreadcrumbsLoading(true);
    }
    
    visited.add(encounterId);
    debugLog(`Prefetching data for encounter ID: ${encounterId} at depth ${depth}`);
    
    try {
      // First check if we already have this encounter in cache
      if (encounterCache[encounterId] && encounterCache[encounterId].routes) {
        const routes = encounterCache[encounterId].routes;
        
        // Process each outgoing route to fetch its destination
        for (const route of routes) {
          if (route.RelID_Encounter_Receiving && !visited.has(route.RelID_Encounter_Receiving)) {
            // If not in cache, fetch it
            if (!encounterCache[route.RelID_Encounter_Receiving]) {
              await fetchEncounterDataSilently(route.RelID_Encounter_Receiving);
            }
            
            // Recursively prefetch for this route
            await prefetchFutureEncounters(
              route.RelID_Encounter_Receiving, 
              depth + 1, 
              new Set(visited)
            );
          }
        }
      } else {
        // If we don't have this encounter in cache yet, fetch it first
        const data = await fetchEncounterDataSilently(encounterId);
        if (data && data.EncounterRoutes) {
          // Then process its routes
          for (const route of data.EncounterRoutes) {
            if (route.RelID_Encounter_Receiving && !visited.has(route.RelID_Encounter_Receiving)) {
              await prefetchFutureEncounters(
                route.RelID_Encounter_Receiving, 
                depth + 1, 
                new Set(visited)
              );
            }
          }
        }
      }
      
      // Calculate the longest path after initial prefetch (only at depth 0)
      if (depth === 0) {
        calculateLongestPath(encounterId);
        // Mark breadcrumbs as loaded
        setBreadcrumbsLoading(false);
      }
    } catch (error) {
      logError(`Error in prefetchFutureEncounters for ID ${encounterId}:`, error);
      // Still try to calculate the path even if prefetching had errors
      if (depth === 0) {
        calculateLongestPath(encounterId);
        // Mark breadcrumbs as loaded even if there was an error
        setBreadcrumbsLoading(false);
      }
    }
  }, [encounterCache, fetchEncounterDataSilently, calculateLongestPath, setBreadcrumbsLoading, debugLog, logError]); // Use ref to avoid TDZ

  // Update the ref every render so callers always have the latest version
  prefetchFutureEncountersRef.current = prefetchFutureEncounters;

  const loadEncounterInDisplay = useCallback((encounterId) => {
    try {
      console.log(`// XOXO // [loadEncounterInDisplay] Called for encounterId: ${encounterId}. Presentation active: ${isPresentationActive}.`);
      if (!isPresentationActive) {
        console.log('// XOXO // [loadEncounterInDisplay] Presentation not active; skipping.');
        return;
      }

      console.log('// XOXO // [loadEncounterInDisplay] Checking displayWindowRef.current:', displayWindowRef.current);
      if (!displayWindowRef.current) {
        console.log('// XOXO // [loadEncounterInDisplay] displayWindowRef.current is null. Window not open or ref lost.');
        setDebugInfo(prev => ({ ...prev, displayWindowStatus: 'closed/null ref' }));
        return;
      }
      if (displayWindowRef.current.closed) {
        console.log('// XOXO // [loadEncounterInDisplay] displayWindowRef.current.closed is true. Window was closed.');
        displayWindowRef.current = null; // Clear the ref as the window is gone
        setDebugInfo(prev => ({ ...prev, displayWindowStatus: 'closed' }));
        return;
      }

      const message = {
        type: 'LOAD_ENCOUNTER_IN_DISPLAY',
        encounterId: encounterId,
        gameId: currentGameId,
        timestamp: Date.now()
      };
      console.log('// XOXO // [loadEncounterInDisplay] Preparing to post message:', message);
      console.log('// XOXO // [loadEncounterInDisplay] Target origin for postMessage:', window.location.origin);

      // Throttle messages to prevent flooding the display window
      const now = Date.now();
      const lastMessageTime = displayWindowRef.current._lastPresentationHostMessageTime || 0;
      const timeSinceLastMessage = now - lastMessageTime;

      if (timeSinceLastMessage > 250) { 
        console.log('// XOXO // [loadEncounterInDisplay] Posting message now.');
        displayWindowRef.current.postMessage(message, window.location.origin);
        displayWindowRef.current._lastPresentationHostMessageTime = now;
        
        setDebugInfo(prev => ({
          ...prev,
          lastEncounterId: encounterId,
          transitions: prev.transitions + 1,
          displayWindowStatus: 'open (messaged)',
          lastCommunicationStatus: 'success (postMessage)',
        }));
        setDisplayCommunicationStatus('connected');
        setDisplayError(null);
      } else {
        console.log(`// XOXO // [loadEncounterInDisplay] Throttled postMessage. Time since last: ${timeSinceLastMessage}ms`);
      }
    } catch (error) {
      const errorMsg = `Error in loadEncounterInDisplay: ${error.message}`;
      logError(errorMsg, error);
      setDisplayError(errorMsg);
      setDisplayCommunicationStatus('error');
    }
  }, [isPresentationActive, displayWindowRef, currentGameId, addToast, debugLog, setDebugInfo, setDisplayCommunicationStatus, setDisplayError]);

  // Update ref each render
  loadEncounterInDisplayRef.current = loadEncounterInDisplay;

  // Helper function to open a new display window (now specifically for PresentationDisplayHost)
  const openNewDisplayWindow = (gameIdForWindow, initialEncounterId, isNewPresentationStart = false) => {
    try {
      if (!gameIdForWindow) { // Changed to check gameIdForWindow
        addToast('Cannot open display window without an active game ID being provided.', 'error');
        console.log('// XOXO // [openNewDisplayWindow] Attempted to open display window with no gameIdForWindow.');
        return;
      }

      const url = `/presentation-display?gameId=${gameIdForWindow}&t=${Date.now()}`;
      console.log(`// XOXO // [openNewDisplayWindow] Opening PresentationDisplayHost with explicitly passed gameId: ${gameIdForWindow}, URL: ${url}`);
      
      // Close existing window first if open, to avoid multiple display windows
      if (displayWindowRef.current && !displayWindowRef.current.closed) {
        try { displayWindowRef.current.close(); } catch (e) { logError('Error closing existing window before opening new', e); }
      }
      
      displayWindowRef.current = window.open(url, 'EncounterDisplay', 'width=1024,height=768');
      displayWindowRef.current._lastPresentationHostMessageTime = 0; // Initialize throttle timer

      if (!displayWindowRef.current || displayWindowRef.current.closed) {
        const errorMsg = 'Failed to open display window - popup may have been blocked by browser.';
        logError(errorMsg);
        addToast(errorMsg, 'error');
        setDisplayError(errorMsg + " Please check your browser's popup settings.");
        setDebugInfo(prev => ({ ...prev, displayWindowStatus: 'failed to open - blocked' }));
        setDisplayCommunicationStatus('error');
      } else {
        setDebugInfo(prev => ({ ...prev, displayWindowStatus: 'newly opened' }));
        setDisplayCommunicationStatus('connected');

        // After window opens, send appropriate initial message
        setTimeout(() => {
          if (displayWindowRef.current && !displayWindowRef.current.closed) {
            if (isNewPresentationStart) {
              const welcomeMessage = { type: 'SHOW_WELCOME', gameId: gameIdForWindow, timestamp: Date.now() }; // Use gameIdForWindow
              console.log('// XOXO // [openNewDisplayWindow] Posting SHOW_WELCOME to new display host:', welcomeMessage);
              displayWindowRef.current.postMessage(welcomeMessage, window.location.origin);
            } else if (initialEncounterId) {
              console.log(`// XOXO // [openNewDisplayWindow] Window reopened, attempting to load initial encounter: ${initialEncounterId} for gameId: ${gameIdForWindow}`);
              // loadEncounterInDisplay will use EducatorPanel's currentGameId state, which should be in sync by now if startPresentation set it.
              // For safety, ensure the message it sends also uses a consistent gameId if possible, but PresentationDisplayHost primarily validates against its own URL gameId.
              loadEncounterInDisplay(initialEncounterId); 
            } else {
              const welcomeMessage = { type: 'SHOW_WELCOME', gameId: gameIdForWindow, timestamp: Date.now() }; // Use gameIdForWindow
              console.log('// XOXO // [openNewDisplayWindow] Defaulting to SHOW_WELCOME for reopened window (using passed gameIdForWindow):', welcomeMessage);
              displayWindowRef.current.postMessage(welcomeMessage, window.location.origin);
            }
          }
        }, 500); // Delay to allow PresentationDisplayHost to initialize its listeners
      }
    } catch (error) {
      const errorMsg = `Error in openNewDisplayWindow: ${error.message}`;
      logError(errorMsg, error);
      addToast('Error opening display window.', 'error');
      setDisplayError(errorMsg);
      setDisplayCommunicationStatus('error');
    }
  };

  const openDisplayWindow = () => {
    try {
      if (!isPresentationActive) {
        addToast('Please start a presentation first.', 'info');
        return;
      }
      const targetEncounterId = selectedScenarioId || (currentEncounter && currentEncounter.ID);

      console.log(`// XOXO // [openDisplayWindow] Manually opening/refreshing display. Target Encounter: ${targetEncounterId}. Current EducatorPanel gameId: ${currentGameId}`);
      // When manually opening, use the EducatorPanel's current currentGameId state.
      // This assumes that if a presentation is active, currentGameId is the correct one.
      openNewDisplayWindow(currentGameId, targetEncounterId, false);

    } catch (error) {
      const errorMsg = `Error in openDisplayWindow: ${error.message}`;
      logError(errorMsg, error);
      addToast('Error opening display window.', 'error');
      setDisplayError(errorMsg);
      setDisplayCommunicationStatus('error');
    }
  };

  const fetchScenarios = useCallback(() => {
    if (!userSub) {
      console.warn('[EducatorPanel] Cannot fetch scenarios: userSub not available.');
      // Optionally set an error state or return early
      setDisplayCommunicationStatus('error'); 
      setDisplayError('Authentication details missing, cannot load scenarios.');
      return; 
    }

    // Only show loading on initial load
    if (scenarios.length === 0) {
      setDisplayCommunicationStatus('loading');
    }
    
    axios.get('encounters/root-encounters', {
      withCredentials: true, // Ensure cookies are sent
      headers: {
        'x-user-sub': userSub // Add the user sub header
      },
      params: { // Add cache buster
        _t: new Date().getTime()
      } 
    })
      .then(({ data }) => {
        setDisplayCommunicationStatus('connected');
        if (Array.isArray(data)) {
          setScenarios(data);
          debugLog(`Loaded ${data.length} scenarios`);
          console.log('[EducatorPanel] fetchScenarios: Successfully fetched scenarios. Count:', data.length);
        } else {
          console.error('Received non-array data for scenarios:', data);
          setScenarios([]); // Set empty array on invalid data
          setDisplayError('Received invalid scenario data.');
          console.log('[EducatorPanel] fetchScenarios: Received non-array data for scenarios.', data);
        }
      })
      .catch(error => {
        const errorMsg = `Error fetching scenarios: ${error.message}`;
        logError(errorMsg, error);
        setDisplayError(errorMsg);
        setDisplayCommunicationStatus('error');
        setScenarios([]); // Clear scenarios on error
        console.log('[EducatorPanel] fetchScenarios: Error fetching scenarios.', errorMsg);
      });
  }, [userSub, scenarios.length]); // Add userSub and scenarios.length as dependencies

  const handleScenarioChange = (e) => {
    const scenarioId = e.target.value;
    console.log('[EducatorPanel] handleScenarioChange triggered. Selected scenarioId:', scenarioId, 'Current isPresentationActive:', isPresentationActive, 'Current currentGameId:', currentGameId);
    setSelectedScenarioId(scenarioId);
    try {
      // Show informational toast if presentation not active, but continue loading the encounter
      if (!isPresentationActive) {
        addToast('Start a presentation to enable sending polls.', 'info');
        // Continue instead of returning, so we can still load and display encounter data
      }
      debugLog(`Scenario selected: ${scenarioId}`);
      setEncounterPath([scenarioId]);
      
      if (scenarioId) {
        // End any running poll and clear data when changing scenarios
        if (hookIsPollRunning) {
          hookEndPoll();
        }
        hookClearPollData();
        
        console.log('[EducatorPanel] handleScenarioChange: About to call fetchEncounterData for scenarioId:', scenarioId);

        // Fetch data first; after successful retrieval, emit TravelToID so backend is ready
        fetchEncounterData(scenarioId)
          .then(() => {
            if (currentGameId) {
              updateGameEncounter(currentGameId, scenarioId);
            }
            // Only emit TravelToID if presentation is active
            if (isPresentationActive) {
              socket.emit('TravelToID', scenarioId, currentGameId);
            }
          });
      } else {
        // End any running poll and clear data
        if (hookIsPollRunning) {
          hookEndPoll();
        }
        hookClearPollData();
        
        setCurrentEncounter(null); // Explicitly clear current encounter when no scenario is selected
        setEncounterPath([]);
        setLongestPath([]);
      }
    } catch (error) {
      const errorMsg = `Error in scenario change: ${error.message}`;
      logError(errorMsg, error);
    }
  };

  const handleSendPoll = () => {
    console.log('[EducatorPanel] handleSendPoll called. isPresentationActive:', isPresentationActive, 'currentEncounter:', currentEncounter?.ID, 'hookPollOptions:', hookPollOptions);
    
    if (!isPresentationActive) {
      addToast('You must start a presentation before sending a poll.', 'info');
      return;
    }
    if (!selectedScenarioId || !currentEncounter) {
      addToast('Please select a scenario first.', 'info');
      return;
    }
    
    // The hook's sendPoll no longer requires pollOptions, only encounter text
    const result = hookSendPoll(currentEncounter?.Text || "");
    if (!result.success) {
        addToast(result.message, 'error');
    } else {
        addToast(result.message, 'success');
    }
  };

  const handleEndPoll = () => {
    const result = hookEndPoll();
    if (!result.success) {
        addToast(result.message, 'error');
    } else {
        // Success message might be redundant if UI updates clearly via socket events
        // addToast(result.message, 'info');
    }
  };

  // --------------------------------------------------
  // Presentation lifecycle handlers (temporarily kept here until
  // moved into a dedicated usePresentationManager hook).
  // --------------------------------------------------
  const startPresentation = () => {
    console.log('[EducatorPanel] startPresentation called. Current isPresentationActive:', isPresentationActive, 'Current currentGameId:', currentGameId);
    if (hookIsPollRunning) {
      addToast("Cannot start a new presentation while a poll is active.", "error");
      console.warn('[EducatorPanel] Attempted to start presentation while poll is running.');
      return;
    }

    const newGameId = createMultiplayerGame();
    console.log('[EducatorPanel] startPresentation: newGameId created by createMultiplayerGame():', newGameId);
    setCurrentGameId(newGameId);
    setIsPresentationActive(true);
    setSelectedScenarioId(''); // Reset selected scenario
    setCurrentEncounter(null); // Reset current encounter
    setEncounterPath([]); // Reset encounter path
    setLongestPath([]); // Reset longest path
    setAllPaths([]); // Reset all paths
    // Optionally, reset other relevant states like breadcrumbs, etc.
    setBreadcrumbsLoading(true); // Reset breadcrumbs loading state

    console.log(`[EducatorPanel] Generated new gameId: ${newGameId} for new presentation.`);
    // Emit an event to the server to notify that a presentation has started
    if (userSub) {
      socket.emit('start presentation', { gameId: newGameId, hostSub: userSub });
      console.log(`[EducatorPanel] Emitting "start presentation" to server with gameId: ${newGameId} and hostSub: ${userSub}`);
    } else {
      console.error('[EducatorPanel] User sub not available. Cannot emit start presentation.');
      addToast("Error: User identifier not found. Cannot start presentation.", "error");
      // Potentially revert state changes if userSub is critical
      setIsPresentationActive(false);
      setCurrentGameId(null);
      return;
    }

    // Attempt to open or focus the display window.
    openDisplayWindow(newGameId, null, true); // Pass true for isNewPresentationStart

    console.log('[EducatorPanel] startPresentation completed. New isPresentationActive:', true, 'New currentGameId:', newGameId);
    console.log('[EducatorPanel] Display window exists, attempting to load initial encounter or reset.');
    // If a display window exists, send a message to it to load the initial encounter or reset
    // This part might be handled by openDisplayWindow or needs explicit call if an encounter is pre-selected

    addToast("Presentation started. Select a scenario to begin.", "success");
  };

  const endPresentation = () => {
    console.log('[EducatorPanel] endPresentation called'); // LOG ADDED
    if (hookIsPollRunning) {
      addToast('Cannot end the presentation while a poll is active. Please end the poll first.', 'warning');
      console.warn('[EducatorPanel] Attempted to end presentation while poll is running.'); // LOG ADDED
      return;
    }
    setIsPresentationActive(false);
    setScenarioLocked(false); // keep in sync even though we no longer lock during presentation
    setCurrentGameId(null); // Clear the game ID
    addToast('Presentation ended!', 'info');

    // Emit an event to the server to signal presentation end
    console.log('[EducatorPanel] Emitting "presentation ended" to server with gameId:', currentGameId);
    socket.emit('presentation ended', { gameId: currentGameId });

    // Inform the display window to show an end screen or clear itself
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      console.log('[EducatorPanel] Informing display window about presentation end.');
      sendMessageToWindow(displayWindowRef.current, {
        type: 'SHOW_END_SCREEN',
        presenterName: getDisplayName(userSub),
        timestamp: Date.now(),
      });
    } else {
      console.log('[EducatorPanel] No display window or it is closed during endPresentation.');
    }
  };

  const showInstantMessages = () => {
    // Emit event to show instant messages in aggregate
    socket.emit('show instant messages');
  };

  // Function to navigate to the route's destination encounter
  const navigateToRoute = (route) => {
    try {
      if (!route || !route.RelID_Encounter_Receiving) {
        logError(`Route has no destination encounter`, { route });
        return;
      }
      
      // Clear poll data before navigating
      if (hookIsPollRunning) { // Optionally, only clear if a poll was active
        hookEndPoll(); // End the poll first if it's running
      }
      hookClearPollData(); // Clear all poll votes and related state

      const destEncounterId = route.RelID_Encounter_Receiving;
      debugLog(`Navigating to encounter ID: ${destEncounterId}`);
      
      setDebugInfo(prev => ({
        ...prev,
        transitions: prev.transitions + 1,
        lastEncounterId: destEncounterId,
      }));
      
      // Append the destination encounter to the visited path if it's new
      setEncounterPath(prev => {
        const idx = prev.indexOf(destEncounterId);
        if (idx === -1) {
          // brand-new forward move – just append
          return [...prev, destEncounterId];
        }
        // we are revisiting an earlier node (e.g. navigated back then forward) – trim forward branch
        return prev.slice(0, idx + 1);
      });
      
      // Also tell the server to clear poll data but keep the quiz structure
      socket.emit('clear poll data');
      
      // Update game encounter data
      if (currentGameId) {
        updateGameEncounter(currentGameId, destEncounterId);
      }
      
      // Travel to the selected encounter using all available methods
      // Method 1: Socket event
      socket.emit('TravelToID', destEncounterId, currentGameId);
      
      // Method 2: Direct trigger via postMessage through loadEncounterInDisplay
      // triggerEncounterTransition(destEncounterId, currentGameId, displayWindowRef.current); // Old way
      loadEncounterInDisplay(destEncounterId); // New way: postMessage to PresentationDisplayHost
      
      // Also load the encounter data locally (this also calls loadEncounterInDisplay)
      fetchEncounterData(destEncounterId);
    } catch (error) {
      const errorMsg = `Error navigating to route: ${error.message}`;
      logError(errorMsg, error);
      setDisplayError(errorMsg);
      setDisplayCommunicationStatus('error');
    }
  };

  // Add function to navigate to a specific breadcrumb
  const navigateToBreadcrumb = (encounterId) => {
    if (!encounterId) return;
    
    // Clear poll data before navigating via breadcrumb
    if (hookIsPollRunning) {
        hookEndPoll();
    }
    hookClearPollData();

    // Check if this is a visited encounter
    if (!encounterPath.includes(encounterId)) {
      debugLog(`Cannot navigate to unvisited encounter: ${encounterId}`);
      return; // Don't allow navigation to unvisited encounters
    }
    
    debugLog(`Navigating to breadcrumb: ${encounterId}`);
    
    // Find this encounter in our path
    const encounterIndex = encounterPath.indexOf(encounterId);
    let newPath;
    
    if (encounterIndex !== -1) {
      // If it's in our current path, trim the path to this point
      newPath = encounterPath.slice(0, encounterIndex + 1);
    } else {
      debugLog(`Warning: Trying to navigate to encounter not in path: ${encounterId}`);
      return;
    }
    
    // Update path
    setEncounterPath(newPath);
    
    // Load the encounter data
    fetchEncounterData(encounterId);
    
    // Update game encounter data
    if (currentGameId) {
      updateGameEncounter(currentGameId, encounterId);
    }
    
    // Emit travel event
    socket.emit('TravelToID', encounterId, currentGameId);
    
    // Load in display window
    // triggerEncounterTransition(encounterId, currentGameId, displayWindowRef.current); // Old way
    loadEncounterInDisplay(encounterId); // New way: postMessage to PresentationDisplayHost
  };
  
  // Helper method to get encounter title
  const getEncounterTitle = (encounterId) => {
    if (encounterId === selectedScenarioId && currentEncounter) {
      return currentEncounter.Title;
    }
    
    // Check cache first
    if (encounterCache[encounterId] && encounterCache[encounterId].encounter) {
      return encounterCache[encounterId].encounter.Title;
    }
    
    // Try to find the title in scenarios
    const scenario = scenarios.find(s => s.ID === encounterId);
    if (scenario) {
      return scenario.Title;
    }
    
    return `Encounter #${encounterId}`;
  };

  // Function to send a debug toggle message to the display window
  const toggleDisplayDebug = () => {
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      try {
        sendMessageToWindow(displayWindowRef.current, {
          type: 'DEBUG_TOGGLE',
          timestamp: Date.now()
        });
        debugLog('Sent debug toggle message to display window');
      } catch (e) {
        logError('Error sending debug toggle message', e);
      }
    } else {
      setDisplayError('Display window is not open');
    }
  };

  // Function to force reload the display window
  const forceReloadDisplay = () => {
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      try {
        debugLog('Forcing display window reload');
        displayWindowRef.current.location.reload();
      } catch (e) {
        logError('Error reloading display window', e);
      }
    } else {
      setDisplayError('Display window is not open');
    }
  };

  // Function to force reset the display window's transition state
  const forceResetDisplayWindow = () => {
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      try {
        debugLog('Sending force reset command to display window');
        sendMessageToWindow(displayWindowRef.current, {
          type: 'FORCE_RESET',
          timestamp: Date.now()
        });
      } catch (e) {
        logError('Error sending force reset command', e);
      }
    } else {
      setDisplayError('Display window is not open');
    }
  };

  // Only show communication status for errors or disconnects, not for loading
  const renderConnectionStatus = () => {
    switch (displayCommunicationStatus) {
      case 'connected':
      case 'loading': // Don't show loading status to reduce flashing
        return null;
      case 'error':
        return <div className="connection-status error">Communication Error. Please try again.</div>;
      case 'disconnected':
        return <div className="connection-status disconnected">Disconnected from server. Reconnecting...</div>;
      default:
        return null;
    }
  };

  // ------------------------------------------------------------------
  // Helper: Compute maximum depth for a scenario from its root encounter.
  // This function is declared here (as a function declaration) so that it
  // is hoisted and can be called anywhere inside this component, including
  // earlier inside calculateLongestPath.
  // ------------------------------------------------------------------
  function computeScenarioMaxDepth(rootEncounterId) {
    // Depth-first traversal limited by cached data.
    const dfs = (encounterId, depth = 1, visited = new Set()) => {
      if (!encounterId || visited.has(encounterId)) return depth;

      visited.add(encounterId);

      const cached = encounterCache[encounterId];
      const routes = (cached && cached.routes) ? cached.routes : [];

      if (routes.length === 0) return depth;

      let maxDepth = depth;
      for (const r of routes) {
        if (r.RelID_Encounter_Receiving) {
          const branchDepth = dfs(r.RelID_Encounter_Receiving, depth + 1, new Set(visited));
          if (branchDepth > maxDepth) maxDepth = branchDepth;
        }
      }
      return maxDepth;
    };

    return dfs(rootEncounterId);
  }

  // --------------------------------------------------
  // User Management (moved to custom hook)
  // --------------------------------------------------
  const {
    userList,
    totalUsers,
    badges,
    loadingBadges,
    openAwardXPModal,
    openAwardXPToAllModal,
    isBadgeModalOpen, // Kept for passing to UserManagementPanel, which now handles rendering
    setIsBadgeModalOpen, // Kept for passing
    selectedUserForBadge, // Kept for passing
    openBadgeAwardModal,
    awardBadge,
    isInputModalOpen, // Kept for passing
    setIsInputModalOpen, // Kept for passing
    inputModalConfig, // Kept for passing
  } = useUserManagement(currentGameId, currentEncounter ? currentEncounter.EncounterID : null);

  useEffect(() => {
    console.log('[EducatorPanel] useUserManagement initialized with currentGameId:', currentGameId);
  }, [currentGameId]);

  // Map of unread counts per sender (excludes messages authored by educator)
  const unreadBySender = React.useMemo(() => {
    const map = {};
    if (!chatMessages || chatMessages.length === 0) return map;
    chatMessages.forEach(m => {
      const sender = m.senderSub || m.Sender_Sub;
      // Skip messages authored by the educator or without a valid sender
      if (!sender || sender === authUser?.sub) return;

      const convId = m.conversationId;
      // If this message isn't tied to a conversation (e.g., legacy/system), we can't
      // reliably determine its read status, so exclude it from unread calculations.
      if (!convId) return;

      const tsRaw = m.sentAt || m.Sent_At || m.timestamp;
      const ts = tsRaw ? new Date(tsRaw).getTime() : Date.now();

      const viewedTs = lastViewedByConv ? (lastViewedByConv[convId] || 0) : 0;

      if (ts > viewedTs) {
        map[sender] = (map[sender] || 0) + 1;
      }
    });
    return map;
  }, [chatMessages, lastViewedByConv, authUser]);

  // Click handler to open chat with a participant
  const openChatWithUser = async (otherIdentifier) => {
    const otherSub = getPureSub(otherIdentifier);
    try {
      if (!authUser?.sub || !otherSub) return;

      // Check if chat already exists
      const existing = openChats.find(c => c.conversation.other?.sub === otherSub || c.conversation.conversationId === null);
      if (existing) {
        // Toggle visibility
        toggleVisibility(existing.conversation.conversationId);
        return;
      }

      const { data } = await axios.post('/conversations/direct', {
        userSubA: authUser.sub,
        userSubB: otherSub
      });
      const conversation = {
        conversationId: data.conversationId,
        isGroup: false,
        other: { 
          sub: otherSub,
          name: getDisplayName(otherIdentifier) // Provide display name for chat header
        }
      };
      openChat(conversation);
      if (data.conversationId) markMessagesViewed(data.conversationId);
    } catch (err) {
      console.error('Failed to open chat with', otherSub, err);
    }
  };

  // ------------------------------------------------------------------
  // Sync with an already-running presentation when panel first loads or
  // the socket reconnects. This specific useEffect uses the NEWLY MOVED and useCallback-wrapped
  // handlePresenterInfo, so it should be fine IF the move was successful.
  // ------------------------------------------------------------------
  useEffect(() => {
    const requestPresenterInfo = () => {
      debugLog('EducatorPanel: requesting presenter info');
      try {
        socket.emit('get presenter', currentGameId || null);
      } catch (err) {
        logError('EducatorPanel: failed to emit get presenter', err);
      }
    };

    // Assuming handlePresenterInfo is now defined much earlier and is stable (useCallback)
    socket.on('presenter info', handlePresenterInfo);
    socket.on('connect', requestPresenterInfo);

    // Immediately ask on mount
    requestPresenterInfo();

    return () => {
      socket.off('presenter info', handlePresenterInfo);
      socket.off('connect', requestPresenterInfo);
    };
  }, [currentGameId, isPresentationActive, handlePresenterInfo]); // Ensure handlePresenterInfo is stable

  // ------------------------------------------------------------------
  // Late-join sync: once we have a game ID but no current encounter yet,
  // ask the server which encounter is active so UI can catch up.
  // This specific useEffect uses the NEWLY MOVED and useCallback-wrapped
  // handleCurrentEncounter.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!currentGameId) return;
    if (currentEncounter) return; // already loaded something

    debugLog(`EducatorPanel: requesting current encounter for game ${currentGameId}`);
    try {
      socket.emit('request current encounter', currentGameId);
    } catch (err) {
      logError('EducatorPanel: failed to request current encounter', err);
    }

    // Assuming handleCurrentEncounter is now defined much earlier and is stable (useCallback)
    socket.on('current encounter', handleCurrentEncounter);

    return () => socket.off('current encounter', handleCurrentEncounter);
  }, [currentGameId, currentEncounter, handleCurrentEncounter]); // Ensure handleCurrentEncounter is stable

  // Placeholder function for chat visibility toggle
  const toggleVisibility = (identifier) => {
    debugLog(`Placeholder: Toggle visibility for ${identifier}`);
    // This will eventually be handled by ChatContext or a dedicated chat hook
    setOpenChats(prev => ({ ...prev, [identifier]: !prev[identifier] }));
  };

  const markMessagesViewed = (conversationId) => {
    // Placeholder: Logic to mark messages as viewed will be part of ChatContext/hook
    debugLog(`Placeholder: Mark messages viewed for ${conversationId}`);
  };

  const openChat = (otherIdentifier) => {
    // Placeholder: Logic to open/focus a chat window
    debugLog(`Placeholder: Open chat with ${otherIdentifier}`);
  };

  // ----- DEBUG: log render key states -----
  if (DEBUG_MODE) {
    console.log('[EducatorPanel render] embedded:', embedded,
      '| scenarios length:', Array.isArray(scenarios) ? scenarios.length : 'N/A',
      '| isPresentationActive:', isPresentationActive,
      '| scenarioLocked:', scenarioLocked,
      '| currentEncounter exists:', !!currentEncounter,
      '| breadcrumbsLoading:', breadcrumbsLoading);
  }

  return (
    <div className={`educator-panel-container ${embedded ? 'embedded' : ''}`}>
      { !embedded && (
        <>
          <TopHeader title="Educator Panel" />
          <MainNavTabs activeTab="/educator-panel" />
        </>
      ) }
      
      {/* Error toast */}
      {displayError && (
        <div className="error-toast">
          <p>{displayError}</p>
          <button onClick={() => setDisplayError(null)}>Dismiss</button>
        </div>
      )}
      
      {/* Connection status message (less obtrusive than error toast) */}
      {renderConnectionStatus()}
      
      {/* Debug panel */}
      {showDebug && (
        <div className="debug-panel">
          <h3>Educator Panel Debug (Ctrl+Shift+D)</h3>
          <p><strong>Display Window:</strong> {debugInfo.displayWindowStatus}</p>
          <p><strong>Last Communication:</strong> {debugInfo.lastCommunicationStatus || 'none'}</p>
          <p><strong>Communication Methods:</strong> {debugInfo.communicationMethods.join(', ') || 'none'}</p>
          <p><strong>Transitions:</strong> {debugInfo.transitions}</p>
          <p><strong>Last Encounter ID:</strong> {debugInfo.lastEncounterId || 'none'}</p>
          <p><strong>Game ID:</strong> {currentGameId || 'none'}</p>
          <p><strong>Socket Connected:</strong> {debugInfo.isConnected ? 'YES' : 'NO'}</p>
          <p><strong>Communication Status:</strong> {displayCommunicationStatus}</p>
          
          <div className="debug-controls">
            <button onClick={toggleDisplayDebug}>Toggle Display Debug</button>
            <button onClick={forceReloadDisplay}>Force Reload Display</button>
            <button onClick={forceResetDisplayWindow}>Force Reset Display State</button>
            <button onClick={() => setShowDebug(false)}>Hide Debug</button>
          </div>
        </div>
      )}
      
      <div className="scenario-controls" style={{padding:'0 15px'}}>
        <div style={{display:'flex', alignItems:'center', width:'100%', margin:'15px 0 5px', boxSizing:'border-box', justifyContent:'space-between' }}>
          <ScenarioExplorer 
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioId}
            handleScenarioChange={handleScenarioChange}
            isPresentationActive={isPresentationActive}
            scenarioLocked={scenarioLocked}
          />

          <BreadcrumbTrail 
            longestPath={longestPath}
            navigateToBreadcrumb={navigateToBreadcrumb}
            getEncounterTitle={getEncounterTitle}
            breadcrumbsLoading={breadcrumbsLoading}
            isPresentationActive={isPresentationActive}
            currentEncounter={currentEncounter}
          />

          <button 
            className="btn"
            onClick={openDisplayWindow}
            style={{whiteSpace:'nowrap',marginLeft:'10px',minWidth:'220px',flex:'0 0 auto'}}
          >
            Open Encounter Display
          </button>
        </div>
      </div>

      <div className="panel-content" style={{padding:'10px 15px 15px'}}>
        {console.log('[EducatorPanel] Rendering EducatorPollDisplay with props - currentEncounter:', currentEncounter, 'hookPollOptions:', hookPollOptions, 'isPresentationActive:', isPresentationActive, 'totalUsers:', totalUsers)}
        <EducatorPollDisplay 
          isPollRunning={hookIsPollRunning}
          elapsedSeconds={hookElapsedSeconds}
          totalVotes={hookTotalVotes}
          voteCounts={hookVoteCounts}
          voteCountsAbsolute={hookVoteCountsAbsolute}
          pollOptions={hookPollOptions}
          finalVoteCounts={hookFinalVoteCounts}
          finalTotalVotes={hookFinalTotalVotes}
          finalVoteCountsAbsolute={hookFinalVoteCountsAbsolute}
          hasFinalResults={hookHasFinalResults}
          sendPollHandler={handleSendPoll}
          endPollHandler={handleEndPoll}
          isPresentationActive={isPresentationActive}
          currentEncounter={currentEncounter}
          totalUsers={totalUsers}
          navigateToRoute={navigateToRoute}
        />

        <div className="poll-controls">
          <StartPresentationButtons 
            isPresentationActive={isPresentationActive}
            isPollRunning={hookIsPollRunning}
            startPresentation={startPresentation}
            endPresentation={endPresentation}
          />

          <InstructionManager 
            isPresentationActive={isPresentationActive}
            initialActiveInstruction={activeInstruction}
            onInstructionBroadcast={setActiveInstruction}
            onInstructionClose={() => setActiveInstruction(null)}
          />
        </div>

        <UserManagementPanel
          totalUsers={totalUsers}
          userList={userList}
          loadingBadges={loadingBadges}
          openAwardXPModal={openAwardXPModal}
          openAwardXPToAllModal={openAwardXPToAllModal}
          openBadgeAwardModal={openBadgeAwardModal}
          unreadBySender={unreadBySender}
          openChatWithUser={openChatWithUser}
          getPureSub={getPureSub}
          getDisplayName={getDisplayName}
          isBadgeModalOpen={isBadgeModalOpen}
          setIsBadgeModalOpen={setIsBadgeModalOpen}
          selectedUserForBadge={selectedUserForBadge}
          awardBadge={awardBadge}
          badges={badges} 
          isInputModalOpen={isInputModalOpen}
          setIsInputModalOpen={setIsInputModalOpen}
          inputModalConfig={inputModalConfig}
        />

        <PreviewPane 
          isPresentationActive={isPresentationActive}
          currentEncounter={currentEncounter}
        />
      </div>

    </div>
  );
};

export default EducatorPanel; 