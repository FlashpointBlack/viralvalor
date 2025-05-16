import React from 'react';

const SimplePlaceholder = ({ message }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100%',
      backgroundColor: '#2c3e50',
      color: 'white',
      textAlign: 'center',
      padding: '20px',
      fontSize: '1.5rem'
    }}>
      <p>{message || 'Loading...'}</p>
    </div>
  );
};

export default SimplePlaceholder; 