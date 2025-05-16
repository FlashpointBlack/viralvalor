import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import PresentationLanding from './PresentationLanding';
import EncounterDisplay from './EncounterDisplay';
import PresentationEnd from './PresentationEnd';
import SimplePlaceholder from './SimplePlaceholder'; // A simple component for placeholders
import './PresentationTransitions.css'; // Add this new CSS file we'll create
import axios from 'axios';

const PresentationDisplayHost = () => {
  const [currentView, setCurrentView] = useState('welcome'); // 'welcome', 'encounter', 'end'
  const [previousView, setPreviousView] = useState(null); // Track previous view for transitions
  const [isTransitioning, setIsTransitioning] = useState(false); // Track when transitions are happening
  const [currentEncounterId, setCurrentEncounterId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [presenterHostSub, setPresenterHostSub] = useState(null); // For the end screen

  const location = useLocation();
  const containerRef = useRef(null); // For fullscreen functionality

  // Transition duration in ms (should match CSS)
  const TRANSITION_DURATION = 1500;

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

  // Helper to extract image urls from simple HTML snippets (e.g. <img src="/path" />)
  const extractImageUrls = (htmlString) => {
    if (!htmlString) return [];
    const urls = [];
    const regex = /src="([^\"]+)"/g;
    let match;
    while ((match = regex.exec(htmlString)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  };

  // Generic pre-loader that resolves when all images either load or timeout
  const preloadImages = (urls, timeoutMs = 3000) => {
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
  };

  // Main verification routine – fetches any dynamic data required, then pre-loads discovered images
  const verifyImagesLoadedForSlide = async (view, { encounterId, hostSub } = {}) => {
    try {
      let urls = [];

      if (view === 'welcome') {
        urls.push('/images/QRCode.png');
      }

      if (view === 'encounter' && encounterId) {
        const { data } = await axios.get(`/GetEncounterData/${encounterId}`, { params: { _t: Date.now() } });
        const enc = data?.Encounter;
        if (enc) {
          urls.push(...extractImageUrls(enc.BackdropImage));
          urls.push(...extractImageUrls(enc.Character1Image));
          urls.push(...extractImageUrls(enc.Character2Image));
        }
      }

      if (view === 'end' && hostSub) {
        // Resolve presenter picture URL
        const idResp = await axios.get(`/api/user/by-sub/${encodeURIComponent(hostSub)}`);
        const userId = idResp?.data?.id;
        if (userId) {
          const userResp = await axios.get(`/api/users/${userId}`);
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

  // Handle view transitions
  const transitionToView = async (newView, options = {}) => {
    if (newView === currentView) return; // No change needed
    
    // Wait until all images for the incoming slide are ready
    await verifyImagesLoadedForSlide(newView, options);

    // Start transition
    setPreviousView(currentView);
    setIsTransitioning(true);
    
    // Delay setting the new view by a tiny amount to ensure proper CSS transitions
    setTimeout(() => {
      setCurrentView(newView);
    }, 10);
    
    // After transition completes, clean up
    setTimeout(() => {
      setIsTransitioning(false);
      setPreviousView(null);
    }, TRANSITION_DURATION);
  };

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

      if (data && data.type) {
        console.log(`[PresentationDisplayHost] Processing message type: ${data.type}, for gameId: ${data.gameId}. Current host gameId: ${gameId}`);
        
        if (data.gameId && data.gameId !== gameId) {
          console.warn('[PresentationDisplayHost] Ignoring message due to gameId mismatch.', {
            expectedHostGameId: gameId,
            receivedMessageGameId: data.gameId,
            messageType: data.type
          });
          return;
        }

        console.log('[PresentationDisplayHost] Accepted message:', data);

        switch (data.type) {
          case 'SHOW_WELCOME':
            console.log('[PresentationDisplayHost] Setting view to WELCOME');
            transitionToView('welcome');
            setCurrentEncounterId(null);
            setPresenterHostSub(null);
            break;
          case 'LOAD_ENCOUNTER_IN_DISPLAY':
            console.log(`[PresentationDisplayHost] Attempting to load encounter. Received encounterId: ${data.encounterId}. Current view: ${currentView}`);
            if (data.encounterId) {
              setCurrentEncounterId(data.encounterId);
              transitionToView('encounter', { encounterId: data.encounterId });
              console.log(`[PresentationDisplayHost] Set view to ENCOUNTER. New encounterId: ${data.encounterId}`);
            } else {
              console.warn('[PresentationDisplayHost] LOAD_ENCOUNTER_IN_DISPLAY message missing encounterId.');
            }
            break;
          case 'SHOW_END_SCREEN':
            console.log('[PresentationDisplayHost] Setting view to END SCREEN');
            setPresenterHostSub(data.hostSub);
            transitionToView('end', { hostSub: data.hostSub });
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
    console.log(`[PresentationDisplayHost] Initialized. Listening for messages. Current Game ID: ${gameId}`);

    return () => {
      window.removeEventListener('message', handleMessage);
      console.log(`[PresentationDisplayHost] Cleaned up. Stopped listening for messages. Game ID: ${gameId}`);
    };
  }, [gameId, currentView]); // Added currentView to dependencies to log it accurately in LOAD_ENCOUNTER case

  // Fullscreen toggle logic (updated to use document.documentElement)
  const toggleFullscreen = () => {
    try {
      const elem = document.documentElement;
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
      console.error('Error toggling fullscreen:', err);
    }
  };

  // Ensure gameId is loaded before rendering anything specific
  if (!gameId) {
    return <SimplePlaceholder message="Initializing presentation display... Waiting for Game ID." />;
  }
  
  return (
    <div ref={containerRef} onDoubleClick={toggleFullscreen} style={{height: '100vh', width: '100vw', backgroundColor: '#000'}}>
      {/* Welcome view */}
      {(currentView === 'welcome' || previousView === 'welcome') && (
        <div className={`presentation-view welcome-view 
          ${currentView === 'welcome' ? 'current' : ''} 
          ${previousView === 'welcome' ? 'previous fade-out' : ''}`}
        >
          <PresentationLanding />
        </div>
      )}
      
      {/* Encounter view */}
      {(currentView === 'encounter' || previousView === 'encounter') && currentEncounterId && (
        <div className={`presentation-view encounter-view 
          ${currentView === 'encounter' ? 'current' : ''} 
          ${previousView === 'encounter' ? 'previous fade-out' : ''}`}
        >
          <EncounterDisplay encounterIdForDisplay={currentEncounterId} gameId={gameId} />
          
          {/* Preload end view component when on encounter view (hidden) */}
          {currentView === 'encounter' && (
            <div style={{ display: 'none', position: 'absolute', visibility: 'hidden' }} aria-hidden="true">
              <PresentationEnd hostSubForDisplay={presenterHostSub} gameId={gameId} />
            </div>
          )}
        </div>
      )}
      
      {/* End view */}
      {(currentView === 'end' || previousView === 'end') && (
        <div className={`presentation-view end-view 
          ${currentView === 'end' ? 'current' : ''} 
          ${previousView === 'end' ? 'previous fade-out' : ''}`}
        >
          <PresentationEnd hostSubForDisplay={presenterHostSub} gameId={gameId} />
        </div>
      )}
      
      {/* Placeholder for missing encounter ID */}
      {currentView === 'encounter' && !currentEncounterId && (
        <SimplePlaceholder message="Encounter view selected, but no Encounter ID provided." />
      )}
    </div>
  );
};

export default PresentationDisplayHost; 