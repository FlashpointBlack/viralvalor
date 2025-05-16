import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './QuestionPractice.css';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const msToReadable = (ms) => {
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
};

const QuestionReport = () => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  const [stats, setStats] = useState(null);
  const [tagRows, setTagRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [preset, setPreset] = useState('all');
  // Sorting state for tag table
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

  const fetchStats = () => {
    if (!userSub) return;
    setLoading(true);
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const headers = { 'x-user-sub': userSub };

    Promise.all([
      axios.get('/my-question-stats', { headers, params }),
      axios.get('/my-question-stats-by-tag', { headers, params })
    ])
      .then(([statsRes, tagRes]) => {
        setStats(statsRes.data);
        setTagRows(Array.isArray(tagRes.data) ? tagRes.data : []);
      })
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));
  };

  const fmt = (d) => d.toISOString().slice(0, 10);

  const applyPreset = (p) => {
    setPreset(p);
    const today = new Date();
    switch (p) {
      case 'today':
        setStartDate(fmt(today));
        setEndDate(fmt(today));
        break;
      case '7':
        setStartDate(fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)));
        setEndDate(fmt(today));
        break;
      case '30':
        setStartDate(fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)));
        setEndDate(fmt(today));
        break;
      case '90':
        setStartDate(fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89)));
        setEndDate(fmt(today));
        break;
      case 'all':
        setStartDate('');
        setEndDate('');
        break;
      case 'custom':
      default:
        break;
    }
  };

  useEffect(() => {
    if (userSub) fetchStats();
  }, [userSub]);

  useEffect(() => {
    if (
      (preset !== 'custom') ||
      (preset === 'custom' && startDate && endDate && new Date(startDate) <= new Date(endDate))
    ) {
      fetchStats();
    }
  }, [preset, startDate, endDate]);

  const totalIncorrect = stats ? stats.totalAttempts - stats.correctCount : 0;
  const accuracyPct = stats && stats.totalAttempts ? (stats.correctCount / stats.totalAttempts * 100).toFixed(1) : '0';

  /* ------ Tag rows helpers ------ */
  const preparedTagRows = useMemo(() => {
    return tagRows.map(r => ({
      ...r,
      incorrectCount: r.totalAttempts - r.correctCount
    }));
  }, [tagRows]);

  const sortedTagRows = useMemo(() => {
    if (!sortConfig.key) return preparedTagRows;
    const getValue = (row, key) => {
      if (key === 'incorrectCount') return row.incorrectCount;
      if (key === 'accuracyPct') return row.accuracy; // accuracy (0-1)
      return row[key];
    };
    return [...preparedTagRows].sort((a, b) => {
      const aVal = getValue(a, sortConfig.key);
      const bVal = getValue(b, sortConfig.key);
      if (aVal == null || bVal == null) return 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return 0;
    });
  }, [preparedTagRows, sortConfig]);

  const handleSort = (key) => {
    if (sortConfig.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ key, direction: 'asc' });
    }
  };

  const sortIndicator = (key) =>
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  // Early returns (after all hooks)
  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error} onClose={() => setError(null)} />;
  if (!stats) return null;

  return (
    <div className="question-practice-container">
      <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Your Practice Report</h2>
      <div className="date-filter-bar">
        {[
          { key: 'today', label: 'Today' },
          { key: '7', label: 'Last 7 Days' },
          { key: '30', label: 'Last 30 Days' },
          { key: '90', label: 'Last 90 Days' },
          { key: 'all', label: 'All' },
          { key: 'custom', label: 'Custom' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`date-filter-btn ${preset === key ? 'active' : ''}`}
            onClick={() => applyPreset(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="custom-date-range">
          <div className="date-picker-group">
            <span>Start</span>
            <DatePicker
              selected={startDate ? new Date(startDate) : null}
              onChange={date => setStartDate(date ? date.toISOString().slice(0, 10) : '')}
              dateFormat="MM/dd/yyyy"
              maxDate={endDate ? new Date(endDate) : undefined}
              className="date-picker-input"
              placeholderText="MM/DD/YYYY"
            />
          </div>
          <div className="date-picker-group">
            <span>End</span>
            <DatePicker
              selected={endDate ? new Date(endDate) : null}
              onChange={date => setEndDate(date ? date.toISOString().slice(0, 10) : '')}
              dateFormat="MM/dd/yyyy"
              minDate={startDate ? new Date(startDate) : undefined}
              className="date-picker-input"
              placeholderText="MM/DD/YYYY"
            />
          </div>
        </div>
      )}

      {/* Overall statistics */}
      <table className="qp-report-table">
        <tbody>
          <tr><th>Total Questions Answered</th><td>{stats.totalAttempts}</td></tr>
          <tr><th>Unique Questions Answered</th><td>{stats.distinctQuestions}</td></tr>
          <tr><th>Correct Answers</th><td>{stats.correctCount}</td></tr>
          <tr><th>Incorrect Answers</th><td>{totalIncorrect}</td></tr>
          <tr><th>Accuracy Percent</th><td>{accuracyPct}%</td></tr>
          <tr><th>Average Time per Question</th><td>{msToReadable(stats.avgTimeMs)}</td></tr>
          <tr>
            <th>Fastest Question</th>
            <td>{stats.fastestQuestionText ? `${stats.fastestQuestionText} -- ${msToReadable(stats.fastestTimeMs)}` : '—'}</td>
          </tr>
          <tr>
            <th>Slowest Question</th>
            <td>{stats.slowestQuestionText ? `${stats.slowestQuestionText} -- ${msToReadable(stats.slowestTimeMs)}` : '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Tag statistics */}
      {sortedTagRows.length > 0 && (
        <>
          <h3 style={{ marginTop: '2rem', textAlign: 'center' }}>Tag Statistics</h3>
          <table className="qp-report-table" style={{ marginTop: '0.5rem' }}>
            <thead>
              <tr>
                {/* Grouped header row */}
                <th rowSpan="2" className="sortable" onClick={() => handleSort('tagName')}>
                  Tag{sortIndicator('tagName')}
                </th>
                <th rowSpan="2" className="sortable" onClick={() => handleSort('totalAttempts')}>
                  Total Questions Answered{sortIndicator('totalAttempts')}
                </th>
                <th rowSpan="2" className="sortable" onClick={() => handleSort('distinctQuestions')}>
                  Unique Questions Answered{sortIndicator('distinctQuestions')}
                </th>
                <th colSpan="3">Accuracy Metrics</th>
                <th rowSpan="2" className="sortable" onClick={() => handleSort('avgTimeMs')}>
                  Avg Time per Question{sortIndicator('avgTimeMs')}
                </th>
              </tr>
              <tr>
                <th className="sortable" onClick={() => handleSort('correctCount')}>
                  Correct{sortIndicator('correctCount')}
                </th>
                <th className="sortable" onClick={() => handleSort('incorrectCount')}>
                  Incorrect{sortIndicator('incorrectCount')}
                </th>
                <th className="sortable" onClick={() => handleSort('accuracyPct')}>
                  Accuracy %{sortIndicator('accuracyPct')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTagRows.map(row => {
                const incorrect = row.incorrectCount;
                const accPct = row.accuracy !== null ? (row.accuracy * 100).toFixed(1) : '0';
                return (
                  <tr key={row.tagId}>
                    <td style={{ textAlign: 'left' }}>{row.tagName}</td>
                    <td>{row.totalAttempts}</td>
                    <td>{row.distinctQuestions}</td>
                    <td>{row.correctCount}</td>
                    <td>{incorrect}</td>
                    <td>{accPct}%</td>
                    <td>{msToReadable(row.avgTimeMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default QuestionReport; 