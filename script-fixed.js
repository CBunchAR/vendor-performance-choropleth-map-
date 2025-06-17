// Global variables for map layers
let map;
let vendorChoroplethLayer;
let storeLocationsLayer;
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

// SVG Pattern Generation for Vendor Overlaps - REPLACED WITH CSS GRADIENTS
const createOverlapStyle = (vendorColors, efficiency) => {
    if (vendorColors.length <= 1) {
        return null;
    }
    
    console.log(`Creating overlap style for ${vendorColors.length} vendors:`, vendorColors);
    
    // Create CSS repeating linear gradient for stripes
    const stripeWidth = 100 / vendorColors.length; // Percentage width per stripe
    let gradientStops = [];
    
    vendorColors.forEach((color, index) => {
        const startPercent = index * stripeWidth;
        const endPercent = (index + 1) * stripeWidth;
        gradientStops.push(`${color} ${startPercent}%`);
        gradientStops.push(`${color} ${endPercent}%`);
    });
    
    const gradientString = `repeating-linear-gradient(45deg, ${gradientStops.join(', ')})`;
    console.log(`Created gradient: ${gradientString}`);
    
    return gradientString;
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
    
    // Remove existing layer if it exists
    if (vendorChoroplethLayer) {
        map.removeLayer(vendorChoroplethLayer);
    }
    
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
            
            const vendorColors = relevantVendors.map(v => assignVendorColor(v.vendor, mapData.vendorList));
            const efficiency = getZipEfficiency(zipCode, selectedVendors);
            const opacity = efficiencyShading ? getEfficiencyOpacity(efficiency) : 0.7;
            
            let style = {
                weight: 2,
                color: '#333333',
                fillOpacity: opacity
            };
            
            // Check if this ZIP has overlaps (multiple vendors originally, regardless of current selection)
            const hasMultipleVendorsOriginally = vendorsInZip && vendorsInZip.length > 1;
            const hasMultipleRelevantVendors = relevantVendors.length > 1;
            
            if (hasMultipleRelevantVendors) {
                // Multiple relevant vendors selected - show overlap pattern
                console.log(`ZIP ${zipCode}: Multiple relevant vendors (${relevantVendors.length}) - showing overlap pattern`);
                
                // Use striped border approach since CSS gradients don't work well with Leaflet
                style.fillColor = vendorColors[0]; // Primary color
                style.color = vendorColors[1] || vendorColors[0]; // Border color
                style.weight = 4;
                style.dashArray = '8, 4'; // Dashed border
                style.fillOpacity = 0.8;
                
                console.log(`Applied overlap styling to ZIP ${zipCode}`);
            } else if (hasMultipleVendorsOriginally && relevantVendors.length === 1) {
                // Single vendor selected from multi-vendor ZIP - show with special indication
                console.log(`ZIP ${zipCode}: Single vendor from multi-vendor area - showing with indicator`);
                style.fillColor = getVendorColorWithEfficiency(vendorColors[0], efficiency);
                style.color = '#ff6b35'; // Orange border to indicate this ZIP has other vendors
                style.weight = 3;
                style.dashArray = '4, 2'; // Different dash pattern
            } else {
                // Single vendor ZIP - normal display
                style.fillColor = getVendorColorWithEfficiency(vendorColors[0], efficiency);
                console.log(`ZIP ${zipCode}: Single vendor area - normal display`);
            }
            
            // Add dashed red border for low performers if enabled
            if (highlightLowPerformers && getEfficiencyTier(efficiency) === 'low') {
                style.color = '#dc3545';
                style.weight = 3;
                style.dashArray = '8, 4';
            }
            
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
    }
    
    console.log('Vendor choropleth layer created with multi-vendor support');
};

