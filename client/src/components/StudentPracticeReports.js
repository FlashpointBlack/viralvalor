import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './QuestionPractice.css';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import ExportPdfButton from './ExportPdfButton';

const msToReadable = (ms) => {
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
};

const StudentPracticeReports = () => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');

  const [rows, setRows] = useState([]);
  const [tagRows, setTagRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [preset, setPreset] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

  // Ref to capture the report content for PDF export
  const reportRef = useRef(null);

  const fetchStudentData = () => {
    if (!userSub) return;
    setLoading(true);
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    axios.get('questions/admin/question-stats', { headers: { 'x-user-sub': userSub }, params })
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load student stats'))
      .finally(() => setLoading(false));
  };

  const fetchTagData = () => {
    if (!userSub) return;
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (selectedStudent !== 'all') params.studentSub = selectedStudent; // backend will handle optional

    axios.get('questions/admin/question-stats-by-tag', { headers: { 'x-user-sub': userSub }, params })
      .then(({ data }) => setTagRows(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load tag stats'));
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
        // for custom we wait until range selected
        break;
    }
  };

  useEffect(() => {
    // Fire automatically when:
    // 1) preset is not custom (start/end already set accordingly)
    // 2) preset is custom and both dates valid.
    if (
      (preset !== 'custom') ||
      (preset === 'custom' && startDate && endDate && new Date(startDate) <= new Date(endDate))
    ) {
      fetchStudentData();
      fetchTagData();
    }
  }, [preset, startDate, endDate, selectedStudent]);

  useEffect(() => {
    fetchStudentData();
    fetchTagData();
  }, [userSub]);

  // Build student options from fetched rows
  const studentOptions = useMemo(() => {
    const opts = rows.map(r => ({ value: r.userSub, label: r.displayName || r.userSub }));
    // Remove duplicates by userSub
    const unique = [];
    const seen = new Set();
    opts.forEach(o => { if (!seen.has(o.value)) { seen.add(o.value); unique.push(o); } });
    unique.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: 'all', label: 'All Students' }, ...unique];
  }, [rows]);

  // ---- Tag rows helpers ----
  const preparedTagRows = useMemo(() => 
    tagRows.map(r => ({ ...r, incorrectCount: r.totalAttempts - r.correctCount })), 
    [tagRows]
  );

  const sortedTagRows = useMemo(() => {
    if (!sortConfig.key) return preparedTagRows;
    const getVal = (row, key) => {
      if (key === 'incorrectCount') return row.incorrectCount;
      if (key === 'accuracyPct') return row.accuracy;
      return row[key];
    };
    return [...preparedTagRows].sort((a, b) => {
      const aVal = getVal(a, sortConfig.key);
      const bVal = getVal(b, sortConfig.key);
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

  const displayedRows = useMemo(() => 
    selectedStudent === 'all' ? rows : rows.filter(r => r.userSub === selectedStudent),
    [rows, selectedStudent]
  );

  const handleSort = (key) => {
    if (sortConfig.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ key, direction: 'asc' });
    }
  };

  const sortIndicator = key => 
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error} onClose={() => setError(null)} />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <ExportPdfButton 
          targetRef={reportRef}
          filename="student-practice-report.pdf"
          preProcess={(doc) => {
            // remove UI controls
            doc.querySelectorAll('.student-selector, .date-filter-bar, .custom-date-range').forEach(el => el.remove());

            const container = doc.querySelector('.question-practice-container');
            if (!container) return;

            // Build header info
            const header = doc.createElement('div');
            header.style.textAlign = 'center';
            header.style.marginBottom = '12px';
            header.style.fontSize = '18px';
            header.style.fontWeight = '600';

            let periodText = 'All Time';
            if (startDate && endDate) {
              periodText = `${startDate} to ${endDate}`;
            }

            const studentText = selectedStudent !== 'all' ? `Student: ${studentOptions.find(o=>o.value===selectedStudent)?.label || selectedStudent}` : '';

            header.textContent = `Student Practice Report  —  For period inclusive of: ${periodText}${studentText ? '  —  ' + studentText : ''}`;

            container.prepend(header);

            // Footer timestamp
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
        <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Student Practice Reports</h2>
        {/* Student selector */}
        <div className="student-selector" style={{ 
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '1rem',
          padding: '12px',
          background: '#f8f9fa',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          maxWidth: '400px',
          margin: '0 auto 1.5rem auto'
        }}>
          <label htmlFor="student-select" style={{ 
            marginRight: '0.75rem', 
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center'
          }}>Student:</label>
          <select
            id="student-select"
            value={selectedStudent}
            onChange={e => setSelectedStudent(e.target.value)}
            style={{ 
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              fontSize: '0.95rem',
              color: '#374151',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              width: '220px',
              cursor: 'pointer',
              transition: 'border-color 0.2s, box-shadow 0.2s'
            }}
          >
            {studentOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {/* Quick preset buttons */}
        <div className="date-filter-bar" style={{ 
          marginBottom: '1.5rem',
          padding: '10px',
          background: '#f8f9fa',
          borderRadius: '8px',
          maxWidth: '600px',
          margin: '0 auto 1.5rem auto',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
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
          <div className="custom-date-range" style={{ 
            background: '#f8f9fa',
            borderRadius: '8px',
            padding: '12px',
            maxWidth: '500px',
            margin: '0 auto 1.5rem auto',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
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

        {displayedRows.length === 0 ? (
          <p style={{ textAlign: 'center' }}>No data yet.</p>
        ) : (
          <table className="qp-report-table" style={{ margin: '0 auto', width: '100%', maxWidth: '1100px' }}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Total Questions Answered</th>
                <th>Unique Questions Answered</th>
                <th>Correct Answers</th>
                <th>Incorrect Answers</th>
                <th>Accuracy %</th>
                <th>Avg Time per Question</th>
                <th>Fastest</th>
                <th>Slowest</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((r) => {
                const accuracyPct = r.totalAttempts ? (r.correctCount / r.totalAttempts * 100).toFixed(1) : '0';
                const incorrect = r.totalAttempts - r.correctCount;
                return (
                  <tr key={r.userSub}>
                    <td>{r.displayName || r.userSub}</td>
                    <td>{r.totalAttempts}</td>
                    <td>{r.distinctQuestions}</td>
                    <td>{r.correctCount}</td>
                    <td>{incorrect}</td>
                    <td>{accuracyPct}%</td>
                    <td>{msToReadable(r.avgTimeMs)}</td>
                    <td>{msToReadable(r.fastestTimeMs)}</td>
                    <td>{msToReadable(r.slowestTimeMs)}</td>
                    <td>{r.lastAttemptDate ? new Date(r.lastAttemptDate).toLocaleString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Tag stats */}
        {sortedTagRows.length > 0 && (
          <>
            <h3 style={{ marginTop: '2.5rem', textAlign: 'center', marginBottom: '1rem' }}>Tag Statistics</h3>
            <table className="qp-report-table" style={{ margin: '0 auto', width: '100%', maxWidth: '1100px' }}>
              <thead>
                <tr>
                  <th rowSpan="2" className="sortable" onClick={() => handleSort('tagName')}>Tag{sortIndicator('tagName')}</th>
                  <th rowSpan="2" className="sortable" onClick={() => handleSort('totalAttempts')}>Total Questions Answered{sortIndicator('totalAttempts')}</th>
                  <th rowSpan="2" className="sortable" onClick={() => handleSort('distinctQuestions')}>Unique Questions Answered{sortIndicator('distinctQuestions')}</th>
                  <th colSpan="3">Accuracy Metrics</th>
                  <th rowSpan="2" className="sortable" onClick={() => handleSort('avgTimeMs')}>Avg Time per Question{sortIndicator('avgTimeMs')}</th>
                </tr>
                <tr>
                  <th className="sortable" onClick={() => handleSort('correctCount')}>Correct{sortIndicator('correctCount')}</th>
                  <th className="sortable" onClick={() => handleSort('incorrectCount')}>Incorrect{sortIndicator('incorrectCount')}</th>
                  <th className="sortable" onClick={() => handleSort('accuracyPct')}>Accuracy %{sortIndicator('accuracyPct')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedTagRows.map(row => {
                  const accPct = row.accuracy !== null ? (row.accuracy * 100).toFixed(1) : '0';
                  return (
                    <tr key={row.tagId}>
                      <td style={{ textAlign: 'left' }}>{row.tagName}</td>
                      <td>{row.totalAttempts}</td>
                      <td>{row.distinctQuestions}</td>
                      <td>{row.correctCount}</td>
                      <td>{row.incorrectCount}</td>
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
    </>
  );
};

export default StudentPracticeReports; 