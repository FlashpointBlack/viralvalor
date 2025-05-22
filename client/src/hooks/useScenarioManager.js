import { useState, useEffect, useCallback, useRef } from 'react';
import socket from '../socket'; // Assuming socket.js is in the parent directory
import axios from 'axios'; // For API calls
import { getEncounterData } from '../services/encounterService'; // Import service for encounter data

const useScenarioManager = (initialScenarioId = null, initialEncounterId = null, currentGameId = null) => {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState(initialScenarioId);
  const [currentEncounter, setCurrentEncounter] = useState(null);
  const [encounterPath, setEncounterPath] = useState([]); // Array of encounter IDs representing the current path
  const [encounterCache, setEncounterCache] = useState({}); // Cache for fetched encounter data { encounterId: data }
  
  const [breadcrumbsLoading, setBreadcrumbsLoading] = useState(false);
  const [longestPath, setLongestPath] = useState([]); // Stores the sequence of encounter IDs for the longest path
  const [allPaths, setAllPaths] = useState([]); // Stores all possible paths for a scenario
  const [scenarioMaxDepth, setScenarioMaxDepth] = useState(0);

  const scenarioPathCacheRef = useRef(new Map()); // Cache for findAllPathsRecursive results
  const scenarioDepthCacheRef = useRef(new Map()); // Cache for computeScenarioMaxDepth results

  // Refs for functions that might be complex or need to be stable
  const fetchEncounterDataRef = useRef();
  const prefetchFutureEncountersRef = useRef();
  const calculateLongestPathRef = useRef();
  // const loadEncounterInDisplayRef = useRef(); // May not be needed here if managed by EducatorPanel - REVERTED COMMENT

  // Fetch all scenarios on mount
  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        const response = await axios.get('encounters/root-encounters', {
          params: { _t: Date.now(), scope: 'public' },
        });
        if (Array.isArray(response.data)) {
          setScenarios(response.data);
        } else {
          console.error("Error fetching scenarios: response.data is not an array", response.data);
          setScenarios([]);
        }
      } catch (error) {
        console.error("Error fetching scenarios:", error);
        setScenarios([]);
      }
    };
    fetchScenarios();
  }, []);

  // Effect to fetch encounter data when selectedScenarioId or initialEncounterId changes
  // This is more for an initial load if the hook is instantiated with specific IDs
  useEffect(() => {
    if (selectedScenarioId && !currentEncounter && initialEncounterId) { 
      console.log('useScenarioManager: Initializing with selectedScenarioId and initialEncounterId', selectedScenarioId, initialEncounterId);
      // fetchEncounterDataRef.current(initialEncounterId); // Changed to use ref
    } else if (selectedScenarioId && !currentEncounter) {
      console.log('useScenarioManager: selectedScenarioId set, but no currentEncounter. Consider fetching root of scenario if appropriate.', selectedScenarioId);
      // This case is usually handled by handleScenarioChange
    }
  }, [selectedScenarioId, currentEncounter, initialEncounterId]);

  useEffect(() => {
    // When selectedScenarioId changes, clear the caches for depth and paths as they are scenario-specific.
    scenarioDepthCacheRef.current.clear();
    scenarioPathCacheRef.current.clear();
    console.log(`[useScenarioManager] Caches cleared due to scenario change: ${selectedScenarioId}`);
  }, [selectedScenarioId]);

  const fetchEncounterData = useCallback(async (encounterId, forceRefresh = false) => {
    if (!encounterId) return null;
    if (!forceRefresh && encounterCache[encounterId]) {
      setCurrentEncounter(encounterCache[encounterId]);
      if (!encounterPath.includes(encounterId)) {
        setEncounterPath(prev => [...prev, encounterId]);
      }
      return encounterCache[encounterId];
    }
    setBreadcrumbsLoading(true);
    try {
      const { Encounter, EncounterRoutes } = await getEncounterData(encounterId);
      const encounterData = {
        id: Encounter.ID || Encounter.id || encounterId,
        title: Encounter.Title || Encounter.title || `Encounter ${encounterId}`,
        ...Encounter,
        routes: EncounterRoutes || [],
        EncounterRoutes: EncounterRoutes || [],
      };
      setEncounterCache(prevCache => ({ ...prevCache, [encounterId]: encounterData }));
      setCurrentEncounter(encounterData);
      setEncounterPath(prevPath => {
        if (prevPath.length === 0) return [encounterId];
        const existingIndex = prevPath.indexOf(encounterId);
        if (existingIndex !== -1) {
          return prevPath.slice(0, existingIndex + 1);
        }
        return [...prevPath, encounterId];
      });
      // console.log('useScenarioManager: Fetched encounter data for', encounterId);
      return encounterData;
    } catch (error) {
      console.error(`useScenarioManager: Error fetching encounter data for ${encounterId}:`, error);
      setCurrentEncounter(null); // Clear current encounter on error
      return null;
    } finally {
      setBreadcrumbsLoading(false);
    }
  }, [encounterCache, encounterPath]); // encounterPath dependency is important here

  fetchEncounterDataRef.current = fetchEncounterData;

  // Helper function for calculateLongestPath to compute maximum depth for a scenario
  const computeScenarioMaxDepth = useCallback((rootEncounterId, currentCache) => {
    if (scenarioDepthCacheRef.current.has(rootEncounterId)) {
      // console.log(`[useScenarioManager] computeScenarioMaxDepth cache HIT for root: ${rootEncounterId}`);
      return scenarioDepthCacheRef.current.get(rootEncounterId);
    }
    // console.log('[useScenarioManager] computeScenarioMaxDepth CALLED for root:', rootEncounterId);
    const dfs = (encounterId, depth = 1, visited = new Set()) => {
      if (!encounterId || visited.has(encounterId)) return depth;
      visited.add(encounterId);
      const cached = currentCache[encounterId];
      const routes = (cached && cached.routes) ? cached.routes : [];
      if (routes.length === 0) return depth;
      let maxDepth = depth;
      for (const r of routes) {
        if (r.RelID_Encounter_Receiving) {
          const branchDepth = dfs(r.RelID_Encounter_Receiving, depth + 1, new Set(visited));
          if (branchDepth > maxDepth) maxDepth = branchDepth;
        }
      }
      return maxDepth;
    };
    if (!rootEncounterId) return 0;
    const result = dfs(rootEncounterId);
    scenarioDepthCacheRef.current.set(rootEncounterId, result);
    return result;
  }, []); // Empty dependency array: function is stable, caching logic handles data changes via cache clear

  // Helper function for calculateLongestPath to find all paths
  const findAllPathsRecursive = useCallback((encounterId, path = [], visited = new Set(), allFoundPaths = [], currentCache) => {
    // Cache key for findAllPathsRecursive could be more complex if we want to cache intermediate calls.
    // For now, this function is called from calculateLongestPath, which will use its own cache for the result of *its* main call to this.
    // console.log(`[useScenarioManager] findAllPathsRecursive CALLED for ID: ${encounterId}, current path length: ${path.length}`);
    visited.add(encounterId);
    const cachedData = currentCache[encounterId];
    if (!cachedData || !cachedData.routes || cachedData.routes.length === 0) {
      allFoundPaths.push([...path, encounterId]);
      return allFoundPaths;
    }
    const nextEncounters = cachedData.routes
      .filter(route => route.RelID_Encounter_Receiving && !visited.has(route.RelID_Encounter_Receiving))
      .map(route => route.RelID_Encounter_Receiving);
    if (nextEncounters.length === 0) {
      allFoundPaths.push([...path, encounterId]);
      return allFoundPaths;
    }
    for (const nextEncounterId of nextEncounters) {
      findAllPathsRecursive(nextEncounterId, [...path, encounterId], new Set(visited), allFoundPaths, currentCache);
    }
    return allFoundPaths;
  }, []);
  
  const calculateLongestPath = useCallback((rootOfCalculationEncounterId) => {
    // console.log(`[useScenarioManager] calculateLongestPath CALLED for root: ${rootOfCalculationEncounterId}, currentEncounterPath:`, encounterPath.join(', '));
    if (!selectedScenarioId) {
      setLongestPath([]);
      setAllPaths([]);
      setScenarioMaxDepth(0);
      return;
    }
    const currentMaxDepth = computeScenarioMaxDepth(selectedScenarioId, encounterCache);
    setScenarioMaxDepth(currentMaxDepth);
    const actualCurrentEncounterForPath = encounterPath.length > 0 
      ? encounterPath[encounterPath.length - 1]
      : rootOfCalculationEncounterId;
    if (!actualCurrentEncounterForPath) {
        setLongestPath([]);
        setAllPaths([]);
        return;
    }

    let futurePaths;
    const pathCacheKey = actualCurrentEncounterForPath;
    if (scenarioPathCacheRef.current.has(pathCacheKey)) {
      futurePaths = scenarioPathCacheRef.current.get(pathCacheKey);
    } else {
      futurePaths = findAllPathsRecursive(actualCurrentEncounterForPath, [], new Set(), [], encounterCache);
      scenarioPathCacheRef.current.set(pathCacheKey, futurePaths);
    }
    setAllPaths(futurePaths);

    const futureLongestPath = futurePaths.reduce((longest, current) => 
      current.length > longest.length ? current : longest, 
      []
    );

    // Corrected combinedPath logic: Start with the path taken so far (encounterPath)
    // Ensure actualCurrentEncounterForPath is the last element of this base if encounterPath wasn't empty.
    // If encounterPath was empty, combinedPath starts with actualCurrentEncounterForPath.
    let combinedPath;
    if (encounterPath.length > 0) {
      // If actualCurrentEncounterForPath is already the end of encounterPath, use encounterPath directly.
      // Otherwise, it means we might be calculating for a root that's not yet in encounterPath (e.g. initial scenario load)
      // or we navigated to a point not extending current encounterPath (should be rare with current nav logic).
      // For safety, if actualCurrentEncounterForPath differs from last item in encounterPath, start fresh from actualCurrentEncounterForPath.
      if (encounterPath[encounterPath.length -1] === actualCurrentEncounterForPath) {
        combinedPath = [...encounterPath];
      } else {
        // This case implies rootOfCalculationEncounterId was used and might not align with current encounterPath's tip.
        // Or, a navigation happened that reset encounterPath before this calculation based on an old root.
        // Start path from the node we are actually calculating future paths from.
        combinedPath = [actualCurrentEncounterForPath];
      }
    } else {
      combinedPath = [actualCurrentEncounterForPath];
    }

    if (futureLongestPath.length > 0) {
      // Append nodes from futureLongestPath, skipping the first node if it's actualCurrentEncounterForPath
      // (as it's already the last element of combinedPath or combinedPath itself).
      const startIndexInFuture = (futureLongestPath[0] === actualCurrentEncounterForPath) ? 1 : 0;
      for (let i = startIndexInFuture; i < futureLongestPath.length; i++) {
        if (!combinedPath.includes(futureLongestPath[i])) { // Avoid adding duplicates if any overlap (should be rare)
          combinedPath.push(futureLongestPath[i]);
        }
      }
    }

    const placeholderPrefix = 'placeholder-';
    let placeholderCounter = 1;
    let finalDisplayPath = [...combinedPath];
    while (finalDisplayPath.length < currentMaxDepth) {
      finalDisplayPath.push(`${placeholderPrefix}${placeholderCounter++}`);
    }
    if (finalDisplayPath.length > currentMaxDepth && currentMaxDepth > 0) {
      finalDisplayPath = finalDisplayPath.slice(0, currentMaxDepth);
    }
    const currentIndexInDisplayPath = finalDisplayPath.indexOf(actualCurrentEncounterForPath);
    const maxReachableIndex = (currentIndexInDisplayPath !== -1 && futureLongestPath.length > 0) 
                            ? currentIndexInDisplayPath + futureLongestPath.length -1 
                            : currentIndexInDisplayPath;

    // --- BEGIN DEBUG LOG --- 
    // console.log('useScenarioManager: DEBUG calculateLongestPath', {
    //   selectedScenarioId,
    //   rootOfCalculationEncounterId: rootOfCalculationEncounterId, // original param name was rootOfCalculationEncounterId
    //   encounterPath: JSON.parse(JSON.stringify(encounterPath)), // deep copy for logging
    //   actualCurrentEncounterForPath,
    //   currentMaxDepth,
    //   finalDisplayPath: JSON.parse(JSON.stringify(finalDisplayPath)),
    //   visitedPathSegment: JSON.parse(JSON.stringify(visitedPathSegment)),
    //   futureLongestPath: JSON.parse(JSON.stringify(futureLongestPath)),
    //   currentIndexInDisplayPath,
    //   maxReachableIndex
    // });
    // --- END DEBUG LOG ---

    setLongestPath(
      finalDisplayPath.map((id, idx) => {
        const isPlaceholder = typeof id === 'string' && id.startsWith(placeholderPrefix);
        const isCurrent = !isPlaceholder && id === actualCurrentEncounterForPath;
        const visited = !isPlaceholder && encounterPath.includes(id) && !isCurrent;
        const unreachable = isPlaceholder || (currentIndexInDisplayPath !== -1 && idx > maxReachableIndex && !encounterPath.includes(id)) || (currentIndexInDisplayPath === -1 && !encounterPath.includes(id) && !isCurrent) ;
        return {
          id,
          visited,
          isCurrent,
          unreachable,
          title: isPlaceholder ? '' : (encounterCache[id]?.title || encounterCache[id]?.Encounter?.Title || `Encounter ${id}`)
        };
      })
    );
  }, [selectedScenarioId, encounterCache, encounterPath, computeScenarioMaxDepth, findAllPathsRecursive]);

  calculateLongestPathRef.current = calculateLongestPath;
  
  const fetchEncounterDataSilently = useCallback(async (encounterId) => {
    if (!encounterId) return null;
    if (encounterCache[encounterId]) {
      return encounterCache[encounterId];
    }
    try {
      const { Encounter, EncounterRoutes } = await getEncounterData(encounterId);
      const encounterData = {
        id: Encounter.ID || Encounter.id || encounterId,
        title: Encounter.Title || Encounter.title || `Encounter ${encounterId}`,
        ...Encounter,
        routes: EncounterRoutes || [],
        EncounterRoutes: EncounterRoutes || [],
      };
      setEncounterCache(prevCache => ({ ...prevCache, [encounterId]: encounterData }));
      return encounterData;
    } catch (error) {
      console.error(`useScenarioManager: Silent fetch error for ID ${encounterId}:`, error);
      return null;
    }
  }, [encounterCache]);

  const prefetchFutureEncounters = useCallback(async (encounterId, depth = 0, visited = new Set()) => {
    if (!encounterId || visited.has(encounterId)) {
      if (depth === 0 && !visited.has(encounterId)) {
         calculateLongestPathRef.current(encounterId);
         setBreadcrumbsLoading(false);
      }
      return;
    }
    if (depth === 0) {
      setBreadcrumbsLoading(true);
    }
    visited.add(encounterId);
    try {
      let currentEncounterData = encounterCache[encounterId];
      if (!currentEncounterData || !currentEncounterData.routes) {
        currentEncounterData = await fetchEncounterDataSilently(encounterId);
      }
      if (currentEncounterData && currentEncounterData.routes) {
        const routes = currentEncounterData.routes;
        for (const route of routes) {
          const nextEncounterId = route.RelID_Encounter_Receiving;
          if (nextEncounterId) {
            await prefetchFutureEncounters(nextEncounterId, depth + 1, new Set(visited));
          }
        }
      }
      if (depth === 0) {
        calculateLongestPathRef.current(encounterId);
        setBreadcrumbsLoading(false);
      }
    } catch (error) {
      console.error(`useScenarioManager: Error in prefetchFutureEncounters for ID ${encounterId}:`, error);
      if (depth === 0) {
        calculateLongestPathRef.current(encounterId);
        setBreadcrumbsLoading(false);
      }
    }
  }, [fetchEncounterDataSilently, encounterCache, calculateLongestPathRef]); // Added calculateLongestPathRef

  prefetchFutureEncountersRef.current = prefetchFutureEncounters;

  const handleScenarioChange = useCallback(async (scenarioId) => {
    if (!scenarioId) return;
    setSelectedScenarioId(scenarioId);
    setCurrentEncounter(null); // Clear current encounter to ensure clean load
    setEncounterPath([]); 
    setLongestPath([]);
    setAllPaths([]); 
    setScenarioMaxDepth(0); 
    const initialEncounter = await fetchEncounterDataRef.current(scenarioId, true); // Use ref
    if (initialEncounter) {
      prefetchFutureEncountersRef.current(initialEncounter.id || initialEncounter.ID);
    } else {
      // If initial encounter fails to load, reset breadcrumbs loading
      setBreadcrumbsLoading(false);
    }
  }, []); // Removed fetchEncounterData from deps, using ref instead

  const navigateToBreadcrumb = useCallback(async (encounterId) => {
    if (!encounterId || (typeof encounterId === 'string' && encounterId.startsWith('placeholder-'))) {
      console.log('useScenarioManager: Navigation to placeholder or invalid ID blocked.', encounterId);
      return;
    }
    
    const pathItem = longestPath.find(item => item.id === encounterId);
    if (!pathItem || pathItem.unreachable) {
        console.log('useScenarioManager: Navigation to unreachable or non-existent breadcrumb item blocked.', encounterId, pathItem);
        return;
    }

    const data = await fetchEncounterDataRef.current(encounterId);
    if (data) {
      prefetchFutureEncountersRef.current(encounterId);
      if (socket && currentGameId) {
        socket.emit('TravelToID', encounterId, currentGameId);
      }
    }
  }, [longestPath, currentGameId]);

  // Socket event handlers
  useEffect(() => {
    const handleTravelToID = (encounterId, gameId) => {
      if (currentGameId && gameId === currentGameId) {
        if (currentEncounter && currentEncounter.id === encounterId) {
          console.log(`[useScenarioManager] Received TravelToID for already current encounter ${encounterId}. Listener will not re-trigger full path calculation.`);
          // The action that emitted TravelToID (e.g., navigateToBreadcrumb) should have already handled necessary updates.
          // If a very light refresh is ever needed here for external syncs, it must be carefully designed to avoid loops.
          return; 
        }
        
        console.log('[useScenarioManager] Received TravelToID socket event for new/different encounter:', encounterId, ' game:', gameId);
        fetchEncounterDataRef.current(encounterId); 
        prefetchFutureEncountersRef.current(encounterId); // This will call calculateLongestPath
      }
    };
    socket.on('TravelToID', handleTravelToID);
    return () => {
      socket.off('TravelToID', handleTravelToID);
    };
  }, [currentGameId, currentEncounter]); // Dependencies remain correct

  // Exposed values and functions
  return {
    scenarios,
    selectedScenarioId,
    currentEncounter,
    encounterPath,
    encounterCache,
    breadcrumbsLoading,
    longestPath,
    allPaths,
    scenarioMaxDepth,
    actions: {
      fetchScenarios: () => console.log("TODO: Expose actual fetchScenarios if needed externally"),
      setSelectedScenarioId: handleScenarioChange,
      fetchEncounterData: fetchEncounterDataRef.current, // Expose the ref's current value
      navigateToEncounter: navigateToBreadcrumb, 
      navigateToBreadcrumb,
      // Exposing these for debug or specific scenarios, but generally used internally
      // calculateLongestPath: calculateLongestPathRef.current, 
      // prefetchFutureEncounters: prefetchFutureEncountersRef.current,
    }
  };
};

export default useScenarioManager; 