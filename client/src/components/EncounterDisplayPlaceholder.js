import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Local implementation of the message listener utility
const createMessageListener = (handler) => {
  return (event) => {
    // Validate origin (allow same origin or localhost during development)
    const isSameOrigin = event.origin === window.location.origin;
    const isLocalhost = event.origin.includes('localhost') || event.origin.includes('127.0.0.1');
    
    if (!isSameOrigin && !isLocalhost) {
      console.warn(`Ignoring message from unauthorized origin: ${event.origin}`);
      return;
    }

    // Validate message structure
    if (!event.data || typeof event.data !== 'object' || !event.data.type) {
      return;
    }

    // Call the handler with the validated message
    handler(event.data, event);
  };
};

const EncounterDisplayPlaceholder = () => {
  const displayRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up message listener using our utility
    const handleMessage = (data) => {
      if (data.type === 'LOAD_ENCOUNTER') {
        const { encounterId, displayMode } = data;
        console.log(`Placeholder received message to load encounter ID: ${encounterId}`);
        
        // Navigate to the encounter with smooth transition
        if (encounterId) {
          let url = `/encounters2/${encounterId}`;
          if (displayMode) {
            url += `?displayMode=${displayMode}`;
          }
          console.log(`Navigating to: ${url}`);
          navigate(url);
        }
      }
    };
    
    // Create and attach the message listener
    const messageListener = createMessageListener(handleMessage);
    window.addEventListener('message', messageListener);
    console.log('Placeholder: Listening for messages');
    
    // Add a direct URL check in case the message isn't received
    const checkUrlParams = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const directEncounterId = urlParams.get('directLoad');
      if (directEncounterId) {
        console.log(`Direct load parameter found: ${directEncounterId}`);
        const displayMode = urlParams.get('displayMode');
        
        let url = `/encounters2/${directEncounterId}`;
        if (displayMode) {
          url += `?displayMode=${displayMode}`;
        }
        navigate(url);
      }
    };
    
    // Check URL parameters on load
    checkUrlParams();
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('message', messageListener);
      console.log('Placeholder: Stopped listening for messages');
    };
  }, [navigate]);

  // Handle toggling fullscreen mode
  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        if (displayRef.current.requestFullscreen) {
          displayRef.current.requestFullscreen();
        } else if (displayRef.current.webkitRequestFullscreen) { // Safari
          displayRef.current.webkitRequestFullscreen();
        } else if (displayRef.current.msRequestFullscreen) { // IE11
          displayRef.current.msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { // Safari
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { // IE11
          document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  return (
    <div 
      className="encounter-display placeholder"
      onDoubleClick={toggleFullscreen}
      ref={displayRef}
    >
      <div className="placeholder-content">
        <h1>Educator Display Mode</h1>
        <p>Please select a scenario from the Educator Panel to display content.</p>
        <p>This window will automatically update when a scenario is selected.</p>
        <p><small>Double-click anywhere to toggle fullscreen mode.</small></p>
      </div>
    </div>
  );
};

export default EncounterDisplayPlaceholder; 