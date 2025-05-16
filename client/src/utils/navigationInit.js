/**
 * Initializes navigation history tracking
 * This should be called once when the app starts
 */
export const initNavigationHistory = () => {
  // Get current path
  const currentPath = window.location.pathname + window.location.search;
  
  try {
    // Initialize history stack if it doesn't exist
    const existingHistory = sessionStorage.getItem('navigationHistory');
    
    if (!existingHistory) {
      // Create a new history stack with the current path
      sessionStorage.setItem('navigationHistory', JSON.stringify([currentPath]));
    } else {
      // Add current path to history if it's different from the last one
      const historyStack = JSON.parse(existingHistory);
      
      if (historyStack.length === 0 || historyStack[historyStack.length - 1] !== currentPath) {
        historyStack.push(currentPath);
        sessionStorage.setItem('navigationHistory', JSON.stringify(historyStack));
      }
    }
    
    console.log('Navigation history initialized:', JSON.parse(sessionStorage.getItem('navigationHistory')));
  } catch (error) {
    console.error('Error initializing navigation history:', error);
  }
};

/**
 * Clears navigation history
 * Useful when you want to reset the navigation stack (e.g., on logout)
 */
export const clearNavigationHistory = () => {
  try {
    sessionStorage.removeItem('navigationHistory');
  } catch (error) {
    console.error('Error clearing navigation history:', error);
  }
}; 