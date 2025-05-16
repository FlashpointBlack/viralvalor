/**
 * History utility for better navigation control in the SPA
 * This helps manage the browser history stack for proper back button behavior
 */

// Keep track of navigation history
const navigationHistory = {
  stack: [],
  
  // Add a new location to the history stack
  push(location) {
    this.stack.push(location);
    localStorage.setItem('navigationHistory', JSON.stringify(this.stack));
  },
  
  // Remove the last location from the history stack
  pop() {
    const location = this.stack.pop();
    localStorage.setItem('navigationHistory', JSON.stringify(this.stack));
    return location;
  },
  
  // Get the previous location without removing it
  peek() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  },
  
  // Get the current history stack
  getStack() {
    return [...this.stack];
  },
  
  // Initialize history from localStorage if available
  init() {
    try {
      const savedHistory = localStorage.getItem('navigationHistory');
      if (savedHistory) {
        this.stack = JSON.parse(savedHistory);
      }
    } catch (error) {
      console.error('Error initializing navigation history:', error);
      this.stack = [];
    }
  },
  
  // Clear the history stack
  clear() {
    this.stack = [];
    localStorage.removeItem('navigationHistory');
  }
};

// Initialize history from localStorage
navigationHistory.init();

export default navigationHistory; 