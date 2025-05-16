import React, { useState, useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';

const ComposeModal = ({ onClose, onSent }) => {
  const { user, isAuthenticated } = useAuth0();
  const { sendMessage } = useSocket();

  const [recipientSub, setRecipientSub] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const textRef = useRef(null);

  // Fetch suggestions when query changes (debounced 300ms)
  useEffect(() => {
    // If we already selected recipient and query matches, don't fetch suggestions
    if (recipientSub && query.trim() === recipientName) { setSuggestions([]); return; }

    if (!query.trim()) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get(`/api/users/search/${encodeURIComponent(query)}`, { signal: controller.signal });
        setSuggestions(data.map(u => ({ sub: u.auth0_sub, name: u.display_name || u.name || 'Unknown' })));
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Autocomplete error', err);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, recipientSub, recipientName]);

  if (!isAuthenticated) return null;

  const handleSend = async () => {
    if (!recipientSub || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      // Step 1: ensure/direct conversation exists
      const { data } = await axios.post('/api/conversations/direct', { userSubA: user.sub, userSubB: recipientSub });
      if (!data || !data.conversationId) throw new Error(data.error || 'Failed to create conversation');
      const conversationId = data.conversationId;

      // Step 2: send first message via socket
      sendMessage({ conversationId, senderSub: user.sub, body });

      setBody('');
      setRecipientSub('');
      onSent && onSent();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleSelectSuggestion = (sug) => {
    setRecipientSub(sug.sub);
    setRecipientName(sug.name);
    setQuery(sug.name);
    setSuggestions([]);
    setTimeout(() => {
      textRef.current && textRef.current.focus();
    }, 0);
  };

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div className="compose-modal" onClick={e => e.stopPropagation()}>
        <button className="compose-close" onClick={onClose}>×</button>
        <h3>New Message</h3>
        <label>
          To:
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setRecipientSub(''); }}
            placeholder="Type a name..."
            autoComplete="new-password"
            autoCorrect="off" autoCapitalize="off" spellCheck="false"
          />
          {suggestions.length > 0 && (
            <ul className="suggestion-list">
              {suggestions.map(sug => (
                <li key={sug.sub} onMouseDown={() => handleSelectSuggestion(sug)}>{sug.name}</li>
              ))}
            </ul>
          )}
        </label>
        <label>
          Message:
          <textarea
            ref={textRef}
            rows="4"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </label>
        {error && <p className="compose-error">{error}</p>}
        <div className="compose-actions">
          <button onClick={handleSend} disabled={sending || !recipientSub || !body.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default ComposeModal; 