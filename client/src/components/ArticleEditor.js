import React, { useState } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './LectureEditor.css';

const ArticleEditor = ({ onBack }) => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  const [mode, setMode] = useState('link'); // 'link' or 'file'
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!title) {
      setError('Title required');
      return;
    }
    if (mode === 'link' && !url) {
      setError('URL required');
      return;
    }
    if (mode === 'file' && !file) {
      setError('PDF file required');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      let articleId;
      if (mode === 'link') {
        const { data } = await axios.post('/create-article-link', { title, url, description }, { headers: { 'x-user-sub': userSub } });
        articleId = data?.articleId;
      } else {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('file', file);
        const { data } = await axios.post('/upload-article-file', formData, { headers: { 'x-user-sub': userSub, 'Content-Type': 'multipart/form-data' } });
        articleId = data?.articleId;
      }

      // Immediately submit for approval if we got an id
      if (articleId) {
        await axios.post('/submit-article-for-approval', { articleId }, { headers: { 'x-user-sub': userSub } }).catch(()=>{});
      }

      onBack();
    } catch (err) {
      console.error(err);
      setError('Failed to save article');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lecture-editor-container">
      {loading && <LoadingIndicator />}
      {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

      <h2 className="lecture-editor-header">New Article</h2>

      <form className="lecture-edit-form" style={{maxWidth:'550px'}} onSubmit={(e)=>{e.preventDefault(); handleSubmit();}}>
        <label>
          Title
          <input type="text" value={title} onChange={(e)=>setTitle(e.target.value)} required />
        </label>
        <label>
          Description (optional – why is this article interesting?)
          <textarea rows="3" value={description} onChange={(e)=>setDescription(e.target.value)} />
        </label>

        {/* Pill switch for mode */}
        <div className="pill-switch" style={{ margin: '1rem 0' }}>
          <span className={`pill ${mode==='link' ? 'active' : ''}`} onClick={()=>setMode('link')}>Link</span>
          <span className={`pill ${mode==='file' ? 'active' : ''}`} onClick={()=>setMode('file')}>PDF Upload</span>
        </div>

        {mode==='link' ? (
          <label>
            Article URL
            <input type="url" placeholder="https://" value={url} onChange={(e)=>setUrl(e.target.value)} required />
          </label>
        ) : (
          <label>
            PDF File
            <input type="file" accept="application/pdf" onChange={(e)=>setFile(e.target.files[0])} required />
          </label>
        )}

        <div className="form-actions">
          <button type="button" className="save-btn cancel-btn" style={{background:'transparent', color:'var(--text-light-secondary,#666)', border:'1px solid var(--border-light,#ddd)'}} onClick={onBack}>Cancel</button>
          <button type="submit" className="save-btn">Submit for Approval</button>
        </div>
      </form>
    </div>
  );
};

export default ArticleEditor; 