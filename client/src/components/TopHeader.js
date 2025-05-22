import React, { useState, useEffect, Children, cloneElement } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import LoginButton from './LoginButton';
import ProfileMenu from './ProfileMenu';
import MainNavTabs from './MainNavTabs';
import '../styles/MobileNav.css';

const TopHeader = ({ title = 'Viral Valor', children, showGreeting = true, showAuthButtons = true }) => {
  const { isAuthenticated } = useAuth0();
  const { userData, user, /*isAdmin*/ } = useAuth();

  // Debug displayName retrieval
  // eslint-disable-next-line no-console
  console.log('[TopHeader] userData:', userData, 'auth0 user:', user);

  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobileMenu = () => setMobileOpen((prev) => !prev);
  const closeMobileMenu = () => setMobileOpen(false);
  
  // Close the mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const isMenuButton = event.target.closest('.hamburger-btn');
      const isNavMenu = event.target.closest('.main-nav');
      
      if (mobileOpen && !isMenuButton && !isNavMenu) {
        setMobileOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [mobileOpen]);

  // Modify children to include ProfileMenu as first item in mobile view
  const modifiedChildren = () => {
    // In mobile view, add ProfileMenu directly to the beginning of children
    if (mobileOpen && isAuthenticated && showGreeting) {
      // Find the MainNavTabs child
      const childArray = Children.toArray(children);
      const navTabsChild = childArray.find(child => child.type === MainNavTabs);
      
      if (navTabsChild) {
        // Create a copy of MainNavTabs with a special prop to include ProfileMenu
        const modifiedNavTabs = cloneElement(navTabsChild, {
          includeProfileMenu: true,
          onMenuItemClick: closeMobileMenu // Add close handler for menu items
        });
        
        // Replace the MainNavTabs in the children array
        return childArray.map(child => 
          child.type === MainNavTabs ? modifiedNavTabs : child
        );
      }
    }
    
    // For other children, add the close handler if they are MainNavTabs
    if (children) {
      const childArray = Children.toArray(children);
      return childArray.map(child => 
        child.type === MainNavTabs 
          ? cloneElement(child, { onMenuItemClick: closeMobileMenu })
          : child
      );
    }
    
    return children;
  };

  return (
    <header className="main-header">
      <div className="header-content">
        {title === 'Viral Valor' ? (
          <h1 className="logo" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
            <Link to="/" style={{ display: 'block', textDecoration: 'none' }} onClick={closeMobileMenu}>
              <img src="/images/LogoHeader.png" alt="Viral Valor Logo" className="header-logo" />
            </Link>
          </h1>
        ) : (
          <h1>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }} onClick={closeMobileMenu}>
              {title}
            </Link>
          </h1>
        )}

        {/* Hamburger toggle for mobile */}
        <button
          className={`hamburger-btn${mobileOpen ? ' open' : ''}`}
          aria-label="Toggle menu"
          onClick={toggleMobileMenu}
        >
          <span className="bar"></span>
          <span className="bar"></span>
          <span className="bar"></span>
        </button>
      </div>

      <div className={`mobile-nav-container${mobileOpen ? ' open' : ''}`}>
        <nav className={`main-nav${mobileOpen ? ' open' : ''}`}>
          {modifiedChildren()}
          
          {/* Mobile login button when not authenticated */}
          {!isAuthenticated && showAuthButtons && mobileOpen && (
            <div className="mobile-auth-buttons">
              <LoginButton className="mobile-login-button" onLoginClick={closeMobileMenu} />
            </div>
          )}
          
          {/* Desktop profile/login showing */}
          {!mobileOpen && (
            <>
              {isAuthenticated && showGreeting && <ProfileMenu />}
              {!isAuthenticated && showAuthButtons && <LoginButton />}
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default TopHeader; 