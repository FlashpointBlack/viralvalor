import React from 'react';
// CharacterImage.css has been centralized to styles/images.css

const CharacterImage = ({ position, characterHtml }) => {
  // Convert HTML string to actual element
  const createMarkup = () => {
    return { __html: characterHtml };
  };

  return (
    <div className={`character-image-container ${position}`}>
      <div dangerouslySetInnerHTML={createMarkup()} />
    </div>
  );
};

export default CharacterImage; 