import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

const DEBUG_HOOK = true; // Or a more sophisticated debug flag
const logHook = (...args) => DEBUG_HOOK && console.log('[usePresentationEncounterManager]', ...args);

const usePresentationEncounterManager = () => {
  const [encounterData, setEncounterData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const encounterCacheRef = useRef(new Map());

  const loadEncounter = useCallback(async (encounterId) => {
    logHook(`loadEncounter called with ID: ${encounterId}, type: ${typeof encounterId}`);
    if (!encounterId) {
      logHook('Error: Encounter ID is required. Setting error state.');
      setError(new Error('Encounter ID is required.'));
      setEncounterData(null);
      setIsLoading(false); // Ensure loading is false on early exit
      return null;
    }

    // Check cache first
    if (encounterCacheRef.current.has(encounterId)) {
      const cachedData = encounterCacheRef.current.get(encounterId);
      logHook(`Cache hit for ID: ${encounterId}. Returning cached data.`, cachedData);
      setEncounterData(cachedData);
      setIsLoading(false);
      setError(null);
      return cachedData;
    }

    logHook(`Cache miss for ID: ${encounterId}. Fetching from API.`);
    setIsLoading(true);
    setError(null);
    try {
      logHook(`Fetching data for encounter ${encounterId} - API call initiated.`);
      const response = await axios.get(`encounters/GetEncounterData/${encounterId}`, {
        params: { scope: 'public', _t: new Date().getTime() }, // Added cache buster
      });
      const newData = response.data;
      logHook(`API response received for ${encounterId}:`, newData);
      
      if (newData && newData.Encounter) {
        logHook(`Data structure valid for ${encounterId}. Caching and setting data.`);
        encounterCacheRef.current.set(encounterId, newData);
        setEncounterData(newData);
        // setError(null); // Already set before try block
        return newData;
      } else {
        logHook(`Error: Invalid data structure received for ${encounterId}. Throwing error.`, newData);
        throw new Error('Invalid data structure received from API.');
      }
    } catch (err) {
      const errStatus = err.response?.status;
      const errMsg = err.message;
      logHook(`Error fetching encounter ${encounterId}. Status: ${errStatus}, Message: ${errMsg}`, err);
      setError(err);
      setEncounterData(null);
      return null;
    } finally {
      logHook(`Finished loadEncounter for ID: ${encounterId}. Setting isLoading to false.`);
      setIsLoading(false);
    }
  }, []); // No dependencies for now, cache and axios are stable or ref-based

  return {
    encounterData,
    isLoading,
    error,
    loadEncounter,
  };
};

export default usePresentationEncounterManager; 