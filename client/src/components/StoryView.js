import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEncounter } from '../contexts/EncounterContext';
import CharacterImage from './CharacterImage';
import BackdropImage from './BackdropImage';
import ChoiceButtons from './ChoiceButtons';
import ErrorMessage from './ErrorMessage';
import axios from 'axios';

// New: Component for scenario selection dropdown
const ScenarioSelector = ({ scenarios, selectedScenarioId, onChange }) => {
  return (
    <div className="scenario-selector">
      <div className="control-item">
        <select value={selectedScenarioId} onChange={onChange}>
          <option value="">Select a Scenario</option>
          {scenarios.map((scenario) => (
            <option key={scenario.ID} value={scenario.ID}>
              {scenario.Title || `Scenario ${scenario.ID}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const StoryView = () => {
  const { 
    currentEncounter, 
    encounterRoutes, 
    loading, 
    error, 
    handleRouteSelection: contextHandleRouteSelection, 
    fetchEncounterData,
    goBack: contextGoBack,
    canGoBack,
    resetHistory
  } = useEncounter();

  // Local loading state to control transitions
  const [localLoading, setLocalLoading] = useState(false);
  
  // Track image loading states
  const [imagesLoaded, setImagesLoaded] = useState(true);
  const [preloadingImages, setPreloadingImages] = useState(false);
  const preloadedImagesRef = useRef(new Set());

  // Track when we're initiating a transition from this component
  const [initiatingTransition, setInitiatingTransition] = useState(false);

  /* --------------------------------------------------
    Cross-fade transition state (mirrors /encounters2)
  ---------------------------------------------------*/
  const FADE_TRANSITION_DURATION_MS = 600;
  const [previousEncounter, setPreviousEncounter] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Handle context loading changes
  useEffect(() => {
    // Only update local loading when we're not in the middle of a transition
    if (!initiatingTransition) {
      setLocalLoading(loading);
    }
  }, [loading, initiatingTransition]);

  // Handle encounter changes
  useEffect(() => {
    // When a new encounter arrives during a transition we initiated,
    // finish the transition sequence
    if (initiatingTransition && currentEncounter && !localLoading) {
      setInitiatingTransition(false);
    }
  }, [currentEncounter, localLoading, initiatingTransition]);

  // Local state for scenario dropdown
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');

  // Fetch list of root encounters (scenarios) - Public list
  useEffect(() => {
    const fetchScenarios = async () => {
      console.log('[StoryView] Fetching public list of all root encounters...');
      try {
        const { data } = await axios.get('/root-encounters', {
          // No auth headers needed
          params: { 
            _t: new Date().getTime(), // Cache buster
            scope: 'public' // Explicitly request the public list
          } 
        });
        if (Array.isArray(data)) {
          console.log(`[StoryView] Received ${data.length} public scenarios.`);
          setScenarios(data);
        } else {
          console.error('[StoryView] Invalid scenario data received:', data);
          setScenarios([]);
        }
      } catch (err) {
        console.error('[StoryView] Failed to fetch scenarios:', err);
        setScenarios([]); 
      }
    };

    fetchScenarios();
  }, []);

  // Handle scenario change
  const handleScenarioChange = (e) => {
    const scenarioId = e.target.value;
    setSelectedScenarioId(scenarioId);
    if (scenarioId) {
      // When switching to a brand-new scenario, wipe any old encounter history
      // so that the back button reflects only the current storyline.
      resetHistory();
      fetchEncounterData(parseInt(scenarioId, 10));
    }
  };

  // Preload images from an encounter to ensure smooth transitions
  const preloadEncounterImages = useCallback((encounter) => {
    if (!encounter) return Promise.resolve();
    
    // Don't preload images we've already loaded
    const imagesToLoad = [];
    
    // Extract image URLs from HTML strings
    const extractImageUrl = (html) => {
      if (!html) return null;
      const match = html.match(/src="([^"]+)"/);
      return match ? match[1] : null;
    };
    
    // Check backdrop image
    const backdropUrl = extractImageUrl(encounter.BackdropImage);
    if (backdropUrl && !preloadedImagesRef.current.has(backdropUrl)) {
      imagesToLoad.push(backdropUrl);
    }
    
    // Check character images
    const char1Url = extractImageUrl(encounter.Character1Image);
    if (char1Url && !preloadedImagesRef.current.has(char1Url)) {
      imagesToLoad.push(char1Url);
    }
    
    const char2Url = extractImageUrl(encounter.Character2Image);
    if (char2Url && !preloadedImagesRef.current.has(char2Url)) {
      imagesToLoad.push(char2Url);
    }
    
    // If no images to load, return immediately
    if (imagesToLoad.length === 0) {
      return Promise.resolve();
    }
    
    // Set loading state
    setPreloadingImages(true);
    setImagesLoaded(false);
    
    // Preload all images
    const promises = imagesToLoad.map(url => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          preloadedImagesRef.current.add(url);
          resolve();
        };
        img.onerror = () => {
          // Still resolve on error, but don't add to preloaded set
          resolve();
        };
        img.src = url;
      });
    });
    
    // Wait for all images to load
    return Promise.all(promises).then(() => {
      setPreloadingImages(false);
      setImagesLoaded(true);
    });
  }, []);

  // Preload images when an encounter changes
  useEffect(() => {
    if (currentEncounter) {
      preloadEncounterImages(currentEncounter);
    }
  }, [currentEncounter, preloadEncounterImages]);

  /* --------------------------------------------------
    Route selection & back navigation with transition
  ---------------------------------------------------*/
  const handleSelectRoute = (routeId) => {
    // Store current encounter for fade out
    if (currentEncounter) {
      // First fetch the new encounter data without transition
      contextHandleRouteSelection(routeId);
      setInitiatingTransition(true);
      
      // The transition will be triggered after images are loaded
      // via the useEffect that watches for currentEncounter and imagesLoaded
    }
  };

  const handleGoBack = () => {
    // Store current encounter for fade out
    if (currentEncounter) {
      // First fetch the new encounter data without transition
      contextGoBack();
      setInitiatingTransition(true);
      
      // The transition will be triggered after images are loaded
      // via the useEffect that watches for currentEncounter and imagesLoaded
    }
  };

  // Start transition when new encounter is ready AND images are loaded
  useEffect(() => {
    if (initiatingTransition && currentEncounter && imagesLoaded && !isTransitioning) {
      // Now start the transition since images are loaded
      setPreviousEncounter(currentEncounter);
      setIsTransitioning(true);
    }
  }, [currentEncounter, imagesLoaded, initiatingTransition, isTransitioning]);

  // End transition after fade duration
  useEffect(() => {
    if (isTransitioning) {
      const t = setTimeout(() => {
        setIsTransitioning(false);
        setPreviousEncounter(null);
      }, FADE_TRANSITION_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [isTransitioning]);

  // Utility to render an encounter block (re-used for prev & current)
  const renderEncounterBlock = (enc) => (
    <>
      <BackdropImage backdropHtml={enc.BackdropImage} />
      <div className="character-images">
        {enc.Character1Image && (
          <CharacterImage position="left" characterHtml={enc.Character1Image} />
        )}
        {enc.Character2Image && (
          <CharacterImage position="right" characterHtml={enc.Character2Image} />
        )}
      </div>
      <div className="encounter-content" style={{ position: 'relative', zIndex: 50, backgroundColor: 'rgba(0, 0, 0, 0.7)' }}>
        <h1 className="encounter-title" style={{ position: 'relative', zIndex: 51 }}>{enc.Title}</h1>
        <p className="encounter-description" style={{ position: 'relative', zIndex: 51 }}>{enc.Description}</p>
        {enc === currentEncounter && (
          <ChoiceButtons routes={encounterRoutes} onSelectRoute={handleSelectRoute} />
        )}
      </div>
    </>
  );

  useEffect(() => {
    // Set page title when component mounts
    document.title = "Single Player Game Mode";
    
    // Add class to body for CSS targeting
    document.body.classList.add('single-player-game-active');
    
    // Reset title when component unmounts
    return () => {
      document.title = "Viral Valor";
      document.body.classList.remove('single-player-game-active');
    };
  }, []);

  /* -------------------------------------------------------------
    Auto‐shrink text inside the encounter box so it never overflows
    its container (80% height of StoryView). Mirrors logic used in
    EncounterDisplay for consistency across modes.
  ---------------------------------------------------------------*/
  const adjustTextFit = useCallback(() => {
    const contentEl = document.querySelector('.story-view .encounter-content');
    if (!contentEl) return;

    const titleEl = contentEl.querySelector('.encounter-title');
    const descEl  = contentEl.querySelector('.encounter-description');
    if (!descEl || !titleEl) return;

    // Reset any inline sizing first
    titleEl.style.fontSize = '';
    descEl.style.fontSize  = '';

    // Get computed starting sizes (px)
    let titleSize = parseFloat(window.getComputedStyle(titleEl).fontSize);
    let descSize  = parseFloat(window.getComputedStyle(descEl ).fontSize);

    // Shrink stepwise until the content fits or minimum reached
    const MIN_DESC  = 6;  // px – allow very small but readable sizes
    const MIN_TITLE = 8;
    const STEP = 0.5;

    let guard = 0;
    const MAX_ITER = 100;
    while (guard < MAX_ITER && contentEl.scrollHeight > contentEl.clientHeight) {
      guard++;
      if (descSize <= MIN_DESC) break;

      descSize  = Math.max(descSize  - STEP, MIN_DESC);
      titleSize = Math.max(titleSize - STEP, MIN_TITLE);

      titleEl.style.fontSize = `${titleSize}px`;
      descEl.style.fontSize  = `${descSize}px`;
    }
  }, []);

  // Run shrink logic whenever encounter changes or window resizes
  useEffect(() => {
    const t = setTimeout(adjustTextFit, 100); // allow assets to load
    window.addEventListener('resize', adjustTextFit);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', adjustTextFit);
    };
  }, [currentEncounter, adjustTextFit]);

  // Show blank state until a scenario is chosen
  const isScenarioSelected = Boolean(selectedScenarioId);

  if (error && isScenarioSelected) {
    return (
      <ErrorMessage
        message={error}
        onRetry={() => fetchEncounterData(parseInt(selectedScenarioId, 10))}
      />
    );
  }

  return (
    <div className="story-view">
      {/* Scenario selection dropdown */}
      <ScenarioSelector
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        onChange={handleScenarioChange}
      />
      
      {/* Render encounter only when a scenario has been chosen */}
      {isScenarioSelected && (
        <>
          {/* Back button */}
          <button 
            className="btn back-btn" 
            onClick={handleGoBack} 
            disabled={!canGoBack}
          >
            ← Back
          </button>

          {/* Previous encounter fading out */}
          {isTransitioning && previousEncounter && (
            <div className="encounter-container previous fade-out">
              {renderEncounterBlock(previousEncounter)}
            </div>
          )}

          {/* Current encounter */}
          {currentEncounter && (
            <div className="encounter-container current">
              {renderEncounterBlock(currentEncounter)}
            </div>
          )}
        </>
      )}

      {/* Blank state message */}
      {!isScenarioSelected && (
        <div className="blank-state-message">
          Please select a scenario to begin...
        </div>
      )}
    </div>
  );
};

export default StoryView; 