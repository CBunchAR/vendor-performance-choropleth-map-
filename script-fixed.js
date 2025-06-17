// Global variables for map layers
let map;
let vendorChoroplethLayer;
let storeLocationsLayer;
let vendorDotsLayer; // New: Layer for vendor overlap dots
let geoJsonData;

// Global variables for data
let mapData = {
    printData: [],
    visitorData: [],
    storeData: [],
    zipCodeData: [],
    vendorList: [],
    zipcodeVendorMap: {} // New: Maps zipcodes to arrays of vendor data for overlap support
};

// Global state variables
let efficiencyShading = true;
let showStoreLocations = true;
let highlightLowPerformers = false;
let selectedVendors = ['all']; // Changed: Now supports multiple vendor selection

// Color constants
const VENDOR_COLOR_PALETTE = [
    '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#2ecc71',
    '#e67e22', '#1abc9c', '#34495e', '#f1c40f', '#e91e63',
    '#8bc34a', '#ff5722', '#607d8b', '#795548', '#ff9800',
    '#4caf50', '#673ab7', '#009688', '#ffeb3b', '#f44336',
    '#2196f3'
];

// Map configuration
const MAP_CENTER = [43.0481, -75.1735];
const ZOOM_LEVEL = 7;

// Business logic functions for vendor choropleth
const calculateEfficiency = (visitors, printPieces) => {
    return printPieces > 0 ? (visitors / printPieces) * 100 : 0;
};

const getEfficiencyTier = (efficiency) => {
    if (efficiency <= 5) return 'low';
    if (efficiency <= 49) return 'medium';
    return 'high';
};

const getEfficiencyOpacity = (efficiency) => {
    if (efficiency <= 5) return 0.3;
    if (efficiency <= 49) return 0.6;
    return 1.0;
};

