import React, { useState, useEffect, useRef } from 'react';
import './MobilePoll.css';
import socket from '../socket';
import { useAuth0 } from '@auth0/auth0-react';
import LoginButton from './LoginButton';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useChat } from '../contexts/ChatContext';
import { useSocket as useAppSocket } from '../contexts/SocketContext';

// Helper function to generate a UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper to extract the pure Auth0 sub (first two pipe-delimited parts)
const getPureSub = (identifier) => {
  if (!identifier) return identifier;
  if (identifier.includes('|')) {
    const parts = identifier.split('|');
    if (parts.length >= 2) {
      return `${parts[0]}|${parts[1]}`;
    }
  }
  return identifier;
};

const MobilePoll = () => {
  const [isPollActive, setIsPollActive] = useState(false);
  const [pollOptions, setPollOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteCounts, setVoteCounts] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [username, setUsername] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [quizId, setQuizId] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [deviceId, setDeviceId] = useState(() => {
    // Get existing device ID or create a new one
    const storedDeviceId = localStorage.getItem('deviceUniqueId');
    if (storedDeviceId) return storedDeviceId;
    
    // Generate a new device ID if none exists
    const newDeviceId = generateUUID();
    localStorage.setItem('deviceUniqueId', newDeviceId);
    return newDeviceId;
  });
  const [debugInfo, setDebugInfo] = useState({
    socketConnected: false,
    lastEvent: 'none',
    receivedPolls: 0,
    lastPollTime: 'never',
    deviceId: deviceId
  });
  const [pollStartTime, setPollStartTime] = useState(() => {
    const stored = localStorage.getItem('pollStartTime');
    return stored ? parseInt(stored, 10) : null;
  });
  const [elapsedTime, setElapsedTime] = useState('0:00');
  const [presentationEnded, setPresentationEnded] = useState(false);
  // Local UI state for guest join flow
  const [joiningAsGuest, setJoiningAsGuest] = useState(false);
  const [presenterSub, setPresenterSub] = useState(null);
  const [presenterName, setPresenterName] = useState('Presenter');
  const [presentationActive, setPresentationActive] = useState(false);
  // --- Presenter message notification ---
  const [presenterConversationId, setPresenterConversationId] = useState(null);
  const [hasUnreadPresenterMessages, setHasUnreadPresenterMessages] = useState(false);
  const [unreadPresenterCount, setUnreadPresenterCount] = useState(0);
  // Presenter profile modal state
  const [showPresenterProfileModal, setShowPresenterProfileModal] = useState(false);
  const [presenterProfile, setPresenterProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  // ----- Reward popup state -----
  const [rewardPopup, setRewardPopup] = useState(null); // { type: 'xp' | 'badge', payload }
  const [instructionPopup, setInstructionPopup] = useState(null); // { imageUrl, title, description }

  // Pre-loaded audio element for reward sounds
  const rewardAudioRef = useRef(null);

  // Auth0 state for showing login button
  const { isAuthenticated, user: authUser } = useAuth0();
  const { userData } = useAuth();

  const { openChat } = useChat();
  const { chatMessages, lastViewedByConv, markMessagesViewed } = useAppSocket();

  // Reusable floating login button (only if user not authenticated)
  const floatingLogin = null;

  // Helper to load quiz data into state
  const handleQuizData = (quizData) => {
    if (quizData && quizData.options) {
      setPollOptions(quizData.options);
      setIsPollActive(true);
      setHasVoted(false);
      setSelectedOption(null);
      setQuizId(quizData.id || null);

      // Handle poll start time: use provided or stored value
      let start = null;
      if (quizData.startTime) {
        start = quizData.startTime;
      } else {
        const stored = localStorage.getItem('pollStartTime');
        if (stored) {
          start = parseInt(stored, 10);
        }
      }
      if (!start) {
        start = Date.now();
      }
      localStorage.setItem('pollStartTime', start.toString());
      setPollStartTime(start);

      if (quizData.gameId) {
        setGameId(quizData.gameId);
      }
    }
  };

  // Add debug info updater function
  const updateDebugInfo = (info) => {
    setDebugInfo(prev => ({ ...prev, ...info }));
  };

  // Add a debug toggle with keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Shift+D to toggle debug mode
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDebug(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Initialize socket connection and event listeners
  useEffect(() => {
    console.log('MobilePoll component mounted, device ID:', deviceId);
    
    // Check if we have a game ID in the URL first (needed for registration)
    const urlParams = new URLSearchParams(window.location.search);
    const gameIdParam = urlParams.get('gameId');
    if (gameIdParam) {
      setGameId(gameIdParam);
    }

    // Check if username is stored in localStorage and register early
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
      setIsRegistered(true);
      
      // Register user with both username and device ID (gameId may still be null here)
      socket.emit('register user', {
        username: storedUsername,
        deviceId: deviceId,
        gameId: gameIdParam || gameId || null
      });
    }

    // Update initial connection status
    updateDebugInfo({ socketConnected: socket.connected });

    // Listen for new quiz events (server broadcasts 'new quiz' to clients)
    socket.on('new quiz', (quizData) => {
      console.log('Quiz received:', quizData);
      updateDebugInfo({ 
        lastEvent: 'new quiz', 
        receivedPolls: debugInfo.receivedPolls + 1,
        lastPollTime: new Date().toLocaleTimeString()
      });

      handleQuizData(quizData);
      
      // New quiz always starts with a clean slate
      setSelectedOption(null);
      setHasVoted(false);
    });

    // Handle current quiz response when joining mid-poll
    socket.on('current quiz', (quizData) => {
      console.log('Current quiz data received:', quizData);
      updateDebugInfo({ lastEvent: 'current quiz' });
      handleQuizData(quizData);
    });

    // Also listen for poll started event
    socket.on('poll started', () => {
      console.log('Poll started event received');
      updateDebugInfo({ lastEvent: 'poll started' });
      setIsPollActive(true);
      setPollStartTime(Date.now());
      
      // Store poll start time in localStorage for persistence
      localStorage.setItem('pollStartTime', Date.now().toString());
    });

    socket.on('end quiz', () => {
      console.log('Quiz ended');
      updateDebugInfo({ lastEvent: 'end quiz' });
      setIsPollActive(false);
      setPollStartTime(null);
      localStorage.removeItem('pollStartTime');
      // Do NOT clear the selected option to keep user's choice visible
    });

    socket.on('poll ended', () => {
      console.log('Poll ended event received');
      updateDebugInfo({ lastEvent: 'poll ended' });
      setIsPollActive(false);
      setPollStartTime(null);
      // Do NOT clear the selected option
    });

    socket.on('results updated', (results, totalVotes) => {
      // We acknowledge results but do not display them (anonymous)
      updateDebugInfo({ lastEvent: 'results updated' });
      if (results && Array.isArray(results)) {
        setVoteCounts(results.map(r => parseFloat(r)));
        setTotalVotes(totalVotes || 0);
      }
    });

    socket.on('presentation ended', () => {
      console.log('Presentation ended event received');
      updateDebugInfo({ lastEvent: 'presentation ended' });
      setPresentationEnded(true);
      setIsPollActive(false);
      setPollOptions([]);
      localStorage.removeItem('pollStartTime');
    });

    // Handle cleared poll data (when educator navigates to new encounter)
    socket.on('poll data cleared', () => {
      console.log('Poll data cleared event received');
      updateDebugInfo({ lastEvent: 'poll data cleared' });
      
      // Reset all voting state
      setSelectedOption(null);
      setHasVoted(false);
      setVoteCounts([]);
      setTotalVotes(0);
      setIsPollActive(false);
      setPollOptions([]);
    });

    // Handle vote received confirmations
    socket.on('vote received', (totalVotes) => {
      console.log('Vote received confirmation, total votes:', totalVotes);
      updateDebugInfo({ 
        lastEvent: 'vote received confirmation',
        totalVotes: totalVotes
      });
    });

    // Track connection status
    socket.on('connect', () => {
      console.log('Socket connected');
      updateDebugInfo({ socketConnected: true });
      
      // Re-register with device ID on reconnect
      if (isRegistered && username) {
        socket.emit('register user', {
          username: username,
          deviceId: deviceId,
          gameId: gameId
        });
      }
      
      socket.emit('request current quiz', { gameId, deviceId });
      socket.emit('request current instruction');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      updateDebugInfo({ socketConnected: false });
    });

    // Check connection status
    console.log('Socket connected:', socket.connected);
    if (!socket.connected) {
      console.log('Socket not connected, connecting...');
      socket.connect();
    } else {
      // Request current poll state on component mount
      socket.emit('request current quiz', { gameId, deviceId });
    }

    // Request current quiz periodically if registered but no poll is active
    const checkInterval = setInterval(() => {
      if (isRegistered && !isPollActive) {
        console.log('Periodic check for active polls');
        socket.emit('request current quiz', { gameId, deviceId });
      }
    }, 5000); // Check every 5 seconds

    // Listen for presenter info and presentation status events
    const handlePresentationStarted = ({ gameId: startedGameId, hostSub }) => {
      if (startedGameId && (!gameId || startedGameId === gameId)) {
        setGameId(startedGameId);
        setPresenterSub(hostSub);
        setPresentationActive(true);
      }
    };

    const handlePresenterInfo = ({ gameId: infoGameId, hostSub, isActive }) => {
      // Always update presenterSub if we have it
      if (hostSub) {
        setPresenterSub(hostSub);
      }

      // If the server indicates the presentation is already active, update local state.
      if (isActive) {
        setPresentationActive(true);

        // If we didn't have a game ID yet, set it from the payload
        if (!gameId && infoGameId) {
          setGameId(infoGameId);
        }
      }
    };

    const handlePresentationEnded = ({ gameId: endedGameId }) => {
      if (!endedGameId || endedGameId === gameId) {
        setPresentationActive(false);
        setPresenterSub(null);
      }
    };

    socket.on('presentation started', handlePresentationStarted);
    socket.on('presenter info', handlePresenterInfo);
    socket.on('presentation ended', handlePresentationEnded);

    // Listen for incoming chat messages from presenter
    const handleReceiveMessage = (msg) => {
      if (!msg || !presenterSub) return;
      if (msg.senderSub === presenterSub) {
        // If we already know the conversation ID, ensure it matches
        if (!presenterConversationId || msg.conversationId === presenterConversationId) {
          setPresenterConversationId(msg.conversationId);
          setHasUnreadPresenterMessages(true);
          setUnreadPresenterCount(prev => prev + 1);
        }
      }
    };
    socket.on('receive message', handleReceiveMessage);

    // Reward notifications
    const handleXpAwarded = (payload) => {
      console.log('XP awarded event received', payload);
      setRewardPopup({ type: 'xp', payload });
    };
    const handleBadgeAwarded = (payload) => {
      console.log('Badge awarded event received', payload);
      setRewardPopup({ type: 'badge', payload });
    };
    socket.on('xp awarded', handleXpAwarded);
    socket.on('badge awarded', handleBadgeAwarded);

    // Instruction notifications
    const handleInstructionBroadcast = (payload) => {
      console.log('Instruction broadcast received:', payload);
      setInstructionPopup(payload);
    };
    socket.on('instruction broadcast', handleInstructionBroadcast);

    // Handle instruction close events
    const handleInstructionClose = () => {
      console.log('Instruction close received');
      setInstructionPopup(null);
    };
    socket.on('instruction close', handleInstructionClose);

    // Clean up event listeners on unmount
    return () => {
      socket.off('new quiz');
      socket.off('poll started');
      socket.off('end quiz');
      socket.off('poll ended');
      socket.off('results updated');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('poll data cleared');
      socket.off('vote received');
      clearInterval(checkInterval);
      socket.off('presentation started', handlePresentationStarted);
      socket.off('presenter info', handlePresenterInfo);
      socket.off('presentation ended', handlePresentationEnded);
      socket.off('receive message', handleReceiveMessage);
      socket.off('xp awarded', handleXpAwarded);
      socket.off('badge awarded', handleBadgeAwarded);
      socket.off('instruction broadcast', handleInstructionBroadcast);
      socket.off('instruction close', handleInstructionClose);
    };
  }, [isRegistered, isPollActive, debugInfo.receivedPolls, gameId, deviceId, username, presenterSub, presenterConversationId]);

  // Fetch / create direct conversation with presenter when we learn their sub
  useEffect(() => {
    if (!presenterSub || !isAuthenticated || !authUser?.sub) return;
    if (presenterConversationId) return; // already have it

    (async () => {
      try {
        const { data } = await axios.post('/conversations/direct', {
          userSubA: authUser.sub,
          userSubB: presenterSub
        });
        if (data?.conversationId) {
          setPresenterConversationId(data.conversationId);
        }
      } catch (err) {
        console.error('Failed to fetch/create presenter conversation', err);
      }
    })();
  }, [presenterSub, isAuthenticated, authUser, presenterConversationId]);

  // Fetch presenter display name when we learn their sub
  useEffect(() => {
    if (!presenterSub) return;
    const pureSub = getPureSub(presenterSub);
    if (!pureSub) return;
    axios.get(`/api/user/profile/${encodeURIComponent(pureSub)}`)
      .then(({ data }) => {
        if (data?.display_name) {
          setPresenterName(data.display_name);
        }
      })
      .catch(() => {/* ignore */});
  }, [presenterSub]);

  // Helper to open chat with presenter and mark messages read
  const openPresenterMessages = async () => {
    if (!presenterSub) return;
    try {
      let convId = presenterConversationId;
      if (!convId && isAuthenticated && authUser?.sub) {
        const { data } = await axios.post('/conversations/direct', {
          userSubA: authUser.sub,
          userSubB: presenterSub
        });
        convId = data?.conversationId;
        setPresenterConversationId(convId);
      }
      if (!convId) return;

      openChat({ conversationId: convId, isGroup: false, other: { sub: presenterSub, name: presenterName }, meta: { isPresenterChat: true } });
      markMessagesViewed(convId);
      setHasUnreadPresenterMessages(false);
      setUnreadPresenterCount(0);
    } catch (err) {
      console.error('Failed to open presenter chat', err);
    }
  };

  // Keep unread count in sync with global chat state (mirrors MessageDropdown logic)
  useEffect(() => {
    if (!presenterConversationId) return;

    // Timestamp when user last viewed this conversation (0 if never)
    const convViewed = lastViewedByConv[presenterConversationId] || 0;

    // Compute unread message count for this conversation excluding self-authored messages
    const count = chatMessages.reduce((total, m) => {
      if (m.conversationId !== presenterConversationId) return total;

      const ts = new Date(m.sentAt || m.Sent_At || m.timestamp || Date.now()).getTime();
      if (ts > convViewed && m.senderSub !== authUser?.sub) {
        return total + 1;
      }
      return total;
    }, 0);

    setUnreadPresenterCount(count);
    setHasUnreadPresenterMessages(count > 0);
  }, [chatMessages, lastViewedByConv, presenterConversationId, authUser]);

  // Update elapsed time
  useEffect(() => {
    if (!pollStartTime) return;
    const interval = setInterval(() => {
      const diff = Date.now() - pollStartTime;
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setElapsedTime(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [pollStartTime]);

  // Request current quiz right after registration or on mount if already registered
  useEffect(() => {
    if (isRegistered) {
      socket.emit('request current quiz', { gameId, deviceId });
      socket.emit('request current instruction');
    }
  }, [isRegistered, gameId, deviceId]);

  // Auto-register authenticated users ONLY after we have a DB display_name (ensures correct name from start)
  useEffect(() => {
    if (!isAuthenticated) return;

    const dbName = userData?.display_name || localStorage.getItem('display_name');
    if (!dbName) {
      // Wait until we have the DB value
      return;
    }

    const combined = `${authUser.sub}|${dbName}`;

    // First-time registration
    if (!isRegistered) {
      setUsername(combined);
      setIsRegistered(true);

      socket.emit('register user', {
        username: combined,
        deviceId,
        gameId
      });

      // Persist for next visit
      localStorage.setItem('username', combined);
      return;
    }

    // Update registration if we previously registered with a different name
    if (username !== combined) {
      setUsername(combined);
      socket.emit('register user', {
        username: combined,
        deviceId,
        gameId
      });

      localStorage.setItem('username', combined);
    }
  }, [isAuthenticated, userData, authUser, isRegistered, username, deviceId, gameId]);

  // If we were already registered before discovering the gameId, re-register with the game context
  useEffect(() => {
    if (isRegistered && gameId) {
      socket.emit('register user', {
        username,
        deviceId,
        gameId
      });
    }
  }, [gameId, isRegistered, username, deviceId]);

  // Handle user registration
  const handleRegister = (e) => {
    e.preventDefault();
    if (username.trim()) {
      localStorage.setItem('username', username);
      setIsRegistered(true);
      
      // Send both username and device ID during registration
      socket.emit('register user', {
        username: username,
        deviceId: deviceId,
        gameId: gameId
      });
    }
  };

  // Utility to copy game link
  const copyGameLink = () => {
    const link = `${window.location.origin}/poll${gameId ? `?gameId=${gameId}` : ''}`;
    navigator.clipboard.writeText(link)
      .then(() => alert('Game link copied to clipboard!'))
      .catch(() => alert('Failed to copy link'));
  };

  // Handle vote submission
  const handleVote = (index) => {
    if (!quizId) {
      console.error('Cannot vote: No quiz ID available');
      updateDebugInfo({ lastEvent: 'vote error - no quiz ID' });
      return;
    }
    
    console.log('Submitting vote for option:', index, 'gameId:', gameId, 'quizId:', quizId);
    setSelectedOption(index);
    if (!hasVoted) setHasVoted(true);
    
    // Server expects {quizId, selectedOption}
    socket.emit('quiz response', {
      quizId: quizId,
      selectedOption: index,
      deviceId: deviceId
    });
    
    updateDebugInfo({ 
      lastEvent: 'vote submitted',
      lastVote: `Option ${index} for quiz ${quizId}`
    });
  };

  // Message presenter helper – defined early so it can be referenced in JSX before this point
  const handleMessagePresenter = async () => {
    if (!presentationActive || !presenterSub) {
      alert('Presentation is not active yet.');
      return;
    }

    if (!isAuthenticated) {
      alert('Please log in to send a message to the presenter.');
      return;
    }

    const msg = prompt('Enter a message for the presenter:');
    if (!msg || !msg.trim()) return;

    try {
      // Ensure direct conversation exists
      const convRes = await fetch('/conversations/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userSubA: authUser.sub, userSubB: presenterSub })
      });
      const convData = await convRes.json();
      if (!convRes.ok) throw new Error(convData.error || 'Failed to create conversation');
      const conversationId = convData.conversationId;

      // Emit chat message via socket
      socket.emit('send message', {
        conversationId,
        senderSub: authUser.sub,
        body: msg.trim()
      });

      alert('Message sent!');
    } catch (err) {
      console.error('Error sending presenter message:', err);
      alert('Failed to send message.');
    }
  };

  // Handle showing results before voting
  const handleShowResults = () => {
    setHasVoted(true);
    socket.emit('request results');
  };

  // Function to show presenter profile in a mobile-friendly popup
  const showPresenterProfile = async () => {
    if (!presenterSub) return;
    
    try {
      setLoadingProfile(true);
      setShowPresenterProfileModal(true);
      
      // Get the pure sub from the presenter sub (strip display name if present)
      const pureSub = getPureSub(presenterSub);
      
      // Fetch presenter profile data
      const { data } = await axios.get(`/api/user/profile/${encodeURIComponent(pureSub)}`);
      setPresenterProfile(data);
    } catch (err) {
      console.error('Error fetching presenter profile:', err);
      setPresenterProfile({
        display_name: 'Unavailable',
        bio: 'Profile information could not be loaded.'
      });
    } finally {
      setLoadingProfile(false);
    }
  };

  // Close presenter profile modal
  const closePresenterProfile = () => {
    setShowPresenterProfileModal(false);
  };

  // ----- Presenter Profile Modal component (reused across different UI states) -----
  const PresenterProfileModal = () => {
    if (!showPresenterProfileModal) return null;

    return (
      <div className="profile-modal-overlay" onClick={closePresenterProfile}>
        <div className="profile-modal-content" onClick={e => e.stopPropagation()}>
          <button className="close-modal-btn" onClick={closePresenterProfile}>×</button>
          {loadingProfile ? (
            <div className="profile-loading">
              <p>Loading presenter profile...</p>
            </div>
          ) : presenterProfile ? (
            <div className="presenter-profile">
              {/* Image */}
              <div className="profile-picture-section" style={{ width: '100%', marginBottom: '1rem' }}>
                {presenterProfile.profile_image ? (
                  <img
                    src={presenterProfile.profile_image}
                    alt={`${presenterProfile.display_name || 'profile'}'s profile`}
                    className="profile-picture-preview"
                    style={{ maxHeight: '30vh', width: '100%', height: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <div className="profile-picture-placeholder" style={{ height: '30vh', width:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#fafafa', borderRadius:'8px', color:'#777' }}>
                    No profile picture
                  </div>
                )}
              </div>

              {/* Display name (always show) */}
              <div className="profile-display-name" style={{ textAlign:'center', marginBottom:'0.75rem' }}>
                <h2 style={{ margin:0 }}>{presenterProfile.display_name}</h2>
              </div>

              {/* Details */}
              {presenterProfile.organization && (
                <div className="profile-organization" style={{ textAlign:'center', marginBottom:'0.75rem' }}>
                  <h4>Organization</h4>
                  <p>{presenterProfile.organization}</p>
                </div>
              )}
              {presenterProfile.bio && (
                <div className="profile-bio" style={{ marginBottom:'0.75rem' }}>
                  <p>{presenterProfile.bio}</p>
                </div>
              )}
              {presenterProfile.credentials && presenterProfile.credentials.length > 0 && (
                <div className="profile-credentials">
                  <h4>Credentials</h4>
                  <ul>
                    {presenterProfile.credentials.map((credential, index) => (
                      <li key={index}>{credential}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="profile-error">
              <p>Unable to load presenter profile.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ----- Reward Popup Modal component -----
  const RewardPopupModal = () => {
    if (!rewardPopup) return null;

    const close = () => setRewardPopup(null);
    const { type, payload } = rewardPopup;

    return (
      <div className="profile-modal-overlay" onClick={close}>
        <div className="profile-modal-content" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
          <button className="close-modal-btn" onClick={close}>×</button>
          {type === 'xp' && (
            <>
              <img 
                src="/images/PlusXP.png" 
                alt="XP" 
                style={{ 
                  width: '75%',          // 75% of modal width
                  height: 'auto',        // maintain aspect ratio
                  display: 'block',      // allow centering via margin auto
                  margin: '0 auto 1rem'  // center horizontally and keep spacing below
                }} 
              />
              <p style={{ fontSize: '4.5rem', fontWeight:'900', color:'#ffffff', margin:'0.5rem 0' }}>
                {payload?.amount > 0 ? `+${payload.amount}` : payload.amount}
              </p>
              {payload?.level && (
                <p style={{ fontSize: '1.5rem', marginTop: '0.75rem', color:'#fff' }}>Your new level: <strong>{payload.level}</strong></p>
              )}
            </>
          )}
          {type === 'badge' && (
            <>
              <h2 style={{ color:'#fff', marginBottom:'1rem' }}>New Badge Earned!</h2>
              {payload?.imageUrl && (
                <img 
                  src={payload?.imageUrl} 
                  alt={payload?.title || 'Badge'} 
                  style={{ 
                    width: '75%',          // fill 75% of modal width
                    height: 'auto',        // keep aspect ratio
                    display: 'block',      // allow margin auto centering
                    margin: '0 auto 1rem'  // center and spacing
                  }} 
                />
              )}
              <h3 style={{ color:'#fff', marginBottom:'0.5rem' }}>{payload?.title || 'Badge'}</h3>
              {payload?.description && <p style={{ color:'#fff' }}>{payload.description}</p>}
            </>
          )}
        </div>
      </div>
    );
  };

  // ----- Instruction Popup Modal component -----
  const InstructionPopupModal = () => {
    if (!instructionPopup) return null;
    const { imageUrl, title } = instructionPopup;
    return (
      <div className="profile-modal-overlay" style={{ cursor:'default' }}>
        <div className="profile-modal-content" style={{ textAlign: 'center' }}>
          {/* No close button */}
          {title && <h2 style={{ color:'#fff', marginBottom:'1rem' }}>{title}</h2>}
          {imageUrl && (
            <div style={{ height: '65vh', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img 
                src={imageUrl}
                alt={title || 'Instruction'} 
                style={{ maxWidth: '90%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // Debug panel component
  const DebugPanel = () => (
    <div className="debug-panel">
      <h3>Mobile Poll Debug (Ctrl+Shift+D)</h3>
      <p><strong>Socket Connected:</strong> {debugInfo.socketConnected ? 'YES' : 'NO'}</p>
      <p><strong>Last Event:</strong> {debugInfo.lastEvent}</p>
      <p><strong>Polls Received:</strong> {debugInfo.receivedPolls}</p>
      <p><strong>Last Poll Time:</strong> {debugInfo.lastPollTime}</p>
      <p><strong>Game ID:</strong> {gameId || 'none'}</p>
      <p><strong>Quiz ID:</strong> {quizId || 'none'}</p>
      <p><strong>Username:</strong> {username || 'not set'}</p>
      <p><strong>Device ID:</strong> {deviceId.substring(0, 8)}...</p>
      <p><strong>Poll Active:</strong> {isPollActive ? 'YES' : 'NO'}</p>
      <p><strong>Selected Option:</strong> {selectedOption !== null ? selectedOption : 'none'}</p>
      <p><strong>Has Voted:</strong> {hasVoted ? 'YES' : 'NO'}</p>
      <div className="debug-actions">
        <button className="btn" onClick={() => socket.emit('request current quiz', { gameId, deviceId })}>
          Request Current Poll
        </button>
        <button className="btn" onClick={() => setShowDebug(false)}>
          Hide Debug
        </button>
      </div>
    </div>
  );

  // Add Header component just before main component returns are defined
  const Header = () => {
    // Use ONLY our DB-provided display_name for authenticated users
    const displayName = isAuthenticated
      ? (userData?.display_name || localStorage.getItem('display_name') || '')
      : username;

    return (
      <div className="poll-header" style={{ width: '100%', textAlign: 'center', marginBottom: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Logo Image */}
        <img
          src="/images/Logo.png"
          alt="Logo"
          style={{ width: '100%', height: 'auto', maxWidth: '600px', display: 'block', margin: '0 auto' }}
        />

        {/* User status text (shown only after user is authenticated or registered) */}
        {(isAuthenticated || isRegistered) && (
          <h3 style={{ marginTop: '0.75rem' }}>
            {isAuthenticated ? 
              `Logged in as: ${displayName}` : 
              <>
                Hi, {displayName}!<br />
                <span style={{ fontSize: '0.9rem' }}><i>You are currently connected as a guest and won't earn xp or badges.</i></span>
              </>
            }
          </h3>
        )}
      </div>
    );
  };

  // Request presenter info when we have a game ID (handles late joiners)
  useEffect(() => {
    // Always ask the server for the current presenter status. We pass a gameId if we know it,
    // otherwise null so the server can return any active presentation that exists.
    socket.emit('get presenter', gameId || null);
  }, [gameId]);

  // Auto-dismiss reward popup after 8 seconds
  useEffect(() => {
    if (!rewardPopup) return;
    const timer = setTimeout(() => setRewardPopup(null), 8000);
    return () => clearTimeout(timer);
  }, [rewardPopup]);

  // Play a celebratory sound whenever the user is shown an XP or badge notification
  useEffect(() => {
    if (!rewardPopup) return;

    const audioEl = rewardAudioRef.current;
    if (!audioEl) return;

    // Rewind to start so multiple rewards can fire in quick succession
    audioEl.currentTime = 0;

    audioEl
      .play()
      .catch((err) => {
        // Mobile browsers may block playback until a user interaction has occurred.
        console.warn('Reward sound playback was blocked or failed:', err);
      });
  }, [rewardPopup]);

  // Instruction popup remains until a new instruction is received; no auto-dismiss.

  // Registration / login choice screen
  if (!isRegistered && !isAuthenticated) {
    return (
      <div className="mobile-poll-container">
        {showDebug && <DebugPanel />}
        <Header />
        <div className="registration-form">
          <h2 style={{ marginBottom: '1.5rem' }}>Hello and welcome to this ViralValor powered presentation!</h2>

          {joiningAsGuest ? (
            // --- Prompt for display name ---
            <>
              <form onSubmit={handleRegister}>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Display name"
                  required
                />
                <button type="submit" className="btn">Join Session</button>
              </form>
              {!isAuthenticated && (
                <div style={{ marginTop: '1rem' }}>
                  <LoginButton />
                </div>
              )}
            </>
          ) : (
            // --- Initial choice buttons ---
            <>
              <div className="registration-options">
                <p className="login-prompt">Log in to your account to earn rewards</p>
                <LoginButton />
                <div className="options-divider"><span>or</span></div>
                <button
                  className="btn btn-secondary"
                  onClick={() => setJoiningAsGuest(true)}
                >
                  Continue as Guest
                </button>
              </div>
            </>
          )}
        </div>
        <RewardPopupModal />
        <InstructionPopupModal />
      </div>
    );
  }

  // Show placeholder when no poll is active
  if (!isPollActive && !presentationEnded) {
    return (
      <div className="mobile-poll-container">
        {showDebug && <DebugPanel />}
        <Header />
        {floatingLogin}

        <div className="poll-placeholder">
          {presentationActive ? (
            <>
              <h2>Waiting for poll...</h2>
              <p>A poll will appear here when the presenter starts one.</p>
              {!isAuthenticated && (
                <p style={{ marginTop: '1rem', color: '#2980b9', fontWeight: '500' }}>
                  Log in or create an account to earn XP, collect badges, and engage directly with the presenter!
                </p>
              )}

              {/* Action buttons */}
              <div className="placeholder-actions">
                {isAuthenticated && (
                  <button 
                    className={`btn presenter-msg-btn ${hasUnreadPresenterMessages ? 'has-unread' : ''}`} 
                    onClick={openPresenterMessages}
                    disabled={!presenterSub}
                    style={{ position:'relative' }}
                  >
                    Presenter Messaging
                    {hasUnreadPresenterMessages && (
                      <span className="unread-badge">{unreadPresenterCount}</span>
                    )}
                  </button>
                )}
                {!isAuthenticated && <LoginButton />}
                <button 
                  className="btn" 
                  onClick={() => showPresenterProfile()}
                  disabled={!presenterSub}
                >
                  Presenter Info
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>Waiting for a presentation to start...</h2>
              <p>Once the presenter begins, you will automatically be moved into the session.</p>
              <div className="placeholder-actions">
                <Link to="/" className="btn">Go to Home</Link>
                {!isAuthenticated && <LoginButton />}
              </div>
            </>
          )}
        </div>
        <PresenterProfileModal />
        <RewardPopupModal />
        <InstructionPopupModal />
      </div>
    );
  }

  // Show thank you screen when presentation has ended
  if (presentationEnded) {
    return (
      <div className="mobile-poll-container" style={{
        textAlign: 'center', 
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100vh',
        position: 'relative' // Ensure position context for absolute elements
      }}>
        <Header />
        {floatingLogin}
        
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: '#f8f9fa',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            margin: '0 auto',
            maxWidth: '550px'
          }}>
            <h2 style={{
              fontSize: '2.5rem',
              fontWeight: '700',
              color: '#2c3e50',
              marginBottom: '1.5rem',
              textShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}>Thank you for playing! We hope you enjoyed this ViralValor-powered experience.</h2>
            
            <p style={{
              fontSize: '1.25rem',
              color: '#5d6d7e',
              lineHeight: '1.6'
            }}>Your contributions have been recorded.</p>
          </div>
        </div>
        
        <div style={{ padding: '2rem' }}></div>
        <RewardPopupModal />
        <InstructionPopupModal />
      </div>
    );
  }

  return (
    <div className="mobile-poll-container">
      {showDebug && <DebugPanel />}
      <Header />
      {floatingLogin}
      
      {/* Poll elapsed time */}
      <div className="mobile-poll-timer">
        Poll running: {elapsedTime}
      </div>

      <div className="poll-options">
        {pollOptions.map((option, index) => (
          <div 
            key={index} 
            className={`poll-option ${selectedOption === index ? 'selected' : ''}`}
            onClick={() => handleVote(index)}
          >
            <div className="option-content">
              <span className="option-text">{option}</span>
            </div>
          </div>
        ))}
      </div>

      {hasVoted && totalVotes > 0 && (
        <div className="total-votes">
          Total votes: {totalVotes}
        </div>
      )}

      {/* Message presenter button */}
      <div className="presenter-btn-container">
        {isAuthenticated && (
          <button 
            className={`btn presenter-msg-btn ${hasUnreadPresenterMessages ? 'has-unread' : ''}`} 
            onClick={openPresenterMessages}
            disabled={!presentationActive || !presenterSub}
            style={{ position:'relative' }}
          >
            Presenter Messaging
            {hasUnreadPresenterMessages && (
              <span className="unread-badge">{unreadPresenterCount}</span>
            )}
          </button>
        )}
      </div>

      {/* Presenter Profile Modal */}
      <PresenterProfileModal />
      <RewardPopupModal />
      <InstructionPopupModal />

      {/* Hidden/pre-loaded reward sound */}
      <audio ref={rewardAudioRef} src="/XP.mp3" preload="auto" playsInline />
    </div>
  );
};

export default MobilePoll; 