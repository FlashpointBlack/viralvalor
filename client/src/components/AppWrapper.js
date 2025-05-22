import React, { useEffect } from 'react';
import ChatManager from './ChatManager';
import MessageDropdown from './MessageDropdown';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { useLocation } from 'react-router-dom';

// Utility to apply theme to body element
const applyTheme = (theme) => {
  console.log('🔍 Applying theme:', theme);
  const validThemes = ['light', 'dark', 'system'];
  // Normalize theme string to lowercase to avoid case sensitivity issues
  let t = typeof theme === 'string' ? theme.trim().toLowerCase() : theme;
  if (!validThemes.includes(t)) {
    console.log('⚠️ Invalid theme detected, defaulting to system:', theme);
    t = 'system';
  }
  if (t === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    t = mq.matches ? 'dark' : 'light';
    console.log('🌗 System theme resolved to:', t);
  }
  document.body.dataset.theme = t; // add data-theme attribute for CSS
  
  // Force style recalculation
  document.body.style.display = 'none';
  setTimeout(() => {
    document.body.style.display = '';
    console.log('✅ Theme applied:', t, 'data-theme=', document.body.dataset.theme);
  }, 10);
};

const AppWrapper = ({ children }) => {
  const { userData } = useAuth();
  const location = useLocation();
  const shouldApplySpecialLayout = (
    location.pathname.startsWith('/game') ||
    location.pathname.startsWith('/presentation-display') ||
    location.pathname.startsWith('/presentation-landing') ||
    location.pathname.startsWith('/presentation-end') ||
    
    location.pathname.includes('/poll')
  );

  useEffect(() => {
    console.log('🔄 userData changed in AppWrapper:', userData);
    
    // Apply a default theme immediately if no theme is set
    if (!document.body.dataset.theme) {
      console.log('🔍 No initial theme detected, setting default light theme');
      document.body.dataset.theme = 'light';
    }
    
    if (userData?.theme) {
      console.log('📱 User theme preference from userData:', userData.theme);
      applyTheme(userData.theme);
    } else {
      console.log('⚠️ No theme in userData, current theme:', document.body.dataset.theme);
    }
  }, [userData?.theme]);

  // NEW: Attempt to fetch theme preference if userData exists but no theme value yet
  useEffect(() => {
    const fetchAndApplyTheme = async () => {
      if (userData?.id && !userData?.theme) {
        try {
          console.log('🔄 Fetching theme preference for user', userData.id);
          const res = await axios.get(`/api/user-preferences/${userData.id}`);
          if (res && res.data) {
            const prefs = res.data;
            if (prefs?.theme) {
              console.log('🎨 Theme preference retrieved from API:', prefs.theme);
              applyTheme(prefs.theme);
            } else {
              console.log('⚠️ Theme not found in preferences response');
            }
          } else {
            console.warn('⚠️ Failed to fetch preferences via axios');
          }
        } catch (err) {
          console.error('❌ Error fetching theme preference:', err);
        }
      }
    };

    fetchAndApplyTheme();
  }, [userData?.id, userData?.theme]);

  return (
    <>
      {children}
      <ChatManager />
      {!shouldApplySpecialLayout && <MessageDropdown />}
    </>
  );
};

export default AppWrapper; 