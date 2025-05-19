import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth0 } from '@auth0/auth0-react';
import ComposeModal from './ComposeModal';
import { useChat } from '../contexts/ChatContext';
import axios from 'axios';
import { useLocation } from 'react-router-dom';

// Debug flag - set to true to enable extra debugging
const DEBUG_MODE = true;

const MessageDropdown = () => {
  const { chatMessages, lastViewed, lastViewedByConv, markMessagesViewed } = useSocket();
  const { user, isAuthenticated } = useAuth0();
  const [showPopup, setShowPopup] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const { openChat } = useChat();
  const hideTimeout = useRef(null);
  const location = useLocation();

  // Build a map of unread counts per conversation
  const unreadMap = {};
  chatMessages.forEach(m => {
    const sender = m.senderSub || m.Sender_Sub;
    if (sender === user?.sub) return;
    
    // Skip messages with no conversationId
    const conv = m.conversationId;
    if (!conv) return;
    
    const convViewed = lastViewedByConv[conv] || 0;
    const ts = new Date(m.sentAt || m.Sent_At || m.timestamp || Date.now()).getTime();
    if (ts > convViewed) {
      unreadMap[conv] = (unreadMap[conv] || 0) + 1;
    }
  });

  // Also incorporate server-provided unread counts from conversations
  // This ensures we have correct counts even before we've loaded all messages
  conversations.forEach(conv => {
    // Only use server's unread count if we don't already have a value from actual messages
    // and if the server explicitly says there are unread messages
    if (conv.conversationId && conv.unreadCount && conv.unreadCount > 0 && !unreadMap[conv.conversationId]) {
      unreadMap[conv.conversationId] = conv.unreadCount;
    }
  });

  // Debug: Log any problematic calculations
  Object.keys(unreadMap).forEach(convId => {
    if (unreadMap[convId] > 0) {
      console.log(`Conversation ${convId} has ${unreadMap[convId]} unread messages according to client calculation.`);
    }
  });

  const unreadConvoCount = Object.keys(unreadMap).length;
  
  // Debug log for unread count issue
  console.log('Unread conversation data:', {
    unreadConvoCount,
    unreadMap,
    chatMessagesCount: chatMessages.length,
    lastViewedByConv,
    userSub: user?.sub
  });

  // Reset function to clear any phantom unread badges
  const resetAllUnreadCounts = () => {
    console.log('Manually resetting all unread conversation counts');
    const now = Date.now();
    const resetMap = {};
    
    // Create a new lastViewedByConv with current timestamp for all conversations
    conversations.forEach(conv => {
      if (conv.conversationId) {
        resetMap[conv.conversationId] = now;
      }
    });
    
    // Also include any conversation IDs from existing messages
    chatMessages.forEach(m => {
      if (m.conversationId) {
        resetMap[m.conversationId] = now;
      }
    });
    
    // Reset all conversations in the socket context
    markMessagesViewed(); 
  };

  // When in debug mode and the component mounts, add a special keyboard shortcut
  // to reset unread counts (Shift+Ctrl+R or Shift+⌘+R)
  useEffect(() => {
    if (DEBUG_MODE) {
      const handleKeyDown = (e) => {
        // Reset shortcut: Shift+Ctrl+R or Shift+⌘+R
        if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.key === 'r') {
          e.preventDefault(); // Prevent browser refresh
          resetAllUnreadCounts();
        }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  const fetchConversations = async () => {
    if (!isAuthenticated || !user?.sub) return;
    try {
      setLoading(true);
      const { data } = await axios.get(`/conversations?userSub=${encodeURIComponent(user.sub)}`);

      if (!Array.isArray(data)) {
        console.error('Failed to fetch conversations: API did not return an array.', data);
        setConversations([]); // Ensure conversations is an empty array
        // Optionally, you could re-throw an error here or set an error state to display to the user
        // throw new Error('API did not return an array.'); 
      } else {
        const enriched = await Promise.all(
          data.map(async (conv) => { // data is confirmed to be an array here
            // Only direct chats need enrichment & only when the supplied name still looks like a raw Auth0 sub
            if (!conv.isGroup && conv.other?.sub && (!conv.other.name || conv.other.name.includes('|') || conv.other.name === 'Unknown User')) {
              try {
                const { data: userInfo } = await axios.get(`/user/by-sub/${encodeURIComponent(conv.other.sub)}`);
                if (userInfo?.display_name) {
                  return { ...conv, other: { ...conv.other, name: userInfo.display_name } };
                }
              } catch (lookupErr) {
                // Silently ignore lookup failures – we will fall back to the existing name
                console.warn('Failed to resolve display name for', conv.other?.sub, lookupErr?.response?.status || lookupErr?.message);
              }
            }
            return conv;
          })
        );
        console.log('Fetched conversations (enriched):', enriched);
        setConversations(enriched);
      }
    } catch (err) {
      console.error('Failed to fetch conversations', err);
      setConversations([]); // Clear conversations on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showPopup) {
      fetchConversations();
      markMessagesViewed(); // reset unread counter
      const handleOutside = (e) => {
        if (!e.target.closest('.message-dropdown')) setShowPopup(false);
      };
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPopup]);

  const togglePopup = () => {
    setShowPopup(prev => {
      const next = !prev;
      if (next) {
        const ev = new CustomEvent('headerDropdownOpened', { detail: { source: 'message' } });
        window.dispatchEvent(ev);
      }
      return next;
    });
  };

  useEffect(() => {
    const handleExternalOpen = (e) => {
      if (e.detail?.source !== 'message') {
        setShowPopup(false);
      }
    };
    window.addEventListener('headerDropdownOpened', handleExternalOpen);
    return () => window.removeEventListener('headerDropdownOpened', handleExternalOpen);
  }, []);

  const handleMouseEnter = () => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
  };

  const handleMouseLeave = () => {
    hideTimeout.current = setTimeout(() => {
      setShowPopup(false);
      hideTimeout.current = null;
    }, 250);
  };

  const handleOpenConversation = (conv) => {
    openChat(conv);
    setShowPopup(false);
  };

  // Do not render the chat bubble if the user is not logged in or we are on the presentation display route
  if (!isAuthenticated || location.pathname.startsWith('/presentation-display') || location.pathname.startsWith('/game')) {
    return null;
  }

  return (
    <div className="message-dropdown" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        className="message-btn custom-msg-btn"
        onClick={togglePopup}
        style={{
          position: 'relative',
          width: '108px',
          height: '108px',
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          overflow: 'visible',
        }}
      >
        {/* Circle background */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '60px',
            height: '60px',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: '#CCCCCC',
            border: '1px solid var(--border-color)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        {/* Full-size image */}
        <img
          src="/images/ChatVirus.png"
          alt="Chat"
          className="chat-icon"
          style={{
            position: 'relative',
            width: '108px',
            height: '108px',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
        {/* Force badge to always appear for testing */}
        {unreadConvoCount > 0 && (
          <span 
            style={{ 
              position: 'absolute', 
              top: '15px', 
              right: '15px', 
              backgroundColor: 'red', 
              color: 'white',
              borderRadius: '50%',
              width: '25px',
              height: '25px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '14px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
              zIndex: 999
            }}
          >
            {unreadConvoCount}
          </span>
        )}
      </button>
      {showPopup && (
        <div className="message-popup" style={{ zIndex: 9999 }}>
          <div className="popup-header">
            <h4>Messages</h4>
            {DEBUG_MODE && (
              <button 
                onClick={resetAllUnreadCounts}
                style={{
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Reset Unread
              </button>
            )}
          </div>
          {loading ? (
            <p>Loading...</p>
          ) : conversations.length === 0 ? (
            <p>No conversations</p>
          ) : (
            <ul className="conversation-list">
              {conversations.map(conv => (
                <li key={conv.conversationId} className="conversation-item" onClick={() => handleOpenConversation(conv)}>
                  <div className="conv-meta">
                    { (unreadMap[conv.conversationId] || 0) > 0 && (
                      <span className="conv-unread">{unreadMap[conv.conversationId]}</span>
                    ) }
                    <span className="conv-other">{conv.isGroup ? 'Group Chat' : (conv.other?.name || '')}</span>
                  </div>
                  <div className="conv-snippet">
                    {conv.lastMessageId ? `Last received ${conv.lastReceivedTime ? new Date(conv.lastReceivedTime).toLocaleString() : 'never'}` : 'No messages yet'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} onSent={fetchConversations} />
      )}
      {/* chat windows rendered by ChatManager */}
    </div>
  );
};

export default MessageDropdown; 