import React, { useEffect, useContext, createContext } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { EncounterProvider } from './contexts/EncounterContext';
import { ChatProvider } from './contexts/ChatContext';
import { SocketProvider } from './contexts/SocketContext';
import { useAuth0 } from '@auth0/auth0-react';
import { useAuth } from './contexts/AuthContext';
import StoryView from './components/StoryView';
import HomePage from './components/HomePage';
import EducatorPanel from './components/EducatorPanel';
import EncounterDisplay from './components/EncounterDisplay';
import EncounterDisplayPlaceholder from './components/EncounterDisplayPlaceholder';
import MobilePoll from './components/MobilePoll';
import CompleteProfile from './components/CompleteProfile';
import UserProfile from './components/UserProfile';
import LoginButton from './components/LoginButton';
import LogoutButton from './components/LogoutButton';
import AppWrapper from './components/AppWrapper';
import ScrollToTop from './components/ScrollToTop';
import useCustomNavigation from './hooks/useCustomNavigation';
import navigationHistory from './utils/history';
import { ToastProvider } from './contexts/ToastContext';
import './main.css';
import axios from 'axios';
import PresentationLanding from './components/PresentationLanding';
import PresentationEnd from './components/PresentationEnd';
import PresentationDisplayHost from './components/PresentationDisplayHost';
import RoutesWithEncounter from './RoutesWithEncounter';

// Create a context for our custom navigation to be accessible throughout the app
export const NavigationContext = createContext(null);

// Simple Protected Route component using Auth0 directly
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isLoading, user } = useAuth0();
  const { isAdmin, profileComplete } = useAuth();
  const location = useLocation();
  
  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }
  
  // If on /presentation-display, allow it to render without full auth/profile checks
  // as it's a passive display window controlled by an authenticated educator.
  if (location.pathname === '/presentation-display') {
    return children;
  }
  
  if (!isAuthenticated) {
    return <div>Please log in to access this page.</div>;
  }
  
  // While profile status is still unknown, show a placeholder to avoid premature redirects
  if (profileComplete === null) {
    return <div className="loading">Checking profile…</div>;
  }
  
  // Redirect users with incomplete profiles to the in-app profile tab
  // UNLESS it's the presentation display window.
  if (profileComplete === false) {
    if (location.pathname !== '/presentation-display') { 
        return <Navigate to="/?tab=profile" replace />;
    }
  }
  
  // For admin routes - add logic to check if user is admin
  if (requireAdmin) {
    if (!isAdmin) {
      return <div>You need admin access for this page.</div>;
    }
  }
  
  return children;
};

