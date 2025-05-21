import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

const usePresentationEncounterManager = () => {
  const [encounterData, setEncounterData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const encounterCacheRef = useRef(new Map());

  const loadEncounter = useCallback(async (encounterId) => {
    if (!encounterId) {
      setError(new Error('Encounter ID is required.'));
      setEncounterData(null);
      return null;
    }

    // Check cache first
    if (encounterCacheRef.current.has(encounterId)) {
      const cachedData = encounterCacheRef.current.get(encounterId);
      setEncounterData(cachedData);
      setIsLoading(false);
      setError(null);
      return cachedData;
    }

    // Not in cache, fetch from API
    setIsLoading(true);
    setError(null);
    try {
      console.log(`[usePresentationEncounterManager] Fetching data for encounter ${encounterId}`);
      const response = await axios.get(`encounters/GetEncounterData/${encounterId}`, {
        params: { scope: 'public' },
      });
      const newData = response.data; // Assuming response.data is { Encounter: {}, EncounterRoutes: [] }
      
      if (newData && newData.Encounter) {
        encounterCacheRef.current.set(encounterId, newData);
        setEncounterData(newData);
        console.log(`[usePresentationEncounterManager] Fetched and cached data for encounter ${encounterId}:`, newData);
        return newData;
      } else {
        throw new Error('Invalid data structure received from API.');
      }
    } catch (err) {
      console.error(`[usePresentationEncounterManager] Error fetching encounter ${encounterId}:`, err);
      setError(err);
      setEncounterData(null);
      return null;
    } finally {
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