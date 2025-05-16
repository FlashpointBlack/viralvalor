import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * A component that enhances Link functionality with proper history tracking
 * This helps ensure the back button works correctly in the SPA
 */
const NavigateWithHistory = ({ 
  to, 
  children, 
  onClick, 
  className = '',
  style = {},
  replace = false,
  state = {},
  ...props 
}) => {
  const navigate = useNavigate();
  
  const handleClick = (e) => {
    // Allow default behavior for middle-click, cmd+click, ctrl+click, etc.
    if (
      e.button !== 0 || // not left click
      e.metaKey || 
      e.ctrlKey || 
      e.shiftKey || 
      e.altKey || 
      e.defaultPrevented
    ) {
      return;
    }
    
    e.preventDefault();
    
    // Call any provided onClick handler
    if (onClick) {
      onClick(e);
    }
    
    // Use React Router navigate for SPA navigation
    navigate(to, { replace, state });
    
    // Update history stack in sessionStorage for back button support
    try {
      const historyStack = JSON.parse(sessionStorage.getItem('navigationHistory') || '[]');
      
      // Don't add duplicates to history
      if (historyStack.length === 0 || historyStack[historyStack.length - 1] !== to) {
        historyStack.push(to);
        
        // Limit history size
        if (historyStack.length > 50) {
          historyStack.shift();
        }
        
        sessionStorage.setItem('navigationHistory', JSON.stringify(historyStack));
      }
    } catch (error) {
      console.error('Error updating history stack:', error);
    }
  };
  
  return (
    <Link
      to={to}
      onClick={handleClick}
      className={className}
      style={style}
      {...props}
    >
      {children}
    </Link>
  );
};

export default NavigateWithHistory; 