import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ImageManager = () => {
  const [activeTab, setActiveTab] = useState('characters');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [newImageTitle, setNewImageTitle] = useState('');
  const [newImageDescription, setNewImageDescription] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const [editingImage, setEditingImage] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  
  useEffect(() => {
    fetchImages(activeTab);
  }, [activeTab]);

  const fetchImages = async (type) => {
    setLoading(true);
    setError(null);
    try {
      let endpoint;
      switch(type) {
        case 'backdrops':
          endpoint = '/GetAllBackdropData';
          break;
        case 'badges':
          endpoint = '/GetAllBadgesData';
          break;
        case 'instructions':
          endpoint = '/GetAllInstructionData';
          break;
        default: // characters
          endpoint = '/GetAllCharacterData';
          break;
      }
      
      const response = await axios.get(endpoint);
      setImages(response.data);
    } catch (err) {
      console.error(`Error fetching ${type}:`, err);
      setError(`Failed to load ${type} images`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadingFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!uploadingFile) {
      setError('Please select a file to upload');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('image', uploadingFile);
    formData.append('title', newImageTitle);
    formData.append('description', newImageDescription);
    formData.append('userSub', 'anonymous');
    
    try {
      let endpoint;
      switch(activeTab) {
        case 'backdrops':
          endpoint = '/images/uploads/backdrops/';
          break;
        case 'badges':
          endpoint = '/images/uploads/badges/';
          break;
        case 'instructions':
          endpoint = '/images/uploads/instructions/';
          break;
        default: // characters
          endpoint = '/images/uploads/characters/';
          break;
      }
      
      await axios.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });
      
      // Reset form and fetch updated images
      setUploadingFile(null);
      setNewImageTitle('');
      setNewImageDescription('');
      setUploadProgress(0);
      fetchImages(activeTab);
      
    } catch (err) {
      console.error(`Error uploading ${activeTab}:`, err);
      setError(`Failed to upload image: ${err.message || 'Unknown error'}`);
      
      // Log more detailed error information
      if (err.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error response data:', err.response.data);
        console.error('Error response status:', err.response.status);
        console.error('Error response headers:', err.response.headers);
        setError(`Failed to upload image: ${err.response.data || err.message}`);
      } else if (err.request) {
        // The request was made but no response was received
        console.error('Error request:', err.request);
        setError('Failed to upload image: No response received from server');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteImage = async (imageId) => {
    if (!window.confirm('Are you sure you want to delete this image?')) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Attempting to delete image with ID ${imageId}`);
      
      // Based on the routes, we need to use a POST request with the ID in the body
      let endpoint;
      switch(activeTab) {
        case 'backdrops':
          endpoint = '/delete-backdrop';
          break;
        case 'badges':
          endpoint = '/delete-badge';
          break;
        case 'instructions':
          endpoint = '/delete-instruction';
          break;
        default: // characters
          endpoint = '/delete-character';
          break;
      }
      
      // Send ID in the request body
      const response = await axios.post(endpoint, { 
        ID: imageId,
        _REC_Modification_User: 'anonymous'
      });
      
      console.log('Delete response:', response.data);
      
      // Refresh the images
      fetchImages(activeTab);
      
      // If the deleted image was selected, clear selection
      if (selectedImage && selectedImage.ID === imageId) {
        setSelectedImage(null);
      }
      
    } catch (err) {
      console.error(`Error deleting image:`, err);
      
      // Log more detailed error information
      if (err.response) {
        console.error('Error response data:', err.response.data);
        console.error('Error response status:', err.response.status);
        setError(`Failed to delete image: ${err.response.data || err.message}`);
      } else if (err.request) {
        console.error('Error request:', err.request);
        setError('Failed to delete image: No response received from server');
      } else {
        setError(`Failed to delete image: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (imageId) => {
    const image = images.find(img => img.ID === imageId);
    if (!image) return;
    
    setEditingImage(image);
    setEditTitle(image.Title || '');
    setEditDescription(image.Description || '');
  };
  
  const closeEditDialog = () => {
    setEditingImage(null);
    setEditTitle('');
    setEditDescription('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingImage) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Correct endpoints for update with _REC_Modification_User
      let endpoint;
      switch(activeTab) {
        case 'backdrops':
          endpoint = `/update-backdrop-field`;
          break;
        case 'badges':
          endpoint = `/update-badge-field`;
          break;
        case 'instructions':
          endpoint = `/update-instruction-field`;
          break;
        default: // characters
          endpoint = `/update-character-field`;
          break;
      }
      
      console.log(`Updating image with ID ${editingImage.ID} using endpoint: ${endpoint}`);
      console.log('Update data:', { id: editingImage.ID, title: editTitle, description: editDescription });
      
      // First update the title
      await axios.post(endpoint, { 
        id: editingImage.ID, 
        field: 'Title', 
        value: editTitle,
      });
      
      // Then update the description
      await axios.post(endpoint, { 
        id: editingImage.ID, 
        field: 'Description', 
        value: editDescription,
      });
      
      // Also update the modification user (but not the creation user)
      await axios.post(endpoint, { 
        id: editingImage.ID, 
        field: '_REC_Modification_User', 
        value: 'anonymous',
      });
      
      // Update the image in the local state
      setImages(images.map(img => 
        img.ID === editingImage.ID 
          ? { ...img, Title: editTitle, Description: editDescription } 
          : img
      ));
      
      // If this was the selected image, update that too
      if (selectedImage && selectedImage.ID === editingImage.ID) {
        setSelectedImage({ ...selectedImage, Title: editTitle, Description: editDescription });
      }
      
      closeEditDialog();
      
    } catch (err) {
      console.error(`Error updating image:`, err);
      
      // Log more detailed error information
      if (err.response) {
        console.error('Error response data:', err.response.data);
        console.error('Error response status:', err.response.status);
        console.error('Error response headers:', err.response.headers);
        setError(`Failed to update image: ${err.response.data || err.message}`);
      } else if (err.request) {
        console.error('Error request:', err.request);
        setError('Failed to update image: No response received from server');
      } else {
        setError(`Failed to update image: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const getImagePath = (type) => {
    switch(type) {
      case 'backdrops':
        return 'images/uploads/backdrops/';
      case 'badges':
        return 'images/uploads/badges/';
      case 'instructions':
        return 'images/uploads/instructions/';
      default: // characters
        return 'images/uploads/characters/';
    }
  };

  const imagePath = getImagePath(activeTab);

  // Helper function to truncate description
  const truncateDescription = (description, maxLength = 200) => {
    if (!description) return "";
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength) + '...';
  };

  // Helper to get display name for active tab (capitalized)
  const getDisplayName = (tab) => {
    switch(tab) {
      case 'characters':
        return 'Character';
      case 'backdrops':
        return 'Backdrop';
      case 'badges':
        return 'Badge';
      case 'instructions':
        return 'Student Instruction';
      default:
        return tab.charAt(0).toUpperCase() + tab.slice(1);
    }
  };

  // Helper function to format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'No date available';
    
    try {
      // Normalize any supported format into a JS Date object
      let date = new Date(dateString);

      if (isNaN(date.getTime())) {
        // Attempt to parse common MySQL format (YYYY-MM-DD HH:MM:SS)
        const parts = dateString.split(/[- :]/);
        if (parts.length === 6) {
          date = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
        }
      }

      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }

      // Format: MM/DD/YYYY (standard American)
      const pad = (n) => n.toString().padStart(2, '0');
      const yyyy = date.getFullYear();
      const mm = pad(date.getMonth() + 1);
      const dd = pad(date.getDate());

      return `${mm}/${dd}/${yyyy}`;
    } catch (e) {
      console.error('Error parsing date:', e, dateString);
      return 'Error parsing date';
    }
  };

  return (
    <div className="image-manager">
      <h2>Image Manager</h2>
      
      <div className="image-manager-tabs">
        <button 
          className={`tab-button ${activeTab === 'characters' ? 'active' : ''}`}
          onClick={() => setActiveTab('characters')}
        >
          Characters
        </button>
        <button 
          className={`tab-button ${activeTab === 'backdrops' ? 'active' : ''}`}
          onClick={() => setActiveTab('backdrops')}
        >
          Backdrops
        </button>
        <button 
          className={`tab-button ${activeTab === 'badges' ? 'active' : ''}`}
          onClick={() => setActiveTab('badges')}
        >
          Badges
        </button>
        <button 
          className={`tab-button ${activeTab === 'instructions' ? 'active' : ''}`}
          onClick={() => setActiveTab('instructions')}
        >
          Instructions
        </button>
      </div>
      
      <div className="image-manager-content">
        <div className="upload-section">
          <h3>Upload New {getDisplayName(activeTab)}</h3>
          <form onSubmit={handleUpload} className="upload-form">
            <div className="form-group">
              <label htmlFor="imageTitle">Title:</label>
              <input 
                type="text" 
                id="imageTitle" 
                value={newImageTitle}
                onChange={(e) => setNewImageTitle(e.target.value)}
                placeholder="Enter image title"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="imageDescription">Description:</label>
              <textarea 
                id="imageDescription" 
                value={newImageDescription}
                onChange={(e) => setNewImageDescription(e.target.value)}
                placeholder="Enter image description"
                rows="3"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="imageFile">Image File:</label>
              <input 
                type="file" 
                id="imageFile" 
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
            
            {uploadProgress > 0 && (
              <div className="progress-bar-container">
                <div 
                  className="progress-bar"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
                <span>{uploadProgress}%</span>
              </div>
            )}
            
            <button 
              type="submit" 
              className="btn"
              disabled={loading || !uploadingFile}
            >
              Upload Image
            </button>
          </form>
        </div>
        
        <div className="images-gallery">
          <h3>{getDisplayName(activeTab)} Gallery</h3>
          
          {loading && <div className="loading">Loading...</div>}
          {error && <div className="error">{error}</div>}
          
          {images.length === 0 && !loading ? (
            <div className="no-images">No images available</div>
          ) : (
            <div className="images-grid">
              {images.map(image => (
                <div 
                  key={image.ID}
                  className={`image-item ${selectedImage && selectedImage.ID === image.ID ? 'selected' : ''}`}
                  onClick={() => setSelectedImage(image)}
                >
                  <div className="image-container">
                    <img 
                      src={`${imagePath}${image.FileName}`}
                      alt={image.Title || `Image ${image.ID}`}
                      className="image-thumbnail"
                      title={image.Description || "No description available"}
                    />
                    <div className="image-actions">
                      <button 
                        className="btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(image.ID);
                        }}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteImage(image.ID);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    {image.Description && (
                      <div className="image-description-tooltip">
                        {truncateDescription(image.Description)}
                      </div>
                    )}
                  </div>
                  <div className="image-title">{image.Title || `Image ${image.ID}`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="image-preview-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{selectedImage.Title || `Image ${selectedImage.ID}`}</h3>
              <button 
                onClick={() => setSelectedImage(null)} 
                className="btn"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <img 
                src={`${imagePath}${selectedImage.FileName}`}
                alt={selectedImage.Title || `Image ${selectedImage.ID}`}
                className="full-size-preview"
              />
              <div className="image-details">
                {selectedImage.Description && (
                  <p><strong>Description:</strong> {selectedImage.Description}</p>
                )}
                <p><strong>Uploaded:</strong> {formatDate(selectedImage._REC_Creation_Timestamp || selectedImage.CreationTimestamp || selectedImage.Uploaded)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Image Modal */}
      {editingImage && (
        <div className="image-preview-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Edit Image</h3>
              <button 
                onClick={closeEditDialog} 
                className="btn"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleEditSubmit} className="edit-form">
                <div className="form-group">
                  <label htmlFor="editTitle">Title:</label>
                  <input 
                    type="text" 
                    id="editTitle" 
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Enter image title"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="editDescription">Description:</label>
                  <textarea 
                    id="editDescription" 
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Enter image description"
                    rows="5"
                  />
                </div>
                
                <div className="form-actions">
                  <button 
                    type="button" 
                    className="btn"
                    onClick={closeEditDialog}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn"
                    disabled={loading}
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageManager; 