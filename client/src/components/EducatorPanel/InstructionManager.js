import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import socket from '../../socket'; // Assuming socket is setup and exported from client/src/socket.js
import { useToast } from '../../contexts/ToastContext';

const InstructionManager = ({
  isPresentationActive,
  // Props that will be passed from EducatorPanel
  initialActiveInstruction, // The active instruction when this component mounts
  onInstructionBroadcast, // Callback when an instruction is broadcast
  onInstructionClose,     // Callback when an instruction is closed
}) => {
  const [instructionModal, setInstructionModal] = useState(false);
  const [instructions, setInstructions] = useState([]);
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  const [activeInstruction, setActiveInstruction] = useState(initialActiveInstruction);
  const { addToast } = useToast();

  const fetchInstructions = useCallback(async () => {
    try {
      setLoadingInstructions(true);
      const response = await axios.get('instructions/GetAllInstructionData');
      setInstructions(response.data || []);
    } catch (err) {
      console.error('Error fetching instructions:', err);
      addToast('Failed to load instructions', 'error');
    } finally {
      setLoadingInstructions(false);
    }
  }, [addToast]);

  const openInstructionModal = () => {
    if (instructions.length === 0) {
      fetchInstructions();
    }
    setInstructionModal(true);
  };

  const broadcastInstruction = (instruction) => {
    if (!instruction) return;
    const payload = {
      id: instruction.ID,
      title: instruction.Title,
      description: instruction.Description,
      imageUrl: `/images/uploads/instructions/${instruction.FileName}`
    };
    socket.emit('instruction_broadcast', payload);
    addToast('Instruction broadcast sent!', 'success');
    setInstructionModal(false);
    setActiveInstruction(instruction); // Update local state
    if (onInstructionBroadcast) {
      onInstructionBroadcast(instruction); // Notify parent
    }
  };

  const closeInstruction = () => {
    socket.emit('instruction_close');
    addToast('Instruction closed.', 'info');
    setActiveInstruction(null); // Update local state
    if (onInstructionClose) {
      onInstructionClose(); // Notify parent
    }
  };

  // Effect to sync with external changes to activeInstruction (e.g. from other panels or initial load)
  useEffect(() => {
    setActiveInstruction(initialActiveInstruction);
  }, [initialActiveInstruction]);
  
  // Effect for socket listeners to handle instruction updates from the server
  useEffect(() => {
    const handleBroadcast = (payload) => {
      setActiveInstruction(payload);
      if (onInstructionBroadcast) {
        onInstructionBroadcast(payload);
      }
    };
    const handleClose = () => {
      setActiveInstruction(null);
      if (onInstructionClose) {
        onInstructionClose();
      }
    };

    socket.on('instruction_broadcast', handleBroadcast);
    socket.on('instruction_close', handleClose);
    
    // On mount, explicitly request current instruction state from server
    // to ensure this instance is in sync if it loads after an instruction
    // has already been broadcast by another panel or session.
    socket.emit('request current instruction');

    return () => {
      socket.off('instruction_broadcast', handleBroadcast);
      socket.off('instruction_close', handleClose);
    };
  }, [onInstructionBroadcast, onInstructionClose]);


  return (
    <>
      <div className="poll-controls"> {/* Using existing class for similar layout */}
        {activeInstruction ? (
          <button
            className="btn"
            onClick={closeInstruction}
            disabled={!isPresentationActive}
            title={!isPresentationActive ? 'Start a presentation to manage instructions.' : 'Close the currently active instruction for all participants.'}
            style={{
              opacity: !isPresentationActive ? 0.5 : 1,
              cursor: !isPresentationActive ? 'not-allowed' : 'pointer'
            }}
          >
            Close Instructions
          </button>
        ) : (
          <button
            className="btn"
            onClick={openInstructionModal}
            disabled={!isPresentationActive}
            title={!isPresentationActive ? 'Start a presentation to broadcast instructions.' : 'Select and broadcast an instruction to all participants.'}
            style={{
              opacity: !isPresentationActive ? 0.5 : 1,
              cursor: !isPresentationActive ? 'not-allowed' : 'pointer'
            }}
          >
            Broadcast Instruction
          </button>
        )}
      </div>

      {instructionModal && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setInstructionModal(false)}>
          <div className="badge-modal" /* Reusing badge-modal style for consistency */ onClick={e => e.stopPropagation()}>
            <h3>Select an Instruction to Broadcast</h3>
            {loadingInstructions ? (
              <p>Loading instructions...</p>
            ) : instructions.length === 0 ? (
              <p>No instructions available. You can create them in the admin panel.</p>
            ) : (
              <div className="badge-grid"> {/* Reusing badge-grid style for consistency */}
                {instructions.map(instr => (
                  <div key={instr.ID} className="badge-item" /* Reusing badge-item */ onClick={() => broadcastInstruction(instr)}>
                    <img src={`/images/uploads/instructions/${instr.FileName}`} alt={instr.Title} style={{objectFit: 'contain', backgroundColor:'#f0f0f0', border:'1px solid #ddd'}}/>
                    <span>{instr.Title}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn" style={{marginTop:'10px'}} onClick={() => setInstructionModal(false)}>Cancel</button>
          </div>
        </div>, document.body
      )}
    </>
  );
};

export default InstructionManager; 