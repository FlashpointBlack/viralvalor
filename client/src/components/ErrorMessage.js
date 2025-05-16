import React, { useState, useEffect } from 'react';

/**
 * Error overlay component.
 * Added a dismiss button so users can close the overlay without having to refresh the page.
 * If an `onClose` callback is provided, it will be invoked; otherwise the component will
 * hide itself locally.
 */
const ErrorMessage = ({ message, onRetry, onClose }) => {
  const [visible, setVisible] = useState(true);

  // Reset visibility whenever a new error message arrives
  useEffect(() => {
    setVisible(true);
  }, [message]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="error-container">
      <div className="error-content" style={{ position: 'relative' }}>
        {/* Dismiss button */}
        <button
          className="error-close-btn"
          onClick={handleClose}
          aria-label="Close error message"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            fontSize: '1.5rem',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <h2>Something went wrong</h2>
        <p>{message}</p>
        {onRetry && (
          <button className="btn btn-danger" onClick={onRetry}>
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage; 