// Create context-aware tooltip for vendor data
const createContextAwareTooltip = (zipCode, vendors) => {
    if (vendors.length === 0) {
        return `
            <div style="
                font-family: Arial, sans-serif; 
                font-size: 12px; 
                line-height: 1.3; 
                color: #333; 
                max-width: 220px; 
                word-wrap: break-word;
                padding: 4px;
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
    
    // Compact header design
    let content = `
        <div style="
            font-family: Arial, sans-serif; 
            font-size: 12px; 
            line-height: 1.3; 
            color: #333; 
            max-width: 220px;
            padding: 6px;
            word-wrap: break-word;
            box-sizing: border-box;
        ">
            <div style="
                background: ${efficiencyTier === 'high' ? '#d4edda' : efficiencyTier === 'medium' ? '#fff3cd' : '#f8d7da'}; 
                padding: 6px; 
                margin-bottom: 6px; 
                border-radius: 3px;
                border-left: 3px solid ${efficiencyTier === 'high' ? '#28a745' : efficiencyTier === 'medium' ? '#ffc107' : '#dc3545'};
            ">
                <div style="font-weight: bold; margin-bottom: 3px;">
                    ZIP ${zipCode} ${vendors.length > 1 ? `(${vendors.length} vendors)` : ''}
                </div>
                <div style="font-size: 11px; line-height: 1.2;">
                    ${totalVisitors.toLocaleString()} visitors • ${totalPrintPieces.toLocaleString()} prints<br>
                    <strong>${overallEfficiency.toFixed(1)}% efficiency</strong>
                </div>
            </div>
    `;
    
    // Vendor details - more compact layout
    if (vendors.length === 1) {
        const vendor = vendors[0];
        const vendorColor = assignVendorColor(vendor.vendor, mapData.vendorList);
        
        content += `
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                <div style="
                    width: 10px; 
                    height: 10px; 
                    background: ${vendorColor}; 
                    border: 1px solid #666; 
                    border-radius: 2px; 
                    flex-shrink: 0;
                "></div>
                <div style="
                    font-weight: bold; 
                    font-size: 11px;
                    flex: 1;
                    word-wrap: break-word;
                ">${vendor.vendor}</div>
            </div>
        `;
    } else {
        // Multiple vendors - very compact list
        content += `<div style="margin-top: 4px;">`;
        
        vendors.slice(0, 4).forEach((vendor, index) => { // Limit to 4 vendors for space
            const vendorColor = assignVendorColor(vendor.vendor, mapData.vendorList);
            
            content += `
                <div style="
                    display: flex; 
                    align-items: center; 
                    gap: 4px;
                    margin-bottom: 3px; 
                    font-size: 10px;
                ">
                    <div style="
                        width: 8px; 
                        height: 8px; 
                        background: ${vendorColor}; 
                        border: 1px solid #666; 
                        border-radius: 1px; 
                        flex-shrink: 0;
                    "></div>
                    <div style="
                        flex: 1;
                        word-wrap: break-word;
                        line-height: 1.1;
                    ">
                        <strong>${vendor.vendor}</strong><br>
                        <span style="color: #666;">
                            ${vendor.visitors.toLocaleString()}v • ${vendor.efficiency.toFixed(1)}%
                        </span>
                    </div>
                </div>
            `;
        });
        
        if (vendors.length > 4) {
            content += `
                <div style="font-size: 10px; color: #666; text-align: center; margin-top: 3px;">
                    + ${vendors.length - 4} more vendors
                </div>
            `;
        }
        
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
        const marker = L.marker([store.latitude, store.longitude], {
            icon: L.divIcon({
                className: 'store-marker',
                html: '<div style="background: #2c3e50; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        });
        
        marker.bindTooltip(`
            <div style="font-family: Arial, sans-serif; line-height: 1.4;">
                <strong>${store.name}</strong><br>
                ${store.address}
            </div>
        `, {
            sticky: true,
            className: 'store-tooltip'
        });
        
        storeLocationsLayer.addLayer(marker);
    });
    
    if (showStoreLocations) {
        storeLocationsLayer.addTo(map);
    }
    
    console.log('Store locations layer created');
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
        } else if (vendorChoroplethLayer) {
            map.removeLayer(vendorChoroplethLayer);
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
                            border: 3px dashed #3498db;
                            margin-right: 8px;
                        "></div>
                        <span style="font-size: 12px;"><strong>Multi-Vendor Areas - ${overlapCount} total</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; margin-bottom: 4px;">
                        <div style="
                            width: 20px; 
                            height: 15px; 
                            background: #e74c3c; 
                            border: 2px dashed #ff6b35;
                            margin-right: 8px;
                        "></div>
                        <span style="font-size: 11px;">Single vendor from multi-vendor ZIP</span>
                    </div>
                    <small style="color: #666;">Dashed borders indicate multiple vendors available in ZIP code</small>
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
                
                const avgEfficiency = vendorData.length > 0 
                    ? vendorData.reduce((sum, v) => sum + v.efficiency, 0) / vendorData.length 
                    : 0;
                
                content += `
                    <div style="margin-bottom: 6px; display: flex; align-items: center; font-size: 11px;">
                        <div style="width: 15px; height: 15px; background: ${vendorColor}; margin-right: 8px; border: 1px solid #ccc;"></div>
                        <span style="flex: 1; word-break: break-word;">${vendor}</span>
                        <span style="color: #666; margin-left: 4px;">${vendorZipCount} areas, ${avgEfficiency.toFixed(1)}%</span>
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