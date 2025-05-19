import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './QuestionPractice.css';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import ExportPdfButton from './ExportPdfButton';

// Convert milliseconds to human-readable string (m s)
const msToReadable = (ms) => {
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
};

// Admin-only component that lists statistics aggregated by question tag
const QuestionStatsByTag = () => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [preset, setPreset] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const reportRef = useRef(null);

  const fetchData = () => {
    if (!userSub) return;
    setLoading(true);

    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    axios
      .get('questions/admin/question-stats-by-tag', { headers: { 'x-user-sub': userSub }, params })
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load tag stats'))
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

  // Fetch when preset or dates change (respecting custom date validity)
  useEffect(() => {
    if (
      preset !== 'custom' ||
      (preset === 'custom' && startDate && endDate && new Date(startDate) <= new Date(endDate))
    ) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, startDate, endDate]);

  // Initial load
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSub]);

  const handleSort = (key) => {
    if (sortConfig.key === key) {
      setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ key, direction: 'asc' });
    }
  };

  const preparedRows = useMemo(() => {
    return rows.map((r) => ({ ...r, incorrectCount: r.totalAttempts - r.correctCount }));
  }, [rows]);

  const sortedRows = useMemo(() => {
    if (!preparedRows.length || !sortConfig.key) return preparedRows;
    const getValue = (row, key) => (key === 'incorrectCount' ? row.incorrectCount : row[key]);
    return [...preparedRows].sort((a, b) => {
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
  }, [preparedRows, sortConfig]);

  const sortIndicator = (key) =>
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error} onClose={() => setError(null)} />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <ExportPdfButton 
          targetRef={reportRef}
          filename="question-tag-report.pdf"
          preProcess={(doc) => {
            doc.querySelectorAll('.date-filter-bar, .custom-date-range').forEach(el => el.remove());

            const container = doc.querySelector('.question-practice-container');
            if (!container) return;

            const header = doc.createElement('div');
            header.style.textAlign = 'center';
            header.style.marginBottom = '12px';
            header.style.fontSize = '18px';
            header.style.fontWeight = '600';

            let periodText = 'All Time';
            if (startDate && endDate) {
              periodText = `${startDate} to ${endDate}`;
            }

            header.textContent = `Question Tag Report — For period inclusive of: ${periodText}`;

            container.prepend(header);

            const footer = doc.createElement('div');
            footer.style.textAlign = 'right';
            footer.style.marginTop = '12px';
            footer.style.fontSize = '12px';
            footer.textContent = `Generated: ${new Date().toLocaleString()}`;
            container.appendChild(footer);

            // Flatten table headers to single row
            container.querySelectorAll('.qp-report-table').forEach(tbl => {
              const thead = tbl.querySelector('thead');
              if (!thead) return;
              const rows = Array.from(thead.querySelectorAll('tr'));
              if (rows.length < 2) return;
              const first = rows[0];
              const second = rows[1];
              const newRow = doc.createElement('tr');
              first.querySelectorAll('th').forEach(th => {
                const rs = th.getAttribute('rowspan');
                if (rs && parseInt(rs,10) > 1) {
                  const clone = th.cloneNode(true);
                  clone.removeAttribute('rowspan');
                  newRow.appendChild(clone);
                }
              });
              second.querySelectorAll('th').forEach(th => {
                const clone = th.cloneNode(true);
                newRow.appendChild(clone);
              });
              thead.innerHTML = '';
              thead.appendChild(newRow);
            });
          }}
        />
      </div>
      <div ref={reportRef} className="question-practice-container">
        <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Question Tag Reports</h2>

        {/* Preset buttons */}
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

        {/* Custom date range picker */}
        {preset === 'custom' && (
          <div className="custom-date-range">
            <div className="date-picker-group">
              <span>Start</span>
              <DatePicker
                selected={startDate ? new Date(startDate) : null}
                onChange={(date) => setStartDate(date ? date.toISOString().slice(0, 10) : '')}
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
                onChange={(date) => setEndDate(date ? date.toISOString().slice(0, 10) : '')}
                dateFormat="MM/dd/yyyy"
                minDate={startDate ? new Date(startDate) : undefined}
                className="date-picker-input"
                placeholderText="MM/DD/YYYY"
              />
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <p style={{ textAlign: 'center' }}>No data yet.</p>
        ) : (
          <table className="qp-report-table">
            <thead>
              <tr>
                <th rowSpan="2" className="sortable" onClick={() => handleSort('tagName')}>
                  Tag{sortIndicator('tagName')}
                </th>
                <th rowSpan="2" className="sortable" onClick={() => handleSort('totalQuestions')}>
                  Total Questions{sortIndicator('totalQuestions')}
                </th>
                <th colSpan="5">Accuracy Metrics</th>
                <th colSpan="3">Timing Metrics</th>
              </tr>
              <tr>
                <th className="sortable" onClick={() => handleSort('correctCount')}>Correct{sortIndicator('correctCount')}</th>
                <th className="sortable" onClick={() => handleSort('incorrectCount')}>Incorrect{sortIndicator('incorrectCount')}</th>
                <th className="sortable" onClick={() => handleSort('lowestAccuracy')}>
                  Lowest{sortIndicator('lowestAccuracy')}
                </th>
                <th className="sortable" onClick={() => handleSort('accuracy')}>
                  Average{sortIndicator('accuracy')}
                </th>
                <th className="sortable" onClick={() => handleSort('highestAccuracy')}>
                  Highest{sortIndicator('highestAccuracy')}
                </th>

                <th className="sortable" onClick={() => handleSort('slowestTimeMs')}>
                  Slowest{sortIndicator('slowestTimeMs')}
                </th>
                <th className="sortable" onClick={() => handleSort('avgTimeMs')}>
                  Avg Time{sortIndicator('avgTimeMs')}
                </th>
                <th className="sortable" onClick={() => handleSort('fastestTimeMs')}>
                  Fastest{sortIndicator('fastestTimeMs')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const avgAccPct = r.accuracy !== null ? (r.accuracy * 100).toFixed(1) : '0';
                const highestAccPct = r.highestAccuracy !== null ? (r.highestAccuracy * 100).toFixed(1) : '—';
                const lowestAccPct = r.lowestAccuracy !== null ? (r.lowestAccuracy * 100).toFixed(1) : '—';
                return (
                  <tr key={r.tagId}>
                    <td style={{ textAlign: 'left' }}>{r.tagName}</td>
                    <td>{r.totalQuestions}</td>
                    <td>{r.correctCount}</td>
                    <td>{r.incorrectCount}</td>

                    {/* Accuracy percentages */}
                    <td>
                      {lowestAccPct !== 'NaN' ? `${lowestAccPct}%` : '—'}
                      {r.lowestAccUser ? ` (${r.lowestAccUser})` : ''}
                    </td>
                    <td>{avgAccPct !== 'NaN' ? `${avgAccPct}%` : '—'}</td>
                    <td>
                      {highestAccPct !== 'NaN' ? `${highestAccPct}%` : '—'}
                      {r.highestAccUser ? ` (${r.highestAccUser})` : ''}
                    </td>

                    {/* Timing */}
                    <td>
                      {msToReadable(r.slowestTimeMs)}
                      {r.slowestUser ? ` (${r.slowestUser})` : ''}
                    </td>
                    <td>{msToReadable(r.avgTimeMs)}</td>
                    <td>
                      {msToReadable(r.fastestTimeMs)}
                      {r.fastestUser ? ` (${r.fastestUser})` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};

export default QuestionStatsByTag; 