import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop component that scrolls the window to the top whenever
 * the pathname changes in the browser URL.
 */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll to top when path changes
    window.scrollTo(0, 0);
    
    // Log navigation for debugging
    console.log(`Navigated to: ${pathname}`);
  }, [pathname]);

  return null; // This component doesn't render anything
}

export default ScrollToTop; 