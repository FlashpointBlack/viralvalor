import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import ProfileMenu from './ProfileMenu';

// Menu configuration supports standalone links and dropdown groupings
const BASE_MENU_CONFIG = [
  // Home button removed - logo will be used instead
  {
    type: 'dropdown',
    label: 'Edit Content',
    items: [
      // SITE RESOURCES SECTION
      { type: 'header', label: 'Site Resources' },
      { key: 'images', label: 'Images' },
      { key: 'questions', label: 'All Questions' },

      // STUDENT EDUCATION SECTION
      { type: 'header', label: 'Student Education' },
      { key: 'storyline', label: 'Scenarios' },
      { key: 'lectures', label: 'Lectures & Questions' },
      { key: 'journalprompts', label: 'Journal Prompts' },
      { key: 'articles', label: 'Articles' },
    ],
  },
  {
    type: 'dropdown',
    label: 'Activities',
    items: [
      // GAMES SECTION
      { type: 'header', label: 'Games' },
      { key: 'singleplayer', label: 'Choose your own adventure – Solo', path: '/game' },
      { key: 'multiplayer', label: 'Choose your own adventure – Host Multiplayer' },

      // STUDY SECTION
      { type: 'header', label: 'Study' },
      { key: 'mylectures', label: 'Lectures' },
      { key: 'practice', label: 'Question Bank' },
      { key: 'myarticles', label: 'Scholarly Articles' },
      { key: 'journals', label: 'Reflective Journal Assignments' },
    ],
  },
  {
    type: 'dropdown',
    label: 'Administrative',
    items: [
      { key: 'users', label: 'Users' },
      { key: 'sendsysmsg', label: 'Send System Message' },
      { key: 'selftest', label: 'Ops Self-Test', path: '/api/admin/selftest', external: true },

      // REPORTS SECTION
      { type: 'header', label: 'Reports' },
      { key: 'studentstats', label: 'Student Reports' },
      { key: 'questionstats', label: 'Question Reports' },
      { key: 'tagstats', label: 'Tag Reports' },
    ],
  },
];

/**
 * MainNavTabs
 *
 * Reusable navigation tab bar for the main interface. The component is flexible:
 *   • If an onSelectTab callback is provided, the selected tab key is passed back to the caller.
 *   • If no onSelectTab is provided, the component falls back to navigating using react-router.
 *
 * Props:
 *   activeTab?: string        – currently active tab key (for highlighting)
 *   onSelectTab?: (key)=>void – handler when a tab is clicked
 *   includeProfileMenu?: boolean - include ProfileMenu at the beginning (for mobile)
 *   onMenuItemClick?: ()=>void - handler to close mobile menu when an item is clicked
 */
