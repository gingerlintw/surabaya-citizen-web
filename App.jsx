import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import './App.css';

const pulseIcon = new L.divIcon({ className: 'pulse-icon', html: '<div class="ring"></div>', iconSize: [20, 20] });
const myLocationIcon = new L.divIcon({ className: 'my-location-icon', html: '<div style="background:#007bff; width:14px; height:14px; border-radius:50%; border:2px solid white; box-shadow: 0 0 8px #007bff;"></div>', iconSize: [18, 18] });

function App() {
  const getTypeEmoji = (type) => {
    switch (type) {
      case 'FLOOD': return '🌊 BANJIR';
      case 'FIRE': return '🔥 KEBAKARAN';
      case 'ROAD_HAZARD': return '🚧 LALU LINTAS';
      case 'SECURITY': return '🚨 KEAMANAN';
      case 'EARTHQUAKE': return '🫨 GEMPA (Official)';
      default: return '📍 INFO';
    }
  };

  const mapRef = useRef(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  
  const [reportType, setReportType] = useState('ROAD_HAZARD');
  const [reportDesc, setReportDesc] = useState('');
  
  const SURABAYA_CENTER = [-7.2800, 112.7400];

  const fetchIncidents = async (currentLoc = userLocation) => {
    try {
      let url = 'https://surabaya-api-v1ey.onrender.com/api/incidents';
      if (currentLoc) url += `?lat=${currentLoc.lat}&lng=${currentLoc.lng}&radius=15`;
      const res = await fetch(url);
      setIncidents(await res.json());
    } catch (err) {
      console.error("API connection failed", err);
    }
  };

  useEffect(() => {
    fetchIncidents(null); 
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(newLoc);
        fetchIncidents(newLoc); 
      },
      (err) => console.error("Failed to get GPS", err),
      { enableHighAccuracy: true }
    );
    const pollInterval = setInterval(() => fetchIncidents(userLocation), 30000);
    return () => { clearInterval(pollInterval); navigator.geolocation.clearWatch(watchId); };
  }, []);

  const sortedIncidents = useMemo(() => {
    if (!userLocation || incidents.length === 0) return incidents;
    const userPoint = turf.point([userLocation.lng, userLocation.lat]);
    return incidents.map(incident => {
      const incidentPoint = turf.point([incident.longitude, incident.latitude]);
      const distance = turf.distance(userPoint, incidentPoint, { units: 'kilometers' });
      return { ...incident, distance: Number(distance.toFixed(1)) };
    }).sort((a, b) => (a.distance || 999) - (b.distance || 999));
  }, [userLocation, incidents]);

  useEffect(() => {
    const imminentDanger = sortedIncidents.find(inc => inc.distance !== undefined && inc.distance < 2.0 && inc.risk_level === 'HIGH');
    setActiveAlert(imminentDanger || null);
  }, [sortedIncidents]);

  const handleFeedClick = (lat, lng) => {
    if (mapRef.current) { mapRef.current.flyTo([lat, lng], 15, { duration: 1.5 }); }
  };

  const handleReport = async () => {
    if (!userLocation) { alert("Please wait for GPS location!"); return; }
    
    let titlePrefix = "";
    if (reportType === 'FLOOD') titlePrefix = "Banjir";
    if (reportType === 'FIRE') titlePrefix = "Kebakaran";
    if (reportType === 'ROAD_HAZARD') titlePrefix = "Masalah Lalu Lintas";
    if (reportType === 'SECURITY') titlePrefix = "Gangguan Keamanan";

    const newReport = {
      type: reportType,
      title: `Laporan Warga: ${titlePrefix}`,
      description: reportDesc || "Tidak ada deskripsi (No description)",
      latitude: userLocation.lat + (Math.random() * 0.004 - 0.002), 
      longitude: userLocation.lng + (Math.random() * 0.004 - 0.002),
      risk_level: reportType === 'FIRE' || reportType === 'SECURITY' ? 'HIGH' : 'MEDIUM'
    };

    try {
      await fetch('https://surabaya-api-v1ey.onrender.com/api/incidents', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(newReport) 
      });
      alert("✅ Report submitted successfully!");
      setReportDesc(''); 
      fetchIncidents(userLocation); 
    } catch (err) { console.error("Report failed", err); }
  };

  const handleVote = async (e, id, direction) => {
    e.stopPropagation();
    try {
      await fetch(`https://surabaya-api-v1ey.onrender.com/api/incidents/${id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }) });
      fetchIncidents(userLocation);
    } catch (err) { console.error("Vote failed", err); }
  };

  return (
    <div className="app-container">
      {activeAlert && (
        <div className="alert-banner">
          ⚠️ PERINGATAN: {activeAlert.title} (Jarak: {activeAlert.distance} km)
        </div>
      )}

      <div className="feed-panel">
        <h2 className="feed-header">🔴 Nusantara Live Alerts</h2>
        
        <div style={{ background: '#1e1e1e', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #333' }}>
          <select 
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px' }}
          >
            <option value="ROAD_HAZARD">🚧 Masalah Lalu Lintas (Traffic Hazard)</option>
            <option value="FLOOD">🌊 Banjir (Flood)</option>
            <option value="FIRE">🔥 Kebakaran (Fire)</option>
            <option value="SECURITY">🚨 Keamanan (Security Issue)</option>
          </select>
          
          <input 
            type="text" 
            value={reportDesc}
            onChange={(e) => setReportDesc(e.target.value)}
            placeholder="Describe the situation (e.g., fallen tree blocking road)..." 
            style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', boxSizing: 'border-box' }}
          />

          <button 
            onClick={handleReport} 
            style={{ width: '100%', padding: '10px', backgroundColor: '#ff4a4a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            🚨 Kirim Laporan (Submit Report)
          </button>
        </div>

        {!userLocation && <div style={{ color: '#ffcc00', marginBottom: '10px' }}>⏳ Menunggu GPS...</div>}
        
        {sortedIncidents.map(incident => (
          <div key={incident.id} className={`feed-item ${incident.risk_level === 'HIGH' ? 'high-risk' : ''}`} onClick={() => handleFeedClick(incident.latitude, incident.longitude)}>
            <div className="feed-item-header">
              <span className="feed-type">{getTypeEmoji(incident.type)}</span>
              {incident.distance !== undefined && <span className="feed-distance">📍 Jarak {incident.distance} km</span>}
            </div>
            <h3 className="feed-title">{incident.title}</h3>
            <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '8px' }}>{incident.description}</div>
            
            {!incident.isOfficial && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #444', paddingTop: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: incident.votes < 0 ? '#ff4a4a' : '#4caf50' }}>Trust Score: <strong>{incident.votes}</strong></span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={(e) => handleVote(e, incident.id, 'up')} style={{ background: '#2a2a2a', color: '#fff', border: '1px solid #555', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>👍 Konfirmasi</button>
                  <button onClick={(e) => handleVote(e, incident.id, 'down')} style={{ background: '#2a2a2a', color: '#ff4a4a', border: '1px solid #555', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>👎 Palsu</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="map-panel">
        <MapContainer center={SURABAYA_CENTER} zoom={13} zoomControl={false} ref={mapRef}>
          <TileLayer attribution='&copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
          <TileLayer attribution='&copy; OpenWeatherMap' url="https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=7eb904f6c4a6bb4551d7c3d256860ec8" opacity={0.5} />
          {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={myLocationIcon}><Popup>Your Current Location</Popup></Marker>}
          {sortedIncidents.map(incident => (
            <Marker key={incident.id} position={[incident.latitude, incident.longitude]} icon={pulseIcon}>
              <Popup><strong>{incident.title}</strong><br/>{incident.description}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;