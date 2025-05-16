import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import navigationHistory from '../utils/history';
import { getDeviceInfo } from '../utils/deviceDetection';

/**
 * Custom hook for enhanced navigation with proper back button support
 * This hook tracks navigation history and provides methods for navigating
 * within the SPA that integrate with the browser's back button
 */
function useCustomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const deviceInfo = getDeviceInfo();
  
  // Track navigation in our custom history
  useEffect(() => {
    // Don't track the initial page load
    if (navigationHistory.getStack().length === 0) {
      navigationHistory.push(location.pathname);
      return;
    }
    
    // Check if this is a new location (not triggered by back button)
    // If we're navigating forward, add to history
    const currentPath = navigationHistory.peek();
    if (currentPath !== location.pathname) {
      navigationHistory.push(location.pathname);
    }
  }, [location.pathname]);
  
  // Enhanced navigation methods
  const customNavigate = {
    // Navigate to a new route and add to history
    to: (path, options) => {
      // On iOS and Android, use standard navigation to avoid issues
      if (deviceInfo.isIOS || deviceInfo.isAndroid) {
        navigate(path, options);
        return;
      }
      
      // Custom handling for desktop browsers
      navigate(path, options);
    },
    
    // Go back in history, with fallback
    back: (fallbackPath = '/') => {
      // Mobile-specific handling
      if (deviceInfo.isMobile) {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          navigate(fallbackPath);
        }
        return;
      }
      
      // Desktop handling with our custom history
      navigationHistory.pop(); // Remove current path
      const previousPath = navigationHistory.peek();
      
      if (previousPath) {
        // Use browser's back if possible
        window.history.back();
      } else {
        // If no previous path, navigate to fallback
        navigate(fallbackPath);
      }
    },
    
    // Get previous path without navigating
    getPreviousPath: () => {
      const stack = navigationHistory.getStack();
      return stack.length > 1 ? stack[stack.length - 2] : null;
    },
    
    // Clear navigation history
    resetHistory: () => {
      navigationHistory.clear();
      navigationHistory.push(location.pathname);
    }
  };
  
  return customNavigate;
}

export default useCustomNavigation; 