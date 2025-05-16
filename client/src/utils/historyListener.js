import { createBrowserHistory } from 'history';

// Create a singleton history object that all components can use
const history = createBrowserHistory();

// Listen for history changes
history.listen(({ location, action }) => {
  console.log(
    `Navigation ${action} to ${location.pathname}${location.search}${location.hash}`
  );
});

// Handle the initial page load to ensure we start with a clean history
const handleInitialNavigation = () => {
  const currentPath = window.location.pathname + window.location.search;
  console.log('Initial navigation path:', currentPath);
};

// Call once during app initialization
handleInitialNavigation();

export default history; 