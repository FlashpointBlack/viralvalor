import { useEffect, useCallback, useState } from 'react';
import { useNavigate, useLocation, useBeforeUnload } from 'react-router-dom';

/**
 * Hook to add a confirmation prompt when navigating away from a page with unsaved changes
 * @param {boolean} hasUnsavedChanges - Whether there are unsaved changes
 * @param {string} message - The confirmation message to show
 * @returns {Function} - Call this function when you want to bypass the confirmation
 */
function useBackConfirmation(hasUnsavedChanges = false, message = 'You have unsaved changes. Are you sure you want to leave this page?') {
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmedNavigation, setConfirmedNavigation] = useState(false);
  const [destinationLocation, setDestinationLocation] = useState(null);

  // Handle the browser's beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    if (hasUnsavedChanges) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges, message]);

  // Listen for popstate events (browser back/forward buttons)
  useEffect(() => {
    const handlePopState = (e) => {
      if (hasUnsavedChanges && !confirmedNavigation) {
        // Prevent the default navigation
        window.history.pushState(null, '', location.pathname);
        
        // Show confirmation
        if (window.confirm(message)) {
          // If confirmed, allow navigation
          setConfirmedNavigation(true);
          window.history.back();
        }
      }
    };

    if (hasUnsavedChanges) {
      window.addEventListener('popstate', handlePopState);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedChanges, message, location, confirmedNavigation]);

  // Handle confirmed navigation
  useEffect(() => {
    if (confirmedNavigation && destinationLocation) {
      navigate(destinationLocation);
      setConfirmedNavigation(false);
      setDestinationLocation(null);
    }
  }, [confirmedNavigation, destinationLocation, navigate]);

  // Function to navigate with confirmation
  const navigateWithConfirmation = useCallback(
    (to, options = {}) => {
      if (hasUnsavedChanges && !confirmedNavigation) {
        if (window.confirm(message)) {
          setConfirmedNavigation(true);
          setDestinationLocation(to);
        }
      } else {
        navigate(to, options);
      }
    },
    [hasUnsavedChanges, confirmedNavigation, message, navigate]
  );

  // Function to bypass confirmation and navigate
  const navigateWithoutConfirmation = useCallback(
    (to, options = {}) => {
      navigate(to, options);
    },
    [navigate]
  );

  return {
    navigateWithConfirmation,
    navigateWithoutConfirmation
  };
}

export default useBackConfirmation; 