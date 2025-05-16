import axios from 'axios';

/**
 * Award XP to a specific user.
 *
 * @param {number} userId - The ID of the user to receive XP.
 * @param {number} amount - The amount of XP to award (can be negative to remove XP).
 * @returns {Promise<object>} Response containing updated xp_points and level.
 */
export const awardXP = async (userId, amount) => {
  if (!userId || isNaN(userId)) throw new Error('Invalid userId supplied to awardXP');
  if (amount === undefined || isNaN(amount)) throw new Error('Invalid amount supplied to awardXP');

  const response = await axios.post(`/api/users/${userId}/award-xp`, { amount });
  return response.data;
};

/**
 * Award a badge to a specific user.
 *
 * @param {number} userId - The ID of the user to receive the badge.
 * @param {number} badgeId - The ID of the badge to award.
 * @returns {Promise<object>} Response containing badge details.
 */
export const awardBadge = async (userId, badgeId) => {
  if (!userId || isNaN(userId)) throw new Error('Invalid userId supplied to awardBadge');
  if (!badgeId || isNaN(badgeId)) throw new Error('Invalid badgeId supplied to awardBadge');

  const response = await axios.post(`/api/users/${userId}/badges`, { badge_id: badgeId });
  return response.data;
};

// Attach to window for easy debugging / global access (optional)
if (typeof window !== 'undefined') {
  window.awardXP = awardXP;
  window.awardBadge = awardBadge;
} 