import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';

const EncounterContext = createContext();

export const useEncounter = () => useContext(EncounterContext);

export const EncounterProvider = ({ children }) => {
  const [currentEncounter, setCurrentEncounter] = useState(null);
  const [encounterRoutes, setEncounterRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const { socket } = useSocket();
  const { user } = useAuth();
  const userSub = user?.sub;

  const fetchEncounterData = useCallback(async (encounterId) => {
    if (!encounterId) {
      console.warn('[EncounterContext] fetchEncounterData aborted: encounterId is missing.');
      setError('No encounter selected.');
      setCurrentEncounter(null);
      setEncounterRoutes([]);
      setLoading(false);
      return;
    }

    if (!userSub) {
      console.warn('[EncounterContext] fetchEncounterData aborted: userSub is missing.');
      setError('Authentication required to load encounter details.');
      setCurrentEncounter(null);
      setEncounterRoutes([]);
      setLoading(false);
      return;
    }

    console.log(`[EncounterContext] Fetching data for encounter ${encounterId} with auth (requesting public scope).`);
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios({
        method: 'get',
        url: `/GetEncounterData/${encounterId}`,
        withCredentials: true,
        headers: { 'x-user-sub': userSub },
        params: { 
          _t: new Date().getTime(),
          scope: 'public'
        }
      });

      if (!response.data || !response.data.Encounter) {
        throw new Error(`Invalid data structure received for encounter ${encounterId}`);
      }

      setCurrentEncounter(response.data.Encounter);
      setEncounterRoutes(response.data.EncounterRoutes || []);

    } catch (err) {
      const statusCode = err.response?.status;
      console.error('[EncounterContext] Error fetching encounter data:', err);
      if (statusCode === 404) {
        setError(`Encounter Not Found (ID: ${encounterId})`);
      } else if (statusCode === 403) {
        setError(`Permission Denied to access encounter ${encounterId}`);
      } else if (statusCode === 401) {
        setError(`Authentication failed when fetching encounter ${encounterId}`);
      } else {
        setError('Failed to fetch encounter data. Please try again.');
      }
      setCurrentEncounter(null);
      setEncounterRoutes([]);
    } finally {
      setLoading(false);
    }
  }, [userSub]);

  const handleRouteSelection = useCallback((routeId) => {
    if (currentEncounter?.ID) {
      setHistory(prev => {
        if (prev[prev.length - 1] === currentEncounter.ID) return prev;
        return [...prev, currentEncounter.ID];
      });
    }
    fetchEncounterData(routeId);
  }, [currentEncounter?.ID, fetchEncounterData]);

  const goBack = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const prevId = newHistory.pop();
      if (prevId) {
        fetchEncounterData(prevId);
      }
      return newHistory;
    });
  }, [fetchEncounterData]);

  const canGoBack = history.length > 0;

  // Expose a method to allow external components (e.g., StoryView) to clear
  // the stored navigation history when starting a brand-new storyline.
  const resetHistory = useCallback(() => {
    setHistory([]);
  }, []);

  useEffect(() => {
    if (socket) {
      const handleTravel = (routeId) => {
        console.log(`[EncounterContext] Received socket TravelToID: ${routeId}`);
        if (currentEncounter?.ID) {
          setHistory(prev => {
            if (prev[prev.length - 1] === currentEncounter.ID) return prev;
            return [...prev, currentEncounter.ID];
          });
        }
        fetchEncounterData(routeId);
      };
      socket.on('TravelToID', handleTravel);

      return () => {
        socket.off('TravelToID', handleTravel);
      };
    }
  }, [socket, currentEncounter?.ID, fetchEncounterData]);

  const value = {
    currentEncounter,
    encounterRoutes,
    loading,
    error,
    fetchEncounterData,
    handleRouteSelection,
    goBack,
    canGoBack,
    resetHistory
  };

  return (
    <EncounterContext.Provider value={value}>
      {children}
    </EncounterContext.Provider>
  );
}; 