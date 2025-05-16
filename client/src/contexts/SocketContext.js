import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth0 } from '@auth0/auth0-react';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [systemMessages, setSystemMessages] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [lastViewed, setLastViewed] = useState(Date.now()); // Global timestamp when user opened dropdown
  const [lastViewedConvos, setLastViewedConvos] = useState({}); // { [conversationId]: ts }
  const [connectedUsersList, setConnectedUsersList] = useState([]);

  const authRef = React.useRef({});
  const { user, isAuthenticated } = useAuth0();

  useEffect(() => {
    authRef.current = { user, isAuthenticated };
  }, [user, isAuthenticated]);

  useEffect(() => {
    // Create socket connection
    const newSocket = io();
    setSocket(newSocket);

    // Socket event listeners
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);

      // Register authenticated user (joins their private room)
      const { user: authUser, isAuthenticated: authReady } = authRef.current;
      if (authReady && authUser?.sub) {
        newSocket.emit('register user', authUser.sub);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    newSocket.on('user count', (count) => {
      setOnlineUsers(count);
    });

    newSocket.on('system message', (message) => {
      setSystemMessages(prev => [...prev, message]);
    });

    newSocket.on('receive message', (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    newSocket.on('message reaction', (reaction) => {
      console.log('Received reaction:', reaction);
      const { messageId, emoji, senderSub, senderName } = reaction;
      
      // Update message in state
      setChatMessages(prev => {
        return prev.map(m => {
          if ((m.id || m.ID) == messageId) {
            // Parse existing reactions if available
            let currentReactions = [];
            
            if (m.reaction) {
              try {
                // Try to parse as JSON
                const parsed = JSON.parse(m.reaction);
                if (Array.isArray(parsed)) {
                  currentReactions = parsed;
                } else if (typeof m.reaction === 'string') {
                  // Handle old string format (convert to array format)
                  currentReactions = [{
                    emoji: m.reaction,
                    userSub: 'unknown',
                    userName: 'User'
                  }];
                }
              } catch(e) {
                // If parsing fails, assume old string format
                console.log('Error parsing reaction data:', e);
                if (typeof m.reaction === 'string') {
                  currentReactions = [{
                    emoji: m.reaction,
                    userSub: 'unknown',
                    userName: 'User'
                  }];
                }
              }
            }
            
            // Filter out any existing reaction from this user
            currentReactions = currentReactions.filter(r => r.userSub !== senderSub);
            
            // Add the new reaction
            currentReactions.push({
              emoji,
              userSub: senderSub,
              userName: senderName // Already uses the display_name from server
            });
            
            return { 
              ...m, 
              reaction: JSON.stringify(currentReactions)
            };
          }
          return m;
        });
      });
    });

    newSocket.on('update user list', (users) => {
      setConnectedUsersList(users);
    });

    // If we authenticated after socket was connected, make sure to register then
    if (newSocket.connected && isAuthenticated && user?.sub) {
      newSocket.emit('register user', user.sub);
    }

    // Clean up on unmount
    return () => {
      newSocket.disconnect();
    };
  }, [user, isAuthenticated]);

  const emitNewUser = (user) => {
    if (socket && isConnected) {
      socket.emit('new user', user);
    }
  };

  const emitNewAdminUser = () => {
    if (socket && isConnected) {
      socket.emit('new admin user');
    }
  };

  const sendMessage = (message) => {
    if (socket && isConnected) {
      socket.emit('send message', message);
    }
  };

  const selectEncounter = (routeId) => {
    if (socket && isConnected) {
      socket.emit('select encounter', routeId);
    }
  };

  const value = {
    socket,
    isConnected,
    onlineUsers,
    systemMessages,
    chatMessages,
    lastViewed, // global
    lastViewedByConv: lastViewedConvos,
    markMessagesViewed: (conversationId = null) => {
      const now = Date.now();
      if (conversationId) {
        setLastViewedConvos(prev => ({ ...prev, [conversationId]: now }));
      } else {
        setLastViewed(now);
        // Do not clear per-conversation stamps; we only reset the global dropdown badge
      }
    },
    connectedUsersList,
    emitNewUser,
    emitNewAdminUser,
    sendMessage,
    selectEncounter
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}; 