import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import axios from 'axios';

// Ensure axios sends cookies for same-site API calls
axios.defaults.withCredentials = true;

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // Get Auth0 data directly from the Auth0Provider
  const { 
    isAuthenticated, 
    loginWithRedirect, 
    logout, 
    user, 
    isLoading, 
    getAccessTokenSilently 
  } = useAuth0();
  
  const [isAdmin, setIsAdmin] = useState(false);
  // null = not yet determined, boolean once fetched
  const [profileComplete, setProfileComplete] = useState(null);
  const [userData, setUserData] = useState(null);
  const [token, setToken] = useState(null);

  // Encapsulate the user data fetching logic so it can be called manually
  const fetchAuthUserData = useCallback(async () => {
    if (isAuthenticated && user?.sub && token !== null) {
      console.log('[AuthContext] Refreshing profile status and user data', {
        sub: user?.sub,
        tokenSnippet: token?.substring?.(0, 10),
      });
      try {
        const authHeader = { headers: { Authorization: `Bearer ${token}`, 'x-user-sub': user?.sub } };
        const { data: profileData } = await axios.get('users/profile-status', authHeader);
        setProfileComplete(profileData.profileComplete);
        setIsAdmin(profileData.isAdmin);

        const { data: meData } = await axios.get('users/me', authHeader);
        setUserData(meData);
        if (meData?.display_name) {
          localStorage.setItem('display_name', meData.display_name);
        }
      } catch (error) {
        console.error('[AuthContext] profile-status or user/me fetch failed during refresh', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });
      }
    } else {
      console.log('[AuthContext] Skipping refreshAuthUserData: conditions not met', { isAuthenticated, userSub: user?.sub, tokenExists: !!token });
    }
  }, [isAuthenticated, user, token]);

  // Fetch token when authenticated
  useEffect(() => {
    const getToken = async () => {
      try {
        if (isAuthenticated) {
          try {
            const accessToken = await getAccessTokenSilently();
            // eslint-disable-next-line no-console
            console.log('[AuthContext] retrieved access token', accessToken?.substring?.(0, 10), '...');

            if (!accessToken) {
              console.warn('[AuthContext] No access token retrieved');
              return;
            }

            setToken(accessToken);

            // No global axios header; will use fetch for secure API calls per request.
          } catch (err) {
            // Auth0 will throw if no refresh token is available ("Missing Refresh Token").
            // This typically happens for users who logged-in before we added the
            // offline_access scope. It isn't fatal – we can keep operating without
            // a refreshed access-token until the next interactive login.
            if (err?.message?.includes('Missing Refresh Token')) {
              console.warn('[AuthContext] No refresh token available yet – silent token refresh skipped.');
            } else {
              console.error('[AuthContext] getAccessTokenSilently failed', err);
            }
          }
        }
      } catch (error) {
        console.error('Error getting token:', error);
      }
    };

    getToken();
  }, [isAuthenticated, getAccessTokenSilently]);

  // Check user profile status once we have a valid token
  useEffect(() => {
    fetchAuthUserData();
  }, [fetchAuthUserData]);

  // Fallback: fetch display_name using simple endpoint that requires only sub
  useEffect(() => {
    if (user?.sub && !userData) {
      // eslint-disable-next-line no-console
      console.log('[AuthContext] Fetching display_name via by-sub endpoint');
      axios.get(`users/by-sub/${encodeURIComponent(user.sub)}`)
        .then(({ data }) => data)
        .then(data => {
          setUserData(data);

          if (data?.display_name) {
            localStorage.setItem('display_name', data.display_name);
          }
        })
        .catch(err => {
          console.error('[AuthContext] by-sub fetch failed', err);
        });
    }
  }, [user, userData]);

  // Handle logout
  const handleLogout = () => {
    // Ask backend/openid to clear its cookie (errors ignored).
    axios.get('/logout', { withCredentials: true }).catch(() => {});

    // Blow away every bit of client-side persisted state to prevent stale data
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[AuthContext] Storage clearing failed', e);
    }

    // Ensure future axios requests start clean
    delete axios.defaults.headers.common['x-user-sub'];

    // Finally, redirect through Auth0 logout
    logout({ returnTo: window.location.origin });
  };

  // Store user sub in localStorage for development purposes
  useEffect(() => {
    if (isAuthenticated && user?.sub) {
      localStorage.setItem('userSub', user.sub);
      axios.defaults.headers.common['x-user-sub'] = user.sub;
    } else {
      delete axios.defaults.headers.common['x-user-sub'];
    }
  }, [isAuthenticated, user]);

  // Add axios interceptors only once
  useEffect(() => {
    // axios.interceptors.request.use(cfg => {
    //   console.log('[Axios] Outbound', cfg.method, cfg.url, cfg);
    //   return cfg;
    // });
  }, []);

  const value = {
    isAuthenticated,
    isLoading,
    user,
    userData,
    token,
    isAdmin,
    profileComplete,
    login: loginWithRedirect,
    logout: handleLogout,
    refreshAuthContextData: fetchAuthUserData
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 