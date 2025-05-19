import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../contexts/ToastContext';
import './LectureManager.css';

/*
 * LectureManager
 * --------------------------------------------------
 * Allows educators/admins to list their lectures and add new ones (URL or PPT upload).
 */

// utility hook to know admin
const useIsAdmin = (userSub) => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!userSub) {
      setIsAdmin(false);
      return;
    }

    const check = async () => {
      try {
        const { data } = await axios.get('am-admin', {
          headers: { 'x-user-sub': userSub }
        });
        setIsAdmin(!!data.isAdmin);
      } catch {
        setIsAdmin(false);
      }
    };
    check();
  }, [userSub]);

  return isAdmin;
};

const LectureManager = ({ onEditLecture }) => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');
  const isAdmin = useIsAdmin(userSub);

  const [lectures, setLectures] = useState([]); // [{id, title, linkUrl, fileNameServer}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { addToast } = useToast();

  const [confirmState, setConfirmState] = useState({ open: false, message: '', onConfirm: null });

  // Categorize lectures for display in separate groups
  const groupedLectures = React.useMemo(() => {
    const awaiting = [];
    const drafts = [];
    const accepted = [];
    const released = [];

    lectures.forEach((lec) => {
      if (lec.lastReleasedAt) {
        released.push(lec);
      } else if (lec.approvalStatus === 'PENDING') {
        awaiting.push(lec);
      } else if (!lec.approvalStatus || lec.approvalStatus === 'DRAFT') {
        drafts.push(lec);
      } else if (lec.approvalStatus === 'APPROVED') {
        accepted.push(lec);
      }
    });

    // Sort released by oldest release first
    released.sort((a, b) => new Date(a.lastReleasedAt) - new Date(b.lastReleasedAt));

    return { awaiting, drafts, accepted, released };
  }, [lectures]);

  // Separate list of lectures created by the current user (for quick access)
  const myLectures = React.useMemo(
    () => lectures.filter((lec) => lec.createdBy === userSub),
    [lectures, userSub]
  );

  const askConfirmation = (message, onConfirmFn) => {
    setConfirmState({ open: true, message, onConfirm: () => {
      setConfirmState({ open: false, message: '', onConfirm: null });
      onConfirmFn();
    }});
  };

  const loadLectures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get('lectures/my-lectures', { headers: { 'x-user-sub': userSub } });
      setLectures(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError('Failed to load lectures');
    } finally {
      setLoading(false);
    }
  }, [userSub]);

  const handleRelease = async (lectureId) => {
    askConfirmation('Release this lecture to all current students?', async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.post('lectures/release-lecture', { lectureId }, { headers: { 'x-user-sub': userSub } });
        addToast(`Lecture released to ${data.releasedCount || 0} students`, 'success');
        await loadLectures();
      } catch (err) {
        console.error('Failed to release lecture', err);
        setError('Failed to release lecture');
        addToast('Failed to release lecture', 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDelete = async (lectureId) => {
    askConfirmation('Delete this lecture? All associated questions will ALSO be permanently deleted.', async () => {
      setLoading(true);
      setError(null);
      try {
        await axios.post('lectures/delete-lecture', 
          { id: lectureId }, 
          { headers: { 'x-user-sub': userSub } }
        );
        addToast('Lecture deleted', 'success');
        await loadLectures();
      } catch (err) {
        console.error('Failed to delete lecture:', err);
        setError('Failed to delete lecture');
        addToast('Failed to delete lecture', 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleSubmitForApproval = async (lectureId) => {
    askConfirmation('Submit this lecture for admin approval?', async () => {
      setLoading(true);
      setError(null);
      try {
        await axios.post('lectures/submit-lecture-for-approval', { lectureId }, { headers: { 'x-user-sub': userSub } });
        await loadLectures();
        addToast('Lecture submitted for approval', 'success');
      } catch (err) {
        console.error('Failed to submit lecture', err);
        setError('Failed to submit lecture');
        addToast('Failed to submit lecture', 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleApprove = async (lecObj) => {
    const isCreator = lecObj.createdBy === userSub;
    const needsWarning = !isCreator && (!lecObj.approvalStatus || lecObj.approvalStatus === 'DRAFT');
    const message = needsWarning
      ? 'This lecture has not been submitted for approval yet. Approve anyway?'
      : 'Approve this lecture?';

    askConfirmation(message, async () => {
      setLoading(true);
      setError(null);
      try {
        await axios.post('lectures/approve-lecture', { lectureId: lecObj.id }, { headers: { 'x-user-sub': userSub } });
        await loadLectures();
        addToast('Lecture approved', 'success');
      } catch (err) {
        console.error('Failed to approve lecture', err);
        setError('Failed to approve lecture');
        addToast('Failed to approve lecture', 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleReject = async (lecObj) => {
    askConfirmation('Reject this lecture and send it back to draft?', async () => {
      setLoading(true);
      setError(null);
      try {
        await axios.post('lectures/deny-lecture', { lectureId: lecObj.id }, { headers: { 'x-user-sub': userSub } });
        await loadLectures();
        addToast('Lecture rejected', 'info');
      } catch (err) {
        console.error('Failed to reject lecture', err);
        setError('Failed to reject lecture');
        addToast('Failed to reject lecture', 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleAddLecture = () => {
    // Simply open the edit form with 'new' as the lectureId
    // The LectureEditor component already handles this case
    onEditLecture('new');
  };

  useEffect(() => { loadLectures(); }, [loadLectures]);

  // Helper to render a single lecture item
  const renderLectureItem = (lec) => (
    <li
      key={lec.id}
      className={`lecture-item${lec.approvalStatus === 'PENDING' ? ' pending' : ''}${(!lec.approvalStatus || lec.approvalStatus === 'DRAFT') ? ' draft' : ''}`}
    >
      <div className="lecture-actions">
        {/* Edit allowed when not pending/approved OR the user is an admin */}
        {(lec.approvalStatus !== 'PENDING' && lec.approvalStatus !== 'APPROVED') || isAdmin ? (
          <button 
            className="btn btn-icon btn-sm" 
            onClick={() => onEditLecture(lec.id)} 
            title="Edit lecture"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </button>
        ) : null}
        {/* Release button (admins only, approved only) */}
        {isAdmin && lec.approvalStatus === 'APPROVED' && (
          <button
            className="btn btn-icon btn-sm btn-success"
            onClick={() => handleRelease(lec.id)}
            title="Release lecture"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {/* Approve button for admins when pending */}
        {isAdmin && (!lec.approvalStatus || lec.approvalStatus === 'PENDING' || lec.approvalStatus === 'DRAFT') && (
          <button
            className="btn btn-icon btn-sm btn-primary"
            onClick={() => handleApprove(lec)}
            title="Approve lecture"
          >
            ✓
          </button>
        )}
        {/* Submit for approval for draft lectures (any owner) */}
        {!isAdmin && (!lec.approvalStatus || lec.approvalStatus === 'DRAFT') && (
          <button
            className="btn btn-icon btn-sm btn-warning"
            onClick={() => handleSubmitForApproval(lec.id)}
            title="Submit for approval"
          >
            ⇪
          </button>
        )}
        {/* Reject button for admins when pending */}
        {isAdmin && lec.approvalStatus === 'PENDING' && (
          <button
            className="btn btn-icon btn-sm btn-danger"
            onClick={() => handleReject(lec)}
            title="Reject lecture"
          >
            ✗
          </button>
        )}
        {/* Delete not allowed once lecture submitted or approved for non-admins */}
        {(lec.approvalStatus !== 'PENDING' && lec.approvalStatus !== 'APPROVED') || isAdmin ? (
          <button 
            className="btn btn-icon btn-sm btn-danger" 
            onClick={() => handleDelete(lec.id)} 
            title="Delete lecture"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        ) : null}
      </div>
      <strong className="lecture-title">{lec.title}</strong>
      {lec.lastReleasedAt ? (
        <span className="lecture-status">Last released {new Date(lec.lastReleasedAt).toLocaleString()}</span>
      ) : (
        <span className="lecture-status">{lec.approvalStatus || 'DRAFT'}</span>
      )}
    </li>
  );

  /* ------------------------------ Render --------------------------- */
  return (
    <div className="lecture-manager-container">
      {loading && <LoadingIndicator />}
      {error && (
        <ErrorMessage
          message={error}
          onClose={() => setError(null)}
        />
      )}

      <h2>My Lectures</h2>
      <p className="admin-explanation">Create and manage lecture materials for students. Lectures must be approved before they can be released to students. Use the buttons to edit, approve, submit for approval, release, or delete lectures.</p>
      <div className="lecture-actions-wrapper">
        <button className="add-lecture-btn" onClick={handleAddLecture}>Add New Lecture</button>
      </div>

      {/* ----------------- My Lectures (duplicate list) ----------------- */}
      <div className="lecture-list-wrapper">
        {myLectures.length === 0 ? (
          <p>You have not created any lectures yet.</p>
        ) : (
          <ul className="lecture-list">
            {myLectures.map((lec) => renderLectureItem(lec))}
          </ul>
        )}
      </div>

      {isAdmin && (
        <div className="lecture-list-wrapper" style={{ marginTop: '2rem' }}>
          <h3>Other Lectures</h3>
          <p className="admin-explanation" style={{ marginTop: '0.5rem' }}>
            Because you are an administrator, the lectures below show <strong>all</strong> records in the system—organized by their current status—in case you wish to review, approve, or manage them.
          </p>
          {lectures.length === 0 ? (
            <p>No lectures yet.</p>
          ) : (
            <>
              {groupedLectures.awaiting.length > 0 && (
                <>
                  <h4>Awaiting Admin Approval</h4>
                  <ul className="lecture-list">
                    {groupedLectures.awaiting.map((lec) => renderLectureItem(lec))}
                  </ul>
                </>
              )}
              {groupedLectures.drafts.length > 0 && (
                <>
                  <h4>Drafts</h4>
                  <ul className="lecture-list">
                    {groupedLectures.drafts.map((lec) => renderLectureItem(lec))}
                  </ul>
                </>
              )}
              {groupedLectures.accepted.length > 0 && (
                <>
                  <h4>Accepted</h4>
                  <ul className="lecture-list">
                    {groupedLectures.accepted.map((lec) => renderLectureItem(lec))}
                  </ul>
                </>
              )}
              {groupedLectures.released.length > 0 && (
                <>
                  <h4>Released</h4>
                  <ul className="lecture-list">
                    {groupedLectures.released.map((lec) => renderLectureItem(lec))}
                  </ul>
                </>
              )}
            </>
          )}
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

export default LectureManager; 