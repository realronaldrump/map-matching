let map; // Declare map as a global variable

document.addEventListener('DOMContentLoaded', () => {
    getMapboxAccessToken()
        .then(token => {
            mapboxgl.accessToken = token;
            map = new mapboxgl.Map({
                container: 'map',
                style: 'mapbox://styles/mapbox/streets-v12',
                center: [-97.1, 31.5], // Default center (you can adjust this)
                zoom: 12 // Default zoom level
            });

            // Wait for the map to load before adding event listeners
            map.on('load', () => {
                // Add event listener for file upload
                document.getElementById('uploadBtn').addEventListener('click', handleFileUpload);
                // Add event listener for export
                document.getElementById('exportBtn').addEventListener('click', exportMatchedRoute);
            });
        })
        .catch(error => {
            console.error('Error initializing map:', error);
            alert('Failed to initialize map. Please try again later.');
        });
});

// Function to fetch Mapbox Access Token from the server
function getMapboxAccessToken() {
    return fetch('/api/mapbox-token')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch Mapbox token');
            }
            return response.json();
        })
        .then(data => {
            if (!data.accessToken) {
                throw new Error('Mapbox token is undefined');
            }
            return data.accessToken;
        });
}

// Function to handle file upload and process coordinates
async function handleFileUpload(event) {
    const fileInput = document.getElementById('gpxFile');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a file to upload.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const fileContent = e.target.result;
        const fileExtension = file.name.split('.').pop().toLowerCase();

        if (fileExtension === 'gpx') {
            displayOriginalGPX(fileContent);
        } else if (fileExtension === 'geojson') {
            displayOriginalGeoJSON(fileContent);
        }

        // Show loading indicator
        document.getElementById('loading-indicator').style.display = 'block';

        mapMatchFile(fileContent, fileExtension)
            .then(() => {
                // Hide loading indicator after processing
                document.getElementById('loading-indicator').style.display = 'none';
            })
            .catch(error => {
                console.error('Error during map matching:', error);
                alert('An error occurred during map matching. Please check the console for details.');
                // Hide loading indicator on error
                document.getElementById('loading-indicator').style.display = 'none';
            });
    };

    reader.readAsText(file);
}

// Function to toggle layer visibility
function toggleLayer(layerId) {
    const visibility = map.getLayoutProperty(layerId, 'visibility');
    if (visibility === 'visible') {
        map.setLayoutProperty(layerId, 'visibility', 'none');
    } else {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
    }
}

// Event listeners for toggle buttons
document.getElementById('toggle-original').addEventListener('click', () => {
    toggleLayer('original-gpx');
    toggleLayer('original-geojson');
});

document.getElementById('toggle-matched').addEventListener('click', () => {
    toggleLayer('matched-route');
});

// Function to parse GPX content and display on the map
function displayOriginalGPX(gpxContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxContent, "text/xml");
    const tracks = xmlDoc.getElementsByTagName("trk");
    const allCoordinates = [];

    for (let track of tracks) {
        const segments = track.getElementsByTagName("trkseg");
        for (let segment of segments) {
            const trackpoints = segment.getElementsByTagName("trkpt");
            const segmentCoordinates = [];
            for (let point of trackpoints) {
                const lat = parseFloat(point.getAttribute("lat"));
                const lon = parseFloat(point.getAttribute("lon"));
                segmentCoordinates.push([lon, lat]);
            }
            allCoordinates.push(segmentCoordinates);
        }
    }

    if (!map.getSource('original-gpx')) {
        map.addSource('original-gpx', {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'properties': {},
                'geometry': {
                    'type': 'MultiLineString',
                    'coordinates': allCoordinates
                }
            }
        });
    } else {
        map.getSource('original-gpx').setData({
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'MultiLineString',
                'coordinates': allCoordinates
            }
        });
    }

    if (!map.getLayer('original-gpx')) {
        map.addLayer({
            'id': 'original-gpx',
            'type': 'line',
            'source': 'original-gpx',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round',
                'visibility': 'visible'
            },
            'paint': {
                'line-color': '#0000FF',
                'line-width': 2
            }
        });
    }

    // Fit map to original GPX route
    const bounds = new mapboxgl.LngLatBounds();
    allCoordinates.forEach(segment => {
        segment.forEach(coord => bounds.extend(coord));
    });
    map.fitBounds(bounds, { padding: 50 });
}

