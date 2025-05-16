import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const Preferences = () => {
  const { userData, isAuthenticated } = useAuth();
  const [userId, setUserId] = useState(null);
  const [formData, setFormData] = useState({
    theme: 'light',
    email_notifications: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Get user ID
  useEffect(() => {
    if (userData?.id) {
      console.log('User ID found in userData:', userData.id);
      setUserId(userData.id);
    }
  }, [userData]);

  // Fetch current preferences
  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        setLoading(true);
        console.log('Fetching preferences...');
        
        // First try regular userData from context
        if (userData?.id) {
          console.log('Attempting to fetch preferences using direct endpoint for user ID:', userData.id);
          try {
            // First, try our non-authenticated endpoint
            const directRes = await axios.get(`/api/user-preferences/${userData.id}`);
            console.log('Direct preferences response:', directRes.data);
            
            if (directRes.data) {
              setFormData({
                theme: directRes.data.theme || 'light',
                email_notifications: directRes.data.email_notifications !== undefined 
                  ? directRes.data.email_notifications 
                  : 1,
              });
              setUserId(userData.id);
              setLoading(false);
              return;
            }
          } catch (directErr) {
            console.warn('Error fetching from direct endpoint:', directErr.response || directErr);
          }
        }
        
        // Try authenticated /api/user/me endpoint (may fail due to auth issues)
        try {
          console.log('Fallback: fetching from /api/user/me...');
          const res = await axios.get('/api/user/me');
          console.log('Received user data from /api/user/me:', res.data);
          
          if (res.data.id) {
            setUserId(res.data.id);
            setFormData({
              theme: res.data.theme || 'light',
              email_notifications: res.data.email_notifications !== undefined 
                ? res.data.email_notifications 
                : 1,
            });
            setLoading(false);
            return;
          }
        } catch (authErr) {
          console.error('Error fetching /api/user/me:', authErr.response || authErr);
        }
        
        // Fallback to user sub approach
        const userSub = localStorage.getItem('userSub');
        if (userSub) {
          try {
            console.log('Attempting to fetch user by sub:', userSub);
            const subResponse = await axios.get(`/api/user/by-sub/${userSub}`);
            
            if (subResponse.data && subResponse.data.id) {
              console.log('Found user by sub, fetching full profile:', subResponse.data.id);
              
              // Get preferences using the found ID
              try {
                const prefsResponse = await axios.get(`/api/user-preferences/${subResponse.data.id}`);
                console.log('Preferences data from sub approach:', prefsResponse.data);
                
                setUserId(subResponse.data.id);
                setFormData({
                  theme: prefsResponse.data.theme || 'light',
                  email_notifications: prefsResponse.data.email_notifications !== undefined 
                    ? prefsResponse.data.email_notifications 
                    : 1,
                });
                setLoading(false);
                return;
              } catch (prefsErr) {
                console.error('Error fetching preferences by sub ID:', prefsErr);
              }
            }
          } catch (subErr) {
            console.error('Error fetching user by sub:', subErr);
          }
        }
        
        // As last resort, use default values
        console.log('Using default preferences (no data found)');
        setFormData({
          theme: 'light',
          email_notifications: 1,
        });
      } catch (err) {
        console.error('Failed to fetch preferences:', err.response || err);
        setError('Could not load preferences');
      } finally {
        setLoading(false);
      }
    };
    
    if (isAuthenticated) {
      fetchPrefs();
    }
  }, [isAuthenticated, userData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : value,
    }));
    
    // Preview theme change immediately
    if (name === 'theme') {
      console.log('🎨 Preview theme change:', value);
      // Apply theme preview immediately
      document.body.dataset.theme = value === 'system' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
        : value;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const currentUserId = userId || userData?.id;
    
    if (!currentUserId) {
      console.error('Cannot save preferences: No user ID available', {userData, userId});
      setError('Cannot save: User data unavailable');
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      console.log('Saving preferences for user ID:', currentUserId, formData);
      
      // Use the new non-authenticated endpoint
      const response = await axios.put(`/api/user-preferences/${currentUserId}`, formData);
      console.log('Save response:', response.data);
      
      // Validate that the changes were applied by checking the current values
      if (response.data.current) {
        const current = response.data.current;
        console.log('Current preferences after save:', current);
        
        // Check if the values match what we tried to save
        const themeMatch = current.theme === formData.theme;
        const notificationsMatch = 
          current.email_notifications === formData.email_notifications ||
          current.email_notifications === (formData.email_notifications === 1);
        
        if (!themeMatch || !notificationsMatch) {
          console.warn('Values after save don\'t match requested values:', {
            requested: formData,
            saved: current
          });
          
          // Show warning but also update the form with what's actually in the DB
          setError('Warning: Some values may not have been saved correctly');
          setFormData({
            theme: current.theme || 'light',
            email_notifications: current.email_notifications ? 1 : 0
          });
        } else {
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        }
      } else {
        // No verification data, just assume success
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Error updating preferences:', err);
      setError('Failed to save preference changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return <div className="not-authenticated">Please login to access preferences</div>;
  }

  if (loading) return <div className="prefs-loading">Loading preferences...</div>;

  return (
    <div className="preferences-page">
      <h2>Your Preferences</h2>
      <form onSubmit={handleSubmit} className="preferences-form">
        <div className="pref-group">
          <label htmlFor="theme">Theme</label>
          <select id="theme" name="theme" value={formData.theme} onChange={handleChange}>
            <option value="system">System Default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="pref-group checkbox-group">
          <label htmlFor="email_notifications">Email Notifications</label>
          <input
            type="checkbox"
            id="email_notifications"
            name="email_notifications"
            checked={formData.email_notifications === 1}
            onChange={handleChange}
          />
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        {success && <p className="pref-success">Preferences saved!</p>}
        {error && <p className="pref-error">{error}</p>}
      </form>
    </div>
  );
};

export default Preferences; 