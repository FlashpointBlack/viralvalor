import React, { useRef } from 'react';
import './PresentationLanding.css';

const PresentationLanding = ({ disableAutoNavigate = false }) => {
  const containerRef = useRef(null);

  // Helper: toggle fullscreen on double-click
  const toggleFullscreen = () => {
    try {
      const elem = document.documentElement;
      if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
          elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  return (
    <div
      className="presentation-landing-container"
      ref={containerRef}
      onDoubleClick={toggleFullscreen}
    >
      <h1 className="presentation-welcome">Welcome to an exciting Viral Valor powered presentation!</h1>
      <img src="/images/QRCode.png" alt="Join presentation QR code" className="presentation-qr" />
    </div>
  );
};

export default PresentationLanding; 