/**
 * Utility functions for handling window communication
 */

/**
 * Safely send a message to another window
 * @param {Window} targetWindow - The window to send the message to
 * @param {Object} message - The message to send
 * @returns {boolean} - Whether the message was sent successfully
 */
export const sendMessageToWindow = (targetWindow, message) => {
  if (!targetWindow || targetWindow.closed) {
    console.error('Target window is not available');
    return false;
  }

  try {
    // Use the current origin for security
    const origin = window.location.origin || '*';
    targetWindow.postMessage(message, origin);
    return true;
  } catch (error) {
    console.error('Error sending message to window:', error);
    return false;
  }
};

/**
 * Create a message event listener with proper validation
 * @param {Function} handler - The handler function for valid messages
 * @returns {Function} - The event listener function
 */
export const createMessageListener = (handler) => {
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

/**
 * Check if the window is embedded in an iframe
 * @returns {boolean}
 */
export const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}; 