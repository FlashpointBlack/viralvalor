import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ImageSelector = ({ label, type, encounterId, currentImageId, onImageSelected, disableUpload = false }) => {
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const endpoint = type === 'backdrop' 
    ? '/GetAllBackdropData' 
    : '/GetAllCharacterData';
  
  const imagePath = type === 'backdrop'
    ? 'images/uploads/backdrops/'
    : 'images/uploads/characters/';

  useEffect(() => {
    if (currentImageId) {
      fetchCurrentImage();
    }
  }, [currentImageId]);

  const fetchImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(endpoint);
      setImages(response.data);
    } catch (err) {
      console.error(`Error fetching ${type} images:`, err);
      setError(`Failed to load ${type} images`);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentImage = async () => {
    if (!currentImageId) return;
    
    const fetchEndpoint = type === 'backdrop'
      ? `/GetBackdropData/${currentImageId}`
      : `/GetCharacterData/${currentImageId}`;
      
    try {
      const response = await axios.get(fetchEndpoint);
      setSelectedImage(response.data);
    } catch (err) {
      console.error(`Error fetching current ${type}:`, err);
    }
  };

  const handleSelectImage = (image) => {
    setSelectedImage(image);
    onImageSelected(image.ID);
    setIsModalOpen(false);
  };

  const handleOpenModal = () => {
    fetchImages();
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="image-selector">
      <h4>{label}</h4>
      <div className="image-preview">
        {selectedImage ? (
          <div className="preview-container">
            <img 
              src={`${imagePath}${selectedImage.FileName}`}
              alt={selectedImage.Title || label}
              className="image-preview-content"
            />
            {selectedImage.Description && (
              <div className="preview-description-tooltip">
                {selectedImage.Description}
              </div>
            )}
          </div>
        ) : (
          <div className="preview-container">
            <img
              src={type === 'backdrop' ? '/images/Shield.png' : '/images/Virus.png'}
              alt="placeholder"
              className="image-preview-content"
              style={{ width: '100%', height: '100%', opacity: 0.3, objectFit: 'contain' }}
            />
          </div>
        )}
      </div>
      <div className="image-selector-actions">
        <button onClick={handleOpenModal} className="btn">
          Select {label}
        </button>
      </div>

      {/* Modal for image selection */}
      {isModalOpen && (
        <div className="image-selector-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Select {label}</h3>
              <button onClick={handleCloseModal} className="btn">×</button>
            </div>
            <div className="modal-body">
              {loading && <div className="loading">Loading...</div>}
              {error && <div className="error">{error}</div>}
              
              {!disableUpload && (
                <div className="upload-prompt">
                  <p>To upload new images, please use the Images tab from the admin dashboard.</p>
                </div>
              )}
              
              <div className="images-grid">
                {images.map(image => (
                  <div 
                    key={image.ID}
                    className={`image-item ${selectedImage && selectedImage.ID === image.ID ? 'selected' : ''}`}
                    onClick={() => handleSelectImage(image)}
                  >
                    <div className="image-container">
                      <img 
                        src={`${imagePath}${image.FileName}`}
                        alt={image.Title || `${type} ${image.ID}`}
                        className="image-thumbnail"
                        title={image.Description || "No description available"}
                      />
                      {image.Description && (
                        <div className="image-description-tooltip">
                          {image.Description}
                        </div>
                      )}
                    </div>
                    <div className="image-title">{image.Title || `${type} ${image.ID}`}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageSelector; 