const getVendorColorWithEfficiency = (vendorColor, efficiency) => {
    if (!efficiencyShading) return vendorColor;
    
    const opacity = getEfficiencyOpacity(efficiency);
    // Convert hex to rgba with efficiency-based opacity
    const r = parseInt(vendorColor.slice(1, 3), 16);
    const g = parseInt(vendorColor.slice(3, 5), 16);
    const b = parseInt(vendorColor.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const assignVendorColor = (vendorName, vendorList) => {
    const index = vendorList.indexOf(vendorName) % VENDOR_COLOR_PALETTE.length;
    return VENDOR_COLOR_PALETTE[index];
};

const getZipsByVendor = (data, targetVendor) => {
    return data.filter(item => item.vendor === targetVendor);
};

const getVendorColors = (zipCode, selectedVendorsList) => {
    const vendorsInZip = mapData.zipcodeVendorMap[zipCode];
    if (!vendorsInZip) return [];
    
    // Filter to only selected vendors if not showing all
    const relevantVendors = selectedVendorsList.includes('all') 
        ? vendorsInZip 
        : vendorsInZip.filter(v => selectedVendorsList.includes(v.vendor));
    
    console.log(`ZIP ${zipCode}: Found ${vendorsInZip.length} total vendors, ${relevantVendors.length} relevant for selection:`, selectedVendorsList);
    
    return relevantVendors.map(v => assignVendorColor(v.vendor, mapData.vendorList));
};

const getZipEfficiency = (zipCode, selectedVendorsList) => {
    const vendorsInZip = mapData.zipcodeVendorMap[zipCode];
    if (!vendorsInZip) return 0;
    
    // Filter to only selected vendors if not showing all
    const relevantVendors = selectedVendorsList.includes('all') 
        ? vendorsInZip 
        : vendorsInZip.filter(v => selectedVendorsList.includes(v.vendor));
    
    if (relevantVendors.length === 0) return 0;
    
    // Calculate weighted average efficiency
    const totalPrintPieces = relevantVendors.reduce((sum, v) => sum + v.printPieces, 0);
    const totalVisitors = relevantVendors.reduce((sum, v) => sum + v.visitors, 0);
    
    return calculateEfficiency(totalVisitors, totalPrintPieces);
};

const processMapData = (printData, visitorData, storeData) => {
    console.log('Processing map data...');
    console.log('Raw data received:', { printData: printData.length, visitorData: visitorData.length, storeData: storeData.length });
    
    // First, filter out invalid visitor data and aggregate by zip code
    const visitorsByZip = visitorData.reduce((acc, row) => {
        const zip = String(row.zipcode || row.Zipcode || row.ZIP || '').trim();
        let visitors = row.visitors || row.Visitors;
        
        // Skip rows with N/A, null, undefined, or non-numeric visitor values
        if (visitors === 'N/A' || visitors === null || visitors === undefined || 
            isNaN(visitors) || visitors === '' || !zip) {
            console.log('Filtering out invalid visitor data:', { zip, visitors });
            return acc;
        }
        
        // Handle visitor count formatting (e.g., "1.2K" -> 1200)
        let visitorCount = 0;
        const visitorStr = visitors.toString().trim();
        
        if (visitorStr.includes('K')) {
            visitorCount = parseFloat(visitorStr.replace('K', '')) * 1000;
        } else if (visitorStr.startsWith('>')) {
            visitorCount = parseInt(visitorStr.replace('>', ''));
        } else {
            visitorCount = parseInt(visitorStr) || 0;
        }
        
        if (visitorCount > 0) {
            acc[zip] = (acc[zip] || 0) + visitorCount;
            console.log(`Aggregated visitors for ZIP ${zip}: ${acc[zip]}`);
        }
        
        return acc;
    }, {});
    
    console.log('Processed visitor data:', {
        totalZips: Object.keys(visitorsByZip).length,
        sampleData: Object.entries(visitorsByZip).slice(0, 5)
    });
    
    // Create zipcode vendor map for overlap detection
    const zipcodeVendorMap = {};
    
    // Process print data to build vendor overlap map
    printData.forEach(printRow => {
        const zip = String(printRow.zip || printRow['ZIP Code'] || '').trim();
        const vendor = printRow.vendor || 'Unknown Vendor';
        let quantity = printRow.quantity || printRow.Quantity || 0;
        
        if (typeof quantity === 'string') {
            quantity = parseInt(quantity.replace(/,/g, '')) || 0;
        }
        
        if (!zip || quantity <= 0) return;
        
        const totalVisitors = visitorsByZip[zip] || 0;
        const efficiency = calculateEfficiency(totalVisitors, quantity);
        
        const vendorData = {
            vendor: vendor,
            visitors: totalVisitors,
            printPieces: quantity,
            notes: printRow.notes || '',
            efficiency: efficiency,
            efficiencyTier: getEfficiencyTier(efficiency)
        };
        
        // Add to zipcode vendor map for overlap tracking
        if (!zipcodeVendorMap[zip]) {
            zipcodeVendorMap[zip] = [];
        }
        zipcodeVendorMap[zip].push(vendorData);
        
        console.log(`Processing ZIP ${zip}: vendor=${vendor}, quantity=${quantity}, visitors=${totalVisitors}, efficiency=${efficiency.toFixed(2)}%`);
    });
    
    // Create flat zipCodeData for backward compatibility (using first vendor per zip)
    const zipCodeData = Object.entries(zipcodeVendorMap).map(([zip, vendors]) => {
        const primaryVendor = vendors[0]; // Use first vendor as primary for backward compatibility
        return {
            zip: zip,
            visitors: primaryVendor.visitors,
            printPieces: primaryVendor.printPieces,
            vendor: primaryVendor.vendor,
            notes: primaryVendor.notes,
            efficiency: primaryVendor.efficiency,
            efficiencyTier: primaryVendor.efficiencyTier,
            hasOverlap: vendors.length > 1,
            vendorCount: vendors.length
        };
    });
    
    // Get unique vendor list
    const vendorList = [...new Set(Object.values(zipcodeVendorMap).flat().map(v => v.vendor))].sort();
    
    // Process store data
    const processedStoreData = storeData.map(store => ({
        name: store.name || store.Name || 'Unknown Store',
        latitude: parseFloat(store.lat || store.latitude || store.Latitude),
        longitude: parseFloat(store.lng || store.longitude || store.Longitude),
        address: store.address || store.Address || ''
    })).filter(store => !isNaN(store.latitude) && !isNaN(store.longitude));
    
    console.log('Processed data summary:', {
        zipCodes: zipCodeData.length,
        vendors: vendorList.length,
        stores: processedStoreData.length,
        vendorList: vendorList,
        overlappingZips: zipCodeData.filter(z => z.hasOverlap).length,
        sampleZipData: zipCodeData.slice(0, 3)
    });
    
    return {
        zipCodeData: zipCodeData,
        storeData: processedStoreData,
        vendorList: vendorList,
        zipcodeVendorMap: zipcodeVendorMap
    };
};

// Load all CSV data
const loadDataLayers = async () => {
    console.log('Loading data layers...');
    
    try {
        // Show loading indicator
        showLoadingIndicator('Loading CSV data...');
        
        // Load all data files in parallel
        const [printData, visitorData, storeData, nyGeoJson, vtGeoJson] = await Promise.all([
            loadCSV('/input/print_distribution.csv'),
            loadCSV('/input/visitor_data.csv'),
            loadCSV('/input/store_locations.csv'),
            fetch('/input/NY_ZIP_compressed.geojson').then(response => response.json()),
            fetch('/input/VT_ZIP_compressed.geojson').then(response => response.json())
        ]);
        
        console.log('Raw data loaded successfully');
        showLoadingIndicator('Processing data...');
        
        // Store GeoJSON data globally
        geoJsonData = {
            type: "FeatureCollection",
            features: [...nyGeoJson.features, ...vtGeoJson.features]
        };
        
        // Process the data
        const processedData = processMapData(printData, visitorData, storeData);
        
        // Store in global variable
        mapData = {
            printData: printData,
            visitorData: visitorData,
            storeData: processedData.storeData,
            zipCodeData: processedData.zipCodeData,
            vendorList: processedData.vendorList,
            zipcodeVendorMap: processedData.zipcodeVendorMap
        };
        
        showLoadingIndicator('Creating map layers...');
        
        // Create map layers
        createVendorChoroplethLayer();
        createStoreLocationsLayer();
        
        // Update UI components
        updateVendorFilterDropdown();
        updateLegend();
        
        hideLoadingIndicator();
        console.log('Data loading complete');
        
    } catch (error) {
        console.error('Error loading data:', error);
        hideLoadingIndicator();
        showErrorMessage('Failed to load data. Please check the console for details.');
    }
};

// Create vendor choropleth layer
const createVendorChoroplethLayer = () => {
    console.log('Creating vendor choropleth layer...');
    
    // Remove existing layers if they exist
    if (vendorChoroplethLayer) {
        map.removeLayer(vendorChoroplethLayer);
    }
    if (vendorDotsLayer) {
        map.removeLayer(vendorDotsLayer);
    }
    
    // Create new dots layer for vendor overlaps
    vendorDotsLayer = L.layerGroup();
    
    vendorChoroplethLayer = L.geoJson(geoJsonData, {
        style: function(feature) {
            const zipCode = feature.properties.ZCTA5CE20 || feature.properties.ZCTA5CE10;
            const vendorsInZip = mapData.zipcodeVendorMap[zipCode];
            
            // Check if this ZIP has any selected vendors
            let relevantVendors = [];
            if (vendorsInZip) {
                relevantVendors = selectedVendors.includes('all') 
                    ? vendorsInZip 
                    : vendorsInZip.filter(v => selectedVendors.includes(v.vendor));
            }
            
            // No vendors or no relevant vendors for this zip
            if (relevantVendors.length === 0) {
                return {
                    fillColor: '#f0f0f0',
                    fillOpacity: 0.3,
                    weight: 1,
                    color: '#cccccc'
                };
            }
            
            // Get dominant vendor (highest print quantity among relevant vendors)
            const dominantVendor = getDominantVendor(relevantVendors);
            const dominantColor = assignVendorColor(dominantVendor.vendor, mapData.vendorList);
            const efficiency = getZipEfficiency(zipCode, selectedVendors);
            
            let style = {
                weight: 2,
                color: '#333333',
                fillColor: getVendorColorWithEfficiency(dominantColor, efficiency),
                fillOpacity: efficiencyShading ? getEfficiencyOpacity(efficiency) : 0.7
            };
            
            // Add dashed red border for low performers if enabled
            if (highlightLowPerformers && getEfficiencyTier(efficiency) === 'low') {
                style.color = '#dc3545';
                style.weight = 3;
                style.dashArray = '8, 4';
            }
            
            console.log(`ZIP ${zipCode}: Dominant vendor=${dominantVendor.vendor}, ${relevantVendors.length} total vendors`);
            
            return style;
        },
        onEachFeature: function(feature, layer) {
            const zipCode = feature.properties.ZCTA5CE20 || feature.properties.ZCTA5CE10;
            const vendorsInZip = mapData.zipcodeVendorMap[zipCode];
            
            if (vendorsInZip) {
                // Filter vendors based on current selection
                const relevantVendors = selectedVendors.includes('all') 
                    ? vendorsInZip 
                    : vendorsInZip.filter(v => selectedVendors.includes(v.vendor));
                
                if (relevantVendors.length > 0) {
                    // Create vendor overlap dots if multiple vendors
                    if (relevantVendors.length > 1) {
                        createVendorOverlapDots(layer, zipCode, relevantVendors);
                    }
                    
                    // Create context-aware tooltip
                    const tooltipContent = createContextAwareTooltip(zipCode, relevantVendors);
                    
                    layer.bindTooltip(tooltipContent, {
                        sticky: true,
                        className: 'vendor-tooltip'
                    });
                    
                    // Click interaction to highlight vendor territories
                    layer.on('click', function() {
                        if (relevantVendors.length === 1) {
                            highlightVendorTerritory(relevantVendors[0].vendor);
                        } else {
                            // For overlaps, highlight all vendors in this zip
                            relevantVendors.forEach(v => {
                                setTimeout(() => highlightVendorTerritory(v.vendor), Math.random() * 500);
                            });
                        }
                    });
                } else {
                    layer.bindTooltip(`
                        <div style="font-family: Arial, sans-serif;">
                            <strong>Zip Code ${zipCode}</strong><br>
                            <em>No selected vendors in this area</em>
                        </div>
                    `);
                }
            } else {
                layer.bindTooltip(`
                    <div style="font-family: Arial, sans-serif;">
                        <strong>Zip Code ${zipCode}</strong><br>
                        <em>No vendor data available</em>
                    </div>
                `);
            }
        }
    });
    
    // Check if layer should be visible
    if (document.getElementById('toggle-vendor-choropleth')?.checked !== false) {
        vendorChoroplethLayer.addTo(map);
        vendorDotsLayer.addTo(map);
    }
    
    console.log('Vendor choropleth layer created with dominant vendor coloring and overlap dots');
};

// Utility function to calculate the geometric centroid of a polygon
const calculatePolygonCentroid = (coordinates, geometryType) => {
    let totalArea = 0;
    let centroidLat = 0;
    let centroidLng = 0;
    
    const processRing = (ring) => {
        let area = 0;
        let lat = 0;
        let lng = 0;
        
        for (let i = 0; i < ring.length - 1; i++) {
            const x0 = ring[i][0];
            const y0 = ring[i][1];
            const x1 = ring[i + 1][0];
            const y1 = ring[i + 1][1];
            
            const a = x0 * y1 - x1 * y0;
            area += a;
            lat += (y0 + y1) * a;
            lng += (x0 + x1) * a;
        }
        
        area *= 0.5;
        if (area !== 0) {
            lat /= (6 * area);
            lng /= (6 * area);
        }
        
        return { area: Math.abs(area), lat, lng };
    };
    
    if (geometryType === 'Polygon') {
        const result = processRing(coordinates[0]);
        return L.latLng(result.lat, result.lng);
    } else if (geometryType === 'MultiPolygon') {
        coordinates.forEach(polygon => {
            const result = processRing(polygon[0]);
            const area = result.area;
            
            totalArea += area;
            centroidLat += result.lat * area;
            centroidLng += result.lng * area;
        });
        
        if (totalArea > 0) {
            centroidLat /= totalArea;
            centroidLng /= totalArea;
        }
        
        return L.latLng(centroidLat, centroidLng);
    }
    
    return null;
};

// Utility function to find a point guaranteed to be inside the polygon
const findPointInPolygon = (zipLayer) => {
    const bounds = zipLayer.getBounds();
    const boundsCenter = bounds.getCenter();
    
    // Method 1: Try the geometric centroid first
    try {
        const geometricCentroid = calculatePolygonCentroid(
            zipLayer.feature.geometry.coordinates, 
            zipLayer.feature.geometry.type
        );
        
        if (geometricCentroid && isPointInPolygon(geometricCentroid, zipLayer)) {
            return geometricCentroid;
        }
    } catch (e) {
        console.warn('Geometric centroid calculation failed:', e);
    }
    
    // Method 2: Try multiple candidate points within bounds
    const candidatePoints = [
        boundsCenter, // Bounds center
        L.latLng(bounds.getNorth() * 0.8 + bounds.getSouth() * 0.2, bounds.getEast() * 0.8 + bounds.getWest() * 0.2),
        L.latLng(bounds.getNorth() * 0.2 + bounds.getSouth() * 0.8, bounds.getEast() * 0.2 + bounds.getWest() * 0.8),
        L.latLng(bounds.getNorth() * 0.6 + bounds.getSouth() * 0.4, bounds.getEast() * 0.6 + bounds.getWest() * 0.4),
        L.latLng(bounds.getNorth() * 0.4 + bounds.getSouth() * 0.6, bounds.getEast() * 0.4 + bounds.getWest() * 0.6),
        L.latLng(bounds.getNorth() * 0.5 + bounds.getSouth() * 0.5, bounds.getEast() * 0.3 + bounds.getWest() * 0.7),
        L.latLng(bounds.getNorth() * 0.5 + bounds.getSouth() * 0.5, bounds.getEast() * 0.7 + bounds.getWest() * 0.3)
    ];
    
    // Test each candidate point
    for (const point of candidatePoints) {
        if (isPointInPolygon(point, zipLayer)) {
            return point;
        }
    }
    
    // Fallback: Use bounds center (should work in most cases)
    return boundsCenter;
};

// Simple point-in-polygon test using ray casting
const isPointInPolygon = (point, zipLayer) => {
    try {
        const coordinates = zipLayer.feature.geometry.coordinates;
        const lat = point.lat;
        const lng = point.lng;
        
        const testRing = (ring) => {
            let inside = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const xi = ring[i][0], yi = ring[i][1];
                const xj = ring[j][0], yj = ring[j][1];
                
                if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                }
            }
            return inside;
        };
        
        if (zipLayer.feature.geometry.type === 'Polygon') {
            return testRing(coordinates[0]);
        } else if (zipLayer.feature.geometry.type === 'MultiPolygon') {
            return coordinates.some(polygon => testRing(polygon[0]));
        }
        
        return false;
    } catch (e) {
        console.warn('Point-in-polygon test failed:', e);
        return true; // Assume it's inside if test fails
    }
};

