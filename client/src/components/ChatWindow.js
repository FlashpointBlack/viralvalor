import React, { useEffect, useState, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';
import './ChatWindow.css';

const ChatWindow = ({ conversation, onClose, onMinimize, offset = 20, isPresenterChat = false }) => {
  const { user } = useAuth0();
  const { sendMessage, socket, chatMessages, markMessagesViewed } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [reactionAnchor, setReactionAnchor] = useState(null);
  const hideTimer = useRef(null);
  const [dynamicHeight, setDynamicHeight] = useState(null);

  const isSystemChat = conversation.other?.sub === 'SYSTEM';

  // Fetch initial messages
  useEffect(() => {
    const fetchMsgs = async () => {
      try {
        const { data } = await axios.get(`/conversations/${conversation.conversationId}/messages`, {
          params: { userSub: user.sub, limit: 100 }
        });
        setMessages(data);
        // preload reactions map
        const rx = {};
        data.forEach(m=>{ if(m.reaction) rx[m.id||m.ID]=m.reaction; });
      } catch (err) {
        console.error('Fetch msgs failed', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMsgs();
  }, [conversation.conversationId, user.sub]);

  // Listen for new messages
  useEffect(() => {
    setMessages(prev => {
      const newOnes = chatMessages.filter(m => m.conversationId === conversation.conversationId && !prev.some(x => (x.id||x.ID) === (m.id)));
      return newOnes.length ? [...prev, ...newOnes] : prev;
    });
  }, [chatMessages, conversation.conversationId]);

  // Update messages when reactions are received
  useEffect(() => {
    if (socket) {
      const handleMessageReaction = (reaction) => {
        console.log('Received reaction:', reaction);
        const { messageId, emoji, senderSub, senderName } = reaction;
        
        // Update message in state immediately
        setMessages(prev => {
          return prev.map(m => {
            if ((m.id || m.ID) == messageId) {
              // Parse existing reactions if available
              let currentReactions = [];
              if (m.reaction) {
                try {
                  currentReactions = JSON.parse(m.reaction);
                } catch(e) {
                  // If reaction isn't JSON yet, it might be the old string format
                  // We'll create a new array in this case
                  currentReactions = [];
                }
              }
              
              // Filter out any existing reaction from this user
              currentReactions = currentReactions.filter(r => r.userSub !== senderSub);
              
              // Add the new reaction
              currentReactions.push({
                emoji,
                userSub: senderSub,
                userName: senderName
              });
              
              return { 
                ...m, 
                reaction: JSON.stringify(currentReactions)
              };
            }
            return m;
          });
        });
      };

      socket.on('message reaction', handleMessageReaction);
      
      return () => {
        socket.off('message reaction', handleMessageReaction);
      };
    }
  }, [socket]);

  // Scroll to bottom on messages update
  useEffect(() => {
    listRef.current && listRef.current.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // Mark conversation as read whenever messages change (i.e., new ones arrive) or on mount
  useEffect(() => {
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
    const lastId = latest.id || latest.ID;
    if (!lastId) return;
    // Fire-and-forget
    axios.post(`/conversations/${conversation.conversationId}/read`, { userSub: user.sub, lastMessageId: lastId })
      .catch(err => console.warn('mark read failed', err));

    // Locally reset unread badge since user is viewing
    markMessagesViewed(conversation.conversationId);
  }, [messages, conversation.conversationId, user.sub]);

  // Recalculate height when viewport changes (e.g., virtual keyboard shown)
  useEffect(() => {
    if (!isPresenterChat) return; // Only needed for large presenter chat modal

    const updateHeight = () => {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      // Use 45% of the visible viewport as our target height
      setDynamicHeight(Math.round(vh * 0.45));
    };

    updateHeight();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHeight);
    }
    window.addEventListener('orientationchange', updateHeight);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateHeight);
      }
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, [isPresenterChat]);

  const handleSend = () => {
    if (!text.trim()) return;
    if (isSystemChat) return;
    const bodyText = text.trim();
    // Send via socket; server will broadcast back, triggering live update
    sendMessage({ conversationId: conversation.conversationId, senderSub: user.sub, body: bodyText });
    setText('');
  };

  const addReaction = (messageId, reaction) => {
    // Socket broadcast
    if (socket && socket.connected) {
      const payload = { 
        conversationId: conversation.conversationId, 
        messageId, 
        emoji: reaction, 
        senderSub: user.sub, 
        senderName: user.display_name || user.name || user.nickname || user.email
      };
      console.log('emitting reaction:', payload);
      socket.emit('react message', payload);
      
      // Apply reaction locally for immediate feedback
      setMessages(prev => {
        return prev.map(m => {
          if ((m.id || m.ID) == messageId) {
            // Parse existing reactions if available
            let currentReactions = [];
            if (m.reaction) {
              try {
                currentReactions = JSON.parse(m.reaction);
              } catch(e) {
                // Handle case where reaction isn't in JSON format yet
                currentReactions = [];
              }
            }
            
            // Filter out any existing reaction from this user
            currentReactions = currentReactions.filter(r => r.userSub !== user.sub);
            
            // Add the new reaction
            currentReactions.push({
              emoji: reaction,
              userSub: user.sub,
              userName: user.display_name || user.name || user.nickname || user.email
            });
            
            return { 
              ...m, 
              reaction: JSON.stringify(currentReactions)
            };
          }
          return m;
        });
      });
    }
    setReactionAnchor(null);
    // Don't change selectedId here to prevent timestamp display
  };

  const startHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => {
      setReactionAnchor(null);
    }, 250);
  };

  const handleMouseEnter = (key) => {
    // If there's already a reaction anchor and it's not this message,
    // immediately clear it without waiting for the timer
    if (reactionAnchor && reactionAnchor !== key) {
      clearTimeout(hideTimer.current);
      setReactionAnchor(null);
    }
    // Set the new reaction anchor
    setReactionAnchor(key);
  };

  // Helper function to render reactions
  const renderReactions = (reactionData) => {
    if (!reactionData) return null;
    
    try {
      // Try to parse as JSON array first
      const reactions = JSON.parse(reactionData);
      
      // Handle both array format and legacy string format
      if (Array.isArray(reactions)) {
        if (!reactions.length) return null;
        
        return (
          <div className="reaction-display">
            {reactions.map((r, i) => (
              <span key={i} title={`${r.emoji} from ${r.userName || 'User'}`}>{r.emoji}</span>
            ))}
          </div>
        );
      }
    } catch (e) {
      // If parsing as JSON fails, it might be an old string format or something else
      console.log('Failed to parse reaction data:', e);
    }
    
    // Fallback for old-format reactions (raw string)
    return <div className="reaction-display"><span title="Reaction">{reactionData}</span></div>;
  };

  // util helper to render links within message text
  const linkifyText = (txt) => {
    if (!txt) return txt;
    const urlRegexGlobal = /(https?:\/\/[^\s]+)/g;
    const parts = txt.split(urlRegexGlobal);
    const urlChecker = /^(https?:\/\/[^\s]+)$/i;
    return parts.map((part, i) => {
      if (urlChecker.test(part)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        );
      }
      return part;
    });
  };

  // Render message content, supporting pre-made <a href> links in system messages
  const renderMessageContent = (txt) => {
    if (!txt) return txt;
    if (txt.includes('<a ')) {
      // Trusted content from server; minimal sanitization by stripping script tags
      const sanitized = txt.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                           .replace(/javascript:/gi, '');
      return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
    }
    return linkifyText(txt);
  };

  // Determine additional classes and positioning styles
  const containerClasses = `chat-window ${isPresenterChat ? 'presenter-chat-window' : ''}`;
  const containerStyle = isPresenterChat
    ? { height: dynamicHeight ? `${dynamicHeight}px` : '45vh', maxHeight: dynamicHeight ? `${dynamicHeight}px` : '45vh' }
    : { right: offset };

  return (
    <div className={containerClasses} style={containerStyle}>
      <header className="chat-header">
        <span>{conversation.other?.name || (isPresenterChat ? 'Presenter' : '')}</span>
        <div className="chat-controls">
          <button className="chat-min" onClick={onMinimize}>-</button>
          <button className="chat-close" onClick={onClose}>×</button>
        </div>
      </header>
      <div className="chat-messages" ref={listRef}>
        {loading ? <p>Loading…</p> : messages.map((msg, index) => {
          const text = msg.body ?? msg.Body ?? '';
          const sender = msg.senderSub || msg.Sender_Sub;
          const date = msg.sentAt || msg.Sent_At;
          const key = msg.id || msg.ID || msg.timestamp;
          const showTime = selectedId === key || index === messages.length -1;
          const me = sender === user.sub;
          const hasReactions = msg.reaction && (
            typeof msg.reaction === 'string' && 
            (msg.reaction.length > 0 && msg.reaction !== '[]')
          );
          return (
            <div key={key} className={`bubble-container ${me ? 'me' : 'them'} ${hasReactions ? 'has-reactions' : ''}`}>
              <div 
                className={`chat-bubble ${me ? 'me' : 'them'} ${showTime?'show-time':''}`} 
                onClick={()=>setSelectedId(selectedId===key?null:key)}
                onMouseEnter={()=>handleMouseEnter(key)} 
                onMouseLeave={()=>startHideTimer()}
              >
                <p>{renderMessageContent(text)}</p>
                <span className="chat-time">{date ? new Date(date).toLocaleTimeString() : ''}</span>
                {reactionAnchor===key && (
                  <div 
                    className="reaction-menu" 
                    onMouseEnter={()=>clearTimeout(hideTimer.current)} 
                    onMouseLeave={()=>startHideTimer()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {['👍','❤️','😂','😮','😢','😡'].map(em=>(
                      <span 
                        key={em} 
                        onClick={(e) => {
                          e.stopPropagation();
                          addReaction(key, em);
                        }}
                      >
                        {em}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {renderReactions(msg.reaction)}
            </div>
          );
        })}
      </div>
      <div className="chat-input">
        <textarea 
          rows="2" 
          value={text} 
          onChange={e => setText(e.target.value)} 
          placeholder={isSystemChat ? 'Messages from system cannot be replied to' : 'Type a message…'}
          onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleSend(); } }}
          onFocus={() => { listRef.current && listRef.current.scrollTo({ top: listRef.current.scrollHeight }); }}
          disabled={isSystemChat}
        />
        <button onClick={handleSend} disabled={isSystemChat}>Send</button>
      </div>
    </div>
  );
};

export default ChatWindow;