import React, { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import axios from 'axios';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import Select from 'react-select';
import '../styles/mobile-question-bank.css';

/*
 * QuestionBankEditor
 * --------------------------------------------------
 * Allows educators to create and manage multiple-choice questions.
 * Behaviour mirrors StorylineEditor patterns:
 *   • Only owners/admins can modify questions (enforced by backend).
 *   • Uses Auth0 sub header for auth.
 *   • Supports dynamic option list with exactly one correct answer.
 */
const QuestionBankEditor = ({ lectureId = null, showTagFilter = true }) => {
  const { user } = useAuth0();
  const userSub = user?.sub;

  const [questions, setQuestions] = useState([]);            // list for sidebar
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [question, setQuestion] = useState(null);            // full question w/options
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [allTags, setAllTags] = useState([]); // list of {value,label}
  const [filterTags, setFilterTags] = useState([]); // selected tags for filtering
  const [tagsCollapsed, setTagsCollapsed] = useState(true);
  const [newTagName, setNewTagName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEducator, setIsEducator] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // State to track theme for keying react-select
  const [currentAppliedTheme, setCurrentAppliedTheme] = useState(
    typeof document !== 'undefined' ? document.body.dataset.theme || 'light' : 'light'
  );

  // Helper computed – only educator admins may manage tags
  const allowTagging = isAdmin && isEducator;

  // Setup mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Set initial theme
    setCurrentAppliedTheme(document.body.dataset.theme || 'light');

    // Observe body for data-theme changes
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const newTheme = document.body.dataset.theme || 'light';
          setCurrentAppliedTheme(newTheme);
        }
      }
    });

    observer.observe(document.body, { attributes: true });

    return () => {
      observer.disconnect();
    };
  }, []); // Empty dependency array to run once on mount and clean up on unmount

  /* -------------------------------- Helpers ------------------------------ */
  // If tag filter hidden, always treat filterTags as empty for filtering logic
  const effectiveFilterTags = showTagFilter ? filterTags : [];

  const fetchQuestions = useCallback(async () => {
    if (!userSub) return;
    setLoading(true);
    setError(null);
    try {
      let endpoint = '/my-questions';
      if (lectureId) {
        endpoint = `/lecture/${lectureId}/questions`;
      }

      const { data } = await axios.get(endpoint, {
        withCredentials: true,
        headers: { 'x-user-sub': userSub },
      });
      let baseList = Array.isArray(data) ? data : [];

      // Enrich each question with its tags (needed for filtering)
      // This does an additional request per question, which is acceptable for small lists.
      // If performance becomes an issue, consider a dedicated endpoint that returns questions with tags.
      try {
        const enriched = await Promise.all(
          baseList.map(async (q) => {
            try {
              const { data: full } = await axios.get(`/get-question/${q.ID}`, {
                withCredentials: true,
                headers: { 'x-user-sub': userSub },
              });
              return { ...q, tags: full.tags || [] };
            } catch (innerErr) {
              console.warn('Failed to fetch tags for question', q.ID, innerErr);
              return { ...q, tags: [] };
            }
          })
        );
        baseList = enriched;
      } catch (enrichErr) {
        console.error('Failed enriching questions with tags', enrichErr);
      }

      setQuestions(baseList);
    } catch (err) {
      console.error('Failed to load questions:', err);
      setError('error loading questions');
    } finally {
      setLoading(false);
    }
  }, [userSub, lectureId]);

  const loadQuestion = useCallback(async (qid) => {
    if (!qid || !userSub) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`/get-question/${qid}`, {
        withCredentials: true,
        headers: { 'x-user-sub': userSub },
      });
      setQuestion(data);
    } catch (err) {
      console.error('Failed to load question:', err);
      setError('Failed to load question');
    } finally {
      setLoading(false);
    }
  }, [userSub]);

  const createBlankQuestion = async () => {
    if (!userSub) return;
    setLoading(true);
    setError(null);
    try {
      const payload = lectureId ? { userSub, lectureId } : { userSub };
      const { data } = await axios.post('/create-blank-question', payload, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
      const newId = data.questionId;
      await fetchQuestions();
      setSelectedQuestionId(newId);
      await loadQuestion(newId);
    } catch (err) {
      console.error('Failed to create question:', err);
      setError('Failed to create question');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllTags = useCallback(async () => {
    try {
      const { data } = await axios.get('/tags', { withCredentials: true });
      setAllTags(data.map(t => ({ value: t.id, label: t.name })));
    } catch (err) {
      console.error('Failed to load tags', err);
    }
  }, []);

  const refreshTagsAndQuestions = useCallback(async () => {
    await Promise.all([fetchAllTags(), fetchQuestions()]);
  }, [fetchAllTags, fetchQuestions]);

  /* ------------------------------ Field updates -------------------------- */
  const updateQuestionField = async (field, value) => {
    if (!question) return;
    const { ID } = question;
    try {
      setQuestion((prev) => ({ ...prev, [field]: value })); // optimistic
      await axios.post('/update-question-field', { id: ID, field, value }, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
      // refresh list title maybe
      setQuestions((prev) => prev.map((q) => (q.ID === ID ? { ...q, [field]: value } : q)));
    } catch (err) {
      console.error('Failed updating field', err);
      setError('Failed to save field');
    }
  };

  /* ----------------------------- Option helpers -------------------------- */
  const addOption = async () => {
    if (!question) return;
    try {
      const { data } = await axios.post('/create-question-option', {
        questionId: question.ID,
        userSub,
      }, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
      const newOption = { ID: data.optionId, OptionText: '', Rationale: '', IsCorrect: 0 };
      setQuestion((prev) => ({ ...prev, options: [...prev.options, newOption] }));
    } catch (err) {
      console.error('Failed to add option', err);
      setError('Failed to add option');
    }
  };

  const updateOptionText = async (optionId, text) => {
    if (!question) return;
    // optimistic update
    setQuestion((prev) => ({
      ...prev,
      options: prev.options.map((op) => (op.ID === optionId ? { ...op, OptionText: text } : op)),
    }));
    try {
      await axios.post('/update-question-option', { questionId: question.ID, optionId, text }, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
    } catch (err) {
      console.error('Failed update option text', err);
      setError('Failed to save option');
    }
  };

  const updateOptionRationale = async (optionId, rationale) => {
    if (!question) return;
    // optimistic update
    setQuestion((prev) => ({
      ...prev,
      options: prev.options.map((op) => (op.ID === optionId ? { ...op, Rationale: rationale } : op)),
    }));
    try {
      await axios.post('/update-question-option', { questionId: question.ID, optionId, rationale }, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
    } catch (err) {
      console.error('Failed update option rationale', err);
      setError('Failed to save option rationale');
    }
  };

  const deleteOption = async (optionId) => {
    if (!question) return;
    try {
      await axios.post('/delete-question-option', { questionId: question.ID, optionId }, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
      setQuestion((prev) => ({
        ...prev,
        options: prev.options.filter((op) => op.ID !== optionId),
      }));
    } catch (err) {
      console.error('Failed delete option', err);
      setError('Failed to delete option');
    }
  };

  const setCorrectOption = async (optionId) => {
    if (!question) return;
    try {
      await axios.post('/set-correct-option', { questionId: question.ID, optionId }, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
      setQuestion((prev) => ({
        ...prev,
        options: prev.options.map((op) => ({ ...op, IsCorrect: op.ID === optionId ? 1 : 0 })),
      }));
    } catch (err) {
      console.error('Failed set correct option', err);
      setError('Failed to set correct answer');
    }
  };

  /* ------------------------------ Effects -------------------------------- */
  useEffect(() => {
    if (userSub) {
      axios.defaults.headers.common['x-user-sub'] = userSub;
      fetchQuestions();
      fetchAllTags();

      // Determine admin status / educator flag once so we can restrict tag UI
      axios.get('/am-admin', { headers: { 'x-user-sub': userSub } })
        .then(res => setIsAdmin(!!res.data.isAdmin))
        .catch(() => setIsAdmin(false));

      axios.get('/am-educator', { headers: { 'x-user-sub': userSub } })
        .then(res => setIsEducator(!!res.data.isEducator))
        .catch(() => setIsEducator(false));
    }
  }, [userSub, fetchQuestions, fetchAllTags]);

  useEffect(() => {
    if (selectedQuestionId) {
      loadQuestion(selectedQuestionId);
    } else {
      setQuestion(null);
    }
  }, [selectedQuestionId, loadQuestion]);

  /* -------------------------------- Render ------------------------------- */
  if (!userSub) {
    return <div className="question-bank-editor"><p>Please log in.</p></div>;
  }

  const OptionRow = ({ option }) => {
    const { ID, OptionText, Rationale = '', IsCorrect } = option;
    const [localText, setLocalText] = useState(OptionText);
    const [localRationale, setLocalRationale] = useState(Rationale);
    const showRationale = !!OptionText || !!Rationale;

    // Keep local state in sync when parent updates (e.g., option reset)
    useEffect(() => {
      setLocalText(OptionText);
      setLocalRationale(Rationale);
    }, [OptionText, Rationale]);

    const handleBlur = () => {
      if (localText !== OptionText) {
        updateOptionText(ID, localText);
      }
    };

    const handleRationaleBlur = () => {
      if (localRationale !== Rationale) {
        updateOptionRationale(ID, localRationale);
      }
    };

    return (
      <div className="option-row">
        <div className="option-main">
          <input
            type="radio"
            name="correctOption"
            checked={IsCorrect === 1}
            onChange={() => setCorrectOption(ID)}
            title="Mark as correct answer"
          />
          <input
            type="text"
            className="option-input"
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onBlur={handleBlur}
            placeholder="Answer text"
          />
          <button className="btn delete-btn" onClick={() => deleteOption(ID)} title="Delete option">✕</button>
        </div>
        {showRationale && (
          <label className="option-rationale-label">
            Rationale
            <textarea
              className="option-rationale-input"
              value={localRationale}
              onChange={(e) => setLocalRationale(e.target.value)}
              onBlur={handleRationaleBlur}
              placeholder="Explanation shown to student when this answer is chosen"
              rows={3}
              style={{ minHeight: '80px' }}
            />
          </label>
        )}
      </div>
    );
  };

  // Tag change handler
  const handleTagsChange = async (selectedOptions) => {
    if (!allowTagging || !question) return; // restrict if not allowed
    const tagIds = selectedOptions.map(opt => opt.value);
    try {
      await axios.post('/set-question-tags', { questionId: question.ID, tagIds }, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
      setQuestion(prev => ({ ...prev, tags: selectedOptions.map(o => ({ id: o.value, name: o.label })) }));
    } catch (err) {
      console.error('Failed to set tags', err);
      setError('Failed to set tags');
    }
  };

  const handleCreateTag = async (inputValue) => {
    if (!allowTagging) return null;
    try {
      const { data } = await axios.post('/create-tag', { name: inputValue }, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
      // refresh tag list
      await fetchAllTags();
      return { value: data.tagId, label: inputValue };
    } catch (err) {
      console.error('Failed to create tag', err);
      setError('Failed to create tag');
      return null;
    }
  };

  // Get computed style from CSS variables based on current theme
  const getThemeStyles = () => {
    const root = document.documentElement;
    const isDarkTheme = document.body.getAttribute('data-theme') === 'dark';

    const getResolvedVar = (varName) => {
      if (!varName) return null; // Handle cases where a variable might not be applicable
      return getComputedStyle(root).getPropertyValue(varName).trim();
    };

    // Define light and dark variables explicitly for clarity
    const controlBgVar = isDarkTheme ? '--input-bg-dark' : '--input-bg-light';
    const controlTextVar = isDarkTheme ? '--text-dark' : '--text-light';
    const controlBorderVar = isDarkTheme ? '--border-dark' : '--border-light';
    const controlFocusBorderVar = isDarkTheme ? '--primary-dark' : '--primary-light'; // Use primary color for focus

    const menuBgVar = isDarkTheme ? '--bg-dark-card' : '--bg-light-card';
    // menuTextVar can be same as controlTextVar or specific if needed
    const menuBorderVar = isDarkTheme ? '--border-dark' : '--border-light';

    const optionBgVar = isDarkTheme ? '--bg-dark-card' : '--bg-light-card';
    const optionHoverBgVar = isDarkTheme ? '--hover-dark' : '--hover-light';
    const optionSelectedBgVar = isDarkTheme ? getResolvedVar('--primary-dark') : getResolvedVar('--primary-light'); // Selected option background
    const optionSelectedTextVar = isDarkTheme ? getResolvedVar('--text-dark') : getResolvedVar('--button-text-light'); // Text for selected option (e.g., white on primary color)
    const optionTextVar = isDarkTheme ? '--text-dark' : '--text-light';

    // For multi-value chips (selected tags)
    // Light theme: use var(--border-light) (#dddddd)
    // Dark theme: use var(--bg-dark-alt) (#1e1e1e)
    const multiValueBgColor = isDarkTheme ? getResolvedVar('--bg-dark-alt') : getResolvedVar('--border-light');
    const multiValueTextColor = isDarkTheme ? getResolvedVar('--text-dark') : getResolvedVar('--text-light');
    const multiValueRemoveHoverBgColor = isDarkTheme ? getResolvedVar('--button-hover-dark') : getResolvedVar('--button-hover-light');


    const placeholderTextVar = isDarkTheme ? '--text-dark-tertiary' : '--text-light-tertiary';
    const indicatorColorVar = isDarkTheme ? '--text-dark-secondary' : '--text-light-secondary';
    const indicatorHoverColorVar = isDarkTheme ? '--text-dark' : '--text-light';


    return {
      controlBg: getResolvedVar(controlBgVar),
      controlText: getResolvedVar(controlTextVar),
      controlBorder: getResolvedVar(controlBorderVar),
      controlFocusBorder: getResolvedVar(controlFocusBorderVar),
      
      menuBg: getResolvedVar(menuBgVar),
      menuText: getResolvedVar(optionTextVar), // Use optionTextVar for general menu text color
      menuBorder: getResolvedVar(menuBorderVar),
      
      optionBg: getResolvedVar(optionBgVar),
      optionHoverBg: getResolvedVar(optionHoverBgVar),
      optionSelectedBg: optionSelectedBgVar,
      optionSelectedText: optionSelectedTextVar,
      optionText: getResolvedVar(optionTextVar),
      
      multiValueBg: multiValueBgColor,
      multiValueText: multiValueTextColor,
      multiValueRemoveHoverBg: multiValueRemoveHoverBgColor,
      
      placeholderText: getResolvedVar(placeholderTextVar),
      indicatorColor: getResolvedVar(indicatorColorVar),
      indicatorHoverColor: getResolvedVar(indicatorHoverColorVar),
    };
  };

  return (
    <div className="question-bank-editor">
      <div className="qbe-sidebar">
        <button className="btn create-btn" onClick={createBlankQuestion}>+ New Question</button>
        {/* Tag filter */}
        {showTagFilter && (
          <div className="tag-filter" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            <Select
              isMulti
              options={allTags}
              value={filterTags}
              onChange={(vals) => setFilterTags(vals || [])}
              placeholder="Filter by tag(s)"
              classNamePrefix="tag-filter-select"
              menuPortalTarget={document.body}
              styles={{
                menuPortal: base => ({ ...base, zIndex: 12000 }),
                menu: base => ({ ...base, zIndex: 12000 })
              }}
            />
          </div>
        )}
        {loading && <LoadingIndicator />}
        {error && (
          <ErrorMessage
            message={error}
            onRetry={fetchQuestions}
            onClose={() => setError(null)}
          />
        )}
        <ul className="question-list">
          {questions.length === 0 && !loading && (
            <li className="placeholder">No questions created</li>
          )}
          {(effectiveFilterTags.length ? questions.filter((q) => {
            if (!q.tags || q.tags.length === 0) return false;
            return effectiveFilterTags.every(ft => q.tags.some(t => t.id === ft.value));
          }) : questions).map((q) => (
            <li
              key={q.ID}
              className={q.ID === selectedQuestionId ? 'active' : ''}
              onClick={() => setSelectedQuestionId(q.ID)}
            >
              {q.QuestionText || `Question #${q.ID}`}
            </li>
          ))}
        </ul>
      </div>

      <div className="qbe-main">
        {loading && !question && <LoadingIndicator />}
        {question && (
          <div className="question-editor">
            <div className="form-group">
              <label>Question Text</label>
              <textarea
                value={question.QuestionText || ''}
                onChange={(e) => updateQuestionField('QuestionText', e.target.value)}
                rows={6}
                placeholder="Enter the question prompt"
                style={{ minHeight: '120px' }}
              />
            </div>

            {/* Global rationales were removed in favour of per-option rationale. */}

            <div className="options-section">
              <div className="options-header">
                <h4>Options</h4>
                <button className="btn" onClick={addOption}>Add Option</button>
              </div>
              {question.options && (
                <>
                  <div className="option-row option-header">
                    <span className="header-label">Mark Correct</span>
                    <span className="header-label">Answer Text</span>
                    <span className="header-label">Remove Choice</span>
                  </div>
                  {question.options.length > 0 ? (
                    question.options.map((opt) => <OptionRow key={opt.ID} option={opt} />)
                  ) : (
                    <p>No options yet.</p>
                  )}
                </>
              )}
            </div>

            {allowTagging && (
              <div className="form-group">
                <div
                  className="tags-toggle-header"
                  style={{ cursor: 'pointer', userSelect: 'none', marginBottom: '0.5rem' }}
                  onClick={() => setTagsCollapsed(prev => !prev)}
                >
                  <strong>Tags</strong> {tagsCollapsed ? '▸' : '▾'}
                </div>
                {!tagsCollapsed && (
                  <>
                    <div
                      className="tags-grid"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        marginBottom: '0.5rem',
                      }}
                    >
                      {allTags.map(tag => {
                        const checked = question.tags?.some(t => t.id === tag.value);
                        return (
                          <label
                            key={tag.value}
                            className={`tag-item ${checked ? 'selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                let newSelection;
                                if (checked) {
                                  newSelection = (question.tags || []).filter(t => t.id !== tag.value);
                                } else {
                                  newSelection = [...(question.tags || []), { id: tag.value, name: tag.label }];
                                }
                                handleTagsChange(newSelection.map(t => ({ value: t.id, label: t.name })));
                              }}
                            />
                            <span>{tag.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {/* New tag creation (educator admins only) */}
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!newTagName.trim()) return;
                        const created = await handleCreateTag(newTagName.trim());
                        if (created) {
                          setNewTagName('');
                        }
                      }}
                      style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
                    >
                      <input
                        type="text"
                        placeholder="New tag name"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        style={{ flex: '1 1 auto' }}
                      />
                      <button type="submit" className="btn">Add</button>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {!question && !loading && (
          <div className="blank-state">Select or create a question to begin.</div>
        )}
      </div>
    </div>
  );
};

export default QuestionBankEditor; 