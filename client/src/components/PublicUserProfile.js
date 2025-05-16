import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { sanitizeObject } from '../utils/textUtils';
import { useChat } from '../contexts/ChatContext';
import { useAuth0 } from '@auth0/auth0-react';
import BadgeShowcase from './BadgeShowcase';

const PublicUserProfile = ({ userId, onBack }) => {
  const { user: currentUser } = useAuth0();
  const { openChat } = useChat();
  const [userData, setUserData] = useState({
    display_name: '',
    bio: '',
    location: '',
    profile_visibility: 'public',
    isadmin: 0,
    iseducator: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userBadges, setUserBadges] = useState([]);
  const [stats, setStats] = useState({
    xp_points: 0,
    level: 1,
    streak_days: 0
  });
  const [userNotFound, setUserNotFound] = useState(false);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [isMyProfile, setIsMyProfile] = useState(false);
  const [profileSub, setProfileSub] = useState('');

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) {
        setError('No user ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log(`Fetching public profile for user ID: ${userId}`);
        
        // Fetch the user data
        const userResponse = await axios.get(`/api/users/${userId}`);
        const userData = sanitizeObject(userResponse.data);
        
        // Check profile visibility
        if (userData.profile_visibility === 'private') {
          setPrivateProfile(true);
          setLoading(false);
          return;
        }
        
        // Compute display name with sane fallbacks
        const computedDisplayName = userData.display_name && userData.display_name.trim()
          ? userData.display_name.trim()
          : (userData.nickname || userData.name || userData.email || 'Anonymous User');
        
        // Set user data (store numeric id and display fields)
        setUserData({
          id: userData.id,
          display_name: computedDisplayName,
          bio: userData.bio || '',
          location: userData.location || '',
          profile_visibility: userData.profile_visibility || 'public',
          isadmin: userData.isadmin || 0,
          iseducator: userData.iseducator || 0,
        });
        
        // Store profile user's Auth0 sub separately
        setProfileSub(userData.auth0_sub || '');
        
        // Profile image (ensure leading slash)
        const picUrl = userData.picture_url ? (userData.picture_url.startsWith('/') ? userData.picture_url : `/${userData.picture_url}`) : '';
        setProfileImageUrl(picUrl);
        
        // Set stats
        setStats({
          xp_points: userData.xp_points || 0,
          level: userData.level || 1,
          streak_days: userData.streak_days || 0
        });
        
        // Fetch user badges
        if (userData.id) {
          try {
            const badgesResponse = await axios.get(`/api/users/${userData.id}/badges`);
            setUserBadges(sanitizeObject(badgesResponse.data) || []);
          } catch (err) {
            console.error('Could not fetch badges:', err);
            setUserBadges([]);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching user profile:', err);
        
        if (err.response && err.response.status === 404) {
          setUserNotFound(true);
        } else {
          setError('Failed to load profile. Please try again later.');
        }
        
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  // Added: Check if this is the current user's profile
  useEffect(() => {
    if (currentUser && profileSub && currentUser.sub === profileSub) {
      setIsMyProfile(true);
    } else {
      setIsMyProfile(false);
    }
  }, [currentUser, profileSub]);

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
    }
  };

  // Added: Function to handle opening the chat
  const handleSendMessage = async () => {
    if (!profileSub || !currentUser || !currentUser.sub) {
      console.error("User data or current user data not available to start chat");
      setError("Could not initiate chat. Please try again.");
      return;
    }

    if (isMyProfile) {
      console.error("Cannot send message to oneself via this button.");
      return;
    }

    try {
      // Step 1: Find or create a direct conversation
      const { data: conversationData } = await axios.post('/api/conversations/direct', {
        userSubA: currentUser.sub, 
        userSubB: profileSub
      });

      if (!conversationData || !conversationData.conversationId) {
        throw new Error(conversationData.error || 'Failed to find or create conversation');
      }
      
      // Construct the conversation object for openChat.
      // The backend should return the necessary details.
      // We ensure 'other' is populated with the profile user's details.
      const conversationForChatContext = {
        conversationId: conversationData.conversationId,
        other: {
          sub: profileSub,
          name: userData.display_name && userData.display_name.trim()
            ? userData.display_name.trim()
            : (userData.nickname || userData.name || userData.email || 'Anonymous User'),
          picture_url: profileImageUrl,
          ...(conversationData.other || {})
        },
        ...(conversationData.participants ? { participants: conversationData.participants } : {}),
        ...(conversationData.lastMessage ? { lastMessage: conversationData.lastMessage } : {}),
        ...(typeof conversationData.unreadCount !== 'undefined' ? { unreadCount: conversationData.unreadCount } : {})
      };

      openChat(conversationForChatContext);

    } catch (err) {
      console.error('Error preparing chat:', err);
      setError(err.message || 'Could not open chat. Please try again later.');
    }
  };

  if (loading) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  if (userNotFound) {
    return (
      <div className="user-profile-container">
        <div className="profile-error">User not found</div>
        <p>The requested user profile could not be found.</p>
        <button className="btn" onClick={handleBack}>
          Return to Users
        </button>
      </div>
    );
  }

  if (privateProfile) {
    return (
      <div className="user-profile-container">
        <div className="profile-notice">Private Profile</div>
        <p>This user has set their profile to private. Only administrators can view private profiles.</p>
        <button className="btn" onClick={handleBack}>
          Return to Users
        </button>
      </div>
    );
  }

  return (
    <div className="user-profile-container public-profile">
      <div className="profile-header">
        <h2>User Profile: {userData.display_name}</h2>
        {/* Added Send Message Button */}
        {!isMyProfile && userData.id && (
          <button 
            className="btn btn-primary" 
            onClick={handleSendMessage}
            style={{ marginLeft: '20px' }} // Added some margin
          >
            Send Message
          </button>
        )}
        {/* Removed Back to Search button by commenting it out or deleting the line 
        <button className="btn btn-secondary" onClick={handleBack} style={{ marginLeft: 'auto' }}>
          Back to Search
        </button> 
        */}
      </div>
      
      {error && <div className="profile-error">{error}</div>}
      
      <div className="profile-content" style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div className="left-column" style={{ width: '30%', paddingRight: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div 
            className="profile-picture-section" 
            style={{ marginBottom: '20px', width: '100%' }}
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
                  alt={`${userData.display_name || 'User'}'s profile`}
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover'
                  }}
                />
              ) : (
                <img 
                  src="/images/DoctorFade.gif" 
                  alt="Default profile picture"
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover'
                  }}
                />
              )}
            </div>
          </div>
          
          <div className="profile-stats" style={{ marginTop: '20px', width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>Progress</h3>
              <div className="stats-grid" style={{ display: 'flex', justifyContent: 'space-around', gap: '15px', width: '100%' }}>
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
        </div>

        <div className="profile-form-section" style={{ width: '70%' }}>
          <div className="profile-card" style={{ marginBottom: '20px' }}>
            <h3>About</h3>
            {userData.location && (
              <div className="profile-field" style={{ marginBottom: '10px'}}>
                <strong>Organization:</strong> {userData.location}
              </div>
            )}
            {userData.bio ? (
              <div className="profile-field">
                <strong>Bio:</strong> {userData.bio}
              </div>
            ) : (
              <div className="profile-field empty">
                This user hasn't added a bio yet.
              </div>
            )}
          </div>
          
          <BadgeShowcase badges={userBadges} />
        </div>
      </div>
    </div>
  );
};

export default PublicUserProfile; 