// Function to parse GeoJSON content and display on the map
function displayOriginalGeoJSON(geojsonContent) {
    const geojson = JSON.parse(geojsonContent);
    let coordinates;

    if (geojson.type === 'FeatureCollection') {
        coordinates = geojson.features[0].geometry.coordinates;
    } else if (geojson.type === 'Feature') {
        coordinates = geojson.geometry.coordinates;
    } else {
        coordinates = geojson.coordinates;
    }

    if (!map.getSource('original-geojson')) {
        map.addSource('original-geojson', {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'properties': {},
                'geometry': {
                    'type': 'LineString',
                    'coordinates': coordinates
                }
            }
        });
    } else {
        map.getSource('original-geojson').setData({
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': coordinates
            }
        });
    }

    if (!map.getLayer('original-geojson')) {
        map.addLayer({
            'id': 'original-geojson',
            'type': 'line',
            'source': 'original-geojson',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round',
                'visibility': 'visible'
            },
            'paint': {
                'line-color': '#0000FF',
                'line-width': 2
            }
        });
    }

    // Fit map to original GeoJSON route
    const bounds = new mapboxgl.LngLatBounds();
    coordinates.forEach(coord => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 50 });
}

// Function to display matched route on the map
function displayMatchedRoute(routeGeometries) {
    const combinedCoordinates = routeGeometries.flatMap(geometry => geometry.coordinates);

    if (!map.getSource('matched-route')) {
        map.addSource('matched-route', {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'MultiLineString',
                    coordinates: routeGeometries.map(geometry => geometry.coordinates)
                }
            }
        });

        map.addLayer({
            id: 'matched-route',
            type: 'line',
            source: 'matched-route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round',
                'visibility': 'visible'
            },
            paint: {
                'line-color': '#FF0000',
                'line-width': 4
            }
        });
    } else {
        map.getSource('matched-route').setData({
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'MultiLineString',
                coordinates: routeGeometries.map(geometry => geometry.coordinates)
            }
        });
    }

    const bounds = new mapboxgl.LngLatBounds();
    combinedCoordinates.forEach(coord => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 50 });
}

// Function to map match the file content
async function mapMatchFile(fileContent, fileExtension) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(fileContent, "text/xml");
        const trackSegments = xmlDoc.getElementsByTagName('trkseg');
        const matchedGeometries = [];

        for (let i = 0; i < trackSegments.length; i++) {
            const segment = trackSegments[i];
            const trackpoints = segment.getElementsByTagName('trkpt');
            const coordinates = Array.from(trackpoints).map(trkpt => [
                parseFloat(trkpt.getAttribute('lon')),
                parseFloat(trkpt.getAttribute('lat'))
            ]);

            const MAX_COORDINATES_PER_REQUEST = 100;
            const chunks = [];

            for (let i = 0; i < coordinates.length; i += MAX_COORDINATES_PER_REQUEST) {
                const chunk = coordinates.slice(i, i + MAX_COORDINATES_PER_REQUEST);
                if (chunk.length < 2) {
                    if (chunks.length > 0) {
                        // Merge with the previous chunk if possible
                        chunks[chunks.length - 1].push(chunk[0]);
                    } else {
                        console.warn('A segment with only one coordinate was found and skipped.');
                    }
                } else {
                    chunks.push(chunk);
                }
            }

            for (const chunk of chunks) {
                try {
                    const response = await fetch('/api/match', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ coordinates: chunk })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Map Matching API Error');
                    }

                    const data = await response.json();
                    matchedGeometries.push(...data.matchedGeometries);
                } catch (error) {
                    console.error('Error during map matching:', error);
                    alert('An error occurred during map matching. Please try again.');
                }

                // Optional: Add a small delay between requests if needed
                await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
            }
        }

        displayMatchedRoute(matchedGeometries);
    } catch (error) {
        console.error('Error during map matching:', error);
        alert('Error during map matching: ' + error.message);
    }
}

// Function to export matched route as GeoJSON
function exportMatchedRoute() {
    if (!map.getSource('matched-route')) {
        alert('No matched route to export.');
        return;
    }

    const matchedSource = map.getSource('matched-route');
    const matchedData = matchedSource._data; // Access the GeoJSON data

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(matchedData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "matched-route.geojson");
    document.body.appendChild(downloadAnchorNode); // Required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}