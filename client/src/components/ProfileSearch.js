import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ProfileSearch = ({ onViewProfile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showRecent, setShowRecent] = useState(true);

  // Load recent profiles when component mounts
  useEffect(() => {
    fetchRecentProfiles();
  }, []);

  // Fetch recent public profiles
  const fetchRecentProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/public-profiles?limit=12');
      // Ensure we always store an array to avoid runtime errors when rendering
      setProfiles(Array.isArray(response.data) ? response.data : []);
      setShowRecent(true);
    } catch (err) {
      console.error('Error fetching recent profiles:', err);
      setError('Failed to load profiles. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Handle search submission
  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!searchTerm.trim()) {
      fetchRecentProfiles();
      return;
    }
    
    setLoading(true);
    setError(null);
    setSearching(true);
    
    try {
      const response = await axios.get(`/public-profiles/search/${encodeURIComponent(searchTerm)}`);
      setProfiles(Array.isArray(response.data) ? response.data : []);
      setShowRecent(false);
    } catch (err) {
      console.error('Error searching profiles:', err);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    
    // If it's more than a week ago, show date
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    if (date < oneWeekAgo) {
      return date.toLocaleDateString();
    } else {
      // Otherwise, show relative time like "2 days ago"
      const diffTime = Math.abs(new Date() - date);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return 'Today';
      } else if (diffDays === 1) {
        return 'Yesterday';
      } else {
        return `${diffDays} days ago`;
      }
    }
  };

  // Truncate text for display
  const truncateText = (text, maxLength = 100) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="profile-search-container">
      <h2>Find Players</h2>
      
      <div className="search-container">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or location..."
            className="search-input"
          />
          <button type="submit" className="btn" disabled={loading}>
            {searching ? 'Searching...' : 'Search'}
          </button>
          {searchTerm && !showRecent && (
            <button 
              type="button" 
              className="btn" 
              onClick={fetchRecentProfiles}
            >
              Reset
            </button>
          )}
        </form>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      <div className="profiles-header">
        <h3>{showRecent ? 'Recent Profiles' : 'Search Results'}</h3>
        {!showRecent && <span>{profiles.length} profile(s) found</span>}
      </div>
      
      {loading ? (
        <div className="loading-profiles">Loading profiles...</div>
      ) : profiles.length === 0 ? (
        <div className="no-profiles">
          {showRecent 
            ? 'No public profiles available yet.' 
            : 'No profiles found matching your search. Try a different search term.'}
        </div>
      ) : (
        <div className="profiles-grid">
          {profiles.map(profile => (
            <div 
              key={profile.id} 
              className="profile-card"
              onClick={() => onViewProfile(profile.id)}
            >
              <div className="profile-card-header">
                <h4 className="profile-name">{profile.display_name}</h4>
                <div className="profile-level">Level {profile.level || 1}</div>
              </div>
              
              <div className="profile-card-body">
                {/* Role Badges */}
                {(!!profile.isadmin || !!profile.iseducator) && (
                  <div className="role-badges" style={{ marginBottom: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {!!profile.isadmin && (
                      <span style={{ backgroundColor: '#d9534f', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>Admin</span>
                    )}
                    {!!profile.iseducator && (
                      <span style={{ backgroundColor: '#0275d8', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>Educator</span>
                    )}
                  </div>
                )}
                
                {profile.location && (
                  <div className="profile-location">
                    <span className="label">Location:</span> {profile.location}
                  </div>
                )}
                
                {profile.bio ? (
                  <div className="profile-bio">{truncateText(profile.bio)}</div>
                ) : (
                  <div className="profile-bio empty">No bio available</div>
                )}
              </div>
              
              <div className="profile-card-footer">
                <div className="profile-stats">
                  <div className="stat">
                    <span className="value">{profile.xp_points || 0}</span>
                    <span className="label">XP</span>
                  </div>
                  <div className="stat">
                    <span className="value">{profile.streak_days || 0}</span>
                    <span className="label">Streak</span>
                  </div>
                </div>
                
                <div className="profile-last-seen">
                  Last active: {formatDate(profile.last_seen)}
                </div>
              </div>
              
              <button className="btn">View Profile</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfileSearch; 