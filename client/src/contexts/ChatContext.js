import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSocket } from './SocketContext';
import { useAuth0 } from '@auth0/auth0-react';
import axios from 'axios';

const ChatContext = createContext();
export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }) => {
  const [openChats, setOpenChats] = useState([]); // {conversation, visible, unread}
  const { chatMessages } = useSocket();
  const prevMsgCountRef = useRef(0);
  const { user } = useAuth0();

  const openChat = (conversation) => {
    setOpenChats(prev => {
      const exists = prev.find(c => c.conversation.conversationId === conversation.conversationId);
      if (exists) {
        // Merge in any new fields (like 'other') and ensure visible
        return prev.map(c => c.conversation.conversationId === conversation.conversationId ? { ...c, visible: true, conversation: { ...c.conversation, ...conversation } } : c);
      }
      return [...prev, { conversation, visible: true, unread: 0 }];
    });

    // If the conversation's other.name still looks like a raw Auth0 sub, attempt to resolve it once.
    if (!conversation.isGroup && conversation.other?.sub && (!conversation.other.name || conversation.other.name.includes('|') || conversation.other.name === 'Unknown User')) {
      axios.get(`/user/by-sub/${encodeURIComponent(conversation.other.sub)}`)
        .then(({ data }) => {
          if (data?.display_name) {
            setOpenChats(prev => prev.map(c => {
              if (c.conversation.conversationId !== conversation.conversationId) return c;
              return {
                ...c,
                conversation: {
                  ...c.conversation,
                  other: { ...c.conversation.other, name: data.display_name }
                }
              };
            }));
          }
        })
        .catch(() => {/* ignore failures */});
    }

    // If we don't yet know the other participant's name, attempt to fetch full conversation list
    if (!conversation.other && user?.sub) {
      axios.get(`/conversations?userSub=${encodeURIComponent(user.sub)}`)
        .then(({ data: list }) => list)
        .then(list => {
          const full = list.find(l => l.conversationId === conversation.conversationId);
          if (full && full.other) {
            setOpenChats(prev => prev.map(c => {
              if (c.conversation.conversationId !== conversation.conversationId) return c;
              // Preserve any custom meta flags added client-side (e.g., isPresenterChat)
              const mergedMeta = { ...(c.conversation.meta || {}), ...(full.meta || {}) };
              return {
                ...c,
                conversation: {
                  ...c.conversation,
                  ...full,
                  meta: mergedMeta
                }
              };
            }));
          }
        })
        .catch(() => {});
    }
  };

  const closeChat = (conversationId) => {
    setOpenChats(prev => prev.filter(c => c.conversation.conversationId !== conversationId));
  };

  const toggleVisibility = (conversationId) => {
    setOpenChats(prev => prev.map(c => {
      if (c.conversation.conversationId === conversationId) {
        const nowVisible = !c.visible;
        return { ...c, visible: nowVisible, unread: nowVisible ? 0 : c.unread };
      }
      return c;
    }));
  };

  // Auto-open chat when a new message is received
  useEffect(() => {
    // Only track message count change now - don't auto-open windows
    if (!chatMessages || chatMessages.length === 0) {
      prevMsgCountRef.current = 0;
      return;
    }
    
    // Track that new messages arrived
    if (chatMessages.length > prevMsgCountRef.current) {
      // Update currently open chats with unread counts
      const newMessages = chatMessages.slice(prevMsgCountRef.current);
      
      // Increment unread count for conversations with new messages
      // Only if the conversation window is not visible
      newMessages.forEach(newMsg => {
        if (newMsg && newMsg.conversationId) {
          setOpenChats(prev => {
            const existingChat = prev.find(c => c.conversation.conversationId === newMsg.conversationId);
            if (existingChat) {
              // Conversation exists in state, update unread
              return prev.map(c => c.conversation.conversationId === newMsg.conversationId ? 
                { ...c, unread: c.visible ? 0 : (c.unread||0)+1 } : c);
            }
            // Conversation doesn't exist in state yet
            return prev;
          });
        }
      });
      
      // Update total message count reference
      prevMsgCountRef.current = chatMessages.length;
    }
  }, [chatMessages]);

  return (
    <ChatContext.Provider value={{ openChats, openChat, closeChat, toggleVisibility }}>
      {children}
    </ChatContext.Provider>
  );
}; 