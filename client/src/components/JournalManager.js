import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../contexts/ToastContext';
import './JournalManager.css';

const JournalManager = () => {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingPrompt, setEditingPrompt] = useState(null); // {id,title,promptText}
  const [recipientsPromptId, setRecipientsPromptId] = useState(null);
  const [recipients, setRecipients] = useState([]);

  // confirmation modal state
  const [confirm, setConfirm] = useState({ open: false, message: '', onConfirm: null });

  const { addToast } = useToast();

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/journal-prompts');
      setPrompts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load prompts');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => setEditingPrompt({ id: null, title: '', promptText: '' });
  const openEdit = (p) => setEditingPrompt({ ...p });
  const closeEditor = () => setEditingPrompt(null);

  const savePrompt = async () => {
    const { id, title, promptText } = editingPrompt;
    if (!title || !promptText) return alert('Title and prompt text required');
    setLoading(true);
    try {
      if (id) {
        await axios.put(`/journal-prompts/${id}`, { title, promptText });
      } else {
        await axios.post('/journal-prompts', { title, promptText });
      }
      closeEditor();
      fetchPrompts();
    } catch (err) {
      setError('Failed to save prompt');
    } finally {
      setLoading(false);
    }
  };

  const deletePrompt = async (id) => {
    setConfirm({
      open: true,
      message: 'Delete this prompt? This cannot be undone.',
      onConfirm: async () => {
        setConfirm({ ...confirm, open: false });
        setLoading(true);
        try {
          await axios.delete(`/journal-prompts/${id}`);
          fetchPrompts();
        } catch (err) {
          setError('Failed to delete');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const releasePrompt = async (id) => {
    setConfirm({
      open: true,
      message: 'Release this prompt to all students?',
      onConfirm: async () => {
        setConfirm({ ...confirm, open: false });
        setLoading(true);
        try {
          const { data } = await axios.post('/release-journal-prompt', { promptId: id });
          addToast(`Journal released to ${data.releasedCount || 0} students`, 'success');
        } catch (err) {
          setError('Failed to release prompt');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const openDetails = async (id) => {
    setRecipientsPromptId(id);
    setLoading(true);
    try {
      const [rRes, sRes] = await Promise.all([
        axios.get(`/journal-prompts/${id}/recipients`).catch(() => ({ data: [] })),
        axios.get(`/journal-prompts/${id}/stats`).catch(() => ({ data: [] })),
      ]);
      const recips = Array.isArray(rRes.data) ? rRes.data : [];
      const stats = Array.isArray(sRes.data) ? sRes.data : [];

      // Merge data
      const map = {};
      recips.forEach(r => {
        map[r.userSub] = { ...r, charCount: null, submittedAt: null };
      });
      stats.forEach(s => {
        if (map[s.userSub]) {
          map[s.userSub].charCount = s.charCount;
          map[s.userSub].submittedAt = s.submittedAt;
        } else {
          map[s.userSub] = { userSub: s.userSub, displayName: s.displayName, releasedAt: null, charCount: s.charCount, submittedAt: s.submittedAt };
        }
      });
      setRecipients(Object.values(map));
    } catch (err) {
      setError('Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  const closeRecipients = () => { setRecipientsPromptId(null); setRecipients([]); };

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error} onClose={() => setError(null)} />;

  return (
    <div className="journal-mgr-container">
      <h2>Journal Prompts</h2>
      <p className="admin-explanation">Create and manage reflection journal prompts for students. Add new prompts, edit existing ones, release to students, and view response statistics.</p>
      <button type="button" className="add-btn" onClick={openCreate}>+ New Prompt</button>
      <table className="prompt-table">
        <thead>
          <tr><th>ID</th><th>Title</th><th>Created</th><th>Last Released</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {prompts.map(p => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.title}</td>
              <td>{new Date(p.createdAt).toLocaleDateString()}</td>
              <td>{p.lastReleasedAt ? new Date(p.lastReleasedAt).toLocaleDateString() : '-'}</td>
              <td>
                <button className="btn-secondary" onClick={() => openEdit(p)}>Edit</button>
                <button className="btn-secondary" onClick={() => openDetails(p.id)}>Details</button>
                <button className="btn-warning" onClick={() => releasePrompt(p.id)}>Release</button>
                <button className="btn-danger" onClick={() => deletePrompt(p.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Editor modal simple inline */}
      {editingPrompt && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <h3>{editingPrompt.id ? 'Edit Prompt' : 'New Prompt'}</h3>
            <label>Title
              <input
                type="text"
                value={editingPrompt.title}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, title: e.target.value })}
              />
            </label>
            <label>Prompt Text
              <textarea
                rows={6}
                value={editingPrompt.promptText}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, promptText: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button className="btn btn-primary btn-md" onClick={savePrompt}>Save</button>
              <button className="btn btn-secondary btn-md" onClick={closeEditor}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Details modal */}
      {recipientsPromptId && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <h3>Prompt #{recipientsPromptId} – Recipients & Responses</h3>
            <button className="close-btn" onClick={closeRecipients} aria-label="Close">×</button>
            {recipients.length === 0 ? (
              <p>No students have received this prompt yet.</p>
            ) : (
              <table className="stats-table">
                <thead><tr><th>User</th><th>Released</th><th>Characters</th><th>Submitted</th></tr></thead>
                <tbody>
                  {recipients.map((r,i) => (
                    <tr key={i}><td>{r.displayName || r.userSub}</td><td>{r.releasedAt ? new Date(r.releasedAt).toLocaleString() : '-'}</td><td>{r.charCount ?? '-'}</td><td>{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '-'}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <button onClick={closeRecipients}>Close</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={confirm.open}
        message={confirm.message}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm({ ...confirm, open: false })}
      />
    </div>
  );
};

export default JournalManager; 