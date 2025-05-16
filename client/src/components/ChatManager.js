import React from 'react';
import { useChat } from '../contexts/ChatContext';
import ChatWindow from './ChatWindow';

const ChatManager = () => {
  const { openChats, closeChat, toggleVisibility } = useChat();
  return (
    <>
      {openChats.map((c, idx) => {
        if (!c.visible) return null;

        // Check if this window is the special presenter chat shown on /poll
        const isPresenterChat = !!c.conversation?.meta?.isPresenterChat;

        // --- Positioning logic for regular chat windows (unchanged) ---
        let offsetPx = 110 + (openChats.length - 1 - idx) * (350 + 10);
        if (isPresenterChat) {
          // We will render presenter chat centered in an overlay, so the offset is irrelevant
          offsetPx = 0;
        }

        const windowElem = (
          <ChatWindow
            key={c.conversation.conversationId}
            conversation={c.conversation}
            offset={offsetPx}
            isPresenterChat={isPresenterChat}
            onClose={() => closeChat(c.conversation.conversationId)}
            onMinimize={() => toggleVisibility(c.conversation.conversationId)}
          />
        );

        // If presenter chat, wrap it with a full-screen overlay for modal style
        if (isPresenterChat) {
          return (
            <div key={c.conversation.conversationId} className="presenter-chat-overlay">
              {windowElem}
            </div>
          );
        }

        return windowElem;
      })}
    </>
  );
};
export default ChatManager; 