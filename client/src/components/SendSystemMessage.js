import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import axios from 'axios';

/**
 * SendSystemMessage
 *
 * Admin-only component providing a simple UI to broadcast a system message
 * to various classes of users (Admins, Non-Admins, Students, Educators).
 */
const SendSystemMessage = () => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  const [messageText, setMessageText] = useState('');
  const [targets, setTargets] = useState({
    admins: false,
    nonAdmins: false,
    students: false,
    educators: false,
  });
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  const toggleTarget = (key) => {
    setTargets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    const selectedGroups = Object.entries(targets)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (!messageText.trim()) {
      setStatus({ type: 'error', text: 'Message text is required.' });
      return;
    }
    if (selectedGroups.length === 0) {
      setStatus({ type: 'error', text: 'Select at least one target group.' });
      return;
    }

    try {
      setSending(true);
      const { data } = await axios.post(
        '/api/admin/system-messages',
        { body: messageText.trim(), groups: selectedGroups },
        { headers: { 'x-user-sub': userSub } }
      );
      setStatus({ type: 'success', text: `Sent to ${data.count || 0} users.` });
      setMessageText('');
      setTargets({ admins: false, nonAdmins: false, students: false, educators: false });
    } catch (err) {
      console.error('Failed to send system message', err);
      const msg = err?.response?.data?.error || 'Failed to send message.';
      setStatus({ type: 'error', text: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '1rem auto', padding: '1rem' }}>
      <h2>Send System Message</h2>
      <p>Compose a message that will appear in each recipient&apos;s chat inbox as a system message.</p>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="sysmsg-text" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
            Message Text:
          </label>
          <textarea
            id="sysmsg-text"
            rows={4}
            style={{ width: '100%' }}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Enter the announcement or notice to send…"
          />
        </div>

        <fieldset style={{ marginBottom: '1rem', padding: '0.5rem 1rem' }}>
          <legend style={{ fontWeight: 'bold' }}>Target Audience</legend>
          {[
            ['admins', 'Administrators'],
            ['nonAdmins', 'Non-Administrators'],
            ['students', 'Students'],
            ['educators', 'Educators'],
          ].map(([key, label]) => (
            <div key={key} style={{ marginBottom: 6 }}>
              <label>
                <input
                  type="checkbox"
                  checked={targets[key]}
                  onChange={() => toggleTarget(key)}
                  style={{ marginRight: 6 }}
                />
                {label}
              </label>
            </div>
          ))}
        </fieldset>

        <button type="submit" disabled={sending} style={{ padding: '0.5rem 1rem' }}>
          {sending ? 'Sending…' : 'Send Message'}
        </button>
      </form>

      {status && (
        <div style={{ marginTop: '1rem', color: status.type === 'error' ? 'crimson' : 'green' }}>
          {status.text}
        </div>
      )}
    </div>
  );
};

export default SendSystemMessage; 