import React from 'react';
import PropTypes from 'prop-types';

// BreadcrumbCircle component (assuming it remains as is or is adapted to hook data)
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
      {/* Display item.index or item.label if available, otherwise index+1 */}
      {item.label || item.index || index + 1}
    </button>
  );
}, (prevProps, nextProps) => {
  const prevItem = prevProps.item || {};
  const nextItem = nextProps.item || {};
  const sameStatus = (
    prevItem.isCurrent === nextItem.isCurrent &&
    prevItem.visited === nextItem.visited &&
    prevItem.unreachable === nextItem.unreachable
  );
  const sameInteractivity = prevProps.disabled === nextProps.disabled;
  const sameLabel = prevItem.label === nextItem.label && prevItem.index === nextItem.index;
  return sameStatus && sameInteractivity && sameLabel && prevProps.index === nextProps.index;
});

BreadcrumbCircle.displayName = 'BreadcrumbCircle';

BreadcrumbCircle.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string, // Title might come from the item itself now
    label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), // A display label for the circle
    index: PropTypes.number, // Optional explicit index
    isCurrent: PropTypes.bool,
    visited: PropTypes.bool,
    unreachable: PropTypes.bool,
  }).isRequired,
  index: PropTypes.number.isRequired, // overall index in the map function
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired, // for the button's HTML title attribute
};

const BreadcrumbTrail = ({
  // Props from useScenarioManager (via EducatorPanel)
  encounterPath, // Array of encounter IDs: ["enc1", "enc2"], useful for determining visited/current status
  longestPath, // Array of items for display, e.g., [{id, title, isCurrent, visited, ...}]
  currentEncounter, // Full current encounter object
  navigateToBreadcrumb, // This will be scenarioActions.navigateToBreadcrumb
  breadcrumbsLoading,
  
  // Props from EducatorPanel (or could be derived if hook provides all info)
  getEncounterTitle, // Utility function, may still be needed if longestPath items are minimal
  isPresentationActive, // To control overall visibility
}) => {

  // Determine visibility based on presentation state and data availability
  if (!isPresentationActive || !currentEncounter) {
    return null; // Don't render if presentation isn't active or no current encounter
  }
  if (breadcrumbsLoading && (!longestPath || longestPath.length === 0)) {
    return <div className="breadcrumb-loading">Loading breadcrumbs...</div>; 
  }
  if (!longestPath || longestPath.length === 0) {
    return <div className="breadcrumb-info">No path to display.</div>;
  }

  // Helper to determine item status if not directly provided in longestPath objects
  // This is a fallback; ideally, the hook provides these statuses in longestPath items.
  const getItemStatus = (itemId) => {
    const isCurrent = currentEncounter && currentEncounter.id === itemId;
    const visited = encounterPath && encounterPath.includes(itemId) && !isCurrent;
    // `unreachable` logic would need full graph knowledge, ideally from hook.
    // For now, assume `longestPath` items from hook will have `unreachable` pre-calculated.
    return { isCurrent, visited }; 
  };

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
      {longestPath.map((item, index) => {
        // If item from longestPath doesn't have status, try to derive it.
        // This assumes `item` is an object with at least an `id`.
        const status = {
          isCurrent: item.isCurrent !== undefined ? item.isCurrent : getItemStatus(item.id).isCurrent,
          visited: item.visited !== undefined ? item.visited : getItemStatus(item.id).visited,
          unreachable: item.unreachable !== undefined ? item.unreachable : false, // Default if not provided
        };
        const displayLabel = item.title || item.label || getEncounterTitle(item.id) || `Slide ${index + 1}`;
        const buttonTitle = status.unreachable 
          ? 'Alternative path not available' 
          : (item.title || getEncounterTitle(item.id) || `Navigate to slide ${index + 1}`);

        return (
          <React.Fragment key={`breadcrumb-${item.id || `placeholder-${index}`}`}>
            {index > 0 && (
              <div className="breadcrumb-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
            <BreadcrumbCircle
              item={{
                ...item, // Pass through all properties from the item in longestPath
                id: String(item.id), // Ensure id is a string
                isCurrent: status.isCurrent,
                visited: status.visited,
                unreachable: status.unreachable,
                label: item.label || (index + 1) // Ensure a label for the circle
              }}
              index={index}
              onClick={() => (status.visited && !status.isCurrent && item.id && !String(item.id).startsWith('placeholder-')) ? navigateToBreadcrumb(item.id) : null}
              disabled={!status.visited || status.isCurrent || status.unreachable || (item.id && String(item.id).startsWith('placeholder-'))}
              title={buttonTitle}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};

BreadcrumbTrail.propTypes = {
  encounterPath: PropTypes.arrayOf(PropTypes.string), // From hook
  longestPath: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string, 
    label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    isCurrent: PropTypes.bool,
    visited: PropTypes.bool,
    unreachable: PropTypes.bool,
    // other properties the hook might provide
  })).isRequired, // From hook
  currentEncounter: PropTypes.object, // From hook, can be null
  navigateToBreadcrumb: PropTypes.func.isRequired, // From hook (actions)
  breadcrumbsLoading: PropTypes.bool, // From hook
  
  getEncounterTitle: PropTypes.func.isRequired, // From EducatorPanel
  isPresentationActive: PropTypes.bool.isRequired, // From EducatorPanel
};

BreadcrumbTrail.defaultProps = {
  encounterPath: [],
  longestPath: [],
  currentEncounter: null,
  breadcrumbsLoading: false,
};

export default BreadcrumbTrail;
