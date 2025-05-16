import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { NavigationContext } from '../App';

/**
 * A custom navigation link component that integrates with our history management
 * This wraps the standard Link component and adds our custom history tracking
 */
const NavigationLink = ({ 
  to, 
  children, 
  onClick,
  className = '', 
  activeClassName = '',
  exact = false,
  confirm = false,
  confirmMessage = 'Are you sure you want to navigate away? Any unsaved changes will be lost.',
  ...props 
}) => {
  const navigation = useContext(NavigationContext);
  
  const handleClick = (e) => {
    if (confirm && !window.confirm(confirmMessage)) {
      e.preventDefault();
      return;
    }
    
    // Call the original onClick handler if provided
    if (onClick) {
      onClick(e);
    }
    
    // If the user isn't using a modifier key (to open in a new tab, etc.)
    // and there's no default prevention already
    if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      
      if (navigation) {
        // Use our custom navigation to track history correctly
        navigation.to(to);
      }
    }
  };
  
  return (
    <Link
      to={to}
      className={className}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Link>
  );
};

export default NavigationLink; 