/**
 * Utility functions for device detection to optimize navigation experience
 */

/**
 * Detect if the current device is a touch device (mobile, tablet)
 * This helps us optimize navigation behavior for touch devices
 */
export const isTouchDevice = () => {
  return (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (navigator.msMaxTouchPoints > 0)
  );
};

/**
 * Detect if the current device is running iOS
 * iOS has specific handling needs for proper history management
 */
export const isIOS = () => {
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform) ||
  // iPad on iOS 13 detection
  (navigator.userAgent.includes("Mac") && "ontouchend" in document);
};

/**
 * Detect if the current device is running Android
 */
export const isAndroid = () => {
  return /Android/i.test(navigator.userAgent);
};

/**
 * Get information about the current device
 * @returns {Object} Device information
 */
export const getDeviceInfo = () => {
  return {
    isTouchDevice: isTouchDevice(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isMobile: isTouchDevice() || window.innerWidth < 768
  };
}; 