const App = () => {
  const { isAuthenticated, user, isLoading, error } = useAuth0();
  const location = useLocation();
  const { isAdmin, profileComplete } = useAuth();
  const navigate = useNavigate();
  const customNavigation = useCustomNavigation();

  // Store user sub in localStorage for development purposes
  useEffect(() => {
    // Debug Auth0 state
    console.table({ isLoading, isAuthenticated, user, error });

    if (isAuthenticated && user?.sub) {
      localStorage.setItem('userSub', user.sub);
    }
  }, [isLoading, isAuthenticated, user, error]);

  // Improve back button behavior by listening for popstate events
  useEffect(() => {
    // Track navigation history in sessionStorage for SPA back button support
    const updateHistoryStack = () => {
      try {
        // Get current history stack or initialize if doesn't exist
        const historyStack = JSON.parse(sessionStorage.getItem('navigationHistory') || '[]');
        
        // Only add new location if it's different from the last one
        const currentFullPath = location.pathname + location.search;
        if (historyStack.length === 0 || historyStack[historyStack.length - 1] !== currentFullPath) {
          // Add current path to history stack
          historyStack.push(currentFullPath);
          
          // Limit history size to avoid excessive memory usage
          if (historyStack.length > 50) {
            historyStack.shift(); // Remove oldest entry
          }
          
          // Save updated history stack
          sessionStorage.setItem('navigationHistory', JSON.stringify(historyStack));
          console.log('History stack updated:', historyStack);
        }
      } catch (error) {
        console.error('Error updating history stack:', error);
      }
    };
    
    // Update history stack when location changes
    updateHistoryStack();
    
    const handlePopState = (event) => {
      // Log when back button is pressed
      console.log('Back/forward button pressed, new location:', window.location.pathname);
    };

    // Listen for popstate events (back/forward button clicks)
    window.addEventListener('popstate', handlePopState);

    // Clean up when component unmounts
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [location]);

  // After login redirect back to intended page
  useEffect(() => {
    if (isAuthenticated) {
      const redirectPath = sessionStorage.getItem('postLoginRedirect');
      if (redirectPath) {
        sessionStorage.removeItem('postLoginRedirect');
        if (redirectPath !== location.pathname + location.search) {
          navigate(redirectPath, { replace: true });
        }
      }
    }
  }, [isAuthenticated, navigate, location.pathname, location.search]);

  // Redirect users with incomplete profiles to the in-app profile tab
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Determine if current page is profile edit inside HomePage
      const params = new URLSearchParams(location.search);
      const isProfileTab = location.pathname === '/' && params.get('tab') === 'profile';

      if (profileComplete === false && !isProfileTab) {
        // Remember where the user came from so we can return after profile completion
        try {
          const currentFullPath = location.pathname + location.search;
          sessionStorage.setItem('returnAfterProfile', currentFullPath);
        } catch (e) {
          console.warn('Could not persist returnAfterProfile', e);
        }
        navigate('/?tab=profile', { replace: true });
      } else if (profileComplete === true && isProfileTab) {
        // No redirect needed – already on desired tab
      } else if (profileComplete === true && location.pathname === '/complete-profile') {
        // Legacy support – redirect away from deprecated route
        navigate('/?tab=profile', { replace: true });
      }
    }
  }, [isLoading, isAuthenticated, profileComplete, location.pathname, location.search, navigate]);

  // Once the user has completed their profile, return them to the page they came from (if any)
  useEffect(() => {
    if (!isLoading && isAuthenticated && profileComplete === true) {
      try {
        const returnPath = sessionStorage.getItem('returnAfterProfile');
        if (returnPath) {
          sessionStorage.removeItem('returnAfterProfile');
          if (returnPath !== location.pathname + location.search) {
            navigate(returnPath, { replace: true });
          }
        }
      } catch (e) {
        console.warn('Error handling returnAfterProfile', e);
      }
    }
  }, [isLoading, isAuthenticated, profileComplete, location.pathname, location.search, navigate]);

  // Determine if we should hide the global header (HomePage already has its own header)
  const hideGlobalHeader = (
    location.pathname === '/' ||
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/multiplayer') ||
    location.pathname.startsWith('/game') ||
    location.pathname.includes('/educator-panel') ||
    location.pathname.startsWith('/encounters2') ||
    location.pathname.startsWith('/poll') ||
    location.pathname.includes('/poll') ||
    location.pathname.startsWith('/presentation-landing') ||
    location.pathname.startsWith('/presentation-end') ||
    location.pathname.startsWith('/presentation-display')
  );

  return (
    <NavigationContext.Provider value={customNavigation}>
      <ToastProvider>
        <SocketProvider>
          <ChatProvider>
            <AppWrapper>
              <ScrollToTop />
              <div className="app">
                {!hideGlobalHeader && (
                  <header className="app-header">
                    {!isAuthenticated ? (
                      <LoginButton />
                    ) : (
                      <>
                        <span className="user-welcome">Welcome, {user.name}</span>
                        <LogoutButton />
                      </>
                    )}
                  </header>
                )}
                
                <Routes>
                  {/* Route for PresentationDisplayHost - NO EncounterProvider here */}
                  <Route path="/presentation-display" element={<PresentationDisplayHost />} />
                  
                  {/* Other routes that explicitly DO NOT need EncounterProvider can go here */}
                  {/* For example, a standalone login page if it existed outside other flows */}

                  {/* All other application routes that DO need EncounterContext */}
                  <Route 
                    path="/*" 
                    element={                       
                      <EncounterProvider>
                        <RoutesWithEncounter />
                      </EncounterProvider>
                    }
                  />
                </Routes>
              </div>
            </AppWrapper>
          </ChatProvider>
        </SocketProvider>
      </ToastProvider>
    </NavigationContext.Provider>
  );
};

export default App; 