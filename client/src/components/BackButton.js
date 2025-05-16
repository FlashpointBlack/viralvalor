import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A reusable back button component for proper history navigation
 * Uses sessionStorage to track navigation history and provide better back button support
 * 
 * @param {Object} props - Component props
 * @param {string} props.fallbackPath - Path to navigate to if no previous page exists (default: '/')
 * @param {string} props.className - Additional CSS classes for styling
 * @param {boolean} props.confirm - Whether to show a confirmation dialog before navigating back
 * @param {string} props.confirmMessage - The message to show in the confirmation dialog
 */
const BackButton = ({ 
  fallbackPath = '/', 
  className = '', 
  children,
  confirm = false,
  confirmMessage = 'Are you sure you want to go back? Any unsaved changes will be lost.'
}) => {
  const navigate = useNavigate();
  
  const handleGoBack = (e) => {
    e.preventDefault();
    
    // If confirmation is required, show a confirmation dialog
    if (confirm && !window.confirm(confirmMessage)) {
      return;
    }
    
    // Try to get previous path from sessionStorage
    try {
      const historyStack = JSON.parse(sessionStorage.getItem('navigationHistory') || '[]');
      
      if (historyStack.length > 1) {
        // Remove current path
        historyStack.pop();
        
        // Get the previous path
        const previousPath = historyStack[historyStack.length - 1];
        
        // Update sessionStorage with the new history stack
        sessionStorage.setItem('navigationHistory', JSON.stringify(historyStack));
        
        // Navigate to the previous path
        navigate(previousPath);
        console.log('Navigating back to:', previousPath);
        return;
      }
    } catch (error) {
      console.error('Error accessing navigation history:', error);
    }
    
    // If no previous path found in history stack, use browser history or fallback
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  };
  
  return (
    <button 
      onClick={handleGoBack}
      className={`btn btn-secondary ${className}`}
    >
      {children || '← Back'}
    </button>
  );
};

export default BackButton; 