import React from 'react';
import PropTypes from 'prop-types';
// import './EducatorPanel.css'; // Or a specific BreadcrumbTrail.css if needed

// BreadcrumbCircle component moved from EducatorPanel.js
const BreadcrumbCircle = React.memo(({ item, index, onClick, disabled, title }) => {
  const classNames = [
    'breadcrumb-circle',
    item.isCurrent ? 'active' : '',
    item.visited && !item.isCurrent ? 'visited' : '',
    item.unreachable ? 'unreachable' : '',
    !item.visited && !item.isCurrent && !item.unreachable ? 'future' : ''
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classNames}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {index + 1}
    </button>
  );
}, (prevProps, nextProps) => {
  const prevStatus = {
    isCurrent: prevProps.item.isCurrent,
    visited: prevProps.item.visited,
    unreachable: prevProps.item.unreachable
  };
  const nextStatus = {
    isCurrent: nextProps.item.isCurrent,
    visited: nextProps.item.visited,
    unreachable: nextProps.item.unreachable
  };
  const sameStatus = (
    prevStatus.isCurrent === nextStatus.isCurrent &&
    prevStatus.visited === nextStatus.visited &&
    prevStatus.unreachable === nextStatus.unreachable
  );
  const sameInteractivity = prevProps.disabled === nextProps.disabled;
  return sameStatus && sameInteractivity;
});

BreadcrumbCircle.displayName = 'BreadcrumbCircle'; // For better debugging

BreadcrumbCircle.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    isCurrent: PropTypes.bool,
    visited: PropTypes.bool,
    unreachable: PropTypes.bool,
  }).isRequired,
  index: PropTypes.number.isRequired,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
};

const BreadcrumbTrail = ({
  longestPath,
  navigateToBreadcrumb,
  getEncounterTitle, // To get titles for breadcrumbs
  breadcrumbsLoading,
  isPresentationActive,
  currentEncounter, // To know if we should render
}) => {
  if (!isPresentationActive || !currentEncounter || breadcrumbsLoading) {
    // Don't render if presentation isn't active, no current encounter, or breadcrumbs are loading
    // Optionally, show a loading indicator if breadcrumbsLoading is true but presentation is active
    if (isPresentationActive && currentEncounter && breadcrumbsLoading) {
      return <div className="breadcrumb-loading">Loading breadcrumbs...</div>;
    }
    return null;
  }

  if (!longestPath || longestPath.length === 0) {
    return <div className="breadcrumb-info">No path to display.</div>; // Or null
  }

  return (
    <div className="visual-breadcrumb-trail" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflowX: 'auto',
      minWidth: 0,
      height: 'auto', 
      padding: '5px 0'
    }}>
      {longestPath.map((item, index) => (
        <React.Fragment key={`breadcrumb-${item.id || `placeholder-${index}`}`}>
          {index > 0 && (
            <div className="breadcrumb-arrow">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <BreadcrumbCircle
            item={item}
            index={index}
            onClick={() => (item.visited && !item.isCurrent && item.id && !String(item.id).startsWith('placeholder-')) ? navigateToBreadcrumb(item.id) : null}
            disabled={!item.visited || item.isCurrent || item.unreachable || (item.id && String(item.id).startsWith('placeholder-'))}
            title={
              item.id && !String(item.id).startsWith('placeholder-') && item.visited 
                ? getEncounterTitle(item.id) || `Slide ${index + 1}` 
                : item.unreachable 
                  ? 'Alternative path not available from current position' 
                  : 'Future encounter'
            }
          />
        </React.Fragment>
      ))}
    </div>
  );
};

BreadcrumbTrail.propTypes = {
  longestPath: PropTypes.array.isRequired,
  navigateToBreadcrumb: PropTypes.func.isRequired,
  getEncounterTitle: PropTypes.func.isRequired,
  breadcrumbsLoading: PropTypes.bool.isRequired,
  isPresentationActive: PropTypes.bool.isRequired,
  currentEncounter: PropTypes.object, // Required to determine if rendering should occur
};

export default BreadcrumbTrail; 