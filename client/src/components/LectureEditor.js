import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import QuestionBankEditor from './QuestionBankEditor';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../contexts/ToastContext';
import './LectureEditor.css';

/**
 * LectureEditor
 * --------------------------------------------------
 * Allows editing or creating a lecture with associated questions.
 * 
 * Props:
 *   lectureId?: string  - ID of lecture to edit, or 'new' for creating a new lecture
 *   onBack: ()=>void    - Function to call to return to lecture list
 */
const LectureEditor = ({ lectureId, onBack }) => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');
  
  const [isNew, setIsNew] = useState(lectureId === 'new' || !lectureId);
  const [loading, setLoading] = useState(!isNew);
  const [lecture, setLecture] = useState(null);
  
  // Track if we've successfully created a new lecture
  const [createdLectureId, setCreatedLectureId] = useState(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);

  // link vs file mode
  const initialMode = (url || lecture?.linkUrl) ? 'link' : (lecture?.fileNameServer ? 'file' : 'link');
  const [mode, setMode] = useState(initialMode);

  // Debounce helper
  const debounceRef = useRef(null);

  const debounceSave = (field, value, delay = 600) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveField(field, value);
    }, delay);
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [creatingBlank, setCreatingBlank] = useState(false);

  const { addToast } = useToast();

  // Confirmation modal state for submit action
  const [confirmState, setConfirmState] = useState({ open: false, message: '', onConfirm: null });

  const askConfirmation = (message, onConfirmFn) => {
    setConfirmState({
      open: true,
      message,
      onConfirm: () => {
        setConfirmState({ open: false, message: '', onConfirm: null });
        onConfirmFn();
      }
    });
  };

  // Load lecture data if editing existing lecture
  const loadLecture = useCallback(async () => {
    if (isNew || !lectureId || lectureId === 'new') {
      setIsNew(true);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { data } = await axios.get('/my-lectures', { 
        headers: { 'x-user-sub': userSub }
      });
      
      if (Array.isArray(data)) {
        const foundLecture = data.find(l => l.id.toString() === lectureId.toString());
        if (foundLecture) {
          setLecture(foundLecture);
          setTitle(foundLecture.title || '');
          setDescription(foundLecture.description || '');
          setUrl(foundLecture.linkUrl || '');
        } else {
          setError('Lecture not found');
        }
      }
    } catch (err) {
      console.error('Failed to load lecture', err);
      setError('Failed to load lecture');
    } finally {
      setLoading(false);
    }
  }, [lectureId, userSub, isNew]);

  useEffect(() => {
    loadLecture();
  }, [loadLecture]);

  // On mount: if lectureId is "new" or undefined, immediately create a blank lecture
  useEffect(() => {
    const createBlankIfNeeded = async () => {
      if (lectureId && lectureId !== 'new') return; // nothing to do
      if (createdLectureId) return; // already created
      setCreatingBlank(true);
      setError(null);
      try {
        const { data } = await axios.post('/create-blank-lecture', {
          userSub,
          // Optionally pass initial title, empty for now
        }, {
          headers: { 'x-user-sub': userSub }
        });
        const newId = data.lectureId;
        if (newId) {
          setCreatedLectureId(newId);
          setLecture({ id: newId, title: '', description: '', linkUrl: '' });
        } else {
          throw new Error('No lectureId in response');
        }
      } catch (err) {
        console.error('Failed to create blank lecture', err);
        setError('Failed to create lecture');
      } finally {
        setCreatingBlank(false);
      }
    };
    createBlankIfNeeded();
  }, [lectureId, userSub, createdLectureId]);

  // ------- Auto-save helpers -------
  const saveField = async (field, value) => {
    const idToUse = createdLectureId || lectureId || (lecture && lecture.id);
    if (!idToUse) return; // We don't yet have an ID (shouldn't happen)

    try {
      await axios.post('/update-lecture', {
        id: idToUse,
        // Map url↔linkUrl on backend via field name `url`
        ...(field === 'url' ? { url: value } : { [field]: value })
      }, {
        headers: { 'x-user-sub': userSub }
      });

      // Keep local lecture object in sync
      setLecture(prev => prev ? { ...prev, [field === 'url' ? 'linkUrl' : field]: value } : prev);
    } catch (err) {
      console.error('Auto-save failed', err);
      setError('Failed to save changes');
    }
  };

  const handleFileChange = async (fileObj) => {
    if (!fileObj) return;
    const idToUse = createdLectureId || lectureId || (lecture && lecture.id);
    if (!idToUse) return;

    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('id', idToUse);
      formData.append('file', fileObj);
      await axios.post('/upload-lecture-file-existing', formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'x-user-sub': userSub }
      });
      setLecture(prev => prev ? { ...prev, fileNameServer: 'uploaded', linkUrl: prev.linkUrl } : prev);
    } catch (err) {
      console.error('File upload failed', err);
      setError('Failed to upload file');
    } finally {
      setSaving(false);
    }
  };

  // Helper confirm
  const confirmLoss = async (msg) => {
    return window.confirm(msg);
  };

  const switchMode = async (target) => {
    if (target === mode) return;

    // confirm data loss
    let hasData = false;
    if (target === 'link' && lecture?.fileNameServer) hasData = true;
    if (target === 'file' && (url || lecture?.linkUrl)) hasData = true;

    if (hasData) {
      const msg = target === 'link'
        ? 'Switching to Link will delete the currently uploaded file. Continue?'
        : 'Switching to File will clear the current URL. Continue?';
      const ok = await confirmLoss(msg);
      if (!ok) return;
    }

    // Clear opposite data
    const idToUse = createdLectureId || lectureId || (lecture && lecture.id);
    if (target === 'link') {
      // delete file server side
      if (lecture?.fileNameServer) {
        axios.post('/delete-lecture-file', { id: idToUse }, { headers: { 'x-user-sub': userSub } }).catch(() => {});
      }
      setLecture(prev => prev ? { ...prev, fileNameServer: null } : prev);
      setMode('link');
    } else {
      // switching to file: clear URL
      setUrl('');
      saveField('url', '');
      setMode('file');
    }
  };

  // ----------------- Submit for Approval -----------------
  const handleSubmitForApproval = async () => {
    const idToUse = createdLectureId || lectureId || (lecture && lecture.id);
    if (!idToUse) return;

    askConfirmation('Submit this lecture for admin approval?', async () => {
      setSaving(true);
      setError(null);
      try {
        await axios.post('/submit-lecture-for-approval', { lectureId: idToUse }, { headers: { 'x-user-sub': userSub } });
        addToast('Lecture submitted for approval', 'success');
        // Update local lecture status so UI reflects change
        setLecture(prev => prev ? { ...prev, approvalStatus: 'PENDING' } : prev);
      } catch (err) {
        console.error('Failed to submit lecture', err);
        setError('Failed to submit lecture');
        addToast('Failed to submit lecture', 'error');
      } finally {
        setSaving(false);
      }
    });
  };

  // ----------------- Approve Lecture (Admin) -----------------
  const handleApprove = async () => {
    const idToUse = createdLectureId || lectureId || (lecture && lecture.id);
    if (!idToUse) return;

    askConfirmation('Approve this lecture for release?', async () => {
      setSaving(true);
      setError(null);
      try {
        await axios.post('/approve-lecture', { lectureId: idToUse }, { headers: { 'x-user-sub': userSub } });
        addToast('Lecture approved successfully', 'success');
        // Update local lecture status so UI reflects change
        setLecture(prev => prev ? { ...prev, approvalStatus: 'APPROVED' } : prev);
      } catch (err) {
        console.error('Failed to approve lecture', err);
        const msg = err?.response?.data?.error || 'Failed to approve lecture';
        setError(msg);
        addToast(msg, 'error');
      } finally {
        setSaving(false);
      }
    });
  };

  // -------------------- Admin check --------------------
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!userSub) return;
    const fetchAdmin = async () => {
      try {
        const { data } = await axios.get('/am-admin', {
          headers: { 'x-user-sub': userSub }
        });
        setIsAdmin(!!data.isAdmin);
      } catch {
        setIsAdmin(false);
      }
    };
    fetchAdmin();
  }, [userSub]);

  if (loading || creatingBlank) {
    return (
      <div className="lecture-editor-container">
        <LoadingIndicator />
      </div>
    );
  }

  // Determine which lecture ID to use for the question bank
  const questionBankLectureId = createdLectureId || (lecture && lecture.id) || (!isNew && lectureId);

  // Whether this user can modify lecture content
  const canEdit = isAdmin || (!lecture?.approvalStatus || lecture.approvalStatus === 'DRAFT');

  return (
    <div className="lecture-editor-container">
      <div className="lecture-editor-header">
        <h2>{isNew ? 'Add New Lecture' : `Edit Lecture: ${title}`}</h2>
        {/* Submit for approval button shown only when lecture is in DRAFT state */}
        {lecture && !isAdmin && (!lecture.approvalStatus || lecture.approvalStatus === 'DRAFT') && (
          <button className="btn btn-warning btn-sm" onClick={handleSubmitForApproval} disabled={saving}>
            Submit for Approval
          </button>
        )}
        {/* Approve button shown for admins when lecture is in DRAFT state */}
        {lecture && isAdmin && (!lecture.approvalStatus || lecture.approvalStatus === 'DRAFT' || lecture.approvalStatus === 'PENDING') && (
          <button className="btn btn-primary btn-sm" onClick={handleApprove} disabled={saving}>
            Approve Lecture
          </button>
        )}
      </div>

      {error && (
        <ErrorMessage
          message={error}
          onClose={() => setError(null)}
        />
      )}
      {saving && <LoadingIndicator />}

      {/* ------------------ Edit Form ------------------ */}
      <div className="lecture-edit-form">
        <label>Title
          <input
            type="text"
            value={title}
            onChange={(e) => {
              if (!canEdit) return; 
              setTitle(e.target.value);
            }}
            onBlur={(e) => canEdit && saveField('title', e.target.value)}
            required
            disabled={!canEdit}
          />
        </label>
        <label>Description (optional)
          <textarea
            value={description}
            onChange={(e) => {
              if (!canEdit) return;
              setDescription(e.target.value);
              debounceSave('description', e.target.value);
            }}
            readOnly={!canEdit}
          />
        </label>
        {/* Mode selector */}
        <div className="mode-switch pill-switch">
          <span
            className={mode === 'link' ? 'pill active' : 'pill'}
            onClick={() => canEdit && switchMode('link')}
            style={!canEdit ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >Link</span>
          <span
            className={mode === 'file' ? 'pill active' : 'pill'}
            onClick={() => canEdit && switchMode('file')}
            style={!canEdit ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >File</span>
        </div>

        {mode === 'link' && (
          <label>Lecture URL
            <input
              type="url"
              value={url}
              onChange={(e) => {
                if (!canEdit) return;
                setUrl(e.target.value);
                debounceSave('url', e.target.value);
              }}
              placeholder="https://"
              disabled={!canEdit}
            />
          </label>
        )}

        {mode === 'file' && canEdit && (
          <label>{lecture?.fileNameServer ? 'Replace PPT' : 'Upload PPT'}
            <input type="file" accept=".ppt,.pptx" onChange={(e) => handleFileChange(e.target.files[0])} />
          </label>
        )}
      </div>

      {/* Show question bank if we have a valid lecture ID */}
      {questionBankLectureId && canEdit && (
        <div className="question-bank-section">
          <hr />
          <h3>Questions for this lecture</h3>
          <QuestionBankEditor lectureId={questionBankLectureId} showTagFilter={false} />
        </div>
      )}

      <ConfirmationModal
        open={confirmState.open}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState({ open: false, message: '', onConfirm: null })}
      />
    </div>
  );
};

export default LectureEditor; 