import React, { useState, useEffect } from 'react';
import axios from 'axios';
import EncounterForm from './EncounterForm';
import EncounterRoutes from './EncounterRoutes';
import ImageSelector from './ImageSelector';
import './StorylineEditor.css';
import '../styles/StorylineEditorDebug.css';
import { useAuth } from '../contexts/AuthContext';
import prettyBytes from 'pretty-bytes';
import ConfirmationModal from './ConfirmationModal';
import * as encounterService from '../services/encounterService'; // Import the new service

const StorylineEditor = () => {
  const [activeEncounterId, setActiveEncounterId] = useState(null);
  const [encounterPath, setEncounterPath] = useState([]);
  const [encounter, setEncounter] = useState(null);
  const [encounterRoutes, setEncounterRoutes] = useState([]);
  const [rootEncounters, setRootEncounters] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Add an encounter data cache
  const [encounterCache, setEncounterCache] = useState({});
  const [selectedRootEncounterId, setSelectedRootEncounterId] = useState("");
  const [confirmState, setConfirmState] = useState({ open: false, message: '', onConfirm: null });
  
  // Get authenticated user sub from AuthContext
  const { user } = useAuth();
  const userSub = user?.sub;

  // If not authenticated yet, we may wait until user is available
  useEffect(() => {
    if (!userSub) {
      console.warn('[StorylineEditor] userSub not available yet');
    }
  }, [userSub]);

  // Simplified Initial Load Effect: Fetch root encounters when user is available
  useEffect(() => {
    if (userSub) {
      // Set defaults needed for fetches
      axios.defaults.headers.common['x-user-sub'] = userSub;
      axios.defaults.withCredentials = true;
      fetchRootEncountersFromComponent();
      // Optionally, load a default or last-viewed encounter here if desired,
      // using loadEncounter(defaultId, { isNewRoot: true });
    } else {
      setRootEncounters([]);
      setEncounterPath([]);
      setSelectedRootEncounterId("");
      setEncounter(null);
      setActiveEncounterId(null);
    }
    // Dependencies: Only run when userSub changes
  }, [userSub]);

  // Setup axios interceptors once
  useEffect(() => {
    // Set global axios defaults
    axios.defaults.withCredentials = true;
    if (userSub) {
      axios.defaults.headers.common['x-user-sub'] = userSub;
    }
    
    const reqInterceptor = axios.interceptors.request.use(cfg => {
      // Ensure user sub is in the headers if available
      if (userSub && !cfg.headers['x-user-sub']) {
        cfg.headers['x-user-sub'] = userSub;
      }
      
      // Always use credentials
      cfg.withCredentials = true;
      
      return cfg;
    });
    
    const resInterceptor = axios.interceptors.response.use(res => {
      return res;
    }, err => {
      console.error('Axios Response Error:', err);
      return Promise.reject(err);
    });
    
    return () => {
      axios.interceptors.request.eject(reqInterceptor);
      axios.interceptors.response.eject(resInterceptor);
    };
  }, [userSub]);

  // Diagnostics runner
  const runDiagnostics = async () => {
    console.log('Running diagnostics...');
    try {
      await encounterService.getUserProfileStatus(); // Use service
    } catch (err) {
      console.error('Diagnostic: getUserProfileStatus failed', err.message);
    }
    try {
      await encounterService.fetchRootEncounters();
    } catch (err) {
      console.error('Diagnostic: fetchRootEncounters failed', err.message);
    }
    try {
      await encounterService.fetchUnlinkedEncounters(); // Use service
    } catch (err) {
      console.error('Diagnostic: fetchUnlinkedEncounters failed', err.message);
    }
    console.log('Diagnostics complete.');
  };

  const fetchRootEncountersFromComponent = async () => {
    try {
      const data = await encounterService.fetchRootEncounters();
      
      setRootEncounters(data);

      if (activeEncounterId) {
        const isCurrentInRootList = data.some(e => e.ID === activeEncounterId);
        if (!isCurrentInRootList) {
          if (encounterPath.length === 1) {
            setEncounter(null);
            setEncounterRoutes([]);
            setActiveEncounterId(null);
            setEncounterPath([]);
            setSelectedRootEncounterId("");
          }
        } else {
          if (encounterPath.length === 1) {
            setSelectedRootEncounterId(activeEncounterId.toString());
          }
        }
      }
    } catch (err) {
      console.error('Error fetching root encounters:', err);
      setError('Failed to fetch root encounters');
      setRootEncounters([]);
    }
  };

  const handleNavigateUp = () => {
    if (encounterPath.length > 1) {
      // Parent is the second to last item in the path
      const parentEncounterId = encounterPath[encounterPath.length - 2];
      loadEncounter(parentEncounterId, { isNavigatingUp: true });
    } else {
      console.warn('Cannot navigate up from root level.');
    }
  };

  const navigateToBreadcrumb = (index) => {
    if (index >= 0 && index < encounterPath.length) {
      const targetEncounterId = encounterPath[index];
      // Only navigate if it's not the last item (current encounter)
      if (index < encounterPath.length - 1) {
        loadEncounter(targetEncounterId, { breadcrumbIndex: index });
      } else {
      }
    } else {
      console.error(`Invalid breadcrumb index: ${index}`);
    }
  };

  const createBlankEncounter = async () => {
    if (!userSub) {
      setError('User not authenticated');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const responseData = await encounterService.createBlankEncounter(); // Use service
      const newEncounterId = responseData.encounterId;

      await new Promise(resolve => setTimeout(resolve, 100)); 
      
      await fetchRootEncountersFromComponent(); 
      
      await loadEncounter(newEncounterId, { isNewRoot: true });
      
    } catch (err) {
      const statusCode = err.response?.status;
      const responseData = err.response?.data;
      console.error('Error creating blank encounter:', err);
      setError(`Failed to create new scenario (${statusCode || 'Network Error'}): ${responseData?.error || err.message}`);
    } finally {
      // setLoading(false) is handled by the loadEncounter function
    }
  };

  // Reusable confirm helper (borrowed from LectureManager)
  const askConfirmation = (message, onConfirmFn) => {
    setConfirmState({ open: true, message, onConfirm: () => {
      setConfirmState({ open: false, message: '', onConfirm: null });
      onConfirmFn();
    }});
  };

  // --------------------- NEW: Delete Scenario ---------------------
  const deleteRootScenario = async () => {
    if (!selectedRootEncounterId) {
      // Should never happen due to disabled button, but guard anyway
      return;
    }
    askConfirmation('This will permanently delete the selected scenario and ALL of its nested slides and choices. This action cannot be undone. Continue?', async () => {
      setLoading(true);
      setError(null);

      try {
        await encounterService.deleteRootEncounter(parseInt(selectedRootEncounterId, 10)); // Use service

        // Refresh root encounter list
        await fetchRootEncountersFromComponent();

        // If the deleted scenario was the active one, clear the editor state
        if (encounterPath.length && encounterPath[0] === parseInt(selectedRootEncounterId, 10)) {
          setEncounter(null);
          setEncounterRoutes([]);
          setActiveEncounterId(null);
          setEncounterPath([]);
          setSelectedRootEncounterId("");
          setEncounterCache({});
        }

      } catch (err) {
        console.error('Error deleting scenario:', err);
        const status = err.response?.status;
        const message = err.response?.data?.error || err.message;
        setError(`Failed to delete scenario (${status || 'Network Error'}): ${message}`);
      } finally {
        setLoading(false);
      }
    });
  };

  const updateEncounterField = async (field, value) => {
    if (!activeEncounterId || !userSub) return;
    
    // Optimistically update local state first so the UI keeps in sync
    setEncounter(prev => ({
      ...prev,
      [field]: value
    }));

    // NEW: keep the local cache in sync so future loads reflect the change
    setEncounterCache(prev => {
      if (!prev[activeEncounterId]) {
        return {
          ...prev,
          [activeEncounterId]: {
            encounter: { [field]: value },
            routes: encounterRoutes
          }
        };
      }
      return {
        ...prev,
        [activeEncounterId]: {
          ...prev[activeEncounterId],
          encounter: {
            ...prev[activeEncounterId].encounter,
            [field]: value
          }
        }
      };
    });

    // Persist the change in the background
    encounterService.updateEncounterField(activeEncounterId, field, value) // Use service
      .catch((err) => {
        console.error('Error updating encounter field:', err);
        setError(`Failed to update ${field}: ${err.message}`); // Display service error message
      });
  };

  const createEncounterChoice = async () => {
    if (!activeEncounterId || !userSub) return;
    
    try {
      const newChoiceData = await encounterService.createEncounterChoice(activeEncounterId); // Use service
      
      // Add the new choice to the routes array
      const newChoice = {
        ID: newChoiceData.ID, // Assuming service returns the new choice object or at least its ID
        Title: newChoiceData.Title || "", // Use data from service if available
        RelID_Encounter_Calling: activeEncounterId,
        RelID_Encounter_Receiving: null
      };
      
      setEncounterRoutes(prev => [...prev, newChoice]);
    } catch (err) {
      console.error('Error creating encounter choice:', err);
      setError(`Failed to create new choice: ${err.message}`); // Display service error message
    }
  };

  const updateEncounterChoice = async (choiceId, title) => {
    if (!userSub) return;
    try {
      await encounterService.updateEncounterChoice(choiceId, title); // Use service
      
      // Update the local state
      setEncounterRoutes(prev =>
        prev.map(route =>
          route.ID === choiceId ? { ...route, Title: title } : route
        )
      );
    } catch (err) {
      console.error('Error updating encounter choice:', err);
      setError('Failed to update choice');
    }
  };

  const deleteEncounterChoice = async (choiceId) => {
    if (!userSub) return;
    try {
      await encounterService.deleteEncounterChoice(choiceId); // Use service
      
      // Remove the choice from local state
      setEncounterRoutes(prev => 
        prev.filter(route => route.ID !== choiceId)
      );
    } catch (err) {
      console.error('Error deleting encounter choice:', err);
      setError('Failed to delete choice');
    }
  };

  const setReceivingEncounter = async (routeId, receivingEncounterId) => {
    if (!userSub) {
      return Promise.reject(new Error('User not authenticated'));
    }
    
    // Store the current encounter ID (the parent) before making changes
    const parentEncounterId = activeEncounterId; 
    if (!parentEncounterId) {
      return Promise.reject(new Error('Parent encounter ID is missing'));
    }
    
    setLoading(true); // Indicate loading during API call and refetch
    setError(null);
    
    try {
      // 1. Update the link on the server
      // await axios({
      //   method: 'post',
      //   url: 'encounters/set-receiving-encounter',
      //   data: {
      //     RouteID: routeId,
      //     selectedEncounterID: receivingEncounterId
      //   },
      //   withCredentials: true,
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'x-user-sub': userSub
      //   }
      // });
      await encounterService.linkEncounterToRoute(routeId, receivingEncounterId); // Use service
      
      // 2. Refetch the parent encounter data to get the updated routes
      // const response = await axios({
      //   method: 'get',
      //   url: `encounters/GetEncounterData/${parentEncounterId}`,
      //   withCredentials: true,
      //   headers: { 'x-user-sub': userSub },
      //   params: { _t: new Date().getTime() } // Cache buster
      // });
      const parentDataResponse = await encounterService.getEncounterData(parentEncounterId); // Already uses service, ensure this is correct

      // const parentEncounterData = response.data.Encounter;
      // const parentRoutesData = response.data.EncounterRoutes || [];
      const parentEncounterData = parentDataResponse.Encounter;
      const parentRoutesData = parentDataResponse.EncounterRoutes || [];

      // 3. Update the cache for the parent encounter
      setEncounterCache(prev => ({ 
        ...prev, 
        [parentEncounterId]: { 
          encounter: parentEncounterData, 
          routes: parentRoutesData 
        } 
      }));

      // 4. Update the local state for the currently viewed encounter (which is the parent)
      setEncounterRoutes(parentRoutesData);
      
      return Promise.resolve();
      
    } catch (err) {
      const statusCode = err.response?.status;
      const responseData = err.response?.data;
      // const operation = err.config?.url?.includes('set-receiving') ? 'link/unlink route' : 'refetch parent';
      // Determine operation based on which call failed, though service error messages are now primary
      const operation = 'link/unlink route or refetch parent'; 
      
      console.error(`Error during ${operation}:`, err);
      // setError(`Failed to ${receivingEncounterId ? 'link' : 'unlink'} encounter (${operation} - ${statusCode || 'Network Error'}): ${responseData?.error || err.message}`);
      setError(`Operation failed: ${err.message}`); // Use service error message
      
      return Promise.reject(err);
    } finally {
      setLoading(false);
    }
  };

  const createNewFromCurrent = async (routeId) => {
    if (!activeEncounterId || !userSub) {
      setError('Missing required data to create new encounter');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // 1. Duplicate the current encounter
      const duplicateData = await encounterService.duplicateEncounter(activeEncounterId); // Use service
      const newEncounterId = duplicateData.newEncounterId;
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 2. Link the route to the new encounter
      await setReceivingEncounter(routeId, newEncounterId);
        
      // 3. Load the new encounter
      await loadEncounter(newEncounterId, { isFollowingLink: true });
      
    } catch (err) {
      const statusCode = err.response?.status;
      const responseData = err.response?.data;
      
      console.error(`Error during duplicate encounter:`, err);
      setError(`Operation failed: ${err.message}`); // Use service error message
      if (statusCode === 401) {
        loadEncounter(activeEncounterId); // Reload current state
      }
    } finally {
      // setLoading(false) is handled by loadEncounter
    }
  };

  const fetchUnlinkedEncounters = async () => {
    try {
      return await encounterService.fetchUnlinkedEncounters(); // Use service
    } catch (err) {
      console.error('Error fetching unlinked encounters:', err);
      setError(`Failed to fetch unlinked encounters: ${err.message}`); // Display service error
      return [];
    }
  };

  const handleRootEncounterSelect = (e) => {
    const selectedEncounterId = e.target.value;
    // Update dropdown state immediately for responsiveness
    setSelectedRootEncounterId(selectedEncounterId);
    
    if (selectedEncounterId) {
      const parsedId = parseInt(selectedEncounterId);
      // Load the selected root encounter
      loadEncounter(parsedId, { isNewRoot: true }); 
    } else {
      // Clear encounter data when "Select a scenario" is chosen
      setEncounter(null);
      setEncounterRoutes([]);
      setActiveEncounterId(null);
      setEncounterPath([]);
      setEncounterCache({}); // Optionally clear cache when deselecting root
    }
  };

  // Helper method to determine the status class for an encounter
  const getEncounterStatusClass = (encounterId) => {
    // If it's the current encounter, we have the data already
    if (encounterId === activeEncounterId && encounterRoutes) {
      if (encounterRoutes.length === 0) {
        return 'status-red'; // No choices
      } else if (encounterRoutes.some(route => !route.RelID_Encounter_Receiving)) {
        return 'status-yellow'; // Some unlinked choices
      } else {
        return 'status-green'; // All choices linked
      }
    }
    
    // Check if we have cached data for this encounter
    if (encounterCache[encounterId]) {
      const cachedRoutes = encounterCache[encounterId].routes;
      if (cachedRoutes.length === 0) {
        return 'status-red'; // No choices
      } else if (cachedRoutes.some(route => !route.RelID_Encounter_Receiving)) {
        return 'status-yellow'; // Some unlinked choices
      } else {
        return 'status-green'; // All choices linked
      }
    }
    
    // No cached data available
    return 'status-default';
  };

  // Helper method to get encounter title
  const getEncounterTitle = (encounterId) => {
    if (encounterId === activeEncounterId && encounter) {
      return encounter.Title;
    }
    
    // Check cache first
    if (encounterCache[encounterId] && encounterCache[encounterId].encounter) {
      return encounterCache[encounterId].encounter.Title;
    }
    
    // Try to find the title in root encounters
    const rootEncounter = rootEncounters.find(e => e.ID === encounterId);
    if (rootEncounter) {
      return rootEncounter.Title;
    }
    
    return `Encounter #${encounterId}`;
  };

  // Add function to check authentication state
  const checkAuthState = async () => {
    console.log('Checking auth state...');
    console.log('Auth context state', { 
      userSub: userSub ? `${userSub.substring(0, 8)}...` : 'null',
      isAuthenticated: !!userSub,
      axiosDefaults: { withCredentials: axios.defaults.withCredentials, hasUserSubHeader: !!axios.defaults.headers.common['x-user-sub'] }
    });
    try {
      const profileResponse = await encounterService.getUserProfileStatus(); // Use service
      console.log('Profile status check succeeded', profileResponse);
    } catch (err) {
      console.error('Profile status check failed', { error: err.message, status: err.response?.status, data: err.response?.data });
    }
    const cookies = document.cookie.split(';').map(c => c.trim());
    console.log('Available cookies', cookies.length ? cookies : 'No cookies accessible to JavaScript');
  };

  // Add function to make a test request to help debug
  const testCreateRequest = async () => {
    console.log('Making test create request...');
    if (!userSub) {
      console.error('Cannot test: userSub not available');
      return;
    }
    
    try {
      const testResponseData = await encounterService.createBlankEncounter(); // Use service for test
      
      console.log('Test create succeeded!', { responseData: testResponseData });
      fetchRootEncountersFromComponent();
    } catch (err) {
      const responseData = err.response?.data; // This might not be available if service throws generic error
      const statusCode = err.response?.status; // Same here
      
      console.error('Test create failed', { 
        error: err.message, // Use error message from service
        status: statusCode, 
        responseData, 
        // requestConfig: { url: err.config?.url, method: err.config?.method, withCredentials: err.config?.withCredentials, headers: { contentType: err.config?.headers['Content-Type'], userSub: err.config?.headers['x-user-sub']?.substring(0, 8) + '...' } }
      });
    }
  };

  // Monitor encounter path changes to keep the dropdown selection in sync
  useEffect(() => {
    if (encounterPath.length === 0 || !rootEncounters) return;
    
    // The first item in the path is the root encounter
    const rootEncounterId = encounterPath[0];
    
    // Check if this is a root encounter in our list
    const isInRootList = rootEncounters.some(e => e.ID === rootEncounterId);
    
    if (isInRootList) {
      // Update the dropdown selection if we're viewing a root encounter
      setSelectedRootEncounterId(rootEncounterId.toString());
    }
  }, [encounterPath, rootEncounters]);

  // Unified function to load encounter data and update state
  const loadEncounter = async (id, { isNewRoot = false, isFollowingLink = false, isNavigatingUp = false, breadcrumbIndex = -1 } = {}) => {
    if (!id || !userSub) {
      setError('Cannot load encounter: Missing ID or user authentication.');
      return;
    }
    
    if (id === activeEncounterId && !isNewRoot) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check cache first, unless it's a new root selection (we might want fresh data)
      if (!isNewRoot && encounterCache[id]) {
        const cachedData = encounterCache[id];
        
        setEncounter(cachedData.encounter);
        setEncounterRoutes(cachedData.routes || []);
        setActiveEncounterId(id);
        
        // Update path based on context
        setEncounterPath(prev => {
          let newPath;
          if (isFollowingLink) newPath = [...prev, id];
          else if (isNavigatingUp) newPath = prev.slice(0, -1);
          else if (breadcrumbIndex !== -1) newPath = prev.slice(0, breadcrumbIndex + 1);
          else newPath = [id]; // Default/fallback: treat as root/reset
          return newPath;
        });

      } else {
        // Fetch from server
        const encounterDataResponse = await encounterService.getEncounterData(id);
        
        const encounterData = encounterDataResponse.Encounter;
        const routesData = encounterDataResponse.EncounterRoutes || [];

        setEncounter(encounterData);
        setEncounterRoutes(routesData);
        setActiveEncounterId(id);
        
        // Update cache
        setEncounterCache(prev => ({ ...prev, [id]: { encounter: encounterData, routes: routesData } }));
        
        // Update path based on context
        setEncounterPath(prev => {
          let newPath;
          if (isNewRoot) newPath = [id];
          else if (isFollowingLink) newPath = [...prev, id];
          else if (isNavigatingUp) newPath = prev.slice(0, -1);
          else if (breadcrumbIndex !== -1) newPath = prev.slice(0, breadcrumbIndex + 1);
          else newPath = [id]; // Default/fallback
          return newPath;
        });
      }
      
      // If this was a new root selection, update the dropdown
      if (isNewRoot) {
        setSelectedRootEncounterId(id.toString());
      }

    } catch (err) {
      const statusCode = err.response?.status;
      const responseData = err.response?.data;
      console.error(`Error loading encounter ${id}:`, err);
      setError(`Failed to load encounter (${statusCode || 'Network Error'}): ${responseData?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="storyline-editor">
      <div className="storyline-controls">
        <div className="control-item">
          <button onClick={createBlankEncounter} className="btn btn-primary">
            Create New Scenario
          </button>
        </div>
        <div className="control-item">
          <select 
            className="root-encounter-dropdown" 
            onChange={handleRootEncounterSelect}
            value={selectedRootEncounterId}
          >
            <option value="">Select a scenario</option>
            {rootEncounters?.map(encounter => (
              <option key={encounter.ID} value={encounter.ID}>
                {encounter.Title || `Scenario #${encounter.ID}`}
              </option>
            ))}
          </select>
        </div>
        <div className="control-item">
          <button 
            onClick={handleNavigateUp}
            className="btn"
            disabled={encounterPath.length <= 1}
          >
            Up one level
          </button>
        </div>
        <div className="control-item">
          <button
            onClick={deleteRootScenario}
            className="btn btn-danger"
            disabled={!selectedRootEncounterId || loading}
          >
            Delete Scenario
          </button>
        </div>
      </div>

      {encounterPath.length > 0 && (
        <div className="visual-breadcrumb-trail">
          {encounterPath.map((id, index) => (
            <React.Fragment key={id}>
              {index > 0 && (
                <div className="breadcrumb-arrow">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              <button
                className={`breadcrumb-circle ${index === encounterPath.length - 1 ? 'active' : ''} ${
                  getEncounterStatusClass(id)
                }`}
                onClick={() => navigateToBreadcrumb(index)}
                title={getEncounterTitle(id) || `Slide ${index + 1}`}
              >
                {index + 1}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error">{error}</div>}

      {/* Confirmation modal */}
      <ConfirmationModal
        open={confirmState.open}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState({ open: false, message: '', onConfirm: null })}
      />

      {encounter && (
        <div className="encounter-editor">
          <div className="editor-row">
            <div className="encounter-form-section">
              <EncounterForm
                scenario={encounter}
                onUpdateField={updateEncounterField}
              />
            </div>
            <div className="encounter-routes-section">
              <button onClick={createEncounterChoice} className="btn">
                Add Choice
              </button>
              <EncounterRoutes
                routes={encounterRoutes}
                onPersistChoice={updateEncounterChoice}
                onDeleteChoice={deleteEncounterChoice}
                onLinkEncounter={setReceivingEncounter}
                onCreateNewEncounter={createNewFromCurrent}
                fetchUnlinkedEncounters={fetchUnlinkedEncounters}
                // Pass loadEncounter for the follow action
                onFollowLink={(id) => loadEncounter(id, { isFollowingLink: true })}
              />
            </div>
          </div>
          <div className="image-selector-section">
            <h3>Encounter Images</h3>
            {/* Image note removed per request */}
            <div className="image-selectors-row">
              <ImageSelector
                label="Left Character"
                type="character"
                encounterId={activeEncounterId}
                currentImageId={encounter.ImageCharacter1}
                onImageSelected={(imageId) => updateEncounterField('ImageCharacter1', imageId)}
                disableUpload={true}
              />
              <ImageSelector
                label="Backdrop"
                type="backdrop"
                encounterId={activeEncounterId}
                currentImageId={encounter.ImageBackdrop}
                onImageSelected={(imageId) => updateEncounterField('ImageBackdrop', imageId)}
                disableUpload={true}
              />
              <ImageSelector
                label="Right Character"
                type="character"
                encounterId={activeEncounterId}
                currentImageId={encounter.ImageCharacter2}
                onImageSelected={(imageId) => updateEncounterField('ImageCharacter2', imageId)}
                disableUpload={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorylineEditor;