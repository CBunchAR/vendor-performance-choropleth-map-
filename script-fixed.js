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
    vendorList: []
};

// Global state variables
let efficiencyShading = true;
let showStoreLocations = true;
let highlightLowPerformers = false;
let selectedVendor = 'all';

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
    
    // Only process zip codes that exist in print distribution data
    const zipCodeData = printData.map(printRow => {
        const zip = String(printRow.zip || printRow['ZIP Code'] || '').trim();
        const vendor = printRow.vendor || 'Unknown Vendor';
        let quantity = printRow.quantity || printRow.Quantity || 0;
        
        if (typeof quantity === 'string') {
            quantity = parseInt(quantity.replace(/,/g, '')) || 0;
        }
        
        const totalVisitors = visitorsByZip[zip] || 0;
        const efficiency = calculateEfficiency(totalVisitors, quantity);
        
        console.log(`Processing ZIP ${zip}: vendor=${vendor}, quantity=${quantity}, visitors=${totalVisitors}, efficiency=${efficiency.toFixed(2)}%`);
        
        return {
            zip: zip,
            visitors: totalVisitors,
            printPieces: quantity,
            vendor: vendor,
            notes: printRow.notes || '',
            efficiency: efficiency,
            efficiencyTier: getEfficiencyTier(efficiency)
        };
    }).filter(item => item.zip && item.printPieces > 0);
    
    // Get unique vendor list
    const vendorList = [...new Set(zipCodeData.map(item => item.vendor))].sort();
    
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
        sampleZipData: zipCodeData.slice(0, 3)
    });
    
    return {
        zipCodeData: zipCodeData,
        storeData: processedStoreData,
        vendorList: vendorList
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
            vendorList: processedData.vendorList
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
            const zipData = mapData.zipCodeData.find(d => d.zip == zipCode);
            
            if (!zipData || (selectedVendor !== 'all' && zipData.vendor !== selectedVendor)) {
                return {
                    fillColor: '#f0f0f0',
                    fillOpacity: 0.3,
                    weight: 1,
                    color: '#cccccc'
                };
            }
            
            const vendorColor = assignVendorColor(zipData.vendor, mapData.vendorList);
            const finalColor = getVendorColorWithEfficiency(vendorColor, zipData.efficiency);
            
            let style = {
                fillColor: finalColor,
                fillOpacity: efficiencyShading ? getEfficiencyOpacity(zipData.efficiency) : 0.7,
                weight: 2,
                color: '#333333'
            };
            
            // Add dashed red border for low performers if enabled
            if (highlightLowPerformers && zipData.efficiencyTier === 'low') {
                style.color = '#dc3545';
                style.weight = 3;
                style.dashArray = '8, 4';
            }
            
            return style;
        },
        onEachFeature: function(feature, layer) {
            const zipCode = feature.properties.ZCTA5CE20 || feature.properties.ZCTA5CE10;
            const zipData = mapData.zipCodeData.find(d => d.zip == zipCode);
            
            if (zipData) {
                // Enhanced tooltip
                layer.bindTooltip(`
                    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
                        <strong>Zip Code ${zipData.zip}</strong><br>
                        <strong>Vendor:</strong> ${zipData.vendor}<br>
                        <strong>Visitors:</strong> ${zipData.visitors.toLocaleString()} (6 weeks)<br>
                        <strong>Print Pieces:</strong> ${zipData.printPieces.toLocaleString()} (6 weeks)<br>
                        <strong>Efficiency:</strong> ${zipData.efficiency.toFixed(1)}% (visitors/pieces ratio)<br>
                        <strong>Performance:</strong> ${zipData.efficiencyTier.charAt(0).toUpperCase() + zipData.efficiencyTier.slice(1)} Efficiency
                        ${zipData.notes ? '<br><strong>Notes:</strong> ' + zipData.notes : ''}
                    </div>
                `, {
                    sticky: true,
                    className: 'vendor-tooltip'
                });
                
                // Click interaction to highlight vendor territory
                layer.on('click', function() {
                    highlightVendorTerritory(zipData.vendor);
                });
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
    
    console.log('Vendor choropleth layer created');
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
                Vendor Filter:
            </label>
            <select id="vendor-filter" style="
                width: 100%;
                padding: 6px 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            ">
                <option value="all">All Vendors</option>
            </select>
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
    
    // Vendor filter
    document.getElementById('vendor-filter').addEventListener('change', function(e) {
        selectedVendor = e.target.value;
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
    const dropdown = document.getElementById('vendor-filter');
    if (!dropdown || !mapData.vendorList) return;
    
    // Clear existing options except "All Vendors"
    dropdown.innerHTML = '<option value="all">All Vendors</option>';
    
    // Add vendor options
    mapData.vendorList.forEach(vendor => {
        const option = document.createElement('option');
        option.value = vendor;
        option.textContent = vendor;
        dropdown.appendChild(option);
    });
    
    console.log('Updated vendor filter dropdown with', mapData.vendorList.length, 'vendors');
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
    
    // Filter data based on selected vendor
    const filteredData = selectedVendor === 'all' 
        ? mapData.zipCodeData 
        : mapData.zipCodeData.filter(d => d.vendor === selectedVendor);
    
    // Calculate efficiency statistics
    const lowCount = filteredData.filter(d => d.efficiencyTier === 'low').length;
    const mediumCount = filteredData.filter(d => d.efficiencyTier === 'medium').length;
    const highCount = filteredData.filter(d => d.efficiencyTier === 'high').length;
    
    let content = `
        <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #333;">
            Legend
        </h3>
        
        <div style="margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #555;">
                Efficiency Tiers ${efficiencyShading ? '(with shading)' : '(solid colors)'}
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
        </div>
    `;
    
    if (selectedVendor === 'all' && mapData.vendorList.length > 0) {
        content += `
            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #555;">
                    Vendor Colors
                </h4>
                <div style="max-height: 150px; overflow-y: auto;">
        `;
        
        mapData.vendorList.forEach(vendor => {
            const vendorColor = assignVendorColor(vendor, mapData.vendorList);
            const vendorZips = mapData.zipCodeData.filter(d => d.vendor === vendor);
            const vendorZipCount = vendorZips.length;
            const avgEfficiency = vendorZips.length > 0 
                ? vendorZips.reduce((sum, d) => sum + d.efficiency, 0) / vendorZipCount 
                : 0;
            
            content += `
                <div style="margin-bottom: 6px; display: flex; align-items: center; font-size: 11px;">
                    <div style="width: 15px; height: 15px; background: ${vendorColor}; margin-right: 8px; border: 1px solid #ccc;"></div>
                    <span style="flex: 1;">${vendor}</span>
                    <span style="color: #666;">${vendorZipCount} areas, ${avgEfficiency.toFixed(1)}% avg</span>
                </div>
            `;
        });
        
        content += `</div></div>`;
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