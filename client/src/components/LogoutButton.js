import React from 'react';
import axios from 'axios';

const LogoutButton = ({ className = '', onClick = () => {} }) => {
  const handleLogout = () => {
    // Hard-reset all client-side caches to avoid stale data on the next login
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[LogoutButton] Storage clearing failed', e);
    }

    // Ensure we don't accidentally send the previous user's sub on subsequent requests
    delete axios.defaults.headers.common['x-user-sub'];

    // Navigate to the Auth0 /logout route which will also clear the server-side cookie
    window.location.href = `/logout?returnTo=${encodeURIComponent(window.location.origin)}`;
  };

  // Use just the provided className if specified, otherwise use the default profile-menu-item class
  const buttonClassName = className || 'logout-button';

  return (
    <a
      href="#logout"
      className={buttonClassName}
      onClick={(e) => {
        e.preventDefault();
        onClick(); // Call the onClick handler first
        handleLogout();
      }}
    >
      Log&nbsp;Out
    </a>
  );
};

export default LogoutButton; 