// Create small colored dots for additional vendors in multi-vendor ZIP codes
const createVendorOverlapDots = (zipLayer, zipCode, relevantVendors) => {
    if (relevantVendors.length <= 1) return;
    
    // Get the dominant vendor
    const dominantVendor = getDominantVendor(relevantVendors);
    const additionalVendors = getAdditionalVendors(relevantVendors, dominantVendor);
    
    if (additionalVendors.length === 0) return;
    
    // Find a reliable center point within the polygon
    const centerPoint = findPointInPolygon(zipLayer);
    console.log(`ZIP ${zipCode}: Using verified center point [${centerPoint.lat.toFixed(6)}, ${centerPoint.lng.toFixed(6)}]`);
    
    // Create small squares/diamonds for additional vendors positioned consistently at center
    additionalVendors.forEach((vendor, index) => {
        const vendorColor = assignVendorColor(vendor.vendor, mapData.vendorList);
        
        // Position squares in a tight grid pattern around the verified center
        const gridSize = Math.ceil(Math.sqrt(additionalVendors.length));
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        
        // Use very small offsets to ensure we stay within the polygon
        const offsetLat = (row - (gridSize - 1) / 2) * 0.001; // Further reduced
        const offsetLng = (col - (gridSize - 1) / 2) * 0.001; // Further reduced
        
        const squareLat = centerPoint.lat + offsetLat;
        const squareLng = centerPoint.lng + offsetLng;
        
        // Create a square marker using DivIcon for better shape control
        const squareMarker = L.marker([squareLat, squareLng], {
            icon: L.divIcon({
                className: 'vendor-square-marker',
                html: `<div style="
                    width: 12px;
                    height: 12px;
                    background-color: ${vendorColor};
                    border: 2px solid #ffffff;
                    border-radius: 2px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                    transform: rotate(45deg);
                    transform-origin: center;
                "></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        });
        
        // No tooltip for vendor squares - ZIP tooltip shows all vendor info
        
        // Add click handler to highlight this vendor
        squareMarker.on('click', function(e) {
            e.stopPropagation(); // Prevent ZIP click event
            highlightVendorTerritory(vendor.vendor);
        });
        
        vendorDotsLayer.addLayer(squareMarker);
    });
    
    console.log(`Created ${additionalVendors.length} vendor squares for ZIP ${zipCode} at verified center position`);
};

// Create context-aware tooltip for vendor data
const createContextAwareTooltip = (zipCode, vendors) => {
    if (vendors.length === 0) {
        return `
            <div style="
                font-family: Arial, sans-serif; 
                font-size: 14px; 
                line-height: 1.4; 
                color: #333; 
                max-width: 550px; 
                word-wrap: break-word;
                padding: 10px;
            ">
                <strong>ZIP ${zipCode}</strong><br>
                <em style="color: #666;">No vendor data</em>
            </div>
        `;
    }
    
    const totalPrintPieces = vendors.reduce((sum, v) => sum + v.printPieces, 0);
    const totalVisitors = vendors.reduce((sum, v) => sum + v.visitors, 0);
    const overallEfficiency = calculateEfficiency(totalVisitors, totalPrintPieces);
    const efficiencyTier = getEfficiencyTier(overallEfficiency);
    
    // Enhanced header with much better spacing
    let content = `
        <div style="
            font-family: Arial, sans-serif; 
            font-size: 14px; 
            line-height: 1.4; 
            color: #333; 
            max-width: 550px;
            padding: 10px;
            word-wrap: break-word;
            box-sizing: border-box;
        ">
            <div style="
                background: ${efficiencyTier === 'high' ? '#d4edda' : efficiencyTier === 'medium' ? '#fff3cd' : '#f8d7da'}; 
                padding: 12px; 
                margin-bottom: 12px; 
                border-radius: 5px;
                border-left: 5px solid ${efficiencyTier === 'high' ? '#28a745' : efficiencyTier === 'medium' ? '#ffc107' : '#dc3545'};
            ">
                <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">
                    ZIP Code ${zipCode} ${vendors.length > 1 ? `(${vendors.length} vendors)` : ''}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 13px;">
                    <div><strong>Visitors:</strong><br>${totalVisitors.toLocaleString()}</div>
                    <div><strong>Print Pieces:</strong><br>${totalPrintPieces.toLocaleString()}</div>
                    <div><strong>Efficiency:</strong><br>${overallEfficiency.toFixed(1)}%</div>
                </div>
                <div style="margin-top: 8px; text-align: center;">
                    <span style="
                        padding: 4px 12px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: bold;
                        background: ${efficiencyTier === 'high' ? '#28a745' : efficiencyTier === 'medium' ? '#ffc107' : '#dc3545'};
                        color: white;
                        text-transform: uppercase;
                    ">${efficiencyTier} PERFORMANCE</span>
                </div>
            </div>
    `;
    
    // Vendor details with much improved spacing and table format
    if (vendors.length === 1) {
        const vendor = vendors[0];
        const vendorColor = assignVendorColor(vendor.vendor, mapData.vendorList);
        
        content += `
            <div style="
                display: flex; 
                align-items: center; 
                gap: 12px; 
                padding: 10px;
                background: #f8f9fa;
                border-radius: 5px;
                margin-bottom: 8px;
            ">
                <div style="
                    width: 20px; 
                    height: 20px; 
                    background: ${vendorColor}; 
                    border: 2px solid #666; 
                    border-radius: 4px; 
                    flex-shrink: 0;
                "></div>
                <div style="
                    font-weight: bold; 
                    font-size: 14px;
                    flex: 1;
                    word-wrap: break-word;
                ">${vendor.vendor}</div>
            </div>
        `;
    } else {
        // Multiple vendors with enhanced table layout
        content += `<div style="margin-top: 8px;">`;
        content += `<div style="font-weight: bold; margin-bottom: 10px; font-size: 13px; color: #555;">Vendor Performance Details:</div>`;
        
        // Table header
        content += `
            <div style="
                display: grid;
                grid-template-columns: 25px 2fr 90px 90px 70px;
                gap: 8px;
                align-items: center;
                padding: 6px 8px;
                margin-bottom: 4px;
                background: #e9ecef;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
                color: #495057;
                border: 1px solid #dee2e6;
            ">
                <div></div>
                <div>Vendor Name</div>
                <div style="text-align: center;">Visitors</div>
                <div style="text-align: center;">Print Pieces</div>
                <div style="text-align: center;">Efficiency</div>
            </div>
        `;
        
        vendors.forEach((vendor, index) => {
            const vendorColor = assignVendorColor(vendor.vendor, mapData.vendorList);
            
            content += `
                <div style="
                    display: grid;
                    grid-template-columns: 25px 2fr 90px 90px 70px;
                    gap: 8px;
                    align-items: center;
                    padding: 6px 8px;
                    margin-bottom: 2px;
                    background: ${index % 2 === 0 ? '#f8f9fa' : 'white'};
                    border-radius: 4px;
                    font-size: 12px;
                    border: 1px solid #e9ecef;
                ">
                    <div style="
                        width: 16px; 
                        height: 16px; 
                        background: ${vendorColor}; 
                        border: 2px solid #666; 
                        border-radius: 3px;
                    "></div>
                    <div style="
                        font-weight: bold;
                        word-wrap: break-word;
                        font-size: 12px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">${vendor.vendor}</div>
                    <div style="
                        text-align: center;
                        color: #666;
                        font-size: 11px;
                        font-family: monospace;
                    ">${vendor.visitors.toLocaleString()}</div>
                    <div style="
                        text-align: center;
                        color: #666;
                        font-size: 11px;
                        font-family: monospace;
                        font-weight: bold;
                    ">${vendor.printPieces.toLocaleString()}</div>
                    <div style="
                        text-align: center;
                        color: #666;
                        font-size: 11px;
                        font-weight: bold;
                        font-family: monospace;
                    ">${vendor.efficiency.toFixed(1)}%</div>
                </div>
            `;
        });
        
        content += `</div>`;
    }
    
    content += '</div>';
    return content;
};

// Create store locations layer
const createStoreLocationsLayer = () => {
    console.log('Creating store locations layer...');
    
    if (storeLocationsLayer) {
        map.removeLayer(storeLocationsLayer);
    }
    
    storeLocationsLayer = L.layerGroup();
    
    mapData.storeData.forEach(store => {
        // Ensure store has valid data
        if (!store.name || isNaN(store.latitude) || isNaN(store.longitude)) {
            console.warn('Skipping invalid store data:', store);
            return;
        }
        
        const marker = L.marker([store.latitude, store.longitude], {
            icon: L.divIcon({
                className: 'store-marker',
                html: '<div style="background: #2c3e50; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: pointer;"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        });
        
        // Enhanced tooltip for store locations
        const tooltipContent = `
            <div style="
                font-family: Arial, sans-serif; 
                line-height: 1.4; 
                padding: 8px; 
                max-width: 250px;
                color: #333;
            ">
                <div style="font-weight: bold; margin-bottom: 4px; color: #2c3e50;">
                    ${store.name}
                </div>
                <div style="font-size: 12px; color: #666;">
                    ${store.address || 'Address not available'}
                </div>
            </div>
        `;
        
        marker.bindTooltip(tooltipContent, {
            sticky: true,
            className: 'store-tooltip',
            direction: 'top',
            offset: [0, -10]
        });
        
        // Add click interaction for stores if needed
        marker.on('click', function() {
            console.log('Store clicked:', store.name);
        });
        
        storeLocationsLayer.addLayer(marker);
    });
    
    if (showStoreLocations) {
        storeLocationsLayer.addTo(map);
    }
    
    console.log(`Store locations layer created with ${mapData.storeData.length} stores`);
};

// Highlight vendor territory
const highlightVendorTerritory = (vendorName) => {
    console.log('Highlighting vendor territory for:', vendorName);
    
    vendorChoroplethLayer.eachLayer(function(layer) {
        const zipCode = layer.feature.properties.ZCTA5CE20 || layer.feature.properties.ZCTA5CE10;
        const zipData = mapData.zipCodeData.find(d => d.zip == zipCode);
        
        if (zipData && zipData.vendor === vendorName) {
            layer.setStyle({
                weight: 4,
                color: '#000000',
                dashArray: '5, 5'
            });
            
            // Reset style after 3 seconds
            setTimeout(() => {
                layer.setStyle({
                    weight: 2,
                    color: '#333333',
                    dashArray: null
                });
            }, 3000);
        }
    });
};

// UI Creation Functions
const createVendorPerformanceControls = () => {
    const controlsContainer = document.createElement('div');
    controlsContainer.id = 'vendor-controls';
    controlsContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        max-width: 320px;
        font-family: Arial, sans-serif;
        border: 1px solid #ddd;
    `;
    
    controlsContainer.innerHTML = `
        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #333; border-bottom: 2px solid #007cba; padding-bottom: 8px;">
            Vendor Performance Analysis
        </h3>
        
        <div class="vendor-toggle-group" style="margin-bottom: 20px;">
            <div style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 14px;">
                    <input type="checkbox" id="toggle-vendor-choropleth" checked style="margin-right: 8px; transform: scale(1.2);">
                    <span>Vendor Choropleth</span>
                </label>
            </div>
            <div style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 14px;">
                    <input type="checkbox" id="toggle-efficiency-shading" checked style="margin-right: 8px; transform: scale(1.2);">
                    <span>Efficiency Shading</span>
                </label>
            </div>
            <div style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 14px;">
                    <input type="checkbox" id="toggle-store-locations" checked style="margin-right: 8px; transform: scale(1.2);">
                    <span>Store Locations</span>
                </label>
            </div>
            <div style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 14px;">
                    <input type="checkbox" id="toggle-low-performers" style="margin-right: 8px; transform: scale(1.2);">
                    <span>Highlight Low Performers (≤5%)</span>
                </label>
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 14px; margin-bottom: 8px; font-weight: bold;">
                Vendor Selection:
            </label>
            <div id="vendor-selection-info" style="font-size: 12px; color: #666; margin-bottom: 8px; padding: 4px 8px; background: #f8f9fa; border-radius: 3px;">
                All vendors selected
            </div>
            <div style="margin-bottom: 8px; display: flex; gap: 8px;">
                <button id="select-all-vendors" style="
                    flex: 1;
                    padding: 6px 12px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                ">✓ Select All</button>
                <button id="clear-all-vendors" style="
                    flex: 1;
                    padding: 6px 12px;
                    background: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                ">✗ Clear All</button>
            </div>
            <div id="vendor-checkbox-container" style="
                max-height: 200px;
                overflow-y: auto;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 8px;
                background: white;
            ">
                <!-- Vendor checkboxes will be populated here -->
            </div>
        </div>
        
        <div style="border-top: 1px solid #eee; padding-top: 15px;">
            <button id="refresh-data" style="
                width: 100%;
                padding: 8px 16px;
                background: #007cba;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                margin-bottom: 8px;
            ">Refresh Data</button>
        </div>
    `;
    
    document.body.appendChild(controlsContainer);
    setupControlEventListeners();
};

const setupControlEventListeners = () => {
    // Vendor choropleth toggle
    document.getElementById('toggle-vendor-choropleth').addEventListener('change', function(e) {
        if (e.target.checked && vendorChoroplethLayer) {
            vendorChoroplethLayer.addTo(map);
            if (vendorDotsLayer) {
                vendorDotsLayer.addTo(map);
            }
        } else {
            if (vendorChoroplethLayer) {
                map.removeLayer(vendorChoroplethLayer);
            }
            if (vendorDotsLayer) {
                map.removeLayer(vendorDotsLayer);
            }
        }
    });
    
    // Efficiency shading toggle
    document.getElementById('toggle-efficiency-shading').addEventListener('change', function(e) {
        efficiencyShading = e.target.checked;
        if (vendorChoroplethLayer) {
            createVendorChoroplethLayer();
        }
        updateLegend();
    });
    
    // Store locations toggle
    document.getElementById('toggle-store-locations').addEventListener('change', function(e) {
        showStoreLocations = e.target.checked;
        if (storeLocationsLayer) {
            if (showStoreLocations) {
                storeLocationsLayer.addTo(map);
            } else {
                map.removeLayer(storeLocationsLayer);
            }
        }
        updateLegend();
    });
    
    // Low performers highlight toggle
    document.getElementById('toggle-low-performers').addEventListener('change', function(e) {
        highlightLowPerformers = e.target.checked;
        if (vendorChoroplethLayer) {
            createVendorChoroplethLayer();
        }
    });
    
    // Select All vendors button
    document.getElementById('select-all-vendors').addEventListener('click', function() {
        const checkboxes = document.querySelectorAll('.vendor-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        selectedVendors = ['all'];
        updateVendorSelectionInfo();
        if (vendorChoroplethLayer) {
            createVendorChoroplethLayer();
        }
        updateLegend();
    });
    
    // Clear All vendors button
    document.getElementById('clear-all-vendors').addEventListener('click', function() {
        const checkboxes = document.querySelectorAll('.vendor-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        selectedVendors = [];
        updateVendorSelectionInfo();
        if (vendorChoroplethLayer) {
            createVendorChoroplethLayer();
        }
        updateLegend();
    });
    
    // Refresh data
    document.getElementById('refresh-data').addEventListener('click', function() {
        location.reload();
    });
};

const updateVendorFilterDropdown = () => {
    const container = document.getElementById('vendor-checkbox-container');
    if (!container || !mapData.vendorList) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create vendor checkboxes with performance data
    const vendorData = mapData.vendorList.map(vendor => {
        const vendorZips = Object.values(mapData.zipcodeVendorMap)
            .flat()
            .filter(v => v.vendor === vendor);
        
        const avgEfficiency = vendorZips.length > 0 
            ? vendorZips.reduce((sum, v) => sum + v.efficiency, 0) / vendorZips.length 
            : 0;
        
        const areaCount = [...new Set(
            Object.entries(mapData.zipcodeVendorMap)
                .filter(([zip, vendors]) => vendors.some(v => v.vendor === vendor))
                .map(([zip]) => zip)
        )].length;
        
        return {
            vendor,
            avgEfficiency,
            areaCount
        };
    });
    
    // Sort by efficiency (descending) then by name
    vendorData.sort((a, b) => {
        const efficiencyDiff = b.avgEfficiency - a.avgEfficiency;
        return efficiencyDiff !== 0 ? efficiencyDiff : a.vendor.localeCompare(b.vendor);
    });
    
    // Create checkbox for each vendor
    vendorData.forEach(({ vendor, avgEfficiency, areaCount }) => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.style.cssText = `
            margin-bottom: 8px;
            padding: 6px;
            border-radius: 4px;
            transition: background-color 0.2s;
        `;
        
        checkboxDiv.addEventListener('mouseenter', () => {
            checkboxDiv.style.backgroundColor = '#f8f9fa';
        });
        
        checkboxDiv.addEventListener('mouseleave', () => {
            checkboxDiv.style.backgroundColor = 'transparent';
        });
        
        const vendorColor = assignVendorColor(vendor, mapData.vendorList);
        
        checkboxDiv.innerHTML = `
            <label style="
                display: flex;
                align-items: center;
                cursor: pointer;
                font-size: 13px;
                line-height: 1.3;
                margin: 0;
            ">
                <input type="checkbox" 
                       class="vendor-checkbox" 
                       data-vendor="${vendor}" 
                       checked
                       style="
                           margin-right: 8px;
                           transform: scale(1.1);
                           cursor: pointer;
                       ">
                <div style="
                    width: 16px;
                    height: 16px;
                    background-color: ${vendorColor};
                    border: 1px solid #333;
                    border-radius: 3px;
                    margin-right: 8px;
                    flex-shrink: 0;
                "></div>
                <div style="flex: 1; min-width: 0;">
                    <div style="
                        font-weight: bold;
                        color: #333;
                        word-break: break-word;
                        margin-bottom: 2px;
                    ">${vendor}</div>
                    <div style="
                        font-size: 11px;
                        color: #666;
                        display: flex;
                        justify-content: space-between;
                    ">
                        <span>${areaCount} areas</span>
                        <span>${avgEfficiency.toFixed(1)}% avg</span>
                    </div>
                </div>
            </label>
        `;
        
        container.appendChild(checkboxDiv);
    });
    
    // Add event listeners to checkboxes
    container.addEventListener('change', handleVendorCheckboxChange);
    
    // Set initial state - all vendors selected
    selectedVendors = ['all'];
    updateVendorSelectionInfo();
    
    console.log('Updated vendor checkbox interface with', mapData.vendorList.length, 'vendors');
};

const handleVendorCheckboxChange = (event) => {
    if (event.target.classList.contains('vendor-checkbox')) {
        updateSelectedVendorsFromCheckboxes();
    }
};

const updateSelectedVendorsFromCheckboxes = () => {
    const checkboxes = document.querySelectorAll('.vendor-checkbox');
    const checkedVendors = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.vendor);
    
    if (checkedVendors.length === 0) {
        selectedVendors = [];
    } else if (checkedVendors.length === mapData.vendorList.length) {
        selectedVendors = ['all'];
    } else {
        selectedVendors = checkedVendors;
    }
    
    updateVendorSelectionInfo();
    
    // Update map with performance optimization
    requestAnimationFrame(() => {
        if (vendorChoroplethLayer) {
            createVendorChoroplethLayer();
        }
        updateLegend();
    });
};

const updateVendorSelectionInfo = () => {
    const infoElement = document.getElementById('vendor-selection-info');
    if (!infoElement) return;
    
    if (selectedVendors.includes('all')) {
        infoElement.textContent = `All vendors selected (${mapData.vendorList.length} total)`;
        infoElement.style.color = '#28a745';
        infoElement.style.backgroundColor = '#d4edda';
    } else if (selectedVendors.length === 0) {
        infoElement.textContent = 'No vendors selected - map will be empty';
        infoElement.style.color = '#dc3545';
        infoElement.style.backgroundColor = '#f8d7da';
    } else {
        infoElement.textContent = `${selectedVendors.length} of ${mapData.vendorList.length} vendors selected`;
        infoElement.style.color = '#007cba';
        infoElement.style.backgroundColor = '#cce7f0';
    }
};

const createLegend = () => {
    const legend = document.createElement('div');
    legend.id = 'vendor-legend';
    legend.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        max-width: 350px;
        max-height: 400px;
        overflow-y: auto;
        font-family: Arial, sans-serif;
        border: 1px solid #ddd;
    `;
    
    document.body.appendChild(legend);
    updateLegend();
};

const updateLegend = () => {
    const legend = document.getElementById('vendor-legend');
    if (!legend || !mapData.zipCodeData) return;
    
    // Get relevant vendors and their data
    const relevantVendors = selectedVendors.includes('all') 
        ? mapData.vendorList 
        : selectedVendors;
    
    // Calculate statistics for selected vendors
    const relevantZipData = Object.entries(mapData.zipcodeVendorMap)
        .filter(([zip, vendors]) => {
            if (selectedVendors.includes('all')) return true;
            return vendors.some(v => selectedVendors.includes(v.vendor));
        })
        .map(([zip, vendors]) => {
            const filteredVendors = selectedVendors.includes('all') 
                ? vendors 
                : vendors.filter(v => selectedVendors.includes(v.vendor));
            
            const totalPrintPieces = filteredVendors.reduce((sum, v) => sum + v.printPieces, 0);
            const totalVisitors = filteredVendors.reduce((sum, v) => sum + v.visitors, 0);
            const efficiency = calculateEfficiency(totalVisitors, totalPrintPieces);
            
            return {
                zip,
                vendors: filteredVendors,
                efficiency,
                efficiencyTier: getEfficiencyTier(efficiency),
                hasOverlap: filteredVendors.length > 1
            };
        });
    
    const lowCount = relevantZipData.filter(d => d.efficiencyTier === 'low').length;
    const mediumCount = relevantZipData.filter(d => d.efficiencyTier === 'medium').length;
    const highCount = relevantZipData.filter(d => d.efficiencyTier === 'high').length;
    const overlapCount = relevantZipData.filter(d => d.hasOverlap).length;
    
    let content = `
        <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #333;">
            Legend ${relevantVendors.length > 0 ? `(${relevantVendors.length} vendors)` : ''}
        </h3>
    `;
    
    if (relevantVendors.length === 0) {
        content += `
            <div style="text-align: center; color: #666; padding: 20px;">
                <strong>No vendors selected</strong><br>
                <small>Select vendors to see data visualization</small>
            </div>
        `;
    } else {
        content += `
            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #555;">
                    Performance Overview ${efficiencyShading ? '(with shading)' : '(solid colors)'}
                </h4>
                <div style="margin-bottom: 8px; display: flex; align-items: center;">
                    <div style="width: 20px; height: 15px; background: rgba(231, 76, 60, ${efficiencyShading ? '0.3' : '1.0'}); margin-right: 8px; border: 1px solid #ccc;"></div>
                    <span style="font-size: 12px;">Low (≤5%) - ${lowCount} areas</span>
                </div>
                <div style="margin-bottom: 8px; display: flex; align-items: center;">
                    <div style="width: 20px; height: 15px; background: rgba(231, 76, 60, ${efficiencyShading ? '0.6' : '1.0'}); margin-right: 8px; border: 1px solid #ccc;"></div>
                    <span style="font-size: 12px;">Medium (5.1-49%) - ${mediumCount} areas</span>
                </div>
                <div style="margin-bottom: 8px; display: flex; align-items: center;">
                    <div style="width: 20px; height: 15px; background: rgba(231, 76, 60, 1.0); margin-right: 8px; border: 1px solid #ccc;"></div>
                    <span style="font-size: 12px;">High (≥50%) - ${highCount} areas</span>
                </div>
        `;
        
        if (overlapCount > 0) {
            content += `
                <div style="margin-top: 12px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                    <div style="display: flex; align-items: center; margin-bottom: 6px;">
                        <div style="
                            width: 20px; 
                            height: 15px; 
                            background: #e74c3c;
                            border: 1px solid #333;
                            margin-right: 8px;
                            position: relative;
                        ">
                            <div style="
                                position: absolute;
                                top: 1px;
                                right: 1px;
                                width: 8px;
                                height: 8px;
                                background: #3498db;
                                border: 1px solid #fff;
                                border-radius: 1px;
                                transform: rotate(45deg);
                            "></div>
                        </div>
                        <span style="font-size: 12px;"><strong>Multi-Vendor Areas - ${overlapCount} ZIPs</strong></span>
                    </div>
                    <div style="margin-bottom: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #666;">
                            <div style="
                                width: 12px;
                                height: 12px;
                                background: #e74c3c;
                                border: 1px solid #333;
                            "></div>
                            <span>Dominant vendor (highest print volume)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #666; margin-top: 4px;">
                            <div style="
                                width: 8px;
                                height: 8px;
                                background: #3498db;
                                border: 1px solid #fff;
                                border-radius: 1px;
                                transform: rotate(45deg);
                            "></div>
                            <span>Additional vendors (diamond shapes at center)</span>
                        </div>
                    </div>
                    <small style="color: #666;">Each ZIP shows the color of its dominant vendor with diamonds for others</small>
                </div>
            `;
        }
        
        content += `</div>`;
        
        if (relevantVendors.length <= 15) { // Only show individual vendors if not too many
            content += `
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #555;">
                        Selected Vendors (${relevantVendors.length})
                    </h4>
                    <div style="max-height: 200px; overflow-y: auto;">
            `;
            
            relevantVendors.forEach(vendor => {
                const vendorColor = assignVendorColor(vendor, mapData.vendorList);
                const vendorData = Object.values(mapData.zipcodeVendorMap)
                    .flat()
                    .filter(v => v.vendor === vendor);
                
                const vendorZipCount = [...new Set(
                    Object.entries(mapData.zipcodeVendorMap)
                        .filter(([zip, vendors]) => vendors.some(v => v.vendor === vendor))
                        .map(([zip]) => zip)
                )].length;
                
                // Count where this vendor is dominant
                const dominantZipCount = Object.entries(mapData.zipcodeVendorMap)
                    .filter(([zip, vendors]) => {
                        const relevantVendors = selectedVendors.includes('all') 
                            ? vendors 
                            : vendors.filter(v => selectedVendors.includes(v.vendor));
                        const dominant = getDominantVendor(relevantVendors);
                        return dominant && dominant.vendor === vendor;
                    }).length;
                
                const avgEfficiency = vendorData.length > 0 
                    ? vendorData.reduce((sum, v) => sum + v.efficiency, 0) / vendorData.length 
                    : 0;
                
                content += `
                    <div style="margin-bottom: 6px; display: flex; align-items: center; font-size: 11px;">
                        <div style="width: 15px; height: 15px; background: ${vendorColor}; margin-right: 8px; border: 1px solid #ccc;"></div>
                        <span style="flex: 1; word-break: break-word;">${vendor}</span>
                        <span style="color: #666; margin-left: 4px; font-size: 10px;">
                            ${dominantZipCount}/${vendorZipCount} dominant, ${avgEfficiency.toFixed(1)}%
                        </span>
                    </div>
                `;
            });
            
            content += `</div></div>`;
        } else {
            content += `
                <div style="margin-bottom: 20px; text-align: center; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                    <strong>${relevantVendors.length} vendors selected</strong><br>
                    <small style="color: #666;">Too many to display individually</small>
                </div>
            `;
        }
    }
    
    if (showStoreLocations) {
        content += `
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #555;">
                    Store Locations
                </h4>
                <div style="display: flex; align-items: center;">
                    <div style="width: 12px; height: 12px; background: #2c3e50; border-radius: 50%; border: 2px solid white; margin-right: 8px;"></div>
                    <span style="font-size: 12px;">Store Location (${mapData.storeData.length} stores)</span>
                </div>
            </div>
        `;
    }
    
    legend.innerHTML = content;
};

// Utility functions
const showLoadingIndicator = (message) => {
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'loading-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            text-align: center;
            font-family: Arial, sans-serif;
        `;
        document.body.appendChild(indicator);
    }
    indicator.innerHTML = `
        <div style="font-size: 16px; margin-bottom: 10px;">${message}</div>
        <div style="width: 30px; height: 30px; border: 3px solid #f3f3f3; border-top: 3px solid #007cba; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
};

const hideLoadingIndicator = () => {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.remove();
    }
};

const showErrorMessage = (message) => {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #dc3545;
        color: white;
        padding: 15px 20px;
        border-radius: 4px;
        z-index: 10000;
        font-family: Arial, sans-serif;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
};

// CSV loading and processing functions
const loadCSV = async (filepath) => {
    const response = await fetch(filepath);
    const csvText = await response.text();
    
    return Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';']
    }).data;
};

// Color blending functions for vendor overlaps
const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

const rgbToHex = (r, g, b) => {
    return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
};

const blendColors = (colors) => {
    if (colors.length === 1) return colors[0];
    if (colors.length === 0) return '#cccccc';
    
    console.log('Blending colors:', colors);
    
    // Convert all colors to RGB
    const rgbColors = colors.map(color => hexToRgb(color)).filter(rgb => rgb !== null);
    
    if (rgbColors.length === 0) return '#cccccc';
    
    // Calculate weighted average (can be modified for different blending approaches)
    const avgR = rgbColors.reduce((sum, rgb) => sum + rgb.r, 0) / rgbColors.length;
    const avgG = rgbColors.reduce((sum, rgb) => sum + rgb.g, 0) / rgbColors.length;
    const avgB = rgbColors.reduce((sum, rgb) => sum + rgb.b, 0) / rgbColors.length;
    
    const blendedColor = rgbToHex(avgR, avgG, avgB);
    console.log('Blended result:', blendedColor);
    
    return blendedColor;
};

// Enhanced color blending with vendor weighting (based on performance or market share)
const blendColorsWeighted = (vendorData) => {
    if (vendorData.length === 1) {
        return assignVendorColor(vendorData[0].vendor, mapData.vendorList);
    }
    if (vendorData.length === 0) return '#cccccc';
    
    console.log('Weighted blending for vendors:', vendorData.map(v => v.vendor));
    
    // Weight by print pieces (market presence)
    const totalPrintPieces = vendorData.reduce((sum, v) => sum + v.printPieces, 0);
    
    if (totalPrintPieces === 0) {
        // Fallback to simple average if no print data
        const colors = vendorData.map(v => assignVendorColor(v.vendor, mapData.vendorList));
        return blendColors(colors);
    }
    
    let weightedR = 0, weightedG = 0, weightedB = 0;
    
    vendorData.forEach(vendor => {
        const color = assignVendorColor(vendor.vendor, mapData.vendorList);
        const rgb = hexToRgb(color);
        const weight = vendor.printPieces / totalPrintPieces;
        
        if (rgb) {
            weightedR += rgb.r * weight;
            weightedG += rgb.g * weight;
            weightedB += rgb.b * weight;
        }
    });
    
    const blendedColor = rgbToHex(weightedR, weightedG, weightedB);
    console.log('Weighted blend result:', blendedColor);
    
    return blendedColor;
};

const getDominantVendor = (vendorsInZip) => {
    if (!vendorsInZip || vendorsInZip.length === 0) return null;
    
    // Find vendor with highest print quantity
    return vendorsInZip.reduce((dominant, current) => {
        return current.printPieces > dominant.printPieces ? current : dominant;
    });
};

const getAdditionalVendors = (vendorsInZip, dominantVendor) => {
    if (!vendorsInZip || !dominantVendor) return [];
    
    return vendorsInZip.filter(vendor => vendor.vendor !== dominantVendor.vendor);
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing vendor performance choropleth map...');
    
    // Initialize map
    map = L.map('map').setView(MAP_CENTER, ZOOM_LEVEL);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Create UI components
    createVendorPerformanceControls();
    createLegend();
    
    // Load data
    loadDataLayers();
});

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (map) {
        map.remove();
        map = null;
    }
}); 