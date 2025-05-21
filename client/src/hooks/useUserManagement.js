import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
// Import axios interceptor setup for side-effects only
import '../utils/axiosSetup';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
// We will emit socket events for XP awards; remove REST util import

// useSocket returns an object; we need its socket instance

const useUserManagement = (gameId, encounterId) => {
  const { user } = useAuth();
  const { socket } = useSocket() || {};

  const [userList, setUserList] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [badges, setBadges] = useState([]);
  const [loadingBadges, setLoadingBadges] = useState(false);

  // Modal States ------------------------------------------------------
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);
  const [selectedUserForBadge, setSelectedUserForBadge] = useState(null); // Stores user object or 'ALL'
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [inputModalConfig, setInputModalConfig] = useState({
    title: '',
    message: '',
    inputLabel: '',
    inputType: 'number',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
    initialValue: '',
    allowNegative: false,
    requiresReason: false,
    reasonLabel: 'Reason (optional)',
    reasonValue: '',
  });

  // ------------------------------------------------------------------
  // Data fetching helpers
  // ------------------------------------------------------------------
  const fetchBadges = useCallback(async () => {
    // Removed gameId dependency as we fetch all badges now
    setLoadingBadges(true);
    try {
      // Changed endpoint to GetAllBadgesData
      const { data } = await axios.get('badges/GetAllBadgesData'); 
      setBadges(Array.isArray(data) ? data : []); // Ensure data is an array
    } catch (err) {
      console.error('Error fetching badges:', err);
      setBadges([]); // Set to empty array on error
    }
    setLoadingBadges(false);
  }, []); // Dependency array is empty

  useEffect(() => {
    // Fetches all badges when the hook is used
    fetchBadges();
  }, [fetchBadges]);

  // ------------------------------------------------------------------
  // XP helpers
  // ------------------------------------------------------------------
  const awardXPToUser = useCallback((targetUserObj, amount, reason = 'Manual award') => {
    if (!socket || !user || !gameId) {
      console.error('[useUserManagement] awardXPToUser: Missing socket/user/gameId');
      return;
    }

    if (!targetUserObj) {
      console.error('[useUserManagement] awardXPToUser: targetUserObj is required');
      return;
    }

    const userIdentifier = targetUserObj.name; // full auth0Sub|DisplayName string
    if (!userIdentifier || typeof userIdentifier !== 'string' || !userIdentifier.includes('|')) {
      console.error('[useUserManagement] awardXPToUser: invalid userIdentifier', userIdentifier);
      return;
    }

    if (amount === undefined || isNaN(parseInt(amount, 10))) {
      console.error('[useUserManagement] awardXPToUser: Invalid amount. Received:', amount);
      return;
    }

    const payload = {
      userId: userIdentifier, // server will extract pure sub
      amount: parseInt(amount, 10),
      reason,
      awardedBy: user.sub || user._id || 'educator',
      gameId
    };
    console.log('[useUserManagement] Emitting awardXP socket payload', payload);
    socket.emit('awardXP', payload);
  }, [socket, user, gameId]);

  const openAwardXPModal = useCallback((targetUser) => {
    console.log('[useUserManagement] openAwardXPModal called with targetUser:', targetUser);
    // Skip if user appears to be a guest (no "|" in name)
    if (!targetUser.name || !targetUser.name.includes('|')) {
      console.warn('[useUserManagement] openAwardXPModal: Target appears to be a guest. XP not allowed.');
      return;
    }

    setInputModalConfig({
      title: `Award XP to ${targetUser.display_name || targetUser.name}`,
      message: 'Enter the amount of XP to award.',
      inputLabel: 'XP Amount',
      inputType: 'number',
      confirmText: 'Award XP',
      cancelText: 'Cancel',
      initialValue: '10',
      allowNegative: false,
      onConfirm: (value) => {
        awardXPToUser(targetUser, parseInt(value, 10));
        setIsInputModalOpen(false); // Close after confirm
      },
    });
    setIsInputModalOpen(true);
    console.log('[useUserManagement] setIsInputModalOpen(true) CALLED. isInputModalOpen should be true now.');
  }, [awardXPToUser, setIsInputModalOpen]);

  const awardXPToAll = useCallback((amount) => {
    if (!socket || !user || !gameId) {
      console.error('[useUserManagement] awardXPToAll: Missing socket/user/gameId');
      return;
    }

    if (amount === undefined || isNaN(parseInt(amount, 10))) {
      console.error('[useUserManagement] awardXPToAll: Invalid amount', amount);
      return;
    }

    const payload = {
      amount: parseInt(amount, 10),
      awardedBy: user.sub || user._id || 'educator',
      gameId,
      encounterId
    };
    console.log('[useUserManagement] Emitting awardXPToAll socket payload', payload);
    socket.emit('awardXPToAll', payload);
  }, [socket, user, gameId, encounterId]);

  const openAwardXPToAllModal = useCallback(() => {
    console.log('[useUserManagement] openAwardXPToAllModal called');
    setInputModalConfig({
      title: 'Award XP to All Users',
      message: 'Enter the amount of XP to award to all connected users.',
      inputLabel: 'XP Amount',
      inputType: 'number',
      confirmText: 'Award to All',
      cancelText: 'Cancel',
      initialValue: '5',
      allowNegative: false,
      onConfirm: (value) => {
        awardXPToAll(parseInt(value, 10));
        setIsInputModalOpen(false); // Close after confirm
      },
    });
    setIsInputModalOpen(true);
    console.log('[useUserManagement] setIsInputModalOpen(true) CALLED (for ALL). isInputModalOpen should be true now.');
  }, [awardXPToAll, setIsInputModalOpen]);

  // ------------------------------------------------------------------
  // Badge helpers
  // ------------------------------------------------------------------
  const openBadgeAwardModal = useCallback((targetUser) => {
    setSelectedUserForBadge(targetUser);
    setIsBadgeModalOpen(true);
  }, []);

  const awardBadge = useCallback((badgeId) => {
    if (!socket || !user || !gameId || !selectedUserForBadge || !badgeId) return;

    const payloadBase = { badgeId, gameId, encounterId, awardedBy: user._id || user.sub };

    if (selectedUserForBadge === 'ALL') {
      socket.emit('awardBadgeToAll', payloadBase);
    } else {
      socket.emit('awardBadge', {
        ...payloadBase,
        userId: selectedUserForBadge.name,
      });
    }
    setIsBadgeModalOpen(false);
    setSelectedUserForBadge(null);
  }, [socket, user, gameId, encounterId, selectedUserForBadge]);

  // ------------------------------------------------------------------
  // Socket listeners
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!socket || !gameId) return;

    const handleUpdateUserList = (data) => {
      // Check if the update is for the current game
      if (data.gameId && gameId !== data.gameId) {
        console.log(`useUserManagement: Ignoring user list update for different gameId. Expected ${gameId}, got ${data.gameId}`);
        return;
      }
      console.log('useUserManagement: Received updateUserList for gameId:', data.gameId, 'Users:', data.users);
      const users = Array.isArray(data.users) ? data.users : [];
      setUserList(users);
      setTotalUsers(data.total !== undefined ? data.total : users.length);
    };

    socket.on('updateUserList', handleUpdateUserList);
    socket.on('xp_awarded', (d) => console.log('[useUserManagement] xp_awarded event received:', d));
    socket.on('badge_awarded', (d) => console.log('[useUserManagement] badge_awarded event received:', d));

    return () => {
      socket.off('updateUserList', handleUpdateUserList);
      socket.off('xp_awarded');
      socket.off('badge_awarded');
    };
  }, [socket, gameId]);

  // ------------------------------------------------------------------
  // Exposed API
  // ------------------------------------------------------------------
  return {
    userList,
    totalUsers,
    badges,
    loadingBadges,
    fetchBadges,

    // XP functions
    openAwardXPModal,
    openAwardXPToAllModal,

    // Badge functions
    isBadgeModalOpen,
    setIsBadgeModalOpen,
    selectedUserForBadge,
    openBadgeAwardModal,
    awardBadge,

    // Input modal control
    isInputModalOpen,
    setIsInputModalOpen,
    inputModalConfig,
  };
};

export default useUserManagement; 