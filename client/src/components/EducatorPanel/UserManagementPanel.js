import React from 'react';
import ReactDOM from 'react-dom'; // Import ReactDOM for portals
import InputModal from '../InputModal'; // Import InputModal

// UserManagementPanel now receives functions from the useUserManagement hook directly,
// or EducatorPanel will call the hook and pass down the necessary values and functions.
// For this step, we assume EducatorPanel passes them down after calling the hook.

const UserManagementPanel = ({
  // Values from useUserManagement hook (passed by EducatorPanel)
  userList,
  totalUsers,
  badges,
  loadingBadges,
  openAwardXPModal, // Replaces handleAwardXP for individual users
  openAwardXPToAllModal, // Replaces handleAwardXPToAll
  openBadgeAwardModal, // Replaces openBadgeModal and openBadgeModalForAll
  
  // Modal state and handlers from useUserManagement (passed by EducatorPanel)
  isBadgeModalOpen,
  setIsBadgeModalOpen,
  selectedUserForBadge,
  awardBadge,
  isInputModalOpen,
  setIsInputModalOpen,
  inputModalConfig,

  // Props that are still passed directly (not from this specific hook)
  unreadBySender,
  openChatWithUser,
  getPureSub, 
  getDisplayName,
}) => {
  // Debug logging disabled to reduce console noise

  const isAuthenticatedUser = (userName) => {
    return userName && userName.includes('|') && !userName.toLowerCase().startsWith('guest');
  };

  return (
    <div className="user-info-section">
      <div className="total-users" style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}>
        <h3 style={{margin:0}}>Connected Users: {totalUsers}</h3>
        <div className="bulk-award-controls" style={{display:'flex',gap:'8px'}}>
          <button 
            className="btn btn-small" 
            onClick={openAwardXPToAllModal} 
            disabled={totalUsers === 0}
          >
            XP to All
          </button>
          <button 
            className="btn btn-small" 
            onClick={() => openBadgeAwardModal('ALL')} 
            disabled={totalUsers === 0 || loadingBadges}
          >
            Badge to All
          </button>
        </div>
      </div>

      <div className="user-list">
        <table className="user-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Messages</th>
              <th>Polls Voted</th>
              <th>Current Selection</th>
              <th>Awards</th>
            </tr>
          </thead>
          <tbody>
            {(userList || []).map((user, index) => {
              const pureSub = getPureSub ? getPureSub(user.name) : user.name;
              const unreadCount = unreadBySender && unreadBySender[pureSub] !== undefined ? unreadBySender[pureSub] : 0;
              const displayName = getDisplayName ? getDisplayName(user.name) : user.name;
              const isAuthenticated = isAuthenticatedUser(user.name);

              return (
                <tr key={user.id || user.name || index}> 
                  <td>
                    {(() => {
                      const isGuest = (displayName || '').toLowerCase().startsWith('guest');
                      return (
                        <span className={`username ${isGuest ? 'guest-user' : ''}`}>
                          {displayName}
                        </span>
                      );
                    })()}
                  </td>
                  <td>
                    {isAuthenticated && openChatWithUser && (
                      <button 
                        className="message-cell-wrapper message-bubble-btn" 
                        onClick={() => openChatWithUser(user.name)}
                        title={unreadCount > 0 ? `${unreadCount} unread messages` : 'Chat with user'}
                        style={{background:'none',border:'none',padding:0}}
                      >
                        <img src="/images/ChatVirus.png" alt="Chat" className="chat-icon-small" />
                        {unreadCount > 0 && (
                          <span className="unread-message-count">{unreadCount}</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td>{user.pollsVoted || 0}</td>
                  <td>{user.selection || 'None'}</td>
                  <td>
                    {isAuthenticated ? (
                      <>
                        {openAwardXPModal && 
                          <button 
                            className="btn btn-small"
                            onClick={() => openAwardXPModal(user)}
                            title="Award XP to this user"
                          >
                            XP
                          </button>
                        }
                        {openBadgeAwardModal &&
                          <button 
                            className="btn btn-small"
                            onClick={() => openBadgeAwardModal(user)}
                            disabled={loadingBadges}
                            title={loadingBadges ? 'Loading badges...' : 'Award badge to this user'}
                          >
                            Badge
                          </button>
                        }
                      </>
                    ) : (
                      <span style={{color: '#888', fontStyle: 'italic'}}>Guest user</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Badge Award Modal */}
      {isBadgeModalOpen && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setIsBadgeModalOpen(false)}>
          <div className="badge-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Select a Badge to Award {selectedUserForBadge === 'ALL' ? 'to All Users' : `to ${getDisplayName ? getDisplayName(selectedUserForBadge?.name) : selectedUserForBadge?.name || ''}`}</h3>
            {loadingBadges ? (
              <p>Loading badges...</p>
            ) : (
              <div className="badge-grid">
                {(badges || []).map((badge) => (
                  <div key={badge.ID} className="badge-item" onClick={() => awardBadge(badge.ID)}>
                    <img src={`/images/uploads/badges/${badge.FileName}`} alt={badge.Title} />
                    <span>{badge.Title}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn" style={{marginTop:'10px'}} onClick={() => setIsBadgeModalOpen(false)}>Cancel</button>
          </div>
        </div>,
        document.body
      )}

      {/* Input Modal for XP Award */}
      {isInputModalOpen && inputModalConfig && ReactDOM.createPortal(
        <InputModal
          open={isInputModalOpen}
          message={inputModalConfig.message}
          defaultValue={inputModalConfig.initialValue}
          onConfirm={inputModalConfig.onConfirm}
          onCancel={() => setIsInputModalOpen(false)}
        />,
        document.body
      )}
    </div>
  );
};

export default UserManagementPanel; 