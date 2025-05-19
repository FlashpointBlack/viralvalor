import React, { useState } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import QuestionBankEditor from './QuestionBankEditor';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './LectureDetail.css';

// If lecture prop is null/undefined or empty object, treat as creating new lecture
const LectureDetail = ({ lecture, onClose }) => {
  const isNew = !lecture || !lecture.id;
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  // Form state
  const [title, setTitle] = useState(lecture?.title || '');
  const [description, setDescription] = useState(lecture?.description || '');
  const [url, setUrl] = useState(lecture?.linkUrl || '');
  const [file, setFile] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title) return;

    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        // Creation path: link OR file
        if (url) {
          await axios.post('lectures/create-lecture-link', { title, url, description }, {
            headers: { 'x-user-sub': userSub }
          });
        } else if (file) {
          const formData = new FormData();
          formData.append('title', title);
          formData.append('description', description);
          formData.append('file', file);
          await axios.post('lectures/upload-lecture-file', formData, {
            headers: { 'Content-Type': 'multipart/form-data', 'x-user-sub': userSub }
          });
        } else {
          setError('Provide a URL or choose a file');
          setSaving(false);
          return;
        }
      } else {
        // Update existing lecture details (no file uploads here)
        await axios.post('lectures/update-lecture', { id: lecture.id, title, description, url }, {
          headers: { 'x-user-sub': userSub }
        });
      }

      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to save lecture');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lecture-detail-container">
      <div className="lecture-detail-header">
        <h3>{isNew ? 'Add Lecture' : `Edit: ${lecture.title}`}</h3>
        <button onClick={onClose}>Close</button>
      </div>

      {error && (
        <ErrorMessage
          message={error}
          onClose={() => setError(null)}
        />
      )}
      {saving && <LoadingIndicator />}

      {/* ------------------ Edit Form ------------------ */}
      <form onSubmit={handleSave} className="lecture-edit-form">
        <label>Title
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>Description (optional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>Link URL (optional)
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        {isNew && (
          <>
            <div className="or-divider">— or —</div>
            <label>Upload PPT (optional)
              <input type="file" accept=".ppt,.pptx" onChange={(e) => setFile(e.target.files[0])} />
            </label>
          </>
        )}

        <button type="submit" disabled={saving}>{isNew ? 'Create' : 'Save'}</button>
      </form>

      {/* If editing existing lecture show question bank */}
      {!isNew && (
        <>
          <hr />
          <h4>Questions for this lecture</h4>
          <QuestionBankEditor lectureId={lecture.id} />
        </>
      )}
    </div>
  );
};

export default LectureDetail; 