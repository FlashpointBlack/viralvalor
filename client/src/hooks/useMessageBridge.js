import { useEffect, useRef } from 'react';

/**
 * useMessageBridge – attaches a window "message" listener that funnels
 * validated postMessage events to a supplied handler. The validation logic is
 * identical to the former inline implementation in EncounterDisplay.
 */
export default function useMessageBridge({ handleMessage, debugLog = () => {}, logError = () => {} }) {
  const listenerRef = useRef(null);

  useEffect(() => {
    if (!handleMessage) return;

    // Build a listener that wraps validation
    const createMessageListener = (handler) => {
      return (event) => {
        try {
          debugLog(`MessageListener: Received message from ${event.origin}:`, event.data);

          // Allow same-origin or localhost during development
          const isSameOrigin = event.origin === window.location.origin;
          const isLocalhost = event.origin.includes('localhost') || event.origin.includes('127.0.0.1');
          if (!isSameOrigin && !isLocalhost) {
            logError(`Ignoring message from unauthorized origin: ${event.origin}`, { data: event.data });
            return;
          }

          // Validate payload
          if (!event.data || typeof event.data !== 'object' || !event.data.type) {
            logError('Ignoring invalid message format', { data: event.data });
            return;
          }

          handler(event.data, event);
        } catch (err) {
          logError('Error in message listener', err);
        }
      };
    };

    // Detach any previous listener first (hot-reload safety)
    if (listenerRef.current) {
      window.removeEventListener('message', listenerRef.current);
    }

    listenerRef.current = createMessageListener(handleMessage);
    window.addEventListener('message', listenerRef.current);

    return () => {
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current);
      }
    };
  }, [handleMessage, debugLog, logError]);
} 