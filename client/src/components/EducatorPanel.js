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
import PresentationControls from './EducatorPanel/PresentationControls'; // ADDED PresentationControls
import useUserManagement from '../hooks/useUserManagement';
import useEducatorPolls from '../hooks/useEducatorPolls'; // Import the new hook
import useScenarioManager from '../hooks/useScenarioManager'; // ADDED: Import the useScenarioManager hook
import usePresentationManager from '../hooks/usePresentationManager'; // ADDED: Import the usePresentationManager hook
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
  
  // --- OPTIONAL: Send a FORCE_RESET only if explicitly requested (disabled by default) ---
  const SEND_FORCE_RESET = false; // Toggle this flag for debugging only

  const sendLoadMessage = () => {
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
  };

  try {
    if (SEND_FORCE_RESET && displayWindow && !displayWindow.closed) {
      const resetMessage = { type: 'FORCE_RESET', timestamp: Date.now() };
      sendMessageToWindow(displayWindow, resetMessage);
      debugLog('Sent force reset before transition');
      // Delay sending LOAD_ENCOUNTER slightly to allow reset to process
      setTimeout(sendLoadMessage, 100);
    } else {
      // Directly send LOAD_ENCOUNTER without FORCE_RESET
      sendLoadMessage();
    }
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
  // const [scenarios, setScenarios] = useState([]); // REMOVED: Handled by useScenarioManager
  // const [selectedScenarioId, setSelectedScenarioId] = useState(''); // REMOVED: Handled by useScenarioManager
  // const [currentEncounter, setCurrentEncounter] = useState(null); // REMOVED: Handled by useScenarioManager
  // const [encounterPath, setEncounterPath] = useState([]); // REMOVED: Handled by useScenarioManager
  // const [encounterCache, setEncounterCache] = useState({}); // REMOVED: Handled by useScenarioManager
  // const [breadcrumbsLoading, setBreadcrumbsLoading] = useState(false); // REMOVED: Handled by useScenarioManager
  // const [longestPath, setLongestPath] = useState([]); // REMOVED: Handled by useScenarioManager
  // const [allPaths, setAllPaths] = useState([]); // REMOVED: Handled by useScenarioManager
  // const [scenarioMaxDepth, setScenarioMaxDepth] = useState(0); // REMOVED: Handled by useScenarioManager

  const [educatorPanelCurrentGameId, setEducatorPanelCurrentGameId] = useState(null); // Renamed to avoid conflict, will sync with hook
  // const [isPresentationActive, setIsPresentationActive] = useState(false); // REMOVED: Handled by usePresentationManager
  const { addToast } = useToast();
  const { user } = useAuth0(); // Get user from Auth0
  const [displayError, setDisplayError] = useState(null); // ADDED for error toast
  const [debugInfo, setDebugInfo] = useState({ // ADDED for debug panel
    displayWindowStatus: 'Not initialized',
    lastCommunicationStatus: 'none',
    communicationMethods: [],
    transitions: 0,
    lastEncounterId: 'none',
    isConnected: false,
  });
  const [displayCommunicationStatus, setDisplayCommunicationStatus] = useState('N/A'); // ADDED for debug panel
  const [selectedUserForBadge, setSelectedUserForBadge] = useState(null); // ADDED for user management

  // ====== NEW: Display window refs/state NEED to be declared BEFORE passing openDisplayWindow to hooks ======
  const displayWindowRef = useRef(null);
  const [displayWindowUniqueId, setDisplayWindowUniqueId] = useState(null); // To track the specific window instance
  // Track the last encounter ID that was successfully dispatched to the display window. This helps
  // prevent sending identical LOAD_ENCOUNTER messages repeatedly (which resulted in the display
  // bouncing between "Loading" and "Encounter not available" states when the same encounter object
  // was re-set after every scenario manager update).
  const lastDisplayEncounterIdRef = useRef(null);

  // Define openDisplayWindow BEFORE it is passed into usePresentationManager to avoid TDZ errors
  const openDisplayWindow = useCallback(() => {
    debugLog('Attempting to open display window...');

    // Check if the window already exists and is open
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      debugLog('Existing display window found and open. Focusing it.');
      displayWindowRef.current.focus();
      // The navigation will be handled by the calling function (startPresentation)
      // to ensure it has the correct encounter and gameId.
      addToast('Reusing existing display window.', 'info');
      return true; 
    }

    // If not, open a new one
    debugLog('No existing open window, or window was closed. Opening a new one.');
    const uniqueId = uuidv4();
    const displayPath = '/presentation-display';
    const newWindow = window.open(
      displayPath,
      `EncounterDisplay_${uniqueId}`,
      'width=1024,height=768,resizable=yes,scrollbars=yes'
    );

    if (newWindow) {
      displayWindowRef.current = newWindow;
      debugLog(`[EducatorPanel.openDisplayWindow] displayWindowRef.current set. Is it closed? ${displayWindowRef.current.closed}`);
      setDisplayWindowUniqueId(uniqueId);
      addToast('Display window opened.', 'success');
      return true;
    }

    addToast('Failed to open display window. Check popup blocker.', 'error');
    logError('Failed to open display window');
    return false;
  }, [addToast, setDisplayWindowUniqueId]);
  // ====== END NEW BLOCK ======

  // Instantiate the useEducatorPolls hook
  const {
    isPollRunning: hookIsPollRunning,
    pollOptions: hookPollOptions,
    voteCounts: hookVoteCounts,
    voteCountsAbsolute: hookVoteCountsAbsolute,
    finalVoteCounts: hookFinalVoteCounts,
    elapsedSeconds: hookElapsedSeconds,
    totalVotes: hookTotalVotes,
    hasFinalResults: hookHasFinalResults,
    sendPoll: hookSendPoll,
    endPoll: hookEndPoll,
    clearPollData: clearPollDataFromHook,
    sendEncounterState: hookSendEncounterState,
    finalTotalVotes: hookFinalTotalVotes, // ADDED
    finalVoteCountsAbsolute: hookFinalVoteCountsAbsolute, // ADDED
    setExternalPollOptions: hookSetPollOptions,
  } = useEducatorPolls(
    educatorPanelCurrentGameId,      // gameId - Will be synced from usePresentationManager
    user?.sub,          // userSub
    addToast,           // addToast
    DEBUG_MODE,         // debugMode
    EMPTY_INITIAL_POLL_OPTIONS // initialPollOptions
  );

  // Instantiate the useUserManagement hook
  const {
    userList,
    totalUsers,
    badges,
    loadingBadges,
    fetchBadges: fetchBadgesFromHook,
    openAwardXPModal: openAwardXPModalFromHook,
    openAwardXPToAllModal: openAwardXPToAllModalFromHook,
    openBadgeAwardModal: openBadgeAwardModalFromHook,
    awardBadge: awardBadgeFromHook,
    isBadgeModalOpen: isBadgeModalOpenFromHook,
    setIsBadgeModalOpen: setIsBadgeModalOpenFromHook,
    selectedUserForBadge: selectedUserForBadgeFromHook,
    isInputModalOpen: isInputModalOpenFromHook,
    setIsInputModalOpen: setIsInputModalOpenFromHook,
    inputModalConfig: inputModalConfigFromHook,
  } = useUserManagement(socket, user?.sub, educatorPanelCurrentGameId, addToast, DEBUG_MODE); // Pass gameId

  // INSTANTIATE THE useScenarioManager HOOK
  const {
    scenarios, 
    selectedScenarioId, 
    currentEncounter, 
    encounterPath, 
    breadcrumbsLoading, 
    longestPath, 
    actions: scenarioActions, 
  } = useScenarioManager(
    undefined, // initialScenarioId
    undefined, // initialEncounterId
    educatorPanelCurrentGameId // Pass gameId
  );

  // Instantiate the usePresentationManager hook
  const {
    isPresentationActive,
    currentGameId: presentationManagerGameId, // Get gameId from the hook
    presentationStartTime,
    startPresentation: hookStartPresentation,
    endPresentation: hookEndPresentation,
    setCurrentGameId: hookSetCurrentGameId, // To set gameId from EducatorPanel if needed
  } = usePresentationManager(
    educatorPanelCurrentGameId, // Initial gameId
    openDisplayWindow, // Pass openDisplayWindow directly
    addToast,
    currentEncounter // Pass currentEncounter from useScenarioManager
  );

  // Sync educatorPanelCurrentGameId with presentationManagerGameId
  useEffect(() => {
    if (presentationManagerGameId !== educatorPanelCurrentGameId) {
      setEducatorPanelCurrentGameId(presentationManagerGameId);
    }
  }, [presentationManagerGameId, educatorPanelCurrentGameId]);

  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();

  const [debugPanelVisible, setDebugPanelVisible] = useState(DEBUG_MODE); // Start with debug mode
  const [errorsToShow, setErrorsToShow] = useState([]);

  // Refs for functions that might be called from effects or other components
  // const fetchEncounterDataRef = useRef(); // REMOVED as no longer used
  // const prefetchFutureEncountersRef = useRef(); // REMOVED as no longer used

  const { openChatWindow } = useChat();
  const [unreadBySender, setUnreadBySender] = useState({});

  const [liveInstruction, setLiveInstruction] = useState(null); // For live instruction text
  const [showInstructionInput, setShowInstructionInput] = useState(false);
  const [currentInstructionText, setCurrentInstructionText] = useState('');
  const [instructionRecipient, setInstructionRecipient] = useState('all'); // 'all' or user ID
  const [sentInstructions, setSentInstructions] = useState([]); // Track sent instructions

  const [activeLeftTab, setActiveLeftTab] = useState('Instructions');

  // Define navigateToRoute
  const navigateToRoute = useCallback((routeOrPath) => {
    // If a string path provided, navigate directly.
    if (typeof routeOrPath === 'string') {
      debugLog(`Navigating to route path: ${routeOrPath}`);
      navigate(routeOrPath);
      return;
    }

    // If an object with RelID_Encounter_Receiving, navigate via scenarioActions
    if (routeOrPath && routeOrPath.RelID_Encounter_Receiving) {
      const destId = routeOrPath.RelID_Encounter_Receiving;
      debugLog(`Navigating to encounter via route. Destination encounter ID: ${destId}`);
      if (scenarioActions && scenarioActions.navigateToEncounter) {
        scenarioActions.navigateToEncounter(destId);
      }
      return;
    }

    debugLog('navigateToRoute called with unsupported argument:', routeOrPath);
  }, [navigate, scenarioActions]);

  // Effect: when currentEncounter changes, update poll options based on its routes
  useEffect(() => {
    if (!currentEncounter || !hookSetPollOptions) return;

    const routesRaw = currentEncounter.routes || currentEncounter.EncounterRoutes || [];
    const mappedOptions = routesRaw.map((r, idx) => ({
      ID: r.ID || r.RelID_Encounter_Receiving || idx,
      Title: r.Title || `Option ${idx + 1}`,
      RelID_Encounter_Receiving: r.RelID_Encounter_Receiving,
      ...r,
    }));

    hookSetPollOptions(mappedOptions);
  }, [currentEncounter, hookSetPollOptions]);

  // Debug panel functions
  const toggleDisplayDebug = useCallback(() => {
    debugLog('Toggling display debug information.');
    // This function would typically send a message to the display window
    // to toggle its own debug overlay.
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      sendMessageToWindow(displayWindowRef.current, { type: 'TOGGLE_DEBUG' });
    } else {
      addToast('Display window not open.', 'warn');
    }
  }, []);

  const forceReloadDisplay = useCallback(() => {
    debugLog('Forcing reload of display window.');
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      displayWindowRef.current.location.reload();
    } else {
      addToast('Display window not open.', 'warn');
    }
  }, []);

  const forceResetDisplayWindow = useCallback(() => {
    debugLog('Forcing reset of display window state.');
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      sendMessageToWindow(displayWindowRef.current, { type: 'FORCE_RESET' });
      // Also clear local state related to the display if necessary
    } else {
      addToast('Display window not open.', 'warn');
    }
  }, []);

  const setShowDebug = useCallback((show) => {
    setDebugPanelVisible(show);
  }, []);
  
  const openChatWithUser = useCallback((userId, userName) => {
    debugLog(`Opening chat with user: ${userId} (${userName})`);
    // Implementation for opening chat with a specific user
    // This might involve setting some state or calling a function from useChat
    openChatWindow(userId, userName); // Assuming openChatWindow from useChat takes userId and userName
    setUnreadBySender(prev => ({ ...prev, [userId]: 0 })); // Clear unread count for this user
  }, [openChatWindow]);

  // STUBBED EVENT HANDLERS for useEffect
  const handleEncounterUpdate = useCallback((data) => { debugLog('handleEncounterUpdate called with data:', data); }, []);
  const handleUserUpdate = useCallback((data) => { debugLog('handleUserUpdate called with data:', data); }, []);
  const handleUserXPUpdate = useCallback((data) => { debugLog('handleUserXPUpdate called with data:', data); }, []);
  const handleBadgeAwarded = useCallback((data) => { debugLog('handleBadgeAwarded called with data:', data); }, []);
  const handlePollStatus = useCallback((data) => { debugLog('handlePollStatus called with data:', data); }, []);
  const handlePollResults = useCallback((data) => { debugLog('handlePollResults called with data:', data); }, []);
  const handlePollEnded = useCallback((data) => { debugLog('handlePollEnded called with data:', data); }, []);
  const handleInstructionBroadcast = useCallback((data) => { debugLog('handleInstructionBroadcast called with data:', data); }, []);
  const handleInstructionClose = useCallback((data) => { debugLog('handleInstructionClose called with data:', data); }, []);
  const handleNewChatMessage = useCallback((data) => { debugLog('handleNewChatMessage called with data:', data); }, []);
  const handleChatHistory = useCallback((data) => { debugLog('handleChatHistory called with data:', data); }, []);
  const handleUserTyping = useCallback((data) => { debugLog('handleUserTyping called with data:', data); }, []);
  const handleUserStoppedTyping = useCallback((data) => { debugLog('handleUserStoppedTyping called with data:', data); }, []);
  const handleChatError = useCallback((data) => { debugLog('handleChatError called with data:', data); }, []);
  const handleReconnect = useCallback(() => { debugLog('handleReconnect called'); }, []);

  useEffect(() => {
    if (!socket) return;

    // Removed handlePresentationStarted, handlePresentationEnded from dependencies as they are handled by the hook
    // socket.on('presentationStarted', handlePresentationStarted);
    // socket.on('presentationEnded', handlePresentationEnded);

    // Keep other socket event listeners that are not part of usePresentationManager
    // For example:
    // socket.on('encounterUpdate', handleEncounterUpdate);
    // socket.on('userUpdate', handleUserUpdate);
    // ... etc.

    return () => {
      // socket.off('presentationStarted', handlePresentationStarted);
      // socket.off('presentationEnded', handlePresentationEnded);
      // ... other socket.off calls
    };
  }, [socket, user, isAuthenticated, educatorPanelCurrentGameId /* other dependencies if any */]); // educatorPanelCurrentGameId might still be needed for other effects or listeners

  // Effect to load encounter in display window when currentEncounter changes
  useEffect(() => {
    debugLog('[useEffect currentEncounter] Fired. Evaluating whether to dispatch LOAD_ENCOUNTER to display.');
    // Safely derive the encounterId from the structure returned by useScenarioManager
    const encounterIdDerived = currentEncounter
      ? currentEncounter.ID || currentEncounter.id || (currentEncounter.Encounter && (currentEncounter.Encounter.ID || currentEncounter.Encounter.id))
      : null;

    debugLog(`[useEffect currentEncounter] Derived encounterId = ${encounterIdDerived}, presentationActive=${isPresentationActive}, gameId=${educatorPanelCurrentGameId}`);
    debugLog(`[useEffect currentEncounter] displayWindow exists = ${displayWindowRef.current && !displayWindowRef.current.closed}, lastDisplayEncounterId = ${lastDisplayEncounterIdRef.current}`);

    // Avoid sending duplicate LOAD_ENCOUNTER messages for the same encounter ID.
    if (
      encounterIdDerived &&
      isPresentationActive &&
      educatorPanelCurrentGameId &&
      displayWindowRef.current &&
      !displayWindowRef.current.closed &&
      encounterIdDerived !== lastDisplayEncounterIdRef.current // NEW GUARD
    ) {
      debugLog(`[useEffect currentEncounter] Conditions met. Dispatching encounter ${encounterIdDerived} to display.`);
      debugLog('EducatorPanel: Dispatching encounter to display window:', encounterIdDerived);
      loadEncounterInDisplay(encounterIdDerived, educatorPanelCurrentGameId, displayWindowRef.current);
      lastDisplayEncounterIdRef.current = encounterIdDerived; // Update the tracker
    } else if (!currentEncounter && isPresentationActive && educatorPanelCurrentGameId) { // Added educatorPanelCurrentGameId condition
      debugLog('EducatorPanel: currentEncounter is null but presentation active. Displaying "Select a scenario".');
      if (displayWindowRef.current && !displayWindowRef.current.closed) { // Check display window ref
          sendMessageToWindow(displayWindowRef.current, { type: 'SHOW_MESSAGE', message: 'Select a scenario to begin.' });
      }
    }
  }, [currentEncounter, isPresentationActive, educatorPanelCurrentGameId, displayWindowRef]); // displayWindowRef is a ref, no need in deps if its .current is used

  // Reset the tracker when the presentation session ends or the display window gets closed.
  useEffect(() => {
    if (!isPresentationActive) {
      lastDisplayEncounterIdRef.current = null;
    }

    // If the display window was manually closed by the user, also clear the last sent ID so that
    // reopening the window will trigger the first LOAD_ENCOUNTER again.
    const interval = setInterval(() => {
      if (displayWindowRef.current && displayWindowRef.current.closed && lastDisplayEncounterIdRef.current) {
        lastDisplayEncounterIdRef.current = null;
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isPresentationActive]);

  // Function to load encounter in the display window
  // This function stays in EducatorPanel as it directly interacts with displayWindowRef and postMessage
  const loadEncounterInDisplay = (encounterId, gameId, targetWindow) => {
    debugLog(`[loadEncounterInDisplay] Called with encounterId=${encounterId}, gameId=${gameId}, targetWindowExists=${!!targetWindow && !targetWindow.closed}`);
    if (!targetWindow || targetWindow.closed) {
      debugLog('loadEncounterInDisplay: Target window is not available.');
      return false;
    }
    debugLog(`[loadEncounterInDisplay] Triggering encounter transition now.`);
    debugLog(`loadEncounterInDisplay: Loading encounter ${encounterId} for game ${gameId}`);
    
    triggerEncounterTransition(encounterId, gameId, targetWindow); // Use the robust transition trigger
    debugLog(`[loadEncounterInDisplay] triggerEncounterTransition dispatched.`);
    return true;
  };
  
  // Assign to ref for potential external calls if any (though direct calls should be rare)
  // fetchEncounterDataRef.current = fetchEncounterData; // REMOVED: fetchEncounterData is now part of scenarioActions

  // Original fetchScenarios REMOVED (handled by hook)
  // const fetchScenarios = async () => { ... };

  // Original handleScenarioChange REMOVED (use scenarioActions.setSelectedScenarioId)
  // const handleScenarioChange = (e) => { ... };

  // Original fetchEncounterData REMOVED (use scenarioActions.fetchEncounterData)
  // const fetchEncounterData = useCallback(async (encounterId, silent = false, forceRefresh = false) => { ... }, [encounterCache, ...]);
  
  // Original calculateLongestPath REMOVED (handled by hook)
  // const calculateLongestPath = (currentEncounterId) => { ... };
  // calculateLongestPathRef.current = calculateLongestPath; // REMOVED

  // Original prefetchFutureEncounters REMOVED (handled by hook)
  // const prefetchFutureEncounters = useCallback(async (currentEncId) => { ... }, [fetchEncounterDataSilently, encounterCache, currentEncounter, scenarios, selectedScenarioId]);
  // prefetchFutureEncountersRef.current = prefetchFutureEncounters; // REMOVED

  // Original navigateToBreadcrumb REMOVED (use scenarioActions.navigateToBreadcrumb)
  // const navigateToBreadcrumb = (encounterId) => { ... };

  // getEncounterTitle might still be useful if not provided by the hook, or if hook's encounter data is minimal
  const getEncounterTitle = (encounterId) => {
    if (currentEncounter && currentEncounter.id === encounterId && currentEncounter.title) {
      return currentEncounter.title;
    }
    if (scenarioActions.getEncounterFromCache) { // Assuming hook exposes a way to get from cache
        const cachedEncounter = scenarioActions.getEncounterFromCache(encounterId);
        if (cachedEncounter && cachedEncounter.title) return cachedEncounter.title;
    }
    for (const scenario of scenarios) {
      if (scenario.encounters) { // If scenarios have full encounter lists (old structure)
        const encounter = scenario.encounters.find(e => e.id === encounterId);
        if (encounter) return encounter.title || `Encounter ${encounterId}`;
      }
    }
    return `Encounter ${encounterId}`; // Default if not found
  };

  const renderConnectionStatus = useCallback(() => {
    // Placeholder for connection status UI
    // You might want to get socket connection status from useSocket or similar
    return <div className="connection-status">Connection: Connected (Placeholder)</div>;
  }, []);

  // ... other functions like startPresentation, endPresentation, etc. ...

  // In the JSX:
  // ...
  // Pass relevant props to ScenarioExplorer
  // <ScenarioExplorer scenarios={scenarios} selectedScenarioId={selectedScenarioId} onChange={handleScenarioChange} />
  // Becomes:
  // <ScenarioExplorer scenarios={scenarios} selectedScenarioId={selectedScenarioId} onChange={(scenarioId) => scenarioActions.setSelectedScenarioId(scenarioId)} />
  //
  // Pass relevant props to BreadcrumbTrail
  // <BreadcrumbTrail encounterPath={encounterPath} longestPath={longestPath} currentEncounter={currentEncounter} navigateToBreadcrumb={navigateToBreadcrumb} getEncounterTitle={getEncounterTitle} loading={breadcrumbsLoading} />
  // Becomes:
  // <BreadcrumbTrail encounterPath={encounterPath} longestPath={longestPath} currentEncounter={currentEncounter} navigateToBreadcrumb={scenarioActions.navigateToBreadcrumb} getEncounterTitle={getEncounterTitle} loading={breadcrumbsLoading} />
  //
  // Pass relevant props to PreviewPane
  // <PreviewPane currentEncounter={currentEncounter} isPresentationActive={isPresentationActive} />
  // Becomes:
  // <PreviewPane currentEncounter={currentEncounter} isPresentationActive={isPresentationActive} /> // No change if props were already correct

  // ... existing code ...

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
      {debugPanelVisible && (
        <div className="debug-panel">
          <h3>Educator Panel Debug (Ctrl+Shift+D)</h3>
          <p><strong>Display Window:</strong> {debugInfo.displayWindowStatus}</p>
          <p><strong>Last Communication:</strong> {debugInfo.lastCommunicationStatus || 'none'}</p>
          <p><strong>Communication Methods:</strong> {debugInfo.communicationMethods.join(', ') || 'none'}</p>
          <p><strong>Transitions:</strong> {debugInfo.transitions}</p>
          <p><strong>Last Encounter ID:</strong> {debugInfo.lastEncounterId || 'none'}</p>
          <p><strong>Game ID:</strong> {presentationManagerGameId || 'none'}</p> {/* Use gameId from hook */}
          <p><strong>Socket Connected:</strong> {debugInfo.isConnected ? 'YES' : 'NO'}</p>
          <p><strong>Communication Status:</strong> {displayCommunicationStatus}</p>
          
          <div className="debug-controls">
            <button onClick={toggleDisplayDebug}>Toggle Display Debug</button>
            <button onClick={forceReloadDisplay}>Force Reload Display</button>
            <button onClick={forceResetDisplayWindow}>Force Reset Display State</button>
            <button onClick={() => setDebugPanelVisible(false)}>Hide Debug</button>
          </div>
        </div>
      )}
      
      <div className="scenario-controls" style={{padding:'0 15px'}}>
        <div style={{display:'flex', alignItems:'center', width:'100%', margin:'15px 0 5px', boxSizing:'border-box', justifyContent:'space-between' }}>
          <ScenarioExplorer 
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioId}
            onChange={(e) => scenarioActions.setSelectedScenarioId(e.target.value)}
            disabled={!isPresentationActive || hookIsPollRunning}
          />

          <BreadcrumbTrail 
            encounterPath={encounterPath}
            longestPath={longestPath}
            currentEncounter={currentEncounter}
            navigateToBreadcrumb={scenarioActions.navigateToBreadcrumb}
            getEncounterTitle={getEncounterTitle}
            breadcrumbsLoading={breadcrumbsLoading}
            isPresentationActive={isPresentationActive}
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
          sendPollHandler={hookSendPoll}
          endPollHandler={hookEndPoll}
          onClearPollData={clearPollDataFromHook}
          currentEncounter={currentEncounter}
          navigateToRoute={navigateToRoute}
          isPresentationActive={isPresentationActive}
          presentationControls={
              <PresentationControls
                  isPollRunning={hookIsPollRunning}
                  pollOptions={hookPollOptions}
                  voteCounts={hookVoteCounts}
                  voteCountsAbsolute={hookVoteCountsAbsolute}
                  finalVoteCounts={hookFinalVoteCounts}
                  navigateToRoute={navigateToRoute}
                  sendPoll={hookSendPoll}
                  endPoll={hookEndPoll}
                  currentEncounter={currentEncounter}
                  selectedScenarioId={selectedScenarioId}
                  isPresentationActive={isPresentationActive}
                  startPresentation={() => hookStartPresentation(displayWindowRef)} // Pass displayWindowRef, no arg expected
                  endPresentation={() => hookEndPresentation(displayWindowRef)}   // Pass displayWindowRef, no arg expected
                  disabled={!isPresentationActive || (!currentEncounter && !selectedScenarioId)}
              />
          }
        />

        <div className="poll-controls">
          <StartPresentationButtons 
            isPresentationActive={isPresentationActive}
            isPollRunning={hookIsPollRunning}
            currentEncounter={currentEncounter}
            selectedScenarioId={selectedScenarioId}
            startPresentation={() => hookStartPresentation(displayWindowRef)} // Pass displayWindowRef, no arg expected
            endPresentation={() => hookEndPresentation(displayWindowRef)} // Pass displayWindowRef, no arg expected
          />

          <InstructionManager 
            isPresentationActive={isPresentationActive}
            initialActiveInstruction={liveInstruction}
            onInstructionBroadcast={setLiveInstruction}
            onInstructionClose={() => setLiveInstruction(null)}
          />
        </div>

        <UserManagementPanel 
          userList={userList}
          totalUsers={totalUsers}
          badges={badges}
          loadingBadges={loadingBadges}
          openAwardXPModal={openAwardXPModalFromHook}
          openAwardXPToAllModal={openAwardXPToAllModalFromHook}
          openBadgeAwardModal={openBadgeAwardModalFromHook}
          awardBadge={awardBadgeFromHook}
          isBadgeModalOpen={isBadgeModalOpenFromHook}
          setIsBadgeModalOpen={setIsBadgeModalOpenFromHook}
          selectedUserForBadge={selectedUserForBadgeFromHook}
          isInputModalOpen={isInputModalOpenFromHook}
          setIsInputModalOpen={setIsInputModalOpenFromHook}
          inputModalConfig={inputModalConfigFromHook}
          unreadBySender={unreadBySender}
          openChatWithUser={openChatWithUser}
          getPureSub={getPureSub}
          getDisplayName={getDisplayName}
        />

        <PreviewPane 
          currentEncounter={currentEncounter}
          isPresentationActive={isPresentationActive}
          userList={userList}
          gameId={presentationManagerGameId} // Use gameId from hook
        />
      </div>

    </div>
  );
};

export default EducatorPanel; 