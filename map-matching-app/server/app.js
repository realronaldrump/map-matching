const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const gpxParse = require('gpx-parse');
const path = require('path');

dotenv.config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Endpoint to handle GPX/GeoJSON file uploads
app.post('/api/match', async (req, res) => {
    try {
        const { coordinates } = req.body;
        
        if (!coordinates || coordinates.length < 2) {
            console.warn('Received /api/match request with insufficient coordinates:', coordinates);
            return res.status(400).json({ error: 'At least 2 coordinates are required for map matching.' });
        }

        console.log(`Processing ${coordinates.length} coordinates for map matching.`);
        const matchedGeometries = await processCoordinates(coordinates);
        res.json({ matchedGeometries });
    } catch (error) {
        console.error('Error in /api/match:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function processCoordinates(coordinates) {
    if (!coordinates || coordinates.length < 2) {
        throw new Error('At least 2 coordinates are required for map matching.');
    }

    const MAX_COORDINATES_PER_REQUEST = 100;
    const profile = 'mapbox/driving';
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    const geometries = 'geojson';
    const baseUrl = `https://api.mapbox.com/matching/v5/${profile}`;

    // Split coordinates into chunks of max 100
    const chunks = [];
    for (let i = 0; i < coordinates.length; i += MAX_COORDINATES_PER_REQUEST) {
        const chunk = coordinates.slice(i, i + MAX_COORDINATES_PER_REQUEST);
        chunks.push(chunk);
    }

    const matchedGeometries = [];

    for (const chunk of chunks) {
        if (chunk.length < 2) {
            // Cannot process a chunk with less than 2 coordinates
            console.warn('Skipped a chunk with less than 2 coordinates.');
            continue;
        }

        const radiuses = Array(chunk.length).fill(25).join(';');
        const coordinatesString = chunk.map(coord => coord.join(',')).join(';');
        const url = `${baseUrl}/${coordinatesString}?access_token=${accessToken}&geometries=${geometries}&radiuses=${radiuses}`;

        try {
            const response = await axios.get(url);
            const data = response.data;

            if (data.code !== 'Ok') {
                throw new Error(`Mapbox API error: ${data.code}`);
            }

            matchedGeometries.push(...data.matchings.map(matching => matching.geometry));
        } catch (error) {
            console.error('Error processing chunk:', error.response ? error.response.data : error.message);
            // Depending on your application's needs, you can choose to:
            // - Continue with the next chunk
            // - Retry the current chunk
            // - Abort the entire process
            throw error; // Here, we're choosing to abort
        }

        // Optional: Delay between requests to respect rate limits (300 requests per minute)
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
    }

    return matchedGeometries;
}

// Function to parse GPX content and extract coordinates
function parseGPX(gpxContent) {
    return new Promise((resolve, reject) => {
        gpxParse.parseGpx(gpxContent, (error, data) => {
            if (error) {
                console.error('Error parsing GPX:', error);
                return reject(new Error('Error parsing GPX file'));
            }
            try {
                const coords = data.tracks[0].segments[0].map(point => [point.lon, point.lat]);
                resolve(coords);
            } catch (err) {
                console.error('Error extracting coordinates from GPX:', err);
                reject(new Error('Error extracting coordinates from GPX file'));
            }
        });
    });
}

// Function to parse GeoJSON content and extract coordinates
function parseGeoJSON(geojsonContent) {
    try {
        const geojson = JSON.parse(geojsonContent);
        let coordinates;

        if (geojson.type === 'FeatureCollection') {
            coordinates = geojson.features[0].geometry.coordinates;
        } else if (geojson.type === 'Feature') {
            coordinates = geojson.geometry.coordinates;
        } else {
            coordinates = geojson.coordinates;
        }

        return coordinates;
    } catch (error) {
        console.error('Error parsing GeoJSON:', error);
        throw new Error('Error parsing GeoJSON file');
    }
}

const MAX_COORDINATES_PER_REQUEST = 100;
const REQUEST_DELAY_MS = 1000; // 1 second delay between requests

// Endpoint to provide Mapbox Access Token
app.get('/api/mapbox-token', (req, res) => {
    res.json({ accessToken: process.env.MAPBOX_ACCESS_TOKEN });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

console.log("Mapbox Access Token:", process.env.MAPBOX_ACCESS_TOKEN);

// Test Mapbox API endpoint
app.get('/test-mapbox', async (req, res) => {
    const testUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/Los%20Angeles.json?access_token=${process.env.MAPBOX_ACCESS_TOKEN}`;
    try {
        const response = await axios.get(testUrl);
        res.json(response.data);
    } catch (error) {
        console.error('Error testing Mapbox API:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error testing Mapbox API' });
    }
});