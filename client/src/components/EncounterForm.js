import React, { useState, useEffect } from 'react';
import './EncounterForm.css';

const EncounterForm = ({ scenario, onUpdateField }) => {
  // Always declare hooks on first render
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creatorDisplayName, setCreatorDisplayName] = useState('');

  // Whenever the incoming scenario changes, sync local state
  useEffect(() => {
    if (scenario) {
      setTitle(scenario.Title || '');
      setDescription(scenario.Description || '');
    }
  }, [scenario]);

  // Persist to DB only when leaving the field
  const handleBlur = (e) => {
    const { name } = e.target;
    const value = name === 'Title' ? title : description;
    if (scenario && scenario[name] !== value) {
      onUpdateField(name, value);
    }
  };

  // Helper to derive a user friendly display name from auth0 style identifiers
  const getDisplayName = (raw) => {
    if (!raw) return '';
    if (raw.includes('|')) {
      const parts = raw.split('|');
      return parts[parts.length - 1] || raw;
    }
    return raw;
  };

  // Extract provider|uuid (first two segments) so the API recognises the sub
  const getPureSub = (identifier) => {
    if (!identifier) return identifier;
    if (identifier.includes('|')) {
      const segments = identifier.split('|');
      if (segments.length >= 2) {
        return `${segments[0]}|${segments[1]}`;
      }
    }
    return identifier;
  };

  // Resolve creator display name from server
  useEffect(() => {
    const sub = scenario?._REC_Creation_User;
    if (!sub) {
      setCreatorDisplayName('');
      return;
    }

    const pureSub = getPureSub(sub);
    // If we already have creatorDisplayName for this sub, skip
    if (creatorDisplayName && creatorDisplayName !== getDisplayName(sub)) return;

    import('axios').then(({ default: axios }) => {
      axios
        .get(`/user/by-sub/${encodeURIComponent(pureSub)}`)
        .then(({ data }) => {
          if (data && data.display_name) {
            setCreatorDisplayName(data.display_name);
          } else {
            setCreatorDisplayName(getDisplayName(sub));
          }
        })
        .catch(() => {
          setCreatorDisplayName(getDisplayName(sub));
        });
    });
  }, [scenario]);

  if (!scenario) return null;

  return (
    <div className="encounter-form">
      <h3>Encounter Details</h3>
      <div className="form-group">
        <label htmlFor="Title">Title</label>
        <input
          type="text"
          id="Title"
          name="Title"
          className="form-control"
          value={title}
          onChange={(e)=>setTitle(e.target.value)}
          onBlur={handleBlur}
          placeholder="Enter encounter title"
        />
      </div>
      <div className="form-group">
        <label htmlFor="Description">Description</label>
        <textarea
          id="Description"
          name="Description"
          className="form-control"
          value={description}
          onChange={(e)=>setDescription(e.target.value)}
          onBlur={handleBlur}
          placeholder="Enter encounter description"
          rows="6"
        ></textarea>
      </div>
      <div className="encounter-info">
        <div className="info-item">
          <span className="info-label">Created By:</span>
          <span className="info-value">{creatorDisplayName || getDisplayName(scenario._REC_Creation_User) || 'Unknown'}</span>
        </div>
      </div>
    </div>
  );
};

export default EncounterForm; 