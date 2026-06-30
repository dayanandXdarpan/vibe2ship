import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Locate, MapPin } from 'lucide-react'
import './LocationPicker.css'

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom purple marker
const purpleIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

function MapClickHandler({ onLocationChange }) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng
      const address = await reverseGeocode(lat, lng)
      onLocationChange({ lat, lng, address })
    },
  })
  return null
}

export default function LocationPicker({ value, onChange }) {
  const [gettingLocation, setGettingLocation] = useState(false)
  const mapRef = useRef()
  const defaultCenter = [20.5937, 78.9629] // India center

  const center = value ? [value.lat, value.lng] : defaultCenter

  const getCurrentLocation = () => {
    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const address = await reverseGeocode(lat, lng)
        onChange({ lat, lng, address })
        mapRef.current?.flyTo([lat, lng], 16)
        setGettingLocation(false)
      },
      (err) => {
        console.warn('Geolocation error:', err)
        setGettingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Auto-detect on mount
  useEffect(() => {
    if (!value) getCurrentLocation()
  }, [])

  return (
    <div className="location-picker">
      <div className="location-picker__map">
        <MapContainer
          center={center}
          zoom={value ? 15 : 5}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapClickHandler onLocationChange={onChange} />
          {value && (
            <Marker position={[value.lat, value.lng]} icon={purpleIcon} />
          )}
        </MapContainer>

        {/* GPS button overlay */}
        <button
          className="location-picker__gps-btn"
          onClick={getCurrentLocation}
          disabled={gettingLocation}
          title="Use my location"
        >
          {gettingLocation ? (
            <span className="spin" style={{ display: 'inline-block' }}>⟳</span>
          ) : (
            <Locate size={18} />
          )}
        </button>
      </div>

      <p className="caption" style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
        <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />
        Tap the map to pin the exact location, or use GPS
      </p>
    </div>
  )
}
