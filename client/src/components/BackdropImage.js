import React from 'react';

// BackdropImage.css has been centralized to styles/images.css
const BackdropImage = ({ backdropHtml }) => {
  // Convert HTML string to actual element
  const createMarkup = () => {
    return { __html: backdropHtml };
  };

  return (
    <div className="backdrop-container">
      <div 
        className="backdrop-image"
        dangerouslySetInnerHTML={createMarkup()} 
      />
      <div className="backdrop-overlay"></div>
    </div>
  );
};

export default BackdropImage; 