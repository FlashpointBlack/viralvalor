import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth0 } from '@auth0/auth0-react';
import axios from 'axios';

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
      console.log('Socket connection - auth status:', { authReady, userSub: authUser?.sub });
      if (authReady && authUser?.sub) {
        console.log('Registering authenticated user with socket:', authUser.sub);
        newSocket.emit('register user', authUser.sub);
        
        // Load existing messages for this user
        fetchExistingMessages(authUser.sub);
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
      console.log('Socket received new message:', message);
      setChatMessages(prev => {
        const newMessages = [...prev, message];
        console.log(`ChatMessages updated: now has ${newMessages.length} messages`);
        return newMessages;
      });
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

  // Fetch all messages for a user's conversations 
  const fetchExistingMessages = async (userSub) => {
    if (!userSub) return;

    try {
      // First get all conversations for the user
      const { data: conversations } = await axios.get(`/conversations?userSub=${encodeURIComponent(userSub)}`);
      
      if (!Array.isArray(conversations)) {
        console.error('Failed to fetch conversations: API did not return an array');
        return;
      }

      // For each conversation, fetch messages
      let allMessages = [];
      const readStatusMap = {}; // Track last read timestamps per conversation
      
      for (const conv of conversations) {
        try {
          // Skip if conversation has no ID
          if (!conv.conversationId) continue;
          
          const { data: messages } = await axios.get(`/conversations/${conv.conversationId}/messages`, {
            params: { userSub, limit: 100 }
          });
          
          if (Array.isArray(messages)) {
            allMessages = [...allMessages, ...messages];
          }
          
          // Get last read timestamp for this conversation based on last message read
          try {
            // If the conversation has a lastReadMessageId parameter provided by the API
            if (conv.lastReadMessageId) {
              // Find the timestamp of the message with this ID
              const lastReadMessage = messages.find(m => (m.id || m.ID) === conv.lastReadMessageId);
              if (lastReadMessage) {
                const timestamp = new Date(lastReadMessage.sentAt || lastReadMessage.Sent_At || lastReadMessage.timestamp || 0).getTime();
                readStatusMap[conv.conversationId] = timestamp;
              }
            } else if (conv.lastReadTime) {
              // If the API provides a lastReadTime directly
              readStatusMap[conv.conversationId] = new Date(conv.lastReadTime).getTime();
            } else if (messages.length === 0 || conv.unreadCount === 0) {
              // For conversations with no messages or explicitly zero unread count, 
              // mark as read by setting timestamp to current time
              readStatusMap[conv.conversationId] = Date.now();
            } else {
              // If unreadCount > 0 but no specifics, use a timestamp of 0 to mark all as unread
              readStatusMap[conv.conversationId] = 0;
            }
          } catch (readErr) {
            console.error(`Error processing read status for conversation ${conv.conversationId}:`, readErr);
            // If there's an error, assume the conversation is read
            readStatusMap[conv.conversationId] = Date.now();
          }
        } catch (err) {
          console.error(`Error fetching messages for conversation ${conv.conversationId}:`, err);
          // If there's an error, assume the conversation is read
          readStatusMap[conv.conversationId] = Date.now();
        }
      }

      console.log(`Loaded ${allMessages.length} existing messages from ${conversations.length} conversations`);
      console.log('Read status map:', readStatusMap);
      
      // Update the chatMessages state with existing messages
      setChatMessages(prev => {
        // Filter out duplicates
        const messageIds = new Set(prev.map(m => m.id || m.ID));
        const newMessages = allMessages.filter(m => !messageIds.has(m.id || m.ID));
        return [...prev, ...newMessages];
      });
      
      // Update the lastViewedByConv state with read timestamps
      setLastViewedConvos(readStatusMap);
    } catch (err) {
      console.error('Error fetching existing messages:', err);
    }
  };

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