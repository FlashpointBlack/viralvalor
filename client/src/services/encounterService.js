import axios from 'axios';

// Helper to get userSub, assuming it's stored or accessible
// For now, we'll assume axios defaults are set up elsewhere (as in StorylineEditor)
// or passed into functions if needed. Ideally, userSub is handled by axios interceptors.

/**
 * Fetches the root encounters for the current user.
 * Assumes axios defaults (baseURL, credentials, userSub header) are configured.
 * @throws {Error} if the request fails.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of root encounter objects.
 */
export const fetchRootEncounters = async () => {
  try {
    const response = await axios.get('encounters/root-encounters', {
      // userSub should be in axios defaults or an interceptor
      params: { _t: new Date().getTime() } // Cache buster
    });
    if (Array.isArray(response.data)) {
      return response.data;
    } else {
      console.error('Root encounters response is not an array:', response.data);
      throw new Error('Invalid data format for root encounters.');
    }
  } catch (err) {
    console.error('Error fetching root encounters in service:', err);
    const message = err.response?.data?.error || err.message || 'Failed to fetch root encounters';
    throw new Error(message);
  }
};

/**
 * Fetches the data for a specific encounter.
 * Assumes axios defaults (baseURL, credentials, userSub header) are configured.
 * @param {string|number} encounterId - The ID of the encounter to fetch.
 * @throws {Error} if the request fails or encounterId is missing.
 * @returns {Promise<Object>} A promise that resolves to an object containing encounter details and routes.
 *         The object shape is expected to be { Encounter: {}, EncounterRoutes: [] }.
 */
export const getEncounterData = async (encounterId) => {
  if (!encounterId) {
    console.error('getEncounterData service called without encounterId');
    throw new Error('Encounter ID is required to fetch data.');
  }
  try {
    const response = await axios.get(`encounters/GetEncounterData/${encounterId}`, {
      // userSub should be in axios defaults or an interceptor
      params: { _t: new Date().getTime() } // Cache buster
    });
    // Ensure the response structure is as expected
    if (response.data && response.data.Encounter) {
      return {
        Encounter: response.data.Encounter,
        EncounterRoutes: response.data.EncounterRoutes || []
      };
    } else {
      console.error('Invalid data format for encounter data:', response.data);
      throw new Error('Invalid data format for encounter data.');
    }
  } catch (err) {
    console.error(`Error fetching encounter data for ID ${encounterId} in service:`, err);
    const message = err.response?.data?.error || err.message || `Failed to fetch data for encounter ${encounterId}`;
    throw new Error(message);
  }
};

/**
 * Creates a new blank root encounter for the current user.
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to an object containing the new encounterId.
 */
export const createBlankEncounter = async () => {
  try {
    // userSub should be in axios defaults or an interceptor
    const response = await axios.post('encounters/create-blank-encounter', { /* userSub could be sent here if not in interceptor */ });
    return response.data; // Expected: { encounterId: newId }
  } catch (err) {
    console.error('Error creating blank encounter in service:', err);
    const message = err.response?.data?.error || err.message || 'Failed to create blank encounter';
    throw new Error(message);
  }
};

/**
 * Deletes a root encounter and all its nested content.
 * @param {string|number} rootEncounterId - The ID of the root encounter to delete.
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to the server response (often empty or a success message).
 */
export const deleteRootEncounter = async (rootEncounterId) => {
  if (!rootEncounterId) {
    throw new Error('Root Encounter ID is required for deletion.');
  }
  try {
    // userSub should be in axios defaults or an interceptor
    const response = await axios.post('encounters/delete-root-encounter', { rootEncounterId });
    return response.data;
  } catch (err) {
    console.error(`Error deleting root encounter ${rootEncounterId} in service:`, err);
    const message = err.response?.data?.error || err.message || 'Failed to delete root encounter';
    throw new Error(message);
  }
};

/**
 * Updates a specific field of an encounter.
 * @param {string|number} encounterId - The ID of the encounter to update.
 * @param {string} field - The name of the field to update.
 * @param {any} value - The new value for the field.
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to the server response.
 */
export const updateEncounterField = async (encounterId, field, value) => {
  if (!encounterId || !field) {
    throw new Error('Encounter ID and field are required for update.');
  }
  try {
    // userSub should be in axios defaults or an interceptor
    const response = await axios.post('encounters/update-encounter-field', {
      id: encounterId,
      field,
      value
    });
    return response.data;
  } catch (err) {
    console.error(`Error updating encounter field ${field} for ID ${encounterId} in service:`, err);
    const message = err.response?.data?.error || err.message || `Failed to update field ${field}`;
    throw new Error(message);
  }
};

/**
 * Creates a new choice for an encounter.
 * @param {string|number} encounterId - The ID of the encounter to add the choice to.
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to the new choice data (e.g., { ID: newChoiceId, ... }).
 */
