import React, { useState, useEffect } from 'react';
import './ConfirmationModal.css'; // Re-use existing modal styles

/**
 * Generic input dialog.
 * Props:
 *  - open: boolean – show / hide
 *  - message: string – text to display above input
 *  - defaultValue: string | number – initial value
 *  - onConfirm: function(value) – called with entered value when user confirms
 *  - onCancel: function() – called when modal dismissed
 */
const InputModal = ({ open, message, defaultValue = '', onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultValue);

  // Reset local state every time modal opens
  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onCancel} aria-label="Close">×</button>
        <div className="confirm-body">
          <p>{message}</p>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', marginTop: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>
        <div className="confirm-actions">
          <button className="btn btn-primary" onClick={() => onConfirm(value)}>Confirm</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default InputModal; 