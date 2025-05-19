import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import './QuestionPractice.css';
import { useLocation } from 'react-router-dom';

// NOTE: We're restoring the full component while removing the attempts table from the UI.

const QuestionPractice = () => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');
  const location = useLocation();

  const [questions, setQuestions] = useState([]);          // [{ID, QuestionText}]
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0); // tracks position in randomized list
  const [question, setQuestion] = useState(null);          // {ID, QuestionText, options}
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [attempts, setAttempts] = useState([]);            // kept for future reporting UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitStatus, setSubmitStatus] = useState(null);  // {isCorrect: bool}
  const questionStartRef = useRef(null); // records timestamp when current question was shown

  /* --------------------- Data loading helpers --------------------- */
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(location.search);
      const lectureId = params.get('lecture');
      const endpoint = lectureId ? `lecture/${lectureId}/questions` : 'student-questions';
      const { data } = await axios.get(endpoint);
      let list = Array.isArray(data) ? [...data] : [];
      // Shuffle questions so every practice session has a different order
      list = list.sort(() => Math.random() - 0.5);
      setQuestions(list);

      if (list.length > 0) {
        setCurrentIndex(0);
        const firstId = list[0].ID;
        setSelectedQuestionId(firstId);
        // defer question loading – don't await to keep UX responsive
        loadQuestion(firstId);
      }
    } catch (err) {
      console.error('Failed to load questions', err);
      setError('Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [location.search]);

  const loadQuestion = useCallback(async (qid) => {
    if (!qid) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`questions/student-question/${qid}`);
      // Shuffle the answer options so their placement changes each time
      const shuffle = (arr) => arr
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);

      const shuffledOptions = Array.isArray(data.options) ? shuffle(data.options) : [];

      setQuestion({ ...data, options: shuffledOptions });
      setSelectedOptionId(null);
      setSubmitStatus(null);
      // Reset timer for new question
      questionStartRef.current = Date.now();
    } catch (err) {
      console.error('Failed to load question', err);
      setError('Failed to load question');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAttempts = useCallback(async (qid) => {
    if (!qid || !userSub) {
      setAttempts([]);
      return;
    }
    try {
      const { data } = await axios.get(`questions/my-question-attempts?questionId=${qid}`, {
        headers: { 'x-user-sub': userSub }
      });
      setAttempts(Array.isArray(data) ? data : []);
    } catch (err) {
      // silently ignore – used for future reporting only
    }
  }, [userSub]);

  // initial load
  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Load attempts when question changes (for future reports)
  useEffect(() => {
    if (selectedQuestionId) {
      loadAttempts(selectedQuestionId);
    }
  }, [selectedQuestionId, loadAttempts]);

  /* --------------------- Event handlers --------------------------- */
  const handleSubmit = async () => {
    if (!selectedQuestionId || selectedOptionId == null) return;
    setLoading(true);
    setError(null);
    try {
      const timeTakenMs = questionStartRef.current ? Date.now() - questionStartRef.current : null;
      const { data } = await axios.post('questions/record-question-attempt', {
        questionId: selectedQuestionId,
        selectedOptionId,
        timeTakenMs,
      }, {
        headers: { 'Content-Type': 'application/json', 'x-user-sub': userSub },
      });
      setSubmitStatus({ isCorrect: !!data.isCorrect, rationale: data.rationale || '' });
      // refresh attempts silently for future reporting
      await loadAttempts(selectedQuestionId);
    } catch (err) {
      console.error('Failed to submit attempt', err);
      setError('Failed to submit answer');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < questions.length) {
      const nextIdx = currentIndex + 1;
      const nextQuestionId = questions[nextIdx].ID;
      setCurrentIndex(nextIdx);
      setSelectedQuestionId(nextQuestionId);
      loadQuestion(nextQuestionId);
    }
  };

  const handleRestart = () => {
    // restart by refetching and reshuffling the questions list
    fetchQuestions();
  };

  /* ------------------------ Render helpers ------------------------ */
  const renderQuestion = () => {
    if (!question) {
      return <p className="qp-placeholder">Loading question...</p>;
    }

    const isLastQuestion = currentIndex === questions.length - 1;

    return (
      <div className="qp-question-area">
        <h3 className="qp-question-text">{question.QuestionText}</h3>
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <div className="qp-options">
            {question.options.map((op) => (
              <label key={op.ID} className="qp-option-label">
                <input
                  type="radio"
                  name="option"
                  value={op.ID}
                  checked={selectedOptionId === op.ID}
                  onChange={() => setSelectedOptionId(op.ID)}
                  disabled={submitStatus != null}
                />
                <span>{op.OptionText}</span>
              </label>
            ))}
          </div>
          {!submitStatus && (
            <button type="submit" className="qp-submit-btn" disabled={selectedOptionId == null || loading}>Submit</button>
          )}
        </form>

        {submitStatus && (
          <>
            <div className={`qp-result ${submitStatus.isCorrect ? 'correct' : 'incorrect'}`}>
              <p>{submitStatus.isCorrect ? 'Correct!' : 'Incorrect'}</p>
              {submitStatus.rationale && (
                <p className="qp-rationale">{submitStatus.rationale}</p>
              )}
            </div>

            {!isLastQuestion ? (
              <button type="button" className="qp-next-btn" onClick={handleNext}>Next Question</button>
            ) : (
              <div className="qp-complete-section">
                <p className="qp-complete-msg">You've completed all available questions!</p>
                <button type="button" className="qp-restart-btn" onClick={handleRestart}>Restart</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  /* ----------------------------- Render --------------------------- */
  if (!loading && questions.length === 0) {
    return (
      <div className="question-practice-container">
        <p style={{ padding: '1rem', textAlign: 'center' }}>
          No questions are currently available. Your instructor has not released any practice questions yet.
        </p>
      </div>
    );
  }

  return (
    <div className="question-practice-container">
      {loading && <LoadingIndicator />}
      {error && (
        <ErrorMessage
          message={error}
          onClose={() => setError(null)}
        />
      )}

      <div className="qp-layout">
        <div className="qp-main" style={{ width: '100%' }}>
          {renderQuestion()}
        </div>
      </div>
    </div>
  );
};

export default QuestionPractice;