# Vendor Performance Choropleth Map

This web application provides a comprehensive vendor performance analysis tool for print ad distribution campaigns. It visualizes the efficiency of print advertisement distribution across New York state and Vermont by comparing print piece distribution with actual store visitor data from corresponding ZIP codes.

## 🎯 Business Insights

The map enables key business decisions by providing:

- **Vendor Performance Ranking:** Identify which vendors consistently achieve high efficiency ratios
- **Territory Optimization:** Spot underperforming areas within each vendor's territory  
- **Resource Allocation:** Reduce print distribution in consistently low-performing areas (≤5% efficiency)
- **Problem Area Identification:** Quickly identify areas with poor visitor-to-print ratios

## ✨ Key Features

### **Vendor-Based Choropleth with Efficiency Shading**
- Each vendor gets a distinct color from a 21-color palette
- Efficiency shading with three performance tiers:
  - **Low (≤5%)**: 30% opacity - Indicates poor performance
  - **Medium (5.1-49%)**: 60% opacity - Moderate performance  
  - **High (≥50%)**: 100% opacity - Excellent performance

### **Interactive Controls**
- **Vendor Choropleth Toggle:** Show/hide the main vendor layer
- **Efficiency Shading Toggle:** Switch between shaded and solid vendor colors
- **Store Locations Toggle:** Display/hide store location markers
- **Highlight Low Performers:** Add red dashed borders to areas with ≤5% efficiency
- **Vendor Filter Dropdown:** Focus on a specific vendor's territory

### **Enhanced Data Visualization**
- **Smart CSV Processing:** Filters out invalid data (N/A, null values) and aggregates multiple visitor entries per ZIP code
- **Professional Tooltips:** Detailed information on hover including efficiency metrics and performance tier
- **Click Interactions:** Click any ZIP code to highlight the entire vendor's territory
- **Dynamic Legend:** Updates based on current filters with vendor statistics

### **Store Location Mapping**
- Store locations displayed as distinctive markers
- Hover tooltips show store name and address
- Professional styling that doesn't interfere with choropleth data

## 📊 Data Processing

The application intelligently processes three CSV datasets:

### **Print Distribution Data** (`input/print_distribution.csv`)
```csv
zip,quantity,vendor,notes
45201,1250,PrintMax Pro,High-density residential area
45202,850,Local Media Group,
45203,2100,PrintMax Pro,Shopping district coverage
```

### **Visitor Data** (`input/visitor_data.csv`)
```csv
zipcode,visitors
45201,450
45201,400
45202,N/A
45202,720
```

### **Store Locations** (`input/store_locations.csv`)
```csv
name,lat,lng,address
Main Street Store,39.1012,-84.5120,123 Main St
Downtown Location,39.1031,-84.5125,456 Oak Ave
```

## 🚀 Getting Started

### **Prerequisites**
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Python 3.x (for local server)
- Internet connection (for map tiles)

### **Quick Start**
1. **Clone or download** this repository
2. **Navigate** to the project directory
3. **Start a local server:**
   ```bash
   python3 -m http.server 4001
   ```
4. **Open your browser** to `http://localhost:4001`
5. **Explore the map** using the interactive controls

### **Usage Instructions**

1. **Analyze Overall Performance:**
   - View all vendors at once to compare territorial coverage
   - Look for patterns in efficiency across different regions

2. **Focus on Specific Vendors:**
   - Use the vendor filter dropdown to isolate individual vendor performance
   - Click ZIP codes to highlight vendor territories

3. **Identify Problem Areas:**
   - Enable "Highlight Low Performers" to see areas with ≤5% efficiency
   - Light-colored areas indicate poor visitor-to-print ratios

4. **Toggle Views:**
   - Turn off efficiency shading to see pure vendor territories
   - Hide vendor layer to focus on store locations only

## 🔧 Technical Architecture

**Frontend Technologies:**
- **HTML5/CSS3/JavaScript ES6+:** Modern web standards
- **Leaflet.js:** Interactive mapping and choropleth rendering
- **Papa Parse:** Robust CSV data processing with error handling
- **Custom Business Logic:** Efficiency calculations and vendor assignment

**Data Processing Pipeline:**
```javascript
// Efficiency calculation
const calculateEfficiency = (visitors, printPieces) => {
  return printPieces > 0 ? (visitors / printPieces) * 100 : 0;
};

// Performance tier classification
const getEfficiencyTier = (efficiency) => {
  if (efficiency <= 5) return 'low';
  if (efficiency <= 49) return 'medium';
  return 'high';
};
```

**Key Business Functions:**
- Smart data aggregation with validation
- Vendor color assignment algorithm
- Efficiency-based opacity calculation
- Territory highlighting and interaction

## 📁 Project Structure

```
├── index.html              # Main application page
├── script-fixed.js          # Vendor performance choropleth implementation
├── style.css               # Professional styling and responsive design
├── input/                  # Data directory
│   ├── print_distribution.csv
│   ├── visitor_data.csv
│   ├── store_locations.csv
│   ├── NY_ZIP.geojson
│   └── VT_ZIP.geojson
├── README.md               # This documentation
└── .gitignore             # Git ignore file
```

## 🐛 Troubleshooting

**Common Issues:**

1. **Map not loading:**
   - Check internet connection for map tiles
   - Ensure local server is running on port 4001
   - Verify CSV files are in the `input/` directory

2. **No vendor data showing:**
   - Check browser console for CSV parsing errors
   - Verify CSV files have correct headers and format
   - Ensure print distribution data has vendor column

3. **Performance issues:**
   - Large datasets may take time to process
   - Check browser console for error messages
   - Try refreshing the page

## 📈 Business Metrics Explained

- **Efficiency Ratio:** `(Total Visitors ÷ Print Pieces) × 100`
- **Performance Tiers:** Based on efficiency percentages
- **Vendor Coverage:** Number of ZIP codes served by each vendor
- **Average Efficiency:** Mean efficiency across all ZIP codes for a vendor

## 🤝 Contributing

This is a business intelligence tool designed for internal analysis. For modifications or enhancements:

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Test thoroughly with your data
5. Submit a pull request

## 📄 License

This project is proprietary business intelligence software. Internal use and modification permitted.

---

**For support or questions about vendor performance analysis, contact your business intelligence team.** 