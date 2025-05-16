import React from 'react';
import { useState } from 'react';
import '../styles/badgeShowcase.css';
import './ConfirmationModal.css';

const formatDate = (dateString) => {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return d.toLocaleDateString();
};

const BadgeShowcase = ({ badges = [] }) => {
  const [activeBadge, setActiveBadge] = useState(null);

  if (!badges.length) {
    return <p className="no-badges">This user hasn't earned any badges yet.</p>;
  }

  return (
    <>
      <section className="badge-showcase">
        <h3 className="badge-showcase__title">Badges</h3>
        <div className="badge-grid">
          {badges.map((badge) => (
            <div
              key={badge.ID}
              className="badge-card"
              onClick={() => setActiveBadge(badge)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setActiveBadge(badge);
              }}
            >
              <div className="badge-card__image-wrapper">
                <img
                  src={`/images/uploads/badges/${badge.BadgeFileName || badge.Image}`}
                  alt={badge.Title}
                  className="badge-card__image"
                />
                <div className="badge-card__overlay">{badge.Title}</div>
              </div>
              <div className="badge-card__content">
                <span className="badge-card__earned">{formatDate(badge.date_earned)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {activeBadge && (
        <div className="confirm-overlay" onClick={() => setActiveBadge(null)}>
          <div
            className="confirm-modal badge-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="close-btn"
              onClick={() => setActiveBadge(null)}
              aria-label="Close"
            >
              ×
            </button>
            <img
              src={`/images/uploads/badges/${activeBadge.BadgeFileName || activeBadge.Image}`}
              alt={activeBadge.Title}
              className="badge-modal__image"
            />
            <h2 className="badge-modal__title">{activeBadge.Title}</h2>
            {activeBadge.Description && (
              <p className="badge-modal__description">{activeBadge.Description}</p>
            )}
            <p className="badge-modal__earned">Awarded on: {formatDate(activeBadge.date_earned)}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default BadgeShowcase; 