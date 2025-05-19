import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './StudentLectureList.css';
import { useNavigate } from 'react-router-dom';

const StudentLectureList = () => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get('lectures/my-released-lectures', {
          headers: { 'x-user-sub': userSub },
        });
        setLectures(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch lectures', err);
        setError('Unable to load lectures');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userSub]);

  const renderAction = (lec) => {
    return (
      <div style={{display:'flex', gap:'8px'}}>
        {lec.linkUrl && (
          <a
            href={lec.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="lecture-link-btn btn"
          >
            View Lecture
          </a>
        )}
        {lec.fileNameServer && (
          <a
            href={`/api/lectures/download-lecture-file/${lec.id}`}
            className="lecture-link-btn btn"
          >
            Download PPT
          </a>
        )}
        <button
          type="button"
          className="lecture-link-btn btn"
          onClick={() => navigate({ pathname: '/', search: `?tab=practice&lecture=${lec.id}` })}
        >
          QBank
        </button>
      </div>
    );
  };

  return (
    <div className="student-lecture-list-container">
      {loading && <LoadingIndicator />}
      {error && (
        <ErrorMessage
          message={error}
          onClose={() => setError(null)}
        />
      )}

      <h2>Available Lectures</h2>
      <p className="student-explanation">View and access lecture materials released by instructors. Click the buttons to view online lectures, download presentations, or practice with related quiz questions.</p>
      {lectures.length === 0 ? (
        <p>No lectures have been released to you yet.</p>
      ) : (
        <ul className="student-lecture-list">
          {lectures.map((lec) => (
            <li key={lec.id} className="student-lecture-item">
              <div className="lecture-info">
                <strong>{lec.title}</strong>
                {lec.description && <p className="lecture-desc">{lec.description}</p>}
              </div>
              <div className="lecture-meta">
                {lec.releasedAt && (
                  <span className="received-date">
                    Date Received: {new Date(lec.releasedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="lecture-action">{renderAction(lec)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StudentLectureList; 