const MainNavTabs = ({ 
  activeTab, 
  onSelectTab, 
  includeProfileMenu = false,
  onMenuItemClick = () => {} // Default to no-op
}) => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  const [isAdmin, setIsAdmin] = useState(false);
  const [isEducator, setIsEducator] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    if (!userSub) return;
    axios.get('am-admin', { headers: { 'x-user-sub': userSub } })
      .then(({ data }) => setIsAdmin(!!data.isAdmin))
      .catch(() => setIsAdmin(false));

    axios.get('am-educator', { headers: { 'x-user-sub': userSub } })
      .then(({ data }) => setIsEducator(!!data.isEducator))
      .catch(() => setIsEducator(false));
      
    // Handle responsive layout
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [userSub]);

  // Filter menu based on role: remove Questions item for non-admins
  const MENU_CONFIG = React.useMemo(() => {
    // Administrators see the full menu
    if (isAdmin) return BASE_MENU_CONFIG;

    // Educators (who are not admins) – hide Administrative dropdown but keep Edit Content with limited items
    if (isEducator) {
      return BASE_MENU_CONFIG
        .filter(menu => menu.label !== 'Administrative')
        .map(menu => {
          if (menu.type !== 'dropdown') return menu;

          if (menu.label === 'Edit Content') {
            const allowed = new Set(['storyline','lectures','articles']);
            return {
              ...menu,
              items: menu.items.filter(item => {
                if (item.type === 'header') {
                  return item.label === 'Student Education';
                }
                return allowed.has(item.key);
              })
            };
          }

          return menu;
        });
    }

    // Non-admin students – hide Administrative & Edit Content, and remove Multiplayer from Activities
    return BASE_MENU_CONFIG
      .filter(menu => menu.label !== 'Administrative' && menu.label !== 'Edit Content')
      .map(menu => {
        if (menu.type !== 'dropdown') return menu;
        // Remove the multiplayer hosting option
        if (menu.label === 'Activities') {
          return {
            ...menu,
            items: menu.items.filter(item => item.key !== 'multiplayer')
          };
        }
        return menu;
      });
  }, [isAdmin, isEducator]);

  const handleTabClick = (key) => {
    if (typeof onSelectTab === 'function') {
      // Let the parent component handle tab state changes
      onSelectTab(key);
    } else {
      // Fallback: navigate to root and pass the tab via location state
      if (key === 'dashboard') {
        navigate('/');
      } else {
        navigate({ pathname: '/', search: `?tab=${key}` });
      }
    }
    
    // Close mobile menu after navigation
    if (isMobile) {
      onMenuItemClick();
    }
  };

  // Dropdown open state & hide timer
  const [openDropdown, setOpenDropdown] = useState(null);
  const hideTimeout = useRef(null);
  const openRef = useRef(null);

  useEffect(() => {
    openRef.current = openDropdown;
  }, [openDropdown]);

  const handleDropdownEnter = (label) => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
    if (openDropdown !== label) {
      setOpenDropdown(label);
    }
  };

  const handleDropdownLeave = () => {
    hideTimeout.current = setTimeout(() => {
      setOpenDropdown(null);
      hideTimeout.current = null;
    }, 250);
  };

  const handleDropdownToggle = (label) => {
    if (openDropdown === label) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(label);
    }
  };

  // Listen for external dropdown openings to close ours
  useEffect(() => {
    const listener = (e) => {
      if (e.detail?.source !== openRef.current) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('headerDropdownOpened', listener);
    return () => window.removeEventListener('headerDropdownOpened', listener);
  }, []);

  // Dispatch event when our dropdown opens
  useEffect(() => {
    if (openDropdown) {
      const ev = new CustomEvent('headerDropdownOpened', { detail: { source: openDropdown } });
      window.dispatchEvent(ev);
    }
  }, [openDropdown]);

  const renderDropdown = (menu) => {
    const hasActive = menu.items.some((item) => item.key === activeTab);
    const isOpen = openDropdown === menu.label;
    const isActivitiesProtected = menu.label === 'Activities' && !isAuthenticated;

    return (
      <div 
        key={menu.label} 
        className={`dropdown ${isOpen ? 'open' : ''}`} 
        onMouseEnter={!isMobile ? () => handleDropdownEnter(menu.label) : undefined} 
        onMouseLeave={!isMobile ? handleDropdownLeave : undefined}
      >
        <button 
          type="button" 
          className={`main-tab ${hasActive ? 'active' : ''}`} 
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={isMobile ? () => handleDropdownToggle(menu.label) : undefined}
        >
          {menu.label}
          <span className="caret">▾</span>
        </button>
        <div className={`dropdown-content ${isMobile ? 'mobile' : ''}`} style={{ display: isOpen ? 'block' : 'none' }}>
          {isActivitiesProtected && (
            <div className="dropdown-header" style={{ padding: '6px 12px', fontStyle: 'italic', color: '#666' }}>
              Please log in to access these activities.
            </div>
          )}
          {menu.items.map((item) => {
            if (item.type === 'header') {
              return (
                <div key={item.label} className="dropdown-header">
                  {item.label}
                </div>
              );
            }

            const requireAuthTooltip = 'Please log in to access this area';

            return (
              <button
                key={item.key || item.label}
                type="button"
                className={`dropdown-item ${activeTab === item.key ? 'active' : ''}`}
                onClick={() => {
                  if (isActivitiesProtected) return; // ignore clicks when disabled
                  if (item.external) {
                    const url = item.path + (userSub ? `?sub=${encodeURIComponent(userSub)}` : '');
                    window.open(url, '_blank');
                  } else if (item.path) {
                    navigate(item.path);
                    onMenuItemClick(); // Close mobile menu after navigation
                  } else {
                    handleTabClick(item.key);
                  }
                  if (isMobile) {
                    setOpenDropdown(null);
                  }
                }}
                disabled={isActivitiesProtected}
                title={isActivitiesProtected ? requireAuthTooltip : undefined}
                style={isActivitiesProtected ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`main-tabs ${isMobile ? 'mobile' : ''}`}>
      {/* Include ProfileMenu as first item when requested */}
      {includeProfileMenu && isMobile && (
        <ProfileMenu isMobile={true} onMenuItemClick={onMenuItemClick} />
      )}
      
      {MENU_CONFIG.map((menu) => {
        if (menu.type === 'link') {
          return (
            <button
              key={menu.key}
              type="button"
              className={`main-tab ${activeTab === menu.key ? 'active' : ''}`}
              onClick={() => handleTabClick(menu.key)}
            >
              {menu.label}
            </button>
          );
        }
        return renderDropdown(menu);
      })}
    </div>
  );
};

export default MainNavTabs; 