export const createEncounterChoice = async (encounterId) => {
  if (!encounterId) {
    throw new Error('Encounter ID is required to create a choice.');
  }
  try {
    // userSub should be in axios defaults or an interceptor. The original call sent UserSub in data.
    const response = await axios.post('encounters/create-encounter-choice', { EncounterID: encounterId });
    return response.data; // Expected: { ID: ..., Title: ..., ... }
  } catch (err) {
    console.error(`Error creating encounter choice for encounter ${encounterId} in service:`, err);
    const message = err.response?.data?.error || err.message || 'Failed to create encounter choice';
    throw new Error(message);
  }
};

/**
 * Updates an existing encounter choice.
 * @param {string|number} choiceId - The ID of the choice to update.
 * @param {string} title - The new title for the choice.
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to the server response.
 */
export const updateEncounterChoice = async (choiceId, title) => {
  if (!choiceId) {
    throw new Error('Choice ID is required for update.');
  }
  try {
    // userSub should be in axios defaults or an interceptor
    const response = await axios.post('encounters/update-encounter-choice', { ID: choiceId, Title: title });
    return response.data;
  } catch (err) {
    console.error(`Error updating encounter choice ${choiceId} in service:`, err);
    const message = err.response?.data?.error || err.message || 'Failed to update encounter choice';
    throw new Error(message);
  }
};

/**
 * Deletes an encounter choice.
 * @param {string|number} choiceId - The ID of the choice to delete.
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to the server response.
 */
export const deleteEncounterChoice = async (choiceId) => {
  if (!choiceId) {
    throw new Error('Choice ID is required for deletion.');
  }
  try {
    // userSub should be in axios defaults or an interceptor
    const response = await axios.post('encounters/delete-encounter-choice', { ID: choiceId });
    return response.data;
  } catch (err) {
    console.error(`Error deleting encounter choice ${choiceId} in service:`, err);
    const message = err.response?.data?.error || err.message || 'Failed to delete encounter choice';
    throw new Error(message);
  }
};

/**
 * Fetches encounters that are not currently linked to any storyline.
 * @throws {Error} if the request fails.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of unlinked encounter objects.
 */
export const fetchUnlinkedEncounters = async () => {
  try {
    // userSub should be in axios defaults or an interceptor
    const response = await axios.get('encounters/unlinked-encounters');
    return response.data; // Expected: Array of encounter objects
  } catch (err) {
    console.error('Error fetching unlinked encounters in service:', err);
    const message = err.response?.data?.error || err.message || 'Failed to fetch unlinked encounters';
    throw new Error(message);
  }
};

/**
 * Fetches the profile status for the current user.
 * (Could eventually be moved to a dedicated userService.js)
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to the user profile status data.
 */
export const getUserProfileStatus = async () => {
  try {
    // userSub should be in axios defaults or an interceptor
    const response = await axios.get('user/profile-status');
    return response.data;
  } catch (err) {
    console.error('Error fetching user profile status in service:', err);
    const message = err.response?.data?.error || err.message || 'Failed to fetch user profile status';
    throw new Error(message);
  }
};

/**
 * Links or unlinks an encounter to a specific route (choice).
 * @param {string|number} routeId - The ID of the route (choice) to update.
 * @param {string|number|null} receivingEncounterId - The ID of the encounter to link to, or null to unlink.
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to the server response.
 */
export const linkEncounterToRoute = async (routeId, receivingEncounterId) => {
  if (!routeId) {
    throw new Error('Route ID is required to set receiving encounter.');
  }
  try {
    // userSub should be in axios defaults or an interceptor
    const response = await axios.post('encounters/set-receiving-encounter', {
      RouteID: routeId,
      selectedEncounterID: receivingEncounterId // Backend expects selectedEncounterID
    });
    return response.data;
  } catch (err) {
    console.error(`Error setting receiving encounter for route ${routeId} in service:`, err);
    const operation = receivingEncounterId ? 'link' : 'unlink';
    const message = err.response?.data?.error || err.message || `Failed to ${operation} encounter for route`;
    throw new Error(message);
  }
};

/**
 * Duplicates an existing encounter.
 * @param {string|number} encounterId - The ID of the encounter to duplicate.
 * @throws {Error} if the request fails.
 * @returns {Promise<Object>} A promise that resolves to an object containing the newEncounterId.
 */
export const duplicateEncounter = async (encounterId) => {
  if (!encounterId) {
    throw new Error('Encounter ID is required for duplication.');
  }
  try {
    // userSub should be in axios defaults or an interceptor. Original call sent userSub in data.
    const response = await axios.post('encounters/duplicateEncounter', { encounterId });
    return response.data; // Expected: { newEncounterId: id }
  } catch (err) {
    console.error(`Error duplicating encounter ${encounterId} in service:`, err);
    const message = err.response?.data?.error || err.message || 'Failed to duplicate encounter';
    throw new Error(message);
  }
};

// We will add more service functions here as we refactor StorylineEditor.js 