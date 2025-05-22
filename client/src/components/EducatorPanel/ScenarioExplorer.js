import React from 'react';
import PropTypes from 'prop-types';

const ScenarioExplorer = ({
  scenarios,
  selectedScenarioId,
  onChange,
  disabled,
}) => {
  return (
    <div className="scenario-selector" style={{margin:0,marginRight:'10px',minWidth:'220px',flex:'0 0 auto'}}>
      <div className="control-item">
        <select 
          id="scenario-select" 
          value={selectedScenarioId || ''} 
          onChange={onChange}
          disabled={disabled}
          style={{
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
          title={
            disabled
              ? 'Scenario selection is disabled during an active poll or if presentation is not active.'
              : 'Select a scenario to explore'
          }
        >
          <option value="">-- Select a Scenario --</option>
          {Array.isArray(scenarios) && scenarios.length > 0 ? (
            scenarios.map((scenario) => (
              <option key={scenario.ID || scenario.id} value={scenario.ID || scenario.id}>
                {scenario.Title || scenario.title || `Scenario #${scenario.ID || scenario.id}`}
              </option>
            ))
          ) : (
            <option value="" disabled>Loading scenarios or none available...</option>
          )}
        </select>
      </div>
    </div>
  );
};

ScenarioExplorer.propTypes = {
  scenarios: PropTypes.array.isRequired,
  selectedScenarioId: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool.isRequired,
};

ScenarioExplorer.defaultProps = {
  selectedScenarioId: '',
  disabled: true,
  scenarios: [],
};

export default ScenarioExplorer; 