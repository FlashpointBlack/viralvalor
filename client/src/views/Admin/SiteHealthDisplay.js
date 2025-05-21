import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SiteHealthDisplay.css'; // We'll create this for styling

const serviceEndpoints = [
  { name: 'Authentication', endpoint: 'auth/health', group: 'Core Services', details: "Verifies that the authentication service's API endpoint (/api/auth/health) is reachable and responding. A green light means the server successfully processed a request, confirming the service's auth-related routes are loaded and active. This check does not test the connection to the external identity provider (e.g., Auth0), only the application's own auth router." },
  { name: 'User Accounts', endpoint: 'users/health', group: 'Core Services', details: "Verifies that the User Accounts API endpoint (/api/users/health) is reachable and responding. A green light signifies that the server successfully processed a request, confirming that user-related API routes are loaded and the module is active. This check does not perform database queries (e.g., to UserAccounts table) but confirms the API's basic responsiveness." },
  { name: 'Uploads', endpoint: 'uploads/health', group: 'Core Services', details: "Confirms that the API service responsible for handling file uploads (/api/uploads/health) is active and responding. A green light means the server processed the request. This check doesn't attempt an actual file upload or verify disk space/permissions; it only ensures the upload API endpoints are live and the module is loaded." },
  { name: 'Lectures', endpoint: 'lectures/health', group: 'Content Services', details: "Confirms that the main API routing system has a responsive endpoint for /api/lectures/health. A green light means the server successfully processed this request, indicating general API health and specific route availability for lectures. This check is handled directly by the main API router." },
  { name: 'Encounters', endpoint: 'encounters/health', group: 'Content Services', details: "Verifies that the API service for managing story encounters (/api/encounters/health) is active and responding. A green light means the server processed a request, confirming this module is live and its routes are loaded. It does not check database connections or specific encounter data." },
  { name: 'Questions', endpoint: 'questions/health', group: 'Content Services', details: "Ensures the Question Bank API service (/api/questions/health) is reachable and responsive. A green light indicates the server successfully handled a request, confirming the question module's basic operation and that its routes are loaded. It doesn't query the question database." },
  { name: 'Characters', endpoint: 'characters/health', group: 'Content Assets', details: "Verifies that the API service for game characters (/api/characters/health) is active and responding. A green light means the server processed a request, confirming this module is live and its routes are loaded." },
  { name: 'Backdrops', endpoint: 'backdrops/health', group: 'Content Assets', details: "Ensures the API service for managing visual backdrops (/api/backdrops/health) is reachable and responsive. A green light signifies that a request was successful, meaning the backdrop module is active and its routes are loaded." },
  { name: 'Badges', endpoint: 'badges/health', group: 'Content Assets', details: "Verifies that the API service for managing user badges and achievements (/api/badges/health) is active. A green light means the server successfully processed a request, confirming the badges module is live and its routes are loaded." },
  { name: 'Instructions', endpoint: 'instructions/health', group: 'Content Assets', details: "Confirms that the API service for student/user instructions (/api/instructions/health) is reachable and responsive. A green light indicates a successful request, showing the instructions module is active and its routes are loaded." },
  { name: 'Tags', endpoint: 'tags/health', group: 'Content Assets', details: "Verifies that the API service for managing content tags (/api/tags/health) is active and responsive. A green light means the server successfully processed a request, confirming the tagging module is live and its routes are loaded." },
  // Add other health endpoints here as they are created
  // { name: 'Messaging', endpoint: 'messages/health', group: 'Feature Services' }, // Example if messages had a health endpoint
  // { name: 'Journaling', endpoint: 'journal/health', group: 'Feature Services' }, // Example if journal had a health endpoint
];

const SiteHealthDisplay = () => {
  const [healthStatuses, setHealthStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState(null); // To track which item's details are shown

  const toggleDetails = (itemName) => {
    if (expandedItem === itemName) {
      setExpandedItem(null); // Collapse if already expanded
    } else {
      setExpandedItem(itemName); // Expand new item
    }
  };

  useEffect(() => {
    const fetchHealthStatuses = async () => {
      setLoading(true);
      const statuses = {};
      for (const service of serviceEndpoints) {
        try {
          const response = await axios.get(service.endpoint);
          if (response.status === 200 && response.data && (response.data.status === 'ok' || response.data.service)) {
            statuses[service.name] = { status: 'ok', data: response.data, group: service.group, details: service.details };
          } else {
            statuses[service.name] = { status: 'error', error: 'Unexpected response format', data: response.data, group: service.group, details: service.details };
          }
        } catch (error) {
          console.error(`Error fetching health for ${service.name}:`, error);
          statuses[service.name] = {
            status: 'error',
            error: error.response ? `${error.response.status} - ${error.response.data?.message || error.message}` : error.message,
            group: service.group,
            details: service.details
          };
        }
      }
      setHealthStatuses(statuses);
      setLoading(false);
    };

    fetchHealthStatuses();
    const intervalId = setInterval(fetchHealthStatuses, 60000); // Refresh every 60 seconds

    return () => clearInterval(intervalId); // Cleanup interval on component unmount
  }, []);

  const groupedStatuses = serviceEndpoints.reduce((acc, service) => {
    acc[service.group] = acc[service.group] || [];
    if (healthStatuses[service.name]) {
      acc[service.group].push({ name: service.name, ...healthStatuses[service.name] });
    } else if (!loading) { // If not loading and status is missing, show as pending/error
       acc[service.group].push({ name: service.name, status: 'error', error: 'Status not yet fetched', details: service.details });
    }
    return acc;
  }, {});

  if (loading && Object.keys(healthStatuses).length === 0) {
    return <div className="site-health-container"><p>Loading site health status...</p></div>;
  }

  return (
    <div className="site-health-container">
      <h1>Site Health Dashboard</h1>
      {Object.entries(groupedStatuses).map(([groupName, services]) => (
        <div key={groupName} className="health-group">
          <h2>{groupName}</h2>
          {services.length > 0 ? (
            <ul>
              {services.map(service => (
                <li key={service.name} className={`health-status-item ${service.status === 'ok' ? 'status-ok' : 'status-error'}`}>
                  <span className="health-indicator"></span>
                  <span className="service-name" onClick={() => toggleDetails(service.name)} style={{ cursor: 'pointer' }}>
                    {service.name}
                  </span>
                  {service.status === 'error' && <span className="error-message">: {service.error}</span>}
                  {service.status === 'ok' && service.data?.service && <span className="service-detail"> ({service.data.service})</span>}
                  {expandedItem === service.name && service.status === 'ok' && (
                    <div className="health-details">
                      <p><strong>Checks Performed:</strong></p>
                      <ul>
                        <li>{service.details}</li>
                      </ul>
                    </div>
                  )}
                   {expandedItem === service.name && service.status !== 'ok' && (
                    <div className="health-details">
                      <p><strong>Note:</strong> Details are shown for healthy services. This service is currently reporting an error.</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No services in this group or statuses pending.</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default SiteHealthDisplay; 