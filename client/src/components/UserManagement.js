import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './UserManagement.css';

const UserManagement = ({ onViewProfile = () => {} }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'ascending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(10);
  const [filterRole, setFilterRole] = useState('all');

  // Fetch users on component mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/users');
        setUsers(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error details:', err.response || err);
        setError(`Failed to fetch users: ${err.message}`);
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Handle sorting
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Get sorted users
  const getSortedUsers = () => {
    const sortableUsers = [...users];
    if (sortConfig.key) {
      sortableUsers.sort((a, b) => {
        // Special handling for 'role' since it's a computed property
        if (sortConfig.key === 'role') {
          const roleA = getUserRole(a);
          const roleB = getUserRole(b);
          if (roleA < roleB) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (roleA > roleB) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
          }
          return 0;
        }
        
        // Standard sorting for regular properties
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableUsers;
  };

  // Filter users by search term and role
  const getFilteredUsers = () => {
    return getSortedUsers().filter(user => {
      // Safe case-insensitive search across key fields – handle null/undefined gracefully
      const searchLower = searchTerm.toLowerCase();
      const fieldIncludes = (val) => (val || '').toLowerCase().includes(searchLower);

      const matchesSearch =
        fieldIncludes(user.email) ||
        fieldIncludes(user.nickname) ||
        fieldIncludes(user.display_name);
      
      const matchesRole = 
        filterRole === 'all' || 
        (filterRole === 'admin' && user.isadmin === 1) ||
        (filterRole === 'educator' && user.iseducator === 1 && user.isadmin === 0) ||
        (filterRole === 'student' && user.iseducator === 0 && user.isadmin === 0);
      
      return matchesSearch && matchesRole;
    });
  };

  // Pagination logic
  const filteredUsers = getFilteredUsers();
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

  // Handle user deletion
  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await axios.delete(`/users/${userId}`);
        setUsers(users.filter(user => user.id !== userId));
      } catch (err) {
        setError('Failed to delete user. Please try again.');
        console.error('Error deleting user:', err);
      }
    }
  };

  // Handle user selection for editing
  const handleEditUser = (user) => {
    // Fetch the full user data with badges
    axios.get(`/users/${user.id}`)
      .then(response => {
        console.log('[handleEditUser] User data fetched:', response.data);
        setSelectedUser(response.data);
        setShowUserModal(true);
      })
      .catch(err => {
        console.error('Error fetching user details:', err);
        setError('Failed to fetch user details. Please try again.');
      });
  };

  // Handle user modal close
  const handleCloseModal = () => {
    setShowUserModal(false);
    setSelectedUser(null);
  };

  // Handle user update
  const handleSaveUser = async (userData) => {
    try {
      // Update existing user only - removed new user creation
      const response = await axios.put(`/users/${selectedUser.id}`, userData);
      setUsers(users.map(user => user.id === selectedUser.id ? response.data : user));
      
      setShowUserModal(false);
      setSelectedUser(null);
    } catch (err) {
      setError('Failed to save user. Please try again.');
      console.error('Error saving user:', err);
    }
  };

  // User detail modal component
  const UserModal = ({ user, onClose, onSave }) => {
    const [formData, setFormData] = useState({
      email: user.email || '',
      display_name: user.display_name || '',
      isadmin: user.isadmin || 0,
      email_verified: user.email_verified || 0,
      profile_complete: user.profile_complete || 0,
      xp_points: user.xp_points || 0,
      level: user.level || 1,
      streak_days: user.streak_days || 0,
      profile_visibility: user.profile_visibility || 'public',
      iseducator: user.iseducator || 0,
      bio: user.bio || '',
      location: user.location || ''
    });
    const [badges, setBadges] = useState([]);
    const [availableBadges, setAvailableBadges] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedBadge, setSelectedBadge] = useState(null);
    const [pictureUrl, setPictureUrl] = useState(user.picture_url || '');
    const fileInputRef = React.useRef(null);

    // Fetch user badges when the modal opens
    useEffect(() => {
      console.log('[UserModal useEffect] Running for user:', user.id);
      setLoading(true);
      setBadges([]); // Reset badges state initially

      // Fetch user badges
      console.log(`[UserModal useEffect] Fetching badges from /users/${user.id}/badges`);
      axios.get(`/users/${user.id}/badges`)
        .then(response => {
          console.log('[UserModal useEffect] Badge API response:', response.data);
          console.log('Badge data fetched in modal:', response.data);
          setBadges(response.data || []); // Ensure badges is always an array
        })
        .catch(error => {
          console.error('[UserModal useEffect] Error fetching user badges:', error);
          // Optionally set an error state here
          setBadges([]); // Reset to empty array on error
        })
        .finally(() => {
          setLoading(false);
        });

      // Fetch all available badges
      axios.get('badges/GetAllBadgesData')
        .then(response => {
          console.log('Available badges:', response.data);
          setAvailableBadges(response.data);
        })
        .catch(error => {
          console.error('Error fetching available badges:', error);
        });
    }, [user.id]); // Dependency on user.id

    const handleChange = (e) => {
      const { name, value, type, checked } = e.target;
      setFormData({
        ...formData,
        [name]: type === 'checkbox' ? (checked ? 1 : 0) : value
      });
    };

    const handleSubmit = (e) => {
      e.preventDefault();
      // Merge pictureUrl into formData before save
      onSave({ ...formData, picture_url: pictureUrl });
    };

    const handleProfilePicUpload = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      setLoading(true);
      try {
        const fd = new FormData();
        fd.append('image', file);
        fd.append('userId', user.id);
        // optional fd.append('userSub', 'admin');
        const resp = await axios.post('uploads/profiles', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        const url = resp.data.imageUrl.startsWith('/') ? resp.data.imageUrl : `/${resp.data.imageUrl}`;
        setPictureUrl(url);
      } catch (err) {
        console.error('Error uploading profile image:', err);
        alert('Failed to upload image. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    const handleAddBadge = () => {
      if (!selectedBadge) return;
      
      axios.post(`/users/${user.id}/badges`, { badge_id: selectedBadge })
        .then(response => {
          console.log('Badge added:', response.data);
          
          // Refresh the badges list from the server
          axios.get(`/users/${user.id}/badges`)
            .then(response => {
              console.log('Updated badges:', response.data);
              setBadges(response.data);
              setSelectedBadge(null);
            })
            .catch(error => {
              console.error('Error refreshing badges:', error);
            });
        })
        .catch(error => {
          console.error('Error adding badge to user:', error);
          alert('Failed to add badge to user');
        });
    };

    const handleRemoveBadge = (badgeId) => {
      if (window.confirm('Are you sure you want to remove this badge from the user?')) {
        axios.delete(`/users/${user.id}/badges/${badgeId}`)
          .then(response => {
            // Remove the badge from the list
            setBadges(badges.filter(badge => badge.ID !== badgeId));
          })
          .catch(error => {
            console.error('Error removing badge from user:', error);
            alert('Failed to remove badge from user');
          });
      }
    };

    return (
      <div className="user-modal-overlay">
        <div className="user-modal">
          <div className="user-modal-header">
            <h2>Edit User</h2>
            <button className="btn" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            {/* Profile picture */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <img
                src={pictureUrl ? (pictureUrl.startsWith('/') ? pictureUrl : `/${pictureUrl}`) : '/images/DoctorFade.gif'}
                alt="Profile"
                style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <br />
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleProfilePicUpload}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                style={{ marginTop: '0.5rem' }}
              >
                Change Picture
              </button>
            </div>
            <div className="form-container">
              <div className="form-column-left">
                <div className="form-group">
                  <label htmlFor="display_name">Display Name</label>
                  <input
                    type="text"
                    id="display_name"
                    name="display_name"
                    value={formData.display_name}
                    onChange={handleChange}
                    placeholder="Display Name"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="bio">Bio</label>
                  <textarea
                    id="bio"
                    name="bio"
                    value={formData.bio}
                    onChange={handleChange}
                    placeholder="User bio"
                    rows="3"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="location">Location</label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="Location"
                  />
                </div>
              </div>
              
              <div className="form-column-right">
                <div className="form-group">
                  <label htmlFor="profile_visibility">Profile Visibility</label>
                  <select
                    id="profile_visibility"
                    name="profile_visibility"
                    value={formData.profile_visibility}
                    onChange={handleChange}
                  >
                    <option value="public">Public</option>
                    <option value="friends">Friends Only</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                
                <div className="form-row">
                  <div className="form-column">
                    <label htmlFor="xp_points">XP Points</label>
                    <input
                      type="number"
                      id="xp_points"
                      name="xp_points"
                      value={formData.xp_points}
                      onChange={handleChange}
                      min="0"
                    />
                  </div>
                  <div className="form-column">
                    <label htmlFor="level">Level</label>
                    <input
                      type="number"
                      id="level"
                      name="level"
                      value={formData.level}
                      onChange={handleChange}
                      min="1"
                    />
                  </div>
                  <div className="form-column">
                    <label htmlFor="streak_days">Streak Days</label>
                    <input
                      type="number"
                      id="streak_days"
                      name="streak_days"
                      value={formData.streak_days}
                      onChange={handleChange}
                      min="0"
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label>User Roles</label>
                  <div className="form-row">
                    <div className="form-check">
                      <input
                        type="checkbox"
                        id="isadmin"
                        name="isadmin"
                        checked={formData.isadmin === 1}
                        onChange={handleChange}
                      />
                      <label htmlFor="isadmin">Admin</label>
                    </div>
                    <div className="form-check">
                      <input
                        type="checkbox"
                        id="iseducator"
                        name="iseducator"
                        checked={formData.iseducator === 1}
                        onChange={handleChange}
                      />
                      <label htmlFor="iseducator">Educator</label>
                    </div>
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Account Status</label>
                  <div className="form-row">
                    <div className="form-check">
                      <input
                        type="checkbox"
                        id="email_verified"
                        name="email_verified"
                        checked={formData.email_verified === 1}
                        onChange={handleChange}
                        disabled
                      />
                      <label htmlFor="email_verified">Email Verified</label>
                    </div>
                    <div className="form-check">
                      <input
                        type="checkbox"
                        id="profile_complete"
                        name="profile_complete"
                        checked={formData.profile_complete === 1}
                        onChange={handleChange}
                        disabled
                      />
                      <label htmlFor="profile_complete">Profile Complete</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {user && (
              <div className="user-badges-section">
                <h3>User Badges</h3>
                {loading ? (
                  <p>Loading badges...</p>
                ) : (
                  <>
                    <div className="badge-list">
                      {console.log('[UserModal render] Badges state before map:', badges)}
                      {badges.length > 0 ? badges.map(badge => (
                        <div key={badge.ID} className="badge-item">
                          <div className="badge-info">
                            <img 
                              src={`/images/uploads/badges/${badge.BadgeFileName || badge.Image}`} 
                              alt={badge.Title} 
                              className="badge-image" 
                            />
                            <div className="badge-details">
                              <h4>{badge.Title}</h4>
                              <p>{badge.Description}</p>
                              <span className="badge-date">Earned: {formatDate(badge.date_earned)}</span>
                            </div>
                          </div>
                          <button 
                            type="button" 
                            className="btn"
                            onClick={() => handleRemoveBadge(badge.ID)}
                          >
                            Remove
                          </button>
                        </div>
                      )) : (
                        <p>No badges earned yet.</p>
                      )}
                    </div>
                    
                    <div className="add-badge-section">
                      <h4>Add Badge</h4>
                      <div className="add-badge-form">
                        <select 
                          value={selectedBadge || ''} 
                          onChange={(e) => setSelectedBadge(e.target.value)}
                          className="badge-select"
                        >
                          <option value="">Select a badge</option>
                          {availableBadges.map(badge => (
                            <option key={badge.ID} value={badge.ID}>
                              {badge.Title}
                            </option>
                          ))}
                        </select>
                        <button 
                          type="button" 
                          className="btn"
                          onClick={handleAddBadge}
                          disabled={!selectedBadge}
                        >
                          Add Badge
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn">Save</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  // Get user role based on isadmin and iseducator flags
  const getUserRole = (user) => {
    let role = user.iseducator === 1 ? 'Educator' : 'Student';
    if (user.isadmin === 1) {
      role += ' Admin';
    }
    return role;
  };

  // Render loading state
  if (loading) {
    return <div className="loading-spinner">Loading users...</div>;
  }

  return (
    <div className="user-management">
      <div className="user-management-header">
        <h2>User Management</h2>
      </div>
      
      <div className="user-controls">
        <div className="search-filter">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select 
            value={filterRole} 
            onChange={(e) => setFilterRole(e.target.value)}
            className="role-filter"
          >
            <option value="all">All Users</option>
            <option value="admin">Admins Only</option>
            <option value="educator">Educators Only</option>
            <option value="student">Students Only</option>
          </select>
        </div>
        <div className="results-info">
          Showing {currentUsers.length} of {filteredUsers.length} users
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th onClick={() => requestSort('id')}>
                ID {sortConfig.key === 'id' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('display_name')}>
                Name {sortConfig.key === 'display_name' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('email')}>
                Email {sortConfig.key === 'email' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('level')}>
                Level {sortConfig.key === 'level' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('last_seen')}>
                Last Seen {sortConfig.key === 'last_seen' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('role')}>
                Role {sortConfig.key === 'role' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentUsers.length > 0 ? (
              currentUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.display_name || 'N/A'}</td>
                  <td>
                    <div className="email-cell">
                      {user.email || 'N/A'}
                      {user.email_verified === 1 && <span className="verified-badge" title="Email Verified">✓</span>}
                    </div>
                  </td>
                  <td>
                    <div className="level-cell">
                      {user.level || 1}
                    </div>
                  </td>
                  <td>{formatDate(user.last_seen)}</td>
                  <td className={user.isadmin === 1 ? 'admin-role' : (user.iseducator === 1 ? 'educator-role' : 'student-role')}>
                    {getUserRole(user)}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button 
                        className="btn" 
                        onClick={() => handleEditUser(user)}
                        title="View/Edit User"
                      >
                        Edit
                      </button>
                      <button 
                        className="btn" 
                        onClick={() => onViewProfile(user.id)}
                        title="View Public Profile"
                      >
                        Profile
                      </button>
                      <button 
                        className="btn" 
                        onClick={() => handleDeleteUser(user.id)}
                        title="Delete User"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9" className="no-results">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredUsers.length > usersPerPage && (
        <div className="pagination">
          <button 
            className="btn"
            onClick={() => setCurrentPage(1)} 
            disabled={currentPage === 1}
          >
            &laquo;
          </button>
          <button 
            className="btn"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
            disabled={currentPage === 1}
          >
            &lsaquo;
          </button>
          <span className="pagination-info">Page {currentPage} of {totalPages}</span>
          <button 
            className="btn"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
            disabled={currentPage === totalPages}
          >
            &rsaquo;
          </button>
          <button 
            className="btn"
            onClick={() => setCurrentPage(totalPages)} 
            disabled={currentPage === totalPages}
          >
            &raquo;
          </button>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <UserModal 
          user={selectedUser} 
          onClose={handleCloseModal} 
          onSave={handleSaveUser}
        />
      )}
    </div>
  );
};

export default UserManagement; 