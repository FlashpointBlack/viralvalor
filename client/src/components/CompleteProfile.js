import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import axios from 'axios';

const CompleteProfile = () => {
  const { user } = useAuth0();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!displayName.trim()) {
      setError('Please enter a display name');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      await axios.post('/submit-profile', { displayName });
      // After profile creation, take user to full profile editor page
      navigate('/?tab=profile', { replace: true });
    } catch (err) {
      console.error('Error completing profile:', err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="complete-profile-container">
      <div className="complete-profile-card">
        <h2>Complete Your Profile</h2>
        
        {user?.picture && (
          <div className="profile-picture-container">
            <img 
              src={user.picture} 
              alt={user.name || 'Profile'} 
              className="profile-picture" 
            />
          </div>
        )}
        
        <p className="welcome-message">
          Welcome, {user?.name}! Please choose a display name to continue.
        </p>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="displayName">Display Name</label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Choose a display name"
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="btn" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Complete Profile'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile; 