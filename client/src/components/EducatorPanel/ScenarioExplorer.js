import React from 'react';
import PropTypes from 'prop-types';

const ScenarioExplorer = ({
  scenarios,
  selectedScenarioId,
  handleScenarioChange,
  isPresentationActive,
  scenarioLocked,
}) => {
  return (
    <div className="scenario-selector" style={{margin:0,marginRight:'10px',minWidth:'220px',flex:'0 0 auto'}}>
      <div className="control-item">
        <select 
          id="scenario-select" 
          value={selectedScenarioId || ''} 
          onChange={handleScenarioChange}
          disabled={!isPresentationActive}
          style={{
            opacity: !isPresentationActive ? 0.5 : 1,
            cursor: !isPresentationActive ? 'not-allowed' : 'pointer'
          }}
          title={
            !isPresentationActive
              ? 'Start a presentation to enable scenario selection.'
              : undefined
          }
        >
          <option value="">-- Select a Scenario --</option>
          {scenarios.map((scenario) => (
            <option key={scenario.ID} value={scenario.ID}>
              {scenario.Title || `Scenario #${scenario.ID}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

ScenarioExplorer.propTypes = {
  scenarios: PropTypes.array.isRequired, // Changed to PropTypes.array
  selectedScenarioId: PropTypes.string.isRequired,
  handleScenarioChange: PropTypes.func.isRequired,
  isPresentationActive: PropTypes.bool.isRequired,
  scenarioLocked: PropTypes.bool.isRequired,
};

export default ScenarioExplorer; 