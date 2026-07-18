// admin/components/LocationMap.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Box, Label, Input, FormGroup, Button, Text } from '@adminjs/design-system';

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // India

const LocationMap = (props) => {
  const { record, onChange } = props;
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerInstance = useRef(null);

  const initialLat = parseFloat(record.params.latitude) || DEFAULT_CENTER.lat;
  const initialLng = parseFloat(record.params.longitude) || DEFAULT_CENTER.lng;

  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  const updatePosition = (lat, lng) => {
    onChange('latitude', lat);
    onChange('longitude', lng);
    if (markerInstance.current) {
      markerInstance.current.setPosition({ lat, lng });
    }
    if (mapInstance.current) {
      mapInstance.current.panTo({ lat, lng });
    }
  };

  // Initialize the map once, when the Google script has loaded
  useEffect(() => {
    const waitForGoogle = setInterval(() => {
      if (window.google && window.google.maps && mapRef.current && !mapInstance.current) {
        clearInterval(waitForGoogle);

        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: initialLat, lng: initialLng },
          zoom: 13,
        });
        mapInstance.current = map;

        const marker = new window.google.maps.Marker({
          position: { lat: initialLat, lng: initialLng },
          map,
          draggable: true,
        });
        markerInstance.current = marker;

        marker.addListener('dragend', (e) => {
          updatePosition(e.latLng.lat(), e.latLng.lng());
        });

        map.addListener('click', (e) => {
          updatePosition(e.latLng.lat(), e.latLng.lng());
        });

        setMapReady(true);
      }
    }, 200);

    return () => clearInterval(waitForGoogle);
  }, []);

  // Search by place name using Google's Geocoder
  const handleSearch = () => {
    if (!searchText.trim() || !window.google) return;
    setSearching(true);
    setError('');

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: searchText }, (results, status) => {
      setSearching(false);
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        updatePosition(loc.lat(), loc.lng());
      } else {
        setError('No results found');
      }
    });
  };

  // Use browser's current location
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updatePosition(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      (err) => {
        setError('Could not get your location: ' + err.message);
        setLocating(false);
      }
    );
  };

  return (
    <FormGroup>
      <Label>Pick location on map (search, use current location, click, drag marker, or enter manually)</Label>

      <Box display="flex" style={{ gap: '8px', marginBottom: '8px' }}>
        <Input
          flex={1}
          placeholder="Search for a place, city, or address..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button type="button" onClick={handleSearch} disabled={searching}>
          {searching ? 'Searching...' : 'Search'}
        </Button>
        <Button type="button" onClick={handleUseCurrentLocation} disabled={locating}>
          {locating ? 'Locating...' : '📍 My Location'}
        </Button>
      </Box>

      {error && (
        <Text color="danger" fontSize="sm" marginBottom="default">{error}</Text>
      )}

      <Box style={{ height: '350px', marginBottom: '16px' }}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
        {!mapReady && <Text fontSize="sm">Loading map...</Text>}
      </Box>

      <Box display="flex" style={{ gap: '16px' }}>
        <Box flex={1}>
          <Label>Latitude</Label>
          <Input
            type="number"
            value={record.params.latitude || ''}
            onChange={(e) => updatePosition(parseFloat(e.target.value), parseFloat(record.params.longitude) || initialLng)}
          />
        </Box>
        <Box flex={1}>
          <Label>Longitude</Label>
          <Input
            type="number"
            value={record.params.longitude || ''}
            onChange={(e) => updatePosition(parseFloat(record.params.latitude) || initialLat, parseFloat(e.target.value))}
          />
        </Box>
      </Box>
    </FormGroup>
  );
};

export default LocationMap;