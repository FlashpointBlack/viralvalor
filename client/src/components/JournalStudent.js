import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './JournalStudent.css';
import { useAuth0 } from '@auth0/auth0-react';

const JournalStudent = ({ initialPromptId = null }) => {
  const [prompts, setPrompts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [prompt, setPrompt] = useState(null); // {title,promptText}
  const [response, setResponse] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const { isLoading: authLoading, isAuthenticated, user } = useAuth0();
  const [initialOpened, setInitialOpened] = useState(false);

  useEffect(() => {
    // Wait until Auth0 has finished loading and the user is authenticated
    if (!authLoading && isAuthenticated) {
      fetchPrompts();
    }
  }, [authLoading, isAuthenticated]);

  // After prompts are fetched, open initial prompt if provided
  useEffect(() => {
    if (!loading && initialPromptId && !initialOpened && prompts.length) {
      openPrompt(initialPromptId);
      setInitialOpened(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialPromptId, prompts, initialOpened]);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/my-journal-prompts', { headers: { 'x-user-sub': user?.sub } });
      let list = Array.isArray(data) ? data : [];
      // Filter out any placeholder/unreleased prompts that should not be shown to students
      list = list.filter(p => {
        if (!p || typeof p.title !== 'string') return false;
        const t = p.title.trim().toLowerCase();
        return t && t !== 'prompt title' && t !== 'placeholder';
      });
      setPrompts(list);
    } catch (err) {
      setError('Failed to load prompts');
    } finally {
      setLoading(false);
    }
  };

  const openPrompt = async (id) => {
    setLoading(true);
    setSelectedId(id);
    try {
      const [pRes, rRes] = await Promise.all([
        axios.get(`/journal-prompts/${id}`, { headers: { 'x-user-sub': user?.sub } }),
        axios.get(`/journal-prompts/${id}/my-response`, { headers: { 'x-user-sub': user?.sub } }).catch(() => ({ data: null }))
      ]);
      setPrompt(pRes.data);
      if (rRes.data) {
        setResponse(rRes.data.responseText || '');
        setCharCount(rRes.data.charCount || 0);
      } else {
        setResponse('');
        setCharCount(0);
      }
    } catch (err) {
      setError('Failed to load prompt');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`/journal-prompts/${selectedId}/response`, { responseText: response }, { headers: { 'x-user-sub': user?.sub } });
      setCharCount(data.charCount);
      // Refresh list so charCount reflects immediately
      await fetchPrompts();

      // Return to list view after save
      backToList();
    } catch (err) {
      setError('Failed to save response');
    } finally {
      setLoading(false);
    }
  };

  const backToList = () => {
    setSelectedId(null);
    setPrompt(null);
    setResponse('');
    setCharCount(0);
  };

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error} onClose={() => setError(null)} />;

  if (!selectedId) {
    return (
      <div className="journal-list-container">
        <h2>Reflection Journal Prompts</h2>
        <p className="student-explanation">View and respond to journal prompts assigned by instructors. Click on a prompt to enter your response. Your responses are saved when you submit them.</p>
        {prompts.length > 0 ? (
          <ul className="journal-list">
            {prompts.map((p) => (
              <li key={p.id} className={p.charCount != null ? 'completed' : ''}>
                <button type="button" onClick={() => openPrompt(p.id)}>
                  {p.title}
                  {p.charCount != null && <span className="status">Completed ({p.charCount} chars)</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ padding: '0.5rem' }}>No journal prompts available yet. Check back after your instructor assigns them.</p>
        )}
      </div>
    );
  }

  // Writer view
  return (
    <div className="journal-writer-container">
      <h2>{prompt?.title}</h2>
      <p className="prompt-text">{prompt?.promptText}</p>

      <textarea
        className="response-textarea"
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        rows={10}
      />
      <button type="button" className="save-btn" onClick={handleSave}>Save</button>
      {saveMsg && <span className="save-msg">{saveMsg}</span>}
    </div>
  );
};

export default JournalStudent; 