import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * A hook that runs a callback when the location changes
 * This is the recommended way to listen for navigation in React Router v6
 * 
 * @param {Function} callback - Function to call when location changes
 */
const useLocationChange = (callback) => {
  const location = useLocation();

  useEffect(() => {
    // Call the callback with the location object
    if (callback && typeof callback === 'function') {
      callback(location);
    }
  }, [location, callback]);
};

export default useLocationChange; 