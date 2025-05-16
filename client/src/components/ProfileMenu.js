import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useAuth } from '../contexts/AuthContext';
import LogoutButton from './LogoutButton';
import '../styles/ProfileMenu.css';
import '../styles/MobileNav.css';

const ProfileMenu = ({ isMobile = false, onMenuItemClick = () => {} }) => {
  const { user, isAuthenticated } = useAuth0();
  const { userData } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const hideTimeout = useRef(null);
  
  // Close menu when mouse leaves the menu area
  const handleMouseEnter = () => {
    // If there is a pending hide timeout, cancel it
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
    setIsOpen(true);
    const ev = new CustomEvent('headerDropdownOpened', { detail: { source: 'profile' } });
    window.dispatchEvent(ev);
  };
  
  const handleMouseLeave = () => {
    // Start a delayed hide so the menu stays a bit longer
    hideTimeout.current = setTimeout(() => {
      setIsOpen(false);
      hideTimeout.current = null;
    }, 250);
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      const ev = new CustomEvent('headerDropdownOpened', { detail: { source: 'profile' } });
      window.dispatchEvent(ev);
    }
  };

  // Handler for menu item clicks that also closes the mobile menu
  const handleMenuItemClick = () => {
    setIsOpen(false); // Close the dropdown
    onMenuItemClick(); // Close the mobile menu
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    const handleExternalOpen = (e) => {
      if (e.detail?.source !== 'profile') {
        setIsOpen(false);
      }
    };
    window.addEventListener('headerDropdownOpened', handleExternalOpen);

    // Log userData for debugging
    console.log('[ProfileMenu] userData:', userData);

    return () => {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
      }
      window.removeEventListener('headerDropdownOpened', handleExternalOpen);
    };
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  // Get profile picture source
  let picSrc = null;
  if (userData?.picture_url) {
    const isExternalUrl = userData.picture_url.startsWith('http://') || userData.picture_url.startsWith('https://');
    if (!isExternalUrl) {
      // It's an internal URL, ensure it starts with a slash
      picSrc = userData.picture_url.startsWith('/') ? userData.picture_url : `/${userData.picture_url}`;
    }
    // If it's an external URL, picSrc remains null, and the placeholder will be used.
  }

  // Mobile profile menu - EXACT match for the dropdown components in MainNavTabs
  if (isMobile) {
    return (
      <div className="dropdown">
        <button 
          type="button" 
          className="main-tab" 
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={handleToggle}
        >
          {userData?.display_name || user?.name || 'Profile'}
          <span className="caret">▾</span>
        </button>
        <div className="dropdown-content mobile" style={{ display: isOpen ? 'block' : 'none' }}>
          <div className="dropdown-header">
            <img
              src={picSrc || '/images/DoctorFade.gif'}
              alt="Profile"
              style={{ width: '24px', height: '24px', borderRadius: '50%', marginRight: '8px', verticalAlign: 'middle' }}
            />
            {userData?.display_name || user?.name}
          </div>
          <Link to="/?tab=profile" className="dropdown-item" onClick={handleMenuItemClick}>
            Profile
          </Link>
          <Link to="/?tab=playersearch" className="dropdown-item" onClick={handleMenuItemClick}>
            Find Players
          </Link>
          <LogoutButton className="dropdown-item" onClick={handleMenuItemClick} />
        </div>
      </div>
    );
  }

  // Regular profile menu (desktop style)
  return (
    <div 
      className="profile-menu-container" 
      ref={menuRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button 
        className="profile-button"
        onClick={() => {
          // Ensure dropdown stays open on click and inform others
          if (!isOpen) {
            const ev = new CustomEvent('headerDropdownOpened', { detail: { source: 'profile' } });
            window.dispatchEvent(ev);
          }
          /* no-op to retain button semantics */
        }}
      >
        <img
          src={picSrc || '/images/DoctorFade.gif'}
          alt={userData?.display_name || user?.name || 'Profile'}
          className="profile-image"
        />
      </button>

      {isOpen && (
        <div className="profile-dropdown">
          <p className="profile-name">{userData?.display_name || user?.name}</p>
          <nav className="profile-menu-items">
            <Link to="/?tab=profile" className="profile-menu-item">
              Profile
            </Link>
            <Link to="/?tab=playersearch" className="profile-menu-item">
              Find Players
            </Link>
            <LogoutButton />
          </nav>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu; 