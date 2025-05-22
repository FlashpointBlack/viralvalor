import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../contexts/ToastContext';
import './LectureManager.css'; // reuse same styles

const useIsAdmin = (userSub) => {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!userSub) return setIsAdmin(false);
    axios.get('am-admin', { headers: { 'x-user-sub': userSub } })
      .then(({ data }) => setIsAdmin(!!data.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [userSub]);
  return isAdmin;
};

const ArticleManager = ({ onEditArticle }) => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');
  const isAdmin = useIsAdmin(userSub);

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { addToast } = useToast();
  const [confirmState, setConfirmState] = useState({ open: false, message: '', onConfirm: null });

  const grouped = React.useMemo(() => {
    const awaiting = [];
    const accepted = [];
    articles.forEach((a) => {
      if (a.approvalStatus === 'PENDING') awaiting.push(a);
      else if (a.approvalStatus === 'APPROVED') accepted.push(a);
    });
    return { awaiting, accepted };
  }, [articles]);

  const myArticles = React.useMemo(() => articles.filter(a=>a.createdBy === userSub), [articles, userSub]);

  const askConfirm = (msg, fn) => {
    setConfirmState({ open: true, message: msg, onConfirm: () => { setConfirmState({ open:false, message:'', onConfirm:null }); fn(); } });
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await axios.get('articles/my-articles', { headers: { 'x-user-sub': userSub } });
      setArticles(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); setError('Failed to load'); }
    finally { setLoading(false); }
  }, [userSub]);

  useEffect(() => { load(); }, [load]);

  /*
  const handleSubmitForApproval = async (id) => {
    askConfirm('Submit this article for admin approval?', async () => {
      setLoading(true);
      try {
        await axios.post('articles/submit-article-for-approval', { articleId: id }, { headers: { 'x-user-sub': userSub } });
        await load();
        addToast('Article submitted', 'success');
      } catch { addToast('Failed', 'error'); }
      finally { setLoading(false); }
    });
  };
  */

  const handleApprove = async (article) => {
    const needsWarn = article.approvalStatus !== 'PENDING';
    askConfirm(needsWarn ? 'Approve this draft article?' : 'Approve this article?', async () => {
      setLoading(true);
      try {
        await axios.post('articles/approve-article', { articleId: article.id }, { headers: { 'x-user-sub': userSub } });
        await load();
        addToast('Article approved', 'success');
      } catch { addToast('Failed to approve', 'error'); }
      finally { setLoading(false); }
    });
  };

  const handleReject = async (article) => {
    askConfirm('Reject and return to draft?', async () => {
      setLoading(true);
      try {
        await axios.post('articles/deny-article', { articleId: article.id }, { headers: { 'x-user-sub': userSub } });
        await load();
        addToast('Article denied', 'info');
      } catch { addToast('Failed', 'error'); }
      finally { setLoading(false); }
    });
  };

  // Permanently delete an article (admin only)
  const handleDelete = async (article) => {
    askConfirm('This will permanently delete the article. Continue?', async () => {
      setLoading(true);
      try {
        await axios.post('articles/delete-article', { articleId: article.id }, { headers: { 'x-user-sub': userSub } });
        await load();
        addToast('Article deleted', 'success');
      } catch {
        addToast('Failed to delete', 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const renderActions = (article, listType = 'my') => {
    // Always allow viewing/downloading assets
    const viewButtons = (
      <>
        {article.linkUrl && (
          <a
            href={article.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="lecture-link-btn btn"
          >View</a>
        )}
        {article.fileNameServer && (
          <a
            href={`/api/articles/download-article-file/${article.id}`}
            className="lecture-link-btn btn"
          >PDF</a>
        )}
      </>
    );

    // For My Articles we only show view/pdf links regardless of role
    if (listType === 'my') {
      return <div style={{ display: 'flex', gap: '8px' }}>{viewButtons}</div>;
    }

    // Admin/Educator lists (awaiting/approved) may include management buttons
    const isOwner = article.createdBy === userSub;
    return (
      <div style={{ display: 'flex', gap: '8px' }}>
        {viewButtons}
        {(isAdmin || isOwner) && article.approvalStatus !== 'APPROVED' && (
          <>
            <button type="button" className="btn" onClick={() => handleApprove(article)}>Approve</button>
            {/* Only pending items can be denied */}
            {article.approvalStatus === 'PENDING' && (isAdmin || isOwner) && (
              <button type="button" className="btn" onClick={() => handleReject(article)}>Deny</button>
            )}
          </>
        )}
        {/* Delete button – admin only */}
        {isAdmin && (
          <button
            type="button"
            className="btn"
            style={{ backgroundColor: '#e11d48', color: '#fff' }}
            onClick={() => handleDelete(article)}
          >
            Delete
          </button>
        )}
      </div>
    );
  };

  const renderSection = (title, items, listType = 'my') => (
    <div className="lecture-section" key={title}>
      <h3>{title}</h3>
      {items.length === 0 ? <p>No items</p> : (
        <ul className="lecture-list">
          {items.map((art) => (
            <li key={art.id} className="lecture-item">
              <div className="lecture-info">
                <strong>{art.title}</strong>
                {listType === 'my' && art.approvalStatus === 'PENDING' && (
                  <span style={{ marginLeft: 8, fontStyle: 'italic', color: '#d97706' }}>
                    (pending approval)
                  </span>
                )}
                {art.description && <p className="lecture-desc">{art.description}</p>}
              </div>
              <div className="lecture-action">{renderActions(art, listType)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="lecture-manager-container">
      {loading && <LoadingIndicator />}
      {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

      <h2>Article Manager</h2>
      <p>Add or manage journal articles for students. Articles must be approved before they appear to students.</p>

      <div className="lecture-actions-wrapper">
        <button className="add-lecture-btn" onClick={() => onEditArticle('new')}>New Article</button>
      </div>

      {/* ------------ Lists -------------- */}
      {renderSection('My Articles', myArticles, 'my')}

      {isAdmin && (
        <>
          <p className="admin-explanation" style={{ marginTop: '2rem' }}>
            <strong>Administrator Sections</strong> – use the actions below to approve or deny articles submitted by educators.
          </p>
          {renderSection('Awaiting Approval (Admin)', grouped.awaiting, 'admin')}
          {renderSection('Approved (Admin)', grouped.accepted, 'admin')}
        </>
      )}

      {/* confirmation modal */}
      <ConfirmationModal
        open={confirmState.open}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState({ open:false, message:'', onConfirm:null })}
      />
    </div>
  );
};

export default ArticleManager; 