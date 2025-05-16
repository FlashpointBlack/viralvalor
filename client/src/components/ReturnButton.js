import React from 'react';
import { Link } from 'react-router-dom';

const ReturnButton = ({ onClick }) => {
  return (
    <div className="return-buttons">
      <button className="btn btn-secondary" onClick={onClick}>
        Reset Game
      </button>
      <Link to="/" className="btn btn-primary" style={{textDecoration:'none'}}>
        Return to Home
      </Link>
    </div>
  );
};

export default ReturnButton; 