import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Import your page components. Paths may need adjustment based on your actual file structure.
// Some of these are placeholders or inferred from App.js and may need correction.
import HomePage from './components/HomePage';
import EducatorPanel from './components/EducatorPanel';
import MobilePoll from './components/MobilePoll';
import CompleteProfile from './components/CompleteProfile';
import PresentationLanding from './components/PresentationLanding';
import PresentationEnd from './components/PresentationEnd';
import PresentationDisplayHost from './components/PresentationDisplayHost';
// SiteHealthDisplay is now rendered within HomePage, so direct import here is not needed for routing.
// import SiteHealthDisplay from './views/Admin/SiteHealthDisplay'; 
// Ensure ProtectedRoute is imported if it's used directly here, or assume it's applied in App.js structure
import { useAuth0 } from '@auth0/auth0-react'; // For ProtectedRoute logic if replicated
import { useAuth } from './contexts/AuthContext';   // For ProtectedRoute logic if replicated

// Re-define or import ProtectedRoute if you want to use it directly within this file.
// For simplicity, this example assumes ProtectedRoute is handled in the App.js structure
// or that these routes are structured to be conditionally rendered based on auth state there.
// If ProtectedRoute is essential PER ROUTE here, it needs to be defined or imported.

// Simple Protected Route component (copied from App.js for self-containment if needed, or import from a shared util)
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isLoading } = useAuth0();
  const { isAdmin, profileComplete } = useAuth(); // Assuming useAuth provides these

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }
  if (!isAuthenticated) {
    // Could redirect to login or show a message
    // return <Navigate to="/login" replace />; // Example redirect
    return <div>Please log in to access this page.</div>;
  }
  if (profileComplete === null) {
    return <div className="loading">Checking profile…</div>;
  }
  if (profileComplete === false) {
    return <Navigate to="/?tab=profile" replace />;
  }
  if (requireAdmin && !isAdmin) {
    return <div>You need admin access for this page.</div>;
  }
  return children;
};


const RoutesWithEncounter = () => {
  return (
    <Routes>
      {/* Public routes that still need EncounterContext (if any) */}
      <Route path="/" element={<HomePage />} />
      <Route path="/poll" element={<MobilePoll />} />
      <Route path="/game/:gameId/poll" element={<MobilePoll />} />

      {/* Profile routes */}
      <Route
        path="/complete-profile"
        element={
          <ProtectedRoute>
            <CompleteProfile />
          </ProtectedRoute>
        }
      />

      {/* Single-player game route now uses PresentationDisplayHost in single-player mode */}
      <Route path="/game" element={<PresentationDisplayHost isSinglePlayerMode={true} />} />

      {/* Protected routes requiring authentication and EncounterContext */}
      <Route path="/multiplayer" element={<EducatorPanel />} /> 
      <Route
        path="/educator-panel"
        element={
          <ProtectedRoute>
            <EducatorPanel />
          </ProtectedRoute>
        }
      />
      {/* EncounterDisplayPlaceholder might be for a route that uses EncounterContext */}
      {/* If /encounter-display is NOT the presentation mode, include it here */}
      {/* From App.js, EncounterDisplayPlaceholder was used for /encounter-display */}
      {/* <Route 
        path="/encounter-display" 
        element={
          <ProtectedRoute>
            <EncounterDisplayPlaceholder /> // Placeholder component
          </ProtectedRoute>
        } 
      /> */}

      {/* Admin Routes */}
      {/* Route for Site Health removed, now handled as a tab in HomePage 
      <Route 
        path="/admin/site-health" 
        element={ 
          <ProtectedRoute requireAdmin={true}>
            <SiteHealthDisplay />
          </ProtectedRoute>
        }
      />
      */}

      {/* Routes for encounters, assuming they need EncounterContext */}
      

      {/* UUID-based game routes, assuming they need EncounterContext */}
      <Route
        path="/game/:gameId/encounter/:id"
        element={
          <ProtectedRoute>
            <PresentationDisplayHost isSinglePlayerMode={true} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game/:gameId/educator-panel"
        element={
          <ProtectedRoute>
            <EducatorPanel />
          </ProtectedRoute>
        }
      />
      
      {/* Routes related to presentation flow, but not the display host itself if they need context */}
      {/* For example, setup or landing pages before launching the /presentation-display which is context-free */}
      <Route path="/presentation-landing" element={<PresentationLanding />} />
      <Route path="/presentation-end" element={<PresentationEnd />} />

      {/* Add a catch-all or default route for paths handled by RoutesWithEncounter */}
      {/* This example redirects to home, adjust as needed */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default RoutesWithEncounter; 