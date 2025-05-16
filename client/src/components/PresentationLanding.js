import React, { useEffect, useRef } from 'react';
import './PresentationLanding.css';
import { useNavigate } from 'react-router-dom';

const PresentationLanding = () => {
  const navigate = useNavigate();
  const containerRef = useRef(null);

  useEffect(() => {
    // Utility to create a safe message listener (copied from EncounterDisplayPlaceholder)
    const createMessageListener = (handler) => {
      return (event) => {
        const isSameOrigin = event.origin === window.location.origin;
        const isLocalhost = event.origin.includes('localhost') || event.origin.includes('127.0.0.1');
        if (!isSameOrigin && !isLocalhost) {
          // Ignore messages from unknown origins
          console.warn(`Ignoring message from unauthorized origin: ${event.origin}`);
          return;
        }
        if (!event.data || typeof event.data !== 'object' || !event.data.type) {
          return;
        }
        handler(event.data, event);
      };
    };

    // Handler for incoming messages
    const handleMessage = (data) => {
      if (data.type === 'LOAD_ENCOUNTER') {
        // If this landing page was opened with a specific gameId, only
        // honor messages that target the same gameId.  This prevents the
        // display from accidentally resuming a previous presentation when
        // a stale message arrives from another session.

        const expectedGameId = new URLSearchParams(window.location.search).get('gameId');
        if (expectedGameId) {
          if (!data.gameId || data.gameId !== expectedGameId) {
            console.warn('[PresentationLanding] Ignoring LOAD_ENCOUNTER for mismatched game', {
              expected: expectedGameId,
              received: data.gameId
            });
            return; // Abort – message is not for our session
          }
        }

        const { encounterId, displayMode } = data;
        if (encounterId) {
          let url = `/encounters2/${encounterId}`;
          if (displayMode) {
            url += `?displayMode=${displayMode}`;
          }
          // Preserve gameId so subsequent pages know which session we belong to
          const gameSuffix = expectedGameId ? (url.includes('?') ? `&gameId=${expectedGameId}` : `?gameId=${expectedGameId}`) : '';
          navigate(url + gameSuffix);
        }
      }
    };

    // Set up listener on mount and clean up on unmount
    const listener = createMessageListener(handleMessage);
    window.addEventListener('message', listener);
    console.log('[PresentationLanding] Listening for LOAD_ENCOUNTER messages');

    // Also check for directLoad param on initial render
    const urlParams = new URLSearchParams(window.location.search);
    const directEncounterId = urlParams.get('directLoad');

    if (directEncounterId) {
      const displayMode = urlParams.get('displayMode');
      const gameIdFromLandingUrl = urlParams.get('gameId'); // GameId from PresentationLanding's own URL

      let navigateToUrl = `/encounters2/${directEncounterId}`;
      const queryParams = [];

      if (displayMode) {
        queryParams.push(`displayMode=${encodeURIComponent(displayMode)}`);
      }
      if (gameIdFromLandingUrl) { // If PresentationLanding's URL had a gameId, pass it forward
        queryParams.push(`gameId=${encodeURIComponent(gameIdFromLandingUrl)}`);
      }

      if (queryParams.length > 0) {
        navigateToUrl += `?${queryParams.join('&')}`;
      }
      console.log(`[PresentationLanding] directLoad: Navigating to ${navigateToUrl}`);
      navigate(navigateToUrl); // Navigate with all relevant parameters
    }

    return () => {
      window.removeEventListener('message', listener);
      console.log('[PresentationLanding] Stopped listening for messages');
    };
  }, [navigate]);

  // Helper: toggle fullscreen on double-click
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

  return (
    <div
      className="presentation-landing-container"
      ref={containerRef}
      onDoubleClick={toggleFullscreen}
    >
      <h1 className="presentation-welcome">Welcome to an exciting Viral Valor powered presentation!</h1>
      <img src="/images/QRCode.png" alt="Join presentation QR code" className="presentation-qr" />
    </div>
  );
};

export default PresentationLanding; 