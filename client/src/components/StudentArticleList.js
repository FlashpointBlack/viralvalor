import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './StudentLectureList.css'; // reuse basic styling

const StudentArticleList = () => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get('/approved-articles', {
          headers: { 'x-user-sub': userSub },
        });
        setArticles(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch articles', err);
        setError('Unable to load articles');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userSub]);

  const renderAction = (article) => (
    <div style={{ display: 'flex', gap: '8px' }}>
      {article.linkUrl && (
        <a
          href={article.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="lecture-link-btn btn"
        >
          View Article
        </a>
      )}
      {article.fileNameServer && (
        <a
          href={`/download-article-file/${article.id}`}
          className="lecture-link-btn btn"
        >
          Download PDF
        </a>
      )}
    </div>
  );

  return (
    <div className="student-lecture-list-container">
      {loading && <LoadingIndicator />}
      {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

      <h2>Articles</h2>
      <p className="student-explanation">
        Browse educator-recommended readings. Click the buttons to open the article online or download the provided PDF.
      </p>

      {articles.length === 0 ? (
        <p>No articles have been approved yet.</p>
      ) : (
        <ul className="student-lecture-list">
          {articles.map((art) => (
            <li key={art.id} className="student-lecture-item">
              <div className="lecture-info">
                <strong>{art.title}</strong>
                {art.description && <p className="lecture-desc">{art.description}</p>}
              </div>
              <div className="lecture-meta">
                {art.approvedAt && (
                  <span className="received-date">
                    Approved: {new Date(art.approvedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="lecture-action">{renderAction(art)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StudentArticleList; 