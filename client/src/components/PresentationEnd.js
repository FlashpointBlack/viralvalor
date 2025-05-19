import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './PresentationLanding.css'; // Reuse same vibrant background & styles
import axios from 'axios';

const PresentationEnd = ({ hostSubForDisplay, hostSub, gameId }) => {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [presenter, setPresenter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load presenter info from hostSubForDisplay prop or query params as fallback
  useEffect(() => {
    // Use prop if provided, otherwise try URL param as fallback
    let hostSubLocal = hostSubForDisplay || hostSub;
    
    // Fallback to URL param if no prop
    const urlParams = new URLSearchParams(window.location.search);
    if (!hostSubLocal) {
      hostSubLocal = urlParams.get('hostSub');
    }

    console.log(`[PresentationEnd] Loading presenter info for hostSub: ${hostSubLocal}`);

    const fetchPresenter = async (sub) => {
      try {
        // Convert sub -> numeric ID
        const { data } = await axios.get(`/user/by-sub/${encodeURIComponent(sub)}`);
        const userId = data?.id;
        if (!userId) {
          setError('Presenter not found');
          setLoading(false);
          return;
        }

        const userResp = await axios.get(`/users/${userId}`);
        setPresenter(userResp.data);
        console.log('[PresentationEnd] Loaded presenter data:', userResp.data);
      } catch (err) {
        console.error('Failed to fetch presenter info', err);
        setError('Failed to load presenter info');
      } finally {
        setLoading(false);
      }
    };

    if (hostSubLocal) {
      fetchPresenter(hostSubLocal);
    } else {
      console.warn('[PresentationEnd] No hostSub provided via prop or URL');
      setLoading(false);
    }
  }, [hostSubForDisplay, hostSub]);

  // Allow listener for incoming LOAD_ENCOUNTER to support transitions if needed
  useEffect(() => {
    const createMessageListener = (handler) => {
      return (event) => {
        const sameOrigin = event.origin === window.location.origin;
        const localhost = event.origin.includes('localhost') || event.origin.includes('127.0.0.1');
        if (!sameOrigin && !localhost) return;
        if (!event.data || typeof event.data !== 'object' || !event.data.type) return;
        handler(event.data);
      };
    };

    const handleMessage = (data) => {
      if (data.type === 'LOAD_ENCOUNTER') {
        // Guard against messages from a different game session
        const expectedGameId = new URLSearchParams(window.location.search).get('gameId');
        if (expectedGameId) {
          if (!data.gameId || data.gameId !== expectedGameId) {
            console.warn('[PresentationEnd] Ignoring LOAD_ENCOUNTER for mismatched game', {
              expected: expectedGameId,
              received: data.gameId
            });
            return;
          }
        }

        const { encounterId, displayMode } = data;
        if (encounterId) {
          let url = `/encounters2/${encounterId}`;
          if (displayMode) url += `?displayMode=${displayMode}`;
          // Ensure we propagate the gameId forward
          const suffix = expectedGameId ? (url.includes('?') ? `&gameId=${expectedGameId}` : `?gameId=${expectedGameId}`) : '';
          navigate(url + suffix);
        }
      }
    };

    const listener = createMessageListener(handleMessage);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [navigate]);

  // Double-click to toggle fullscreen
  const toggleFullscreen = () => {
    try {
      const elem = document.documentElement;
      if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
          elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  return (
    <div
      className="presentation-landing-container"
      ref={containerRef}
      onDoubleClick={toggleFullscreen}
    >
      <h1 className="presentation-welcome">Thank you for joining this Viral Valor adventure!</h1>
      {loading && <p style={{color:'#fff'}}>Loading presenter info...</p>}
      {error && <p style={{color:'#fff'}}>{error}</p>}
      {presenter && (
        <div style={{
          background:'rgba(255,255,255,0.85)',
          borderRadius:'12px',
          padding:'20px',
          maxWidth:'500px',
          width:'90%',
          color:'#333',
          boxShadow:'0 8px 20px rgba(0,0,0,0.3)',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease',
          animation: 'fadeIn 1s ease-out',
          backdropFilter: 'blur(5px)'
        }}>
          {presenter.picture_url && (
            <img 
              src={presenter.picture_url.startsWith('/') ? presenter.picture_url : `/${presenter.picture_url}`} 
              alt="Presenter" 
              style={{
                width:'300px',
                height:'300px',
                borderRadius:'50%',
                objectFit:'cover',
                margin:'20px auto 15px',
                display: 'block',
                border: '5px solid white',
                boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
              }} 
            />
          )}
          <h2 style={{
            margin:'15px 0', 
            fontSize: '2rem', 
            textAlign: 'center',
            fontWeight: 'bold',
            color: '#2c3e50'
          }}>
            {presenter.display_name}
          </h2>
          
          {presenter.location && 
            <p style={{
              textAlign: 'center', 
              margin: '10px 0', 
              fontSize: '1.1rem',
              color: '#34495e'
            }}>
              <span style={{fontWeight: 'bold'}}>{presenter.location}</span>
            </p>
          }
          
          {presenter.bio && 
            <div style={{
              margin: '20px 0 10px',
              padding: '15px',
              backgroundColor: 'rgba(255,255,255,0.7)',
              borderRadius: '8px',
              fontSize: '1.1rem',
              lineHeight: '1.5'
            }}>
              {presenter.bio}
            </div>
          }
          
          {presenter.email && 
            <p style={{
              textAlign: 'center',
              margin: '15px 0',
              fontSize: '1rem',
              color: '#3498db'
            }}>
              {presenter.email}
            </p>
          }
        </div>
      )}
      
      {/* Animation for the presenter card */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
};

export default PresentationEnd; 