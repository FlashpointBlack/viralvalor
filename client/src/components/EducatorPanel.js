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
import { awardXP, awardBadge } from '../utils/xpUtils';
import { useSocket } from '../contexts/SocketContext';
import { useChat } from '../contexts/ChatContext';
import { useAuth0 } from '@auth0/auth0-react';
import ReactDOM from 'react-dom';
import { useToast } from '../contexts/ToastContext';
import InputModal from './InputModal';

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

const EducatorPanel = ({ embedded = false }) => {
  const [isPollRunning, setIsPollRunning] = useState(false);
  const [pollOptions, setPollOptions] = useState([]);
  const [voteCounts, setVoteCounts] = useState([]);
  const [voteCountsAbsolute, setVoteCountsAbsolute] = useState([]);
  const [finalVoteCounts, setFinalVoteCounts] = useState([]);
  const [finalVoteCountsAbsolute, setFinalVoteCountsAbsolute] = useState([]);
  const [hasFinalResults, setHasFinalResults] = useState(false);
  const [totalVotes, setTotalVotes] = useState(0);
  const [finalTotalVotes, setFinalTotalVotes] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userList, setUserList] = useState([]);
  const [currentEncounter, setCurrentEncounter] = useState(null);
  const [scenarios, setScenarios] = useState([]); 
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [encounterPath, setEncounterPath] = useState([]);
  const [encounterCache, setEncounterCache] = useState({});
  const [allPaths, setAllPaths] = useState([]);
  const [longestPath, setLongestPath] = useState([]);
  const [breadcrumbsLoading, setBreadcrumbsLoading] = useState(true);
  const [scenarioMaxDepth, setScenarioMaxDepth] = useState(null);
  const displayWindowRef = useRef(null);
  const componentIdRef = useRef(`educator-panel-${Date.now()}`);
  const [showDebug, setShowDebug] = useState(DEBUG_MODE);
  const [debugInfo, setDebugInfo] = useState({
    transitions: 0,
    displayWindowStatus: 'not opened',
    lastCommunicationStatus: null,
    communicationMethods: [],
    lastEncounterId: null,
    gameId: null,
    isConnected: socket.connected
  });
  const [displayError, setDisplayError] = useState(null);
  const [currentGameId, setCurrentGameId] = useState(null);
  const [displayCommunicationStatus, setDisplayCommunicationStatus] = useState('none');
  const navigate = useNavigate(); // Use React Router's navigation
  const [isPresentationActive, setIsPresentationActive] = useState(false);
  const { chatMessages, lastViewedByConv, markMessagesViewed } = useSocket();
  const { openChats, openChat, toggleVisibility } = useChat();
  const { user: authUser } = useAuth0();
  const { addToast } = useToast();

  // Add a useRef for storing cached breadcrumb elements
  const breadcrumbNodesRef = useRef({});

  // Prefer Auth0 user sub when available, otherwise fall back to any value previously persisted
  // in localStorage (set by AuthContext) so that we always have the presenter identifier
  // when sending the SHOW_END_SCREEN message to the display window.
  const { user: auth0User } = useAuth0(); // Renamed to avoid conflict with user from useAuth()
  const { user: fallbackAuthUser } = useAuth(); // Might contain data sooner than Auth0 in some flows

  const userSub = auth0User?.sub 
                || fallbackAuthUser?.sub 
                || localStorage.getItem('userSub') 
                || null; // Explicit null if all sources fail

  const isPollRunningRef = useRef(isPollRunning);
  const totalVotesRef = useRef(totalVotes);

  const [scenarioLocked, setScenarioLocked] = useState(false);
  const [badges, setBadges] = useState([]);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [badgeModal, setBadgeModal] = useState({ visible: false, userSub: null });

  // -------- Input modal state for XP award --------
  const [inputModal, setInputModal] = useState({ open: false, message: '', onConfirm: null });

  const [instructionModal, setInstructionModal] = useState(false);
  const [instructions, setInstructions] = useState([]);
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  // Track the currently broadcasted instruction (if any)
  const [activeInstruction, setActiveInstruction] = useState(null);

  const [presentationInfoChecked, setPresentationInfoChecked] = useState(false);

  useEffect(() => {
    isPollRunningRef.current = isPollRunning;
  }, [isPollRunning]);

  useEffect(() => {
    totalVotesRef.current = totalVotes;
  }, [totalVotes]);

  // Listen for keypress to toggle debug mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Shift+D to toggle debug mode
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDebug(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Initialize a new game or verify existing game on startup
  useEffect(() => {
    // Do not create / verify a game until we have confirmed whether a presentation
    // is already running.  This prevents accidental creation of duplicate games
    // when an educator opens another panel in the middle of an active session.
    if (!presentationInfoChecked || isPresentationActive) return;

    console.log(`// XOXO // [useEffect gameId init] Running AFTER presenter info check. Current currentGameId: ${currentGameId}`);

    if (!currentGameId) {
      const newGameId = createMultiplayerGame();
      console.log(`// XOXO // [useEffect gameId init] No currentGameId found. Created new game: ${newGameId}. Calling setCurrentGameId.`);
      setCurrentGameId(newGameId);
    } else {
      const CGE_exists = gameExists(currentGameId);
      console.log(`// XOXO // [useEffect gameId init] currentGameId exists: ${currentGameId}. Does it exist in gameManager? ${CGE_exists}`);
      if (!CGE_exists) {
        const newGameId = createMultiplayerGame();
        console.log(`// XOXO // [useEffect gameId init] Game ${currentGameId} reported as NOT existing. Forcing new game: ${newGameId}. Calling setCurrentGameId.`);
        setCurrentGameId(newGameId);
      } else {
        console.log(`// XOXO // [useEffect gameId init] Game ${currentGameId} already exists and is valid. No change made by this effect.`);
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

  useEffect(() => {
    // Initialize socket event listeners
    socket.on('user count', (count) => {
      setTotalUsers(count);
    });

    socket.on('update user list', (users) => {
      const filtered = currentGameId ? users.filter(u => u.gameId === currentGameId) : [];
      setUserList(filtered);
      setTotalUsers(filtered.length);
      
      // Check if any users have selections to debug
      const usersWithSelections = filtered.filter(user => user.selection);
      if (usersWithSelections.length > 0) {
        console.log('Users with selections:', usersWithSelections);
      }
    });
    
    // Add handler for vote received events
    socket.on('vote received', (totalVoteCount) => {
      console.log('Vote received, requesting updated results. Total votes:', totalVoteCount);
      
      // Make sure we're showing the poll as active
      setIsPollRunning(true);
      
      // Request updated results
      requestResults();
    });

    socket.on('results updated', (results, totalVotesParam, routes) => {
      const running = isPollRunningRef.current;
      const prevTotal = totalVotesRef.current;
      const newTotalVotes = totalVotesParam || 0;

      // Guard against out-of-order responses that might momentarily drop the vote total.
      if (running && newTotalVotes < prevTotal) {
        console.log('Ignoring stale results update (older totalVotes)', newTotalVotes, '<', prevTotal);
        return; // Skip processing older / out-of-date results
      }
      console.log('Results updated:', results, 'Total votes:', newTotalVotes, 'Routes:', routes);
      
      // Update the refs immediately for future comparisons
      totalVotesRef.current = newTotalVotes;
      
      if (results && Array.isArray(results) && results.length > 0) {
        if (running) {
          // Update active poll results
          setVoteCounts(results.map(r => parseFloat(r)));
          setTotalVotes(newTotalVotes);
          
          // Calculate absolute vote counts (number of people who voted)
          if (newTotalVotes) {
            const absoluteCounts = results.map(percentage => 
              Math.round((parseFloat(percentage) / 100) * newTotalVotes)
            );
            setVoteCountsAbsolute(absoluteCounts);
          }
        } else if (hasFinalResults) {
          // We already have final results saved, no need to update
          console.log('Ignoring result update as we have final results');
        } else {
          // Poll just ended, save final results
          console.log('Saving final results:', results);
          setFinalVoteCounts(results.map(r => parseFloat(r)));
          setFinalTotalVotes(newTotalVotes);
          
          if (newTotalVotes) {
            const absoluteCounts = results.map(percentage => 
              Math.round((parseFloat(percentage) / 100) * newTotalVotes)
            );
            setFinalVoteCountsAbsolute(absoluteCounts);
          }
          
          setHasFinalResults(true);
        }
      } else {
        console.log('No results or empty results received');
      }
      
      if (routes) {
        console.log('Updated routes from results:', routes);
        // Only update poll options if we don't already have them from the encounter
        if (!pollOptions || pollOptions.length === 0) {
          setPollOptions(routes);
        }
      }
    });

    socket.on('poll started', () => {
      console.log('Socket received poll_started event');
      
      // Update our refs for consistent state tracking
      setIsPollRunning(true);
      setHasFinalResults(false);
      
      // Reset counter and final results when starting a new poll
      console.log('Resetting seconds counter to 0');
      setElapsedSeconds(0);
      setFinalVoteCounts([]);
      setFinalVoteCountsAbsolute([]);
      setFinalTotalVotes(0);
      
      // Request results immediately when poll starts
      requestResults();
    });

    socket.on('poll ended', () => {
      console.log('Socket received poll_ended event');
      
      // Save the current results as final results before they're cleared
      if (!hasFinalResults && voteCounts.length > 0) {
        console.log('Poll ended - saving final results');
        setFinalVoteCounts([...voteCounts]);
        setFinalVoteCountsAbsolute([...voteCountsAbsolute]);
        setFinalTotalVotes(totalVotes);
        setHasFinalResults(true);
      }
      
      // Set isPollRunning to false which will stop the timer in the useEffect
      setIsPollRunning(false);
      
      // Get final results once more
      socket.emit('request results');
    });

    // Fetch encounter data when encounter changes
    socket.on('TravelToID', (encounterId, gameId) => {
      // Ignore navigation events that are clearly for another game session
      if (gameId && currentGameId && gameId !== currentGameId) return;

      // Adopt the game ID if we have not yet stored one (late-joiner scenario)
      if (gameId && !currentGameId) {
        setCurrentGameId(gameId);
        setDebugInfo(prev => ({ ...prev, gameId }));
      }

      // Any TravelToID event implies a live presentation – flag it accordingly
      if (!isPresentationActive) {
        setIsPresentationActive(true);
      }

      setSelectedScenarioId(encounterId);
      fetchEncounterData(encounterId);
    });

    // Handle when poll data is cleared
    socket.on('poll data cleared', () => {
      console.log('Poll data cleared event received');
      // Set isPollRunning to false 
      setIsPollRunning(false);
    });

    // Fetch initial data
    fetchScenarios();

    // Cleanup on component unmount
    return () => {
      socket.off('user count');
      socket.off('update user list');
      socket.off('vote received');
      socket.off('results updated');
      socket.off('poll started');
      socket.off('poll ended');
      socket.off('TravelToID');
      socket.off('poll data cleared');
    };
  }, [isPollRunning, hasFinalResults, voteCounts, voteCountsAbsolute, totalVotes, pollOptions, currentGameId, isPresentationActive]);

  // Add timer effect for poll duration
  useEffect(() => {
    let timer = null;
    let refreshTimer = null;
    
    if (isPollRunning) {
      // Start the timer
      timer = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
      
      // Also start a timer to refresh results periodically
      refreshTimer = setInterval(() => {
        requestResults();
      }, 2000); // Request updated results every 2 seconds
    } else {
      // Reset the timer when poll is not running
      setElapsedSeconds(0);
    }
    
    // Clean up the timer on unmount or when poll status changes
    return () => {
      if (timer) clearInterval(timer);
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [isPollRunning]);

  // Add effect to recalculate longest path when encounter cache changes
  useEffect(() => {
    // If we have a current encounter and it's in the cache, recalculate the path
    if (currentEncounter && currentEncounter.ID && encounterCache[currentEncounter.ID]) {
      calculateLongestPath(currentEncounter.ID);
    }
  }, [encounterCache]);
  
  // Add effect to trigger prefetching when current encounter changes
  useEffect(() => {
    if (currentEncounter && currentEncounter.ID) {
      debugLog(`Current encounter changed to ${currentEncounter.ID}, starting deep prefetch`);
      // Since this is a new encounter, we want to prefetch all possible future paths
      prefetchFutureEncounters(currentEncounter.ID);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    socket.on('instruction broadcast', handleInstructionBroadcast);
    socket.on('instruction close', handleInstructionClose);

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
      socket.off('instruction broadcast', handleInstructionBroadcast);
      socket.off('instruction close', handleInstructionClose);
      socket.off('connect', handleReconnect);
    };
  }, []);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const fetchEncounterData = (encounterId) => {
    console.log(`// XOXO // [fetchEncounterData] Called. encounterId: ${encounterId}, EducatorPanel's currentGameId state: ${currentGameId}`);
    if (!encounterId) {
      setDisplayError('No encounter ID provided');
      console.log('// XOXO // [fetchEncounterData] Called with no encounterId.');
      return Promise.resolve(null); // Return a resolved promise
    }
    
    // debugLog(`[fetchEncounterData] Fetching for ID: ${encounterId}. Current Game ID: ${currentGameId}`); // Original debugLog
    // Only show loading on initial load, not for subsequent loads
    if (!currentEncounter) {
      setDisplayCommunicationStatus('loading');
    }
    
    return axios.get(`/encounters/GetEncounterData/${encounterId}`)
      .then(({ data }) => {
        setDisplayCommunicationStatus('connected');
        if (data && data.Encounter) {
          setCurrentEncounter(data.Encounter);
          
          // Get the EncounterRoutes from the response
          if (data.EncounterRoutes && Array.isArray(data.EncounterRoutes) && data.EncounterRoutes.length > 0) {
            debugLog('Found routes:', data.EncounterRoutes);
            setPollOptions(data.EncounterRoutes);
            
            // Reset vote counts when changing scenarios
            const newOptionsCount = data.EncounterRoutes.length;
            setVoteCounts(Array(newOptionsCount).fill(0));
            setVoteCountsAbsolute(Array(newOptionsCount).fill(0));
            setTotalVotes(0);
          } else {
            logError(`No routes found for encounter ID: ${encounterId}`);
            setPollOptions([]);
          }
          
          // Cache the encounter data
          setEncounterCache(prev => ({
            ...prev,
            [encounterId]: {
              encounter: data.Encounter,
              routes: data.EncounterRoutes || []
            }
          }));
          
          // Update game encounter data
          if (currentGameId) {
            updateGameEncounter(currentGameId, encounterId);
          }
          
          // Load the encounter in the display window if it's open
          console.log('// XOXO // [fetchEncounterData] Data fetched successfully, now calling loadEncounterInDisplay.');
          loadEncounterInDisplay(encounterId);

          // Prefetch data for encounters beyond the current one
          prefetchFutureEncounters(encounterId);

          return data; // Return data for chaining
        }
        return null;
      })
      .catch(error => {
        const errorMsg = `Error fetching encounter data: ${error.message}`;
        logError(errorMsg, error);
        setDisplayError(errorMsg);
        setDisplayCommunicationStatus('error');
        return null;
      });
  };

  // Function to pre-fetch data for future encounters to enable longest path calculation
  const prefetchFutureEncounters = async (encounterId, depth = 0, visited = new Set()) => {
    // Guard against cycles but do not artificially limit recursion depth here.
    // We want to fully explore the scenario tree so that the maximum depth
    // calculation reflects the actual structure of the selected scenario.
    // If required in the future, we can add a very high ceiling (e.g., > 50)
    // but typical scenarios are expected to be much shallower.
    if (visited.has(encounterId)) return;
    
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
  };

  // A silent version of fetchEncounterData that doesn't update UI state
  const fetchEncounterDataSilently = async (encounterId) => {
    try {
      debugLog(`Silently fetching data for encounter ${encounterId}`);
      const response = await axios.get(`/encounters/GetEncounterData/${encounterId}`);
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

  const loadEncounterInDisplay = (encounterId) => {
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
  };

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
        } else {
          console.error('Received non-array data for scenarios:', data);
          setScenarios([]); // Set empty array on invalid data
          setDisplayError('Received invalid scenario data.');
        }
      })
      .catch(error => {
        const errorMsg = `Error fetching scenarios: ${error.message}`;
        logError(errorMsg, error);
        setDisplayError(errorMsg);
        setDisplayCommunicationStatus('error');
        setScenarios([]); // Clear scenarios on error
      });
  }, [userSub, scenarios.length]); // Add userSub and scenarios.length as dependencies

  const handleScenarioChange = (e) => {
    try {
      const scenarioId = e.target.value;
      console.log(`// XOXO // [handleScenarioChange] Scenario selected via dropdown: ${scenarioId}. Presentation active: ${isPresentationActive}, Locked: ${scenarioLocked}. EducatorPanel's currentGameId state: ${currentGameId}`);

      // Prevent scenario switching once locked for this presentation
      if (scenarioLocked) {
        addToast('You cannot switch scenarios while a presentation is running. End the presentation first.', 'info');
        return;
      }
      if (!isPresentationActive) {
        addToast('You must start a presentation before selecting a scenario.', 'info');
        return;
      }
      debugLog(`Scenario selected: ${scenarioId}`);
      setSelectedScenarioId(scenarioId);
      setScenarioLocked(true); // lock for this presentation
      
      if (scenarioId) {
        // End any running poll when changing scenarios
        if (isPollRunning) {
          endPoll();
          // setIsPollRunning(false); // endPoll should handle this via socket event or directly
        }
        
        setFinalVoteCounts([]);
        setFinalVoteCountsAbsolute([]);
        setFinalTotalVotes(0);
        setHasFinalResults(false);
        setEncounterPath([scenarioId]);
        
        if (currentGameId) {
          updateGameEncounter(currentGameId, scenarioId);
        }
        
        socket.emit('TravelToID', scenarioId, currentGameId); // Notify other clients/server
        
        // Fetch encounter data, which will then call loadEncounterInDisplay
        fetchEncounterData(scenarioId);
      } else {
        // End any running poll
        if (isPollRunning) {
          endPoll();
          setIsPollRunning(false);
        }
        
        // Reset seconds counter
        setFinalVoteCounts([]);
        setFinalVoteCountsAbsolute([]);
        setFinalTotalVotes(0);
        setHasFinalResults(false);
        setEncounterPath([]);
        setLongestPath([]);
      }
    } catch (error) {
      const errorMsg = `Error in scenario change: ${error.message}`;
      logError(errorMsg, error);
      setDisplayError(errorMsg);
      setDisplayCommunicationStatus('error');
    }
  };

  const sendPoll = () => {
    if (!isPresentationActive) {
      addToast('You must start a presentation before sending a poll.', 'info');
      return;
    }
    if (!selectedScenarioId || !currentEncounter) {
      addToast('Please select a scenario first', 'info');
      return;
    }
    
    if (!pollOptions || pollOptions.length === 0) {
      addToast("This scenario doesn't have any poll options", 'info');
      return;
    }
    
    // Extract option titles from pollOptions
    const optionTitles = pollOptions.map(option => option.Title || 'Untitled Option');
    
    // Create updated quiz object
    const pollId = Date.now(); // Unique ID for this poll
    const updatedQuiz = {
      text: "", // Empty question - the educator will verbally provide context
      options: optionTitles,
      id: pollId,
      gameId: currentGameId
    };
    
    console.log('Sending quiz with ID:', pollId, 'and options:', optionTitles);
    
    // First, end any existing poll
    if (isPollRunning) {
      endPoll();
    }
    
    // Clear any poll-related state so stale results don't linger
    // First, instruct the server to end the poll (if one is still active) so that
    // student devices cleanly exit poll mode.
    socket.emit('end quiz');

    setVoteCounts([]);
    setVoteCountsAbsolute([]);
    setTotalVotes(0);
    setFinalVoteCounts([]);
    setFinalVoteCountsAbsolute([]);
    setFinalTotalVotes(0);
    setHasFinalResults(false);
    
    // Send the updated quiz to the server
    socket.emit('update quiz', updatedQuiz);
    
    // Send the quiz right away - server will handle the full process
    socket.emit('send quiz');
    
    // Request initial results after a short delay
    setTimeout(() => {
      console.log('Requesting initial results');
      socket.emit('request results');
    }, 500);
  };

  const endPoll = () => {
    console.log('Ending poll');
    
    // Tell the server to end the poll - it will handle all notifications
    socket.emit('end quiz');
    
    // Also update the state directly for immediate UI response
    setIsPollRunning(false);
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
      
      // Clear poll data while preserving the poll options
      // This ensures the previous poll results aren't shown in the new encounter
      setVoteCounts([]);
      setVoteCountsAbsolute([]);
      setTotalVotes(0);
      setFinalVoteCounts([]);
      setFinalVoteCountsAbsolute([]);
      setFinalTotalVotes(0);
      setHasFinalResults(false);
      
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

  // Function to request the latest results from the server
  const requestResults = () => {
    debugLog('Requesting poll results');
    socket.emit('request results');
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

  // Add function to find the longest possible path from the current encounter
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

  // Modify the breadcrumb trail rendering to use React.memo for stable rendering
  const BreadcrumbCircle = React.memo(({ item, index, onClick, disabled, title }) => {
    // Get the CSS classes based on the item's state
    const classNames = [
      'breadcrumb-circle',
      item.isCurrent ? 'active' : '',
      item.visited && !item.isCurrent ? 'visited' : '',
      item.unreachable ? 'unreachable' : '',
      !item.visited && !item.isCurrent && !item.unreachable ? 'future' : ''
    ].filter(Boolean).join(' ');

    return (
      <button
        className={classNames}
        onClick={onClick}
        disabled={disabled}
        title={title}
      >
        {index + 1}
      </button>
    );
  }, (prevProps, nextProps) => {
    // More granular comparison to avoid unnecessary rerenders
    // Only rerender if the status or interactivity changes
    const prevStatus = {
      isCurrent: prevProps.item.isCurrent,
      visited: prevProps.item.visited,
      unreachable: prevProps.item.unreachable
    };
    
    const nextStatus = {
      isCurrent: nextProps.item.isCurrent,
      visited: nextProps.item.visited,
      unreachable: nextProps.item.unreachable
    };
    
    // Check if visual status is the same
    const sameStatus = (
      prevStatus.isCurrent === nextStatus.isCurrent &&
      prevStatus.visited === nextStatus.visited &&
      prevStatus.unreachable === nextStatus.unreachable
    );
    
    // Check if interactivity is the same
    const sameInteractivity = prevProps.disabled === nextProps.disabled;
    
    // We can skip rendering if status and interactivity haven't changed
    return sameStatus && sameInteractivity;
  });

  const handleAwardXP = (userSub) => {
    // Prevent guest or unauthenticated users (no auth0 sub)
    if (!userSub || !userSub.includes('|') || userSub.toLowerCase().startsWith('guest')) {
      addToast('This user is not authenticated with an account – XP cannot be awarded.', 'error');
      return;
    }

    askForAmount('Enter XP amount to award (positive to add, negative to remove):', async (amount) => {
      if (isNaN(amount) || amount === 0) {
        addToast('Please enter a non-zero numeric value for XP.', 'error');
        return;
      }

      try {
        // Extract pure sub
        let pureSub = userSub;
        if (userSub.split('|').length > 2) {
          const parts = userSub.split('|');
          pureSub = `${parts[0]}|${parts[1]}`;
        }

        const { data } = await axios.get(`/user/by-sub/${encodeURIComponent(pureSub)}`);
        const userId = data?.id;
        if (!userId) {
          addToast('Unable to find user.', 'error');
          return;
        }

        const result = await awardXP(userId, amount);
        addToast(`Successfully updated XP. New total: ${result.xp_points}, Level: ${result.level}`, 'success');

        // Notify the recipient in real-time via socket
        socket.emit('xp awarded', {
          toSub: userSub,            // Full identifier used when the user registered
          amount,
          newXP: result.xp_points,
          level: result.level
        });
      } catch (err) {
        console.error('Error awarding XP:', err);
        addToast('Failed to award XP. Check console for details.', 'error');
      }
    });
  };

  const openBadgeModal = (userSub) => {
    if (!userSub || !userSub.includes('|') || userSub.toLowerCase().startsWith('guest')) {
      addToast('This user is not authenticated with an account – Badge cannot be awarded.', 'error');
      return;
    }
    // Ensure badges loaded
    if (badges.length === 0 && !loadingBadges) {
      fetchBadges();
    }
    setBadgeModal({ visible: true, userSub });
  };

  const awardBadgeToUser = async (userSub, badgeId) => {
    try {
      // Extract pure sub
      let pureSub = userSub;
      if (userSub && userSub.split('|').length > 2) {
        const parts = userSub.split('|');
        pureSub = `${parts[0]}|${parts[1]}`;
      }
      const { data } = await axios.get(`/user/by-sub/${encodeURIComponent(pureSub)}`);
      const userId = data?.id;
      if (!userId) {
        addToast('Unable to find user.', 'error');
        return;
      }
      await awardBadge(userId, badgeId);
      const badge = badges.find(b => b.ID === badgeId);
      addToast(`Successfully awarded badge: ${badge?.Title || 'Badge'}`, 'success');
      setBadgeModal({ visible: false, userSub: null });

      // Build reliable image URL (fallback to FileName path)
      const imageUrl = badge?.ImageURL || badge?.Image || (badge?.FileName ? `/images/uploads/badges/${badge.FileName}` : null);

      // Send real-time notification to the user
      socket.emit('badge awarded', {
        toSub: userSub,
        badgeId,
        title: badge?.Title,
        imageUrl,
        description: badge?.Description || ''
      });
    } catch (err) {
      console.error('Error awarding badge:', err);
      if (err.response && err.response.status === 409) {
        addToast('This user already has this badge.', 'info');
      } else {
        addToast('Failed to award badge. Check console for details.', 'error');
      }
    }
  };

  // Helper to start presentation
  const startPresentation = () => {
    if (!userSub) {
      addToast('You must be logged in to start a presentation.', 'error');
      return;
    }

    const newGameIdGenerated = createMultiplayerGame();
    console.log(`// XOXO // [startPresentation] Generated newGameId: ${newGameIdGenerated}. Calling setCurrentGameId with this ID.`);
    setCurrentGameId(newGameIdGenerated);
    setScenarioLocked(false);
    setIsPresentationActive(true); // Set active immediately

    // Reset UI states
    setEncounterCache({});
    setPollOptions([]);
    setVoteCounts([]); setVoteCountsAbsolute([]); setTotalVotes(0);
    setFinalVoteCounts([]); setFinalVoteCountsAbsolute([]); setFinalTotalVotes(0);
    setHasFinalResults(false);
    setBreadcrumbsLoading(false); // Reset this flag
    setSelectedScenarioId('');
    setCurrentEncounter(null);
    setEncounterPath([]);
    setLongestPath([]);
    setScenarioMaxDepth(null);

    socket.emit('start presentation', { gameId: newGameIdGenerated, hostSub: userSub });
    socket.emit('clear poll data'); // Clear any old poll data on server/clients

    // Open PresentationDisplayHost and tell it to show the welcome screen.
    // openNewDisplayWindow handles closing any existing window.
    openNewDisplayWindow(newGameIdGenerated, null, true); // null for initialEncounterId, true for isNewPresentationStart
    addToast('Presentation started! Display window opened.', 'success');
  };

  // NEW: Helper to end presentation gracefully and reset local UI immediately
  const endPresentation = () => {
    if (!currentGameId || !isPresentationActive) {
      addToast('No active presentation to end.', 'info');
      return;
    }

    setIsPresentationActive(false);
    setIsPollRunning(false);
    setScenarioLocked(false);

    socket.emit('end quiz'); // End any active server-side poll
    setVoteCounts([]); setVoteCountsAbsolute([]); setTotalVotes(0);
    setFinalVoteCounts([]); setFinalVoteCountsAbsolute([]); setFinalTotalVotes(0);
    setHasFinalResults(false);

    setSelectedScenarioId('');
    setCurrentEncounter(null);
    setPollOptions([]);
    setEncounterPath([]);
    setLongestPath([]);
    setScenarioMaxDepth(null);
    setBreadcrumbsLoading(true); // Set to true as there's no scenario to load breadcrumbs for

    socket.emit('presentation ended', { gameId: currentGameId });
    socket.emit('clear poll data');

    try {
      if (displayWindowRef.current && !displayWindowRef.current.closed) {
        const endMessage = {
          type: 'SHOW_END_SCREEN',
          hostSub: userSub, // userSub from auth0User.sub
          gameId: currentGameId,
          timestamp: Date.now()
        };
        console.log('// XOXO // [endPresentation] Posting SHOW_END_SCREEN to display host:', endMessage);
        displayWindowRef.current.postMessage(endMessage, window.location.origin);
        addToast('Presentation ended. Closing slide sent to display.', 'success');
      } else {
        addToast('Presentation ended. Display window was not open to show closing slide.', 'info');
      }
    } catch (err) {
      console.warn('[endPresentation] Could not send SHOW_END_SCREEN message:', err);
      logError('Error sending SHOW_END_SCREEN message', err);
      addToast('Error sending closing slide. See console.', 'error');
    }
    // Optionally clear currentGameId if desired, e.g., setCurrentGameId(null);
  };

  // Helper to derive display name from raw user identifier (e.g., "auth0|abc123|John Doe" -> "John Doe")
  const getDisplayName = useCallback((rawName) => {
    if (!rawName) return '';
    // If the server already supplies a display_name prop, prefer it
    if (typeof rawName === 'object' && rawName.display_name) return rawName.display_name;
    // Otherwise, parse pipe-delimited auth0 string
    if (rawName.includes('|')) {
      const parts = rawName.split('|');
      return parts[parts.length - 1] || rawName; // Last segment assumed to be display_name
    }
    return rawName;
  }, []);

  const getPureSub = useCallback((identifier) => {
    if (!identifier) return identifier;
    if (identifier.includes('|')) {
      const parts = identifier.split('|');
      // Auth0 sub is first two segments e.g. auth0|abc123
      if (parts.length >= 2) {
        return `${parts[0]}|${parts[1]}`;
      }
    }
    return identifier;
  }, []);

  // Map of unread counts per sender (excludes messages authored by educator)
  const unreadBySender = React.useMemo(() => {
    const map = {};
    if (!chatMessages || chatMessages.length === 0) return map;
    chatMessages.forEach(m => {
      const sender = m.senderSub || m.Sender_Sub;
      if (!sender || sender === authUser?.sub) return; // ignore self-authored
      const convId = m.conversationId;
      const tsRaw = m.sentAt || m.Sent_At || m.timestamp;
      const ts = tsRaw ? new Date(tsRaw).getTime() : Date.now();
      const viewedTs = (lastViewedByConv && convId) ? (lastViewedByConv[convId] || 0) : 0;
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

  // Load badges when component mounts
  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    try {
      setLoadingBadges(true);
      const response = await axios.get('badges/GetAllBadgesData');
      setBadges(response.data || []);
    } catch (error) {
      console.error('Error fetching badges:', error);
    } finally {
      setLoadingBadges(false);
    }
  };

  // ------------------------------
  // Bulk award helpers
  // ------------------------------

  const eligibleConnectedUsers = useCallback(() => {
    return (userList || []).filter(
      (u) => u.name && u.name.includes('|') && !u.name.toLowerCase().startsWith('guest')
    );
  }, [userList]);

  const handleAwardXPToAll = () => {
    const eligible = eligibleConnectedUsers();
    if (eligible.length === 0) {
      addToast('No authenticated users to award XP.', 'info');
      return;
    }

    askForAmount('Enter XP amount to award to all users (positive to add, negative to remove):', async (amount) => {
      if (isNaN(amount) || amount === 0) {
        addToast('Please enter a non-zero numeric value for XP.', 'error');
        return;
      }

      try {
        let successCount = 0;
        for (const u of eligible) {
          try {
            let pureSub = u.name;
            if (pureSub.split('|').length > 2) {
              const parts = pureSub.split('|');
              pureSub = `${parts[0]}|${parts[1]}`;
            }
            const { data } = await axios.get(`/user/by-sub/${encodeURIComponent(pureSub)}`);
            const userId = data?.id;
            if (!userId) continue;
            const xpRes = await awardXP(userId, amount);

            // Notify each recipient individually
            socket.emit('xp awarded', {
              toSub: u.name,         // full identifier string
              amount,
              newXP: xpRes?.xp_points,
              level: xpRes?.level
            });
            successCount += 1;
          } catch (err) {
            console.error('Failed to award XP to', u.name, err);
          }
        }
        addToast(`XP updated for ${successCount}/${eligible.length} users.`, successCount === eligible.length ? 'success' : 'info');
      } catch (err) {
        console.error('Bulk XP award error', err);
        addToast('Failed to award XP to all users. Check console for details.', 'error');
      }
    });
  };

  const openBadgeModalForAll = () => {
    if (badges.length === 0 && !loadingBadges) {
      fetchBadges();
    }
    setBadgeModal({ visible: true, userSub: 'ALL' });
  };

  const awardBadgeToAll = async (badgeId) => {
    try {
      const eligible = eligibleConnectedUsers();
      if (eligible.length === 0) {
        addToast('No authenticated users to award badges.', 'info');
        return;
      }

      let successCount = 0;
      for (const u of eligible) {
        try {
          let pureSub = u.name;
          if (pureSub.split('|').length > 2) {
            const parts = pureSub.split('|');
            pureSub = `${parts[0]}|${parts[1]}`;
          }
          const { data } = await axios.get(`/user/by-sub/${encodeURIComponent(pureSub)}`);
          const userId = data?.id;
          if (!userId) continue;
          await awardBadge(userId, badgeId);
          const badge = badges.find(b => b.ID === badgeId);
          addToast(`Successfully awarded badge: ${badge?.Title || 'Badge'}`, 'success');
          setBadgeModal({ visible: false, userSub: null });

          // Build reliable image URL (fallback to FileName path)
          const imageUrl = badge?.ImageURL || badge?.Image || (badge?.FileName ? `/images/uploads/badges/${badge.FileName}` : null);

          // Notify user about badge award in real-time
          socket.emit('badge awarded', {
            toSub: u.name,
            badgeId,
            title: badge?.Title,
            imageUrl,
            description: badge?.Description || ''
          });
          successCount += 1;
        } catch (_err) {
          console.error('Failed to award badge to', u.name, _err);
        }
      }

      const badgeObj = badges.find((b) => b.ID === badgeId);
      addToast(`Badge "${badgeObj?.Title || 'Badge'}" awarded to ${successCount}/${eligible.length} users.`, successCount === eligible.length ? 'success' : 'info');
      setBadgeModal({ visible: false, userSub: null });
    } catch (err) {
      console.error('Bulk badge award error', err);
      addToast('Failed to award badge to all users. Check console for details.', 'error');
    }
  };

  function askForAmount(message, onConfirmFn) {
    setInputModal({ open: true, message, onConfirm: (val) => {
      setInputModal({ open: false, message: '', onConfirm: null });
      onConfirmFn(parseInt(val, 10));
    } });
  }

  const fetchInstructions = async () => {
    try {
      setLoadingInstructions(true);
      const response = await axios.get('instructions/GetAllInstructionData');
      setInstructions(response.data || []);
    } catch (err) {
      console.error('Error fetching instructions:', err);
      addToast('Failed to load instructions', 'error');
    } finally {
      setLoadingInstructions(false);
    }
  };

  const openInstructionModal = () => {
    if (instructions.length === 0) {
      fetchInstructions();
    }
    setInstructionModal(true);
  };

  const broadcastInstruction = (instruction) => {
    if (!instruction) return;
    const payload = {
      id: instruction.ID,
      title: instruction.Title,
      description: instruction.Description,
      imageUrl: `/images/uploads/instructions/${instruction.FileName}`
    };
    socket.emit('instruction broadcast', payload);
    addToast('Instruction broadcast sent!', 'success');
    setInstructionModal(false);
    setActiveInstruction(instruction);
  };

  // Closes the currently active instruction for all clients
  const closeInstruction = () => {
    socket.emit('instruction close');
    addToast('Instruction closed.', 'info');
    setActiveInstruction(null);
  };

  // ------------------------------------------------------------------
  // Sync with an already-running presentation when panel first loads or
  // the socket reconnects.  This prevents accidental creation of a new
  // game session when an educator opens the panel on another device.
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

    const handlePresenterInfo = ({ gameId: infoGameId, isActive }) => {
      debugLog('EducatorPanel: presenter info received', { infoGameId, isActive });
      if (isActive && infoGameId) {
        setCurrentGameId(prev => prev || infoGameId);
        setIsPresentationActive(true);
      }
      // Mark that we have finished the initial presenter check
      setPresentationInfoChecked(true);
    };

    socket.on('presenter info', handlePresenterInfo);
    socket.on('connect', requestPresenterInfo);

    // Immediately ask on mount
    requestPresenterInfo();

    return () => {
      socket.off('presenter info', handlePresenterInfo);
      socket.off('connect', requestPresenterInfo);
    };
    // currentGameId intentionally omitted so the request runs only on mount/reconnect
  }, []);

  // ------------------------------------------------------------------
  // After checking for active presentation, only create a fresh game if
  // none exists AND no presentation is active. (Original effect kept.)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!presentationInfoChecked) return; // wait until we know

    if (!currentGameId && !isPresentationActive) {
      const newGameId = createMultiplayerGame();
      debugLog(`EducatorPanel: No active game found. Created new game ${newGameId}`);
      setCurrentGameId(newGameId);
    }
  }, [presentationInfoChecked, currentGameId, isPresentationActive]);

  // ------------------------------------------------------------------
  // Late-join sync: once we have a game ID but no current encounter yet,
  // ask the server which encounter is active so UI can catch up.
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

    const handleCurrentEncounter = ({ gameId: infoGameId, encounterId }) => {
      debugLog('EducatorPanel: current encounter response', { infoGameId, encounterId });
      if (infoGameId !== currentGameId) return;
      if (!encounterId) return; // nothing selected yet
      fetchEncounterData(encounterId);
    };

    socket.on('current encounter', handleCurrentEncounter);

    return () => socket.off('current encounter', handleCurrentEncounter);
  }, [currentGameId, currentEncounter]);

  return (
    <div className="educator-panel">
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
      
      { !embedded && (
        <TopHeader title="Viral Valor - Host Multiplayer">
          <MainNavTabs />
        </TopHeader>
      ) }

      {/* Combined control bar with white background */}
      <div className="scenario-controls" style={{padding:'0 15px'}}>
        <div className="visual-breadcrumb-trail" style={{display:'flex',alignItems:'center',gap:'1rem',width:'100%',margin:'15px 0 5px',padding:'0 10px',height:'60px',boxSizing:'border-box',justifyContent:'flex-start'}}>
          {/* Scenario selector (left) */}
          <div className="scenario-selector" style={{margin:0,marginRight:'10px',minWidth:'220px',flex:'0 0 auto'}}>
            <div className="control-item">
              <select 
                id="scenario-select" 
                value={selectedScenarioId || ''} 
                onChange={handleScenarioChange}
                disabled={!isPresentationActive || scenarioLocked}
                style={{
                  opacity: (!isPresentationActive || scenarioLocked) ? 0.5 : 1,
                  cursor: (!isPresentationActive || scenarioLocked) ? 'not-allowed' : 'pointer'
                }}
                title={
                  !isPresentationActive
                    ? 'Start a presentation to enable scenario selection.'
                    : scenarioLocked
                      ? 'Scenario locked while presentation is running.'
                      : undefined
                }
              >
                <option value="">-- Select a Scenario --</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.ID} value={scenario.ID}>
                    {scenario.Title || `Scenario #${scenario.ID}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Breadcrumb trail (center) */}
          <div style={{
            flex:1,
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            overflowX:'auto',
            minWidth:0,
            height:'auto', // Changed from fixed height to auto
            padding: '5px 0' // Added padding instead
          }}>
            {!breadcrumbsLoading && longestPath.length > 0 && (
              longestPath.map((item, index) => (
                <React.Fragment key={`breadcrumb-${item.id}`}>
                  {index > 0 && (
                    <div className="breadcrumb-arrow">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                  <BreadcrumbCircle
                    item={item}
                    index={index}
                    onClick={() => (item.visited && !item.isCurrent) ? navigateToBreadcrumb(item.id) : null}
                    disabled={!item.visited || item.isCurrent || item.unreachable}
                    title={
                      item.visited 
                        ? getEncounterTitle(item.id) || `Slide ${index + 1}` 
                        : item.unreachable 
                          ? 'Alternative path not available from current position' 
                          : 'Future encounter'
                    }
                  />
                </React.Fragment>
              ))
            )}
          </div>

          {/* Display button (right) */}
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
        <div className="poll-info-section">
          <div className="poll-time" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '32px'}}>
            <h3 style={{margin: 0}}>{isPollRunning 
              ? `Poll has been running for ${formatTime(elapsedSeconds)}`
              : 'No poll running'}
            </h3>
            {(hasFinalResults ? finalTotalVotes : totalVotes) > 0 && 
              <div className="total-votes" style={{marginLeft: 'auto', fontSize: '14px', whiteSpace: 'nowrap'}}>
                {hasFinalResults ? finalTotalVotes : totalVotes} votes 
                {totalUsers > 0 && ` (${Math.round((hasFinalResults ? finalTotalVotes : totalVotes) / totalUsers * 100)}% of users)`}
              </div>
            }
          </div>

          <div className="poll-options">
            {pollOptions && pollOptions.length > 0 ? (
              <div className="poll-options-compact-wrapper" style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                {pollOptions.map((option, index) => (
                  <React.Fragment key={index}>
                    <div className="poll-option-row" style={{display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px'}}>
                      <button 
                        className="btn poll-route-button"
                        onClick={() => navigateToRoute(option)}
                        disabled={!option.RelID_Encounter_Receiving || isPollRunning}
                        title={
                          isPollRunning ? "Cannot navigate while poll is active" :
                          option.RelID_Encounter_Receiving ? 
                          `Navigate to encounter #${option.RelID_Encounter_Receiving}` : 
                          "This route has no destination encounter"
                        }
                        style={{
                          minHeight: '25px',
                          width: '180px',
                          whiteSpace: 'normal',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0'
                        }}
                      >
                        {option.Title || `Option ${index + 1}`}
                      </button>
                      <div className="option-bar-container" style={{margin:'0'}}>
                        <div 
                          className="option-bar" 
                          style={{ 
                            height: '100%',
                            width: `${hasFinalResults ? 
                              (finalVoteCounts[index] || 0) : 
                              (voteCounts[index] || 0)}%` 
                          }}
                        />
                        <span className="vote-counts">
                          {hasFinalResults ? 
                            `${finalVoteCountsAbsolute[index] || 0} votes (${finalVoteCounts[index] || 0}%)` : 
                            `${voteCountsAbsolute[index] || 0} votes (${voteCounts[index] || 0}%)`}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p>No routes available for this scenario</p>
            )}
          </div>

          <div className="poll-controls">
            {/* Start / End Presentation Buttons */}
            {!isPresentationActive && (
              <button
                className="btn"
                onClick={startPresentation}
                disabled={isPollRunning}
                style={{
                  opacity: isPollRunning ? 0.5 : 1,
                  cursor: isPollRunning ? 'not-allowed' : 'pointer'
                }}
              >
                Start Presentation
              </button>
            )}

            {isPresentationActive && (
              <button
                className="btn"
                onClick={endPresentation}
                disabled={isPollRunning}
                style={{ 
                  opacity: isPollRunning ? 0.5 : 1,
                  cursor: isPollRunning ? 'not-allowed' : 'pointer'
                }}
              >
                End Presentation
              </button>
            )}

            {/* Broadcast / Close Instruction */}
            {activeInstruction ? (
              <button
                className="btn"
                onClick={closeInstruction}
                disabled={!isPresentationActive}
                title={!isPresentationActive ? 'Start a presentation to manage instructions.' : undefined}
                style={{
                  opacity: !isPresentationActive ? 0.5 : 1,
                  cursor: !isPresentationActive ? 'not-allowed' : 'pointer'
                }}
              >
                Close Instructions
              </button>
            ) : (
              <button
                className="btn"
                onClick={openInstructionModal}
                disabled={!isPresentationActive}
                title={!isPresentationActive ? 'Start a presentation to broadcast instructions.' : undefined}
                style={{
                  opacity: !isPresentationActive ? 0.5 : 1,
                  cursor: !isPresentationActive ? 'not-allowed' : 'pointer'
                }}
              >
                Broadcast Instruction
              </button>
            ) }

            {/* Send / End Poll */}
            <button
              className="btn"
              onClick={isPollRunning ? endPoll : sendPoll}
              disabled={isPollRunning ? false : !(pollOptions && pollOptions.length > 0) || !isPresentationActive}
              title={!isPresentationActive ? 'Start a presentation to send polls.' : undefined}
            >
              {isPollRunning ? 'End Poll' : 'Send Poll'}
            </button>
          </div>
        </div>

        <div className="user-info-section">
          <div className="total-users" style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}>
            <h3 style={{margin:0}}>Connected Users: {totalUsers}</h3>
            <div className="bulk-award-controls" style={{display:'flex',gap:'8px'}}>
              <button className="btn btn-small" onClick={handleAwardXPToAll} disabled={totalUsers === 0}>XP to All</button>
              <button className="btn btn-small" onClick={openBadgeModalForAll} disabled={totalUsers === 0 || loadingBadges}>Badge to All</button>
            </div>
          </div>

          <div className="user-list">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Messages</th>
                  <th>Polls Voted</th>
                  <th>Current Selection</th>
                  <th>Awards</th>
                </tr>
              </thead>
              <tbody>
                {userList.map((user, index) => {
                  const pureSub = getPureSub(user.name);
                  const unreadCount = unreadBySender[pureSub] || 0;
                  const displayName = user.display_name || getDisplayName(user.name);
                  // Determine authentication status – authenticated users have an Auth0 sub (pipe-delimited)
                  const isAuthenticated = user.name && user.name.includes('|') && !user.name.toLowerCase().startsWith('guest');
                  const isGuest = !isAuthenticated;

                  return (
                    <tr key={index}>
                      <td>
                        {/* Keep chat button and username logic, but render directly in td */}
                        {(() => {
                          const isGuest = (displayName || '').toLowerCase().startsWith('guest');
                          const pureSub = getPureSub(user.name);
                          const unreadCount = unreadBySender[pureSub] || 0;
                          const hasUnread = unreadCount > 0;
                          
                          return (
                            <span className={`username ${isGuest ? 'guest-user' : ''}`}>
                              {displayName}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        {/* Only show messaging button for authenticated users */}
                        {isAuthenticated && (
                          <button 
                            className="message-cell-wrapper message-bubble-btn" 
                            onClick={() => openChatWithUser(user.name)}
                            title={unreadCount > 0 ? `${unreadCount} unread messages` : 'Chat with user'}
                            style={{background:'none',border:'none',padding:0}}
                          >
                            <img src="/images/ChatVirus.png" alt="Chat" className="chat-icon-small" />
                            {unreadCount > 0 && (
                              <span className="unread-message-count">{unreadCount}</span>
                            )}
                          </button>
                        )}
                      </td>
                      <td>{user.pollsVoted || 0}</td>
                      <td>{user.selection || 'None'}</td>
                      <td>
                        {/* Only show award buttons for authenticated users */}
                        {isAuthenticated ? (
                          <>
                            <button 
                              className="btn btn-small"
                              onClick={() => handleAwardXP(user.name)}
                              title="Award XP to this user"
                            >
                              XP
                            </button>
                            <button 
                              className="btn btn-small"
                              onClick={() => openBadgeModal(user.name)}
                              disabled={loadingBadges}
                              title={loadingBadges ? 'Loading badges...' : 'Award badge to this user'}
                            >
                              Badge
                            </button>
                          </>
                        ) : (
                          <span style={{color: '#888', fontStyle: 'italic'}}>Guest user</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="encounter-preview-section" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'250px',textAlign:'center'}}>
          {isPresentationActive ? (
            currentEncounter ? (
              <EncounterThumbnail encounter={currentEncounter} />
            ) : (
              <p style={{color:'#b03a2e',fontSize:'1.4rem',fontWeight:'600',lineHeight:'1.4',maxWidth:'280px',margin:'0 auto'}}>
                Please select a scenario from the dropdown menu above to load content for your presentation.
              </p>
            )
          ) : (
            <p style={{color:'#b03a2e',fontSize:'1.4rem',fontWeight:'600',lineHeight:'1.4',maxWidth:'280px',margin:'0 auto'}}>Start the presentation to display the QR code, allow students to join, and enable hosting controls.</p>
          )}
        </div>
      </div>

      {badgeModal.visible && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setBadgeModal({ visible: false, userSub: null })}>
          <div className="badge-modal" onClick={e => e.stopPropagation()}>
            <h3>Select a Badge to Award</h3>
            {loadingBadges ? (
              <p>Loading badges...</p>
            ) : (
              <div className="badge-grid">
                {badges.map(badge => (
                  <div key={badge.ID} className="badge-item" onClick={() => (badgeModal.userSub === 'ALL' ? awardBadgeToAll(badge.ID) : awardBadgeToUser(badgeModal.userSub, badge.ID))}>
                    <img src={`/images/uploads/badges/${badge.FileName}`} alt={badge.Title} />
                    <span>{badge.Title}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn" style={{marginTop:'10px'}} onClick={() => setBadgeModal({ visible: false, userSub: null })}>Cancel</button>
          </div>
        </div>, document.body)}

      {/* Numeric input modal for XP */}
      {ReactDOM.createPortal(
        <InputModal
          open={inputModal.open}
          message={inputModal.message}
          onConfirm={inputModal.onConfirm}
          onCancel={() => setInputModal({ open: false, message: '', onConfirm: null })}
        />,
        document.body
      )}

      {instructionModal && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setInstructionModal(false)}>
          <div className="badge-modal" onClick={e => e.stopPropagation()}>
            <h3>Select an Instruction to Broadcast</h3>
            {loadingInstructions ? (
              <p>Loading instructions...</p>
            ) : (
              <div className="badge-grid">
                {instructions.map(instr => (
                  <div key={instr.ID} className="badge-item" onClick={() => broadcastInstruction(instr)}>
                    <img src={`/images/uploads/instructions/${instr.FileName}`} alt={instr.Title} />
                    <span>{instr.Title}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn" style={{marginTop:'10px'}} onClick={() => setInstructionModal(false)}>Cancel</button>
          </div>
        </div>, document.body)}
    </div>
  );
};

export default EducatorPanel; 