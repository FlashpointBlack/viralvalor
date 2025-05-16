import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import { useAuth } from '../contexts/AuthContext';
import { sanitizeObject } from '../utils/textUtils';
import { useChat } from '../contexts/ChatContext';
import BadgeShowcase from './BadgeShowcase';
import './UserProfile.css';

const UserProfile = ({ userId = null }) => {
  const { user: authUser } = useAuth0();
  const { refreshAuthContextData } = useAuth();

  const [userData, setUserData] = useState({
    display_name: '',
    email: '',
    bio: '',
    location: '',
    profile_visibility: 'public',
    isadmin: 0,
    iseducator: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [userBadges, setUserBadges] = useState([]);
  const [stats, setStats] = useState({
    xp_points: 0,
    level: 1,
    streak_days: 0
  });
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [authStatus, setAuthStatus] = useState('checking');
  const fileInputRef = useRef(null);

  // Track viewport width to enable mobile-specific layout tweaks
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // If we are trying to load *the current logged-in user* (no explicit userId prop)
        // but Auth0 hasn't given us the fresh sub yet, wait until it is ready.
        if (!userId && !authUser?.sub) {
          console.log('[UserProfile] Auth0 user not ready – postponing initial profile fetch');
          return; // useEffect will re-run when authUser updates
        }

        setLoading(true);
        console.log('Fetching user profile data...');
        
        // First, check if we can get the Auth0 token from localStorage
        const auth0Token = localStorage.getItem('auth0Token') || localStorage.getItem('id_token');
        const userSub = authUser?.sub || null; // do NOT fall back to potentially stale localStorage value
        
        console.log('Auth status check:', { 
          hasToken: !!auth0Token, 
          hasUserSub: !!userSub 
        });
        
        // Default headers for authenticated requests
        const headers = {};
        if (auth0Token) {
          headers['Authorization'] = `Bearer ${auth0Token}`;
        }
        if (userSub) {
          headers['x-user-sub'] = userSub;
          // Keep localStorage in sync so truly unauthenticated requests can still access it later (e.g., image uploads).
          localStorage.setItem('userSub', userSub);
        }
        
        let userDataResponse;
        
        // If userId is provided, use it, otherwise try to get the current user
        if (userId) {
          // Fetch specific user by ID (for admin view or public profiles)
          userDataResponse = await axios.get(`/api/users/${userId}`);
          setAuthStatus('authenticated');
        } else {
          try {
            // Try to get current user first (if authenticated)
            console.log('Attempting to fetch authenticated user data...');
            userDataResponse = await axios.get('/api/user/me', { headers });
            
            if (userDataResponse.data && userDataResponse.data.id) {
              console.log('Successfully fetched authenticated user data:', userDataResponse.data.id);
              setAuthStatus('authenticated');
            } else {
              throw new Error('No user data returned');
            }
          } catch (err) {
            console.warn('Error fetching authenticated user:', err?.response?.status, err.message);
            
            // If we received a 404 from /api/user/me, it means the account row doesn't exist yet.
            if (err?.response?.status === 404 && authUser?.sub && authUser?.email) {
              try {
                console.log('No DB account found – creating blank profile for sub', authUser.sub);
                // Capture the response from the POST request
                const creationResponse = await axios.post('/api/users', {
                  email: authUser.email,
                  name: authUser.name || null,
                  auth0_sub: authUser.sub,
                  display_name: '',
                  profile_complete: 0
                });

                // Use the data directly from the creationResponse
                if (creationResponse && creationResponse.data) {
                  console.log('Successfully created profile, using response data:', creationResponse.data);
                  userDataResponse = creationResponse; // Or { data: creationResponse.data };
                } else {
                  console.error('Profile creation POST seemed successful but no data returned');
                  // Fallback, though less ideal:
                  // userDataResponse = await axios.get('/api/user/me', { headers }); 
                }
              } catch (createErr) {
                console.error('Failed to auto-create blank profile:', createErr);
              }
            }
            
            // If all authentication attempts fail, use demo data
            if (!userDataResponse) {
              console.log('Using demo data as fallback');
              userDataResponse = { 
                data: {
                  id: 0,
                  display_name: 'Demo User',
                  email: 'demo@example.com',
                  bio: 'This is a demo profile. Sign in to view your real profile.',
                  location: 'Demo Location',
                  profile_visibility: 'public',
                  xp_points: 250,
                  level: 5,
                  streak_days: 7
                }
              };
              setIsDemo(true);
              setAuthStatus('unauthenticated');
            }
          }
        }
        
        const userData = sanitizeObject(userDataResponse.data);
        
        // Set form data
        setUserData({
          id: userData.id,
          display_name: userData.display_name || '',
          email: userData.email || '',
          bio: userData.bio || '',
          location: userData.location || '',
          profile_visibility: userData.profile_visibility || 'public',
          isadmin: userData.isadmin || 0,
          iseducator: userData.iseducator || 0,
        });
        
        // Set stats (read-only)
        setStats({
          xp_points: userData.xp_points || 0,
          level: userData.level || 1,
          streak_days: userData.streak_days || 0
        });
        
        // Set profile image URL if available
        const picUrl = userData.picture_url ? (userData.picture_url.startsWith('/') ? userData.picture_url : `/${userData.picture_url}`) : '';
        setProfileImageUrl(picUrl);
        
        // Fetch user badges if we have a real user ID
        if (userData.id && userData.id > 0) {
          try {
            console.log(`Fetching badges for user ID ${userData.id}`);
            const badgesResponse = await axios.get(`/api/users/${userData.id}/badges`);
            console.log('Badge data:', badgesResponse.data);
            setUserBadges(sanitizeObject(badgesResponse.data) || []);
          } catch (err) {
            console.error('Could not fetch badges:', err);
            setUserBadges([]);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching user profile:', err);
        setError('Failed to load profile. Please try again later.');
        setAuthStatus('error');
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId, authUser]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData({
      ...userData,
      [name]: value
    });
  };

  // Upload helper (used internally)
  const uploadProfileImage = async (file) => {
    if (!file) return;

    // Prevent uploads in demo mode
    if (isDemo) {
      setUploadError('Please sign in to upload a profile picture.');
      return;
    }

    setSaving(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('userId', userData.id);
    formData.append('userSub', authUser?.sub || 'anonymous');

    try {
      const response = await axios.post('/images/uploads/profiles/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      if (response.data && response.data.imageUrl) {
        const url = response.data.imageUrl.startsWith('/') ? response.data.imageUrl : `/${response.data.imageUrl}`;
        setProfileImageUrl(url);
        setUserData(prev => ({ ...prev, picture_url: url }));
      }
    } catch (err) {
      console.error('Error uploading profile image:', err);
      setUploadError('Failed to upload image. Please try again.');
    } finally {
      setUploadProgress(0);
      setSaving(false);
      setSelectedImageFile(null);
    }
  };

  const handleProfileImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Immediate local preview
      setProfileImageUrl(URL.createObjectURL(file));
      setSelectedImageFile(file);
      // Kick off upload immediately
      uploadProfileImage(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check if we're in demo mode
    if (isDemo) {
      setError('Please sign in to save your profile changes.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      console.log('Saving profile changes for user ID:', userData.id);
      
      // Prepare data to send, including profile_complete status
      const profileDataToSend = {
        ...userData,
        profile_complete: userData.display_name && userData.display_name.trim() !== '' ? 1 : 0,
      };
      
      // Use the new non-authenticated endpoint
      const response = await axios.put(`/api/users/${userData.id}/profile`, profileDataToSend, {
        headers: authUser?.sub ? { 'x-user-sub': authUser.sub } : {}
      });
      console.log('Profile update response:', response.data);
      
      // Validate that the changes were applied by checking the current values
      if (response.data.current) {
        const current = response.data.current;
        console.log('Current profile after save:', current);
        
        // Update form data with the actual values from the database
        setUserData(prevData => ({
          ...prevData,
          ...sanitizeObject(current),
        }));
        // Also update stats if they are part of the 'current' object from the server
        if (current.xp_points !== undefined || current.level !== undefined || current.streak_days !== undefined) {
            setStats({
                xp_points: current.xp_points || 0,
                level: current.level || 1,
                streak_days: current.streak_days || 0
            });
        }
        // Also update profileImageUrl if it was part of the 'current' object and potentially changed
        // This is important if picture_url is updated by some other admin means and needs to reflect.
        // However, our current uploadProfileImage directly sets it.
        if (current.picture_url !== undefined) {
            const picUrl = current.picture_url ? (current.picture_url.startsWith('/') ? current.picture_url : `/${current.picture_url}`) : '';
            setProfileImageUrl(picUrl);
        }

      } else {
        // Fallback if response.data.current is not available (e.g., if fetch failed after update)
        // We can try to update the local state based on what was sent, though it might not be DB-accurate
        console.warn('Profile update response did not contain current data. Local state might be ahead of DB for a moment.');
        setUserData(profileDataToSend); // profileDataToSend includes the client-calculated profile_complete
      }
      
      setSuccess(true);
      
      // Reset success message after 3 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 3000);

      // Refresh AuthContext data to ensure global state (like profileComplete for nav guards) is updated
      if (refreshAuthContextData) {
        console.log('[UserProfile] Calling refreshAuthContextData after successful save.');
        refreshAuthContextData();
      }

    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to save profile changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  return (
    <div className="user-profile-container">
      <h2>User Profile {isDemo && <span>(Demo Mode)</span>}</h2>
      
      {error && <div className="profile-error">{error}</div>}
      {success && <div className="profile-success">Profile updated successfully!</div>}
      {authStatus === 'unauthenticated' && (
        <div className="profile-notice">
          <p>You're viewing a demo profile. Please log in to see and edit your actual profile.</p>
        </div>
      )}
      
      <div className="profile-content" style={{ display: 'flex', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        <div className="left-column" style={{ width: isMobile ? '100%' : '30%', paddingRight: isMobile ? '0' : '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div 
            className="profile-picture-section" 
            style={{ marginBottom: '20px', cursor: 'pointer', width: '100%' }}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            <div style={{ 
              width: '100%',
              aspectRatio: '1 / 1',
              margin: '0 auto',
              border: '1px solid #ccc',
              borderRadius: '50%',
              overflow: 'hidden'
            }}>
              {profileImageUrl ? (
                <img 
                  src={profileImageUrl} 
                  alt="Profile" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover'
                  }}
                />
              ) : (
                <img 
                  src="/images/DoctorFade.gif" 
                  alt="Default Profile" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover'
                  }}
                />
              )}
            </div>
          </div>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleProfileImageChange} 
            style={{ display: 'none' }}
            ref={fileInputRef}
          />
          {uploadProgress > 0 && (
            <progress value={uploadProgress} max="100" style={{ width: '100%' }}>{uploadProgress}%</progress>
          )}
          {uploadError && <div className="profile-error">{uploadError}</div>}
          {!isMobile && <div className="profile-stats" style={{ marginTop: '20px', width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>Progress</h3>
              <div className="stats-grid" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-around', gap: '15px', width: '100%' }}>
                <div className="stat-item" style={{ padding: '10px' }}>
                  <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.xp_points}</div>
                  <div className="stat-label">XP Points</div>
                </div>
                
                <div className="stat-item" style={{ padding: '10px' }}>
                  <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.level}</div>
                  <div className="stat-label">Level</div>
                </div>
                
                <div className="stat-item" style={{ padding: '10px' }}>
                  <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.streak_days}</div>
                  <div className="stat-label">Day Streak</div>
                </div>
              </div>
              {/* Role badges just below stats */}
              {(!!userData.isadmin || !!userData.iseducator) && (
                <div className="role-badges" style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {!!userData.isadmin && (
                    <span style={{ backgroundColor: '#d9534f', color: '#fff', padding: '4px 10px', borderRadius: '14px', fontSize: '0.8rem', fontWeight: 'bold' }}>Admin</span>
                  )}
                  {!!userData.iseducator && (
                    <span style={{ backgroundColor: '#0275d8', color: '#fff', padding: '4px 10px', borderRadius: '14px', fontSize: '0.8rem', fontWeight: 'bold' }}>Educator</span>
                  )}
                </div>
              )}
            </div>
          </div>}
        </div>
        
        <div className="profile-form-section" style={{ width: isMobile ? '100%' : '70%', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="display_name">Display Name</label>
              <input
                type="text"
                id="display_name"
                name="display_name"
                value={userData.display_name}
                onChange={handleChange}
                placeholder="Your display name"
                required
              />
              {userData.display_name.trim() === '' && (
                <div style={{ color: 'red', fontWeight: 'bold', marginTop: '0.25rem', textAlign: 'center' }}>
                  You must choose a display name.
                </div>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="email">Registration Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={userData.email}
                placeholder="Registration email"
                readOnly
                disabled
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                value={userData.bio}
                onChange={handleChange}
                placeholder="Tell us about yourself"
                rows="4"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="location">Organization</label>
              <input
                type="text"
                id="location"
                name="location"
                value={userData.location}
                onChange={handleChange}
                placeholder="Your organization"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="profile_visibility">Profile Visibility</label>
              <select
                id="profile_visibility"
                name="profile_visibility"
                value={userData.profile_visibility}
                onChange={handleChange}
              >
                <option value="public">Public - Your profile can be found in public searches</option>
                <option value="private">Private - Your profile is only visible to administrators</option>
              </select>
            </div>
            
            {/* New div to align button to the right */}
            <div style={{ textAlign: 'left', marginTop: '20px' }}> 
              <button 
                className="btn btn-save-profile" 
                disabled={saving || isDemo}
                type="submit"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
      
      {/* Mobile-only stats section just before badges */}
      {isMobile && (
        <div className="profile-stats" style={{ width: '100%', marginTop: '20px', marginBottom: '20px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>Progress</h3>
            <div className="stats-grid" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: '15px', width: '100%' }}>
              <div className="stat-item" style={{ padding: '10px' }}>
                <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.xp_points}</div>
                <div className="stat-label">XP Points</div>
              </div>
              
              <div className="stat-item" style={{ padding: '10px' }}>
                <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.level}</div>
                <div className="stat-label">Level</div>
              </div>
              
              <div className="stat-item" style={{ padding: '10px' }}>
                <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.streak_days}</div>
                <div className="stat-label">Day Streak</div>
              </div>
            </div>
            {/* Role badges just below stats */}
            {(!!userData.isadmin || !!userData.iseducator) && (
              <div className="role-badges" style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {!!userData.isadmin && (
                  <span style={{ backgroundColor: '#d9534f', color: '#fff', padding: '4px 10px', borderRadius: '14px', fontSize: '0.8rem', fontWeight: 'bold' }}>Admin</span>
                )}
                {!!userData.iseducator && (
                  <span style={{ backgroundColor: '#0275d8', color: '#fff', padding: '4px 10px', borderRadius: '14px', fontSize: '0.8rem', fontWeight: 'bold' }}>Educator</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      <BadgeShowcase badges={userBadges} />
    </div>
  );
};

export default UserProfile; 