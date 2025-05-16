import { v4 as uuidv4 } from 'uuid';

// Store active games by ID
const activeGames = new Map();

/**
 * Creates a new multiplayer game session
 * @returns {string} UUID for the new game
 */
export const createMultiplayerGame = () => {
  const gameId = uuidv4();
  
  activeGames.set(gameId, {
    id: gameId,
    createdAt: Date.now(),
    currentEncounterId: null,
    encounters: [],
    status: 'active'
  });
  
  return gameId;
};

/**
 * Updates the current encounter for a game
 * @param {string} gameId - UUID of the game
 * @param {string} encounterId - ID of the encounter
 */
export const updateGameEncounter = (gameId, encounterId) => {
  if (!activeGames.has(gameId)) {
    console.error(`Game ${gameId} not found`);
    return false;
  }
  
  const game = activeGames.get(gameId);
  
  // Save previous encounter to history
  if (game.currentEncounterId) {
    game.encounters.push({
      id: game.currentEncounterId,
      timestamp: Date.now()
    });
  }
  
  // Update current encounter
  game.currentEncounterId = encounterId;
  activeGames.set(gameId, game);
  
  return true;
};

/**
 * Gets the current encounter ID for a game
 * @param {string} gameId - UUID of the game
 * @returns {string|null} Current encounter ID or null if not found
 */
export const getCurrentEncounter = (gameId) => {
  if (!activeGames.has(gameId)) {
    console.error(`Game ${gameId} not found`);
    return null;
  }
  
  return activeGames.get(gameId).currentEncounterId;
};

/**
 * Checks if a game exists
 * @param {string} gameId - UUID of the game
 * @returns {boolean} Whether the game exists
 */
export const gameExists = (gameId) => {
  return activeGames.has(gameId);
};

/**
 * Gets all active game IDs
 * @returns {string[]} Array of game IDs
 */
export const getActiveGameIds = () => {
  return Array.from(activeGames.keys());
};

/**
 * Ends a game session
 * @param {string} gameId - UUID of the game to end
 */
export const endGame = (gameId) => {
  if (activeGames.has(gameId)) {
    activeGames.delete(gameId);
    return true;
  }
  return false;
}; 