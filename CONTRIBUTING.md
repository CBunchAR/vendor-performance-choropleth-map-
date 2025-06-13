# Contributing to Vendor Performance Choropleth Map

Thank you for your interest in contributing to the Vendor Performance Choropleth Map project! This document provides guidelines for contributing to this business intelligence tool.

## 🎯 Project Overview

This application provides vendor performance analysis for print advertisement distribution campaigns. It's designed to help business stakeholders make data-driven decisions about marketing resource allocation.

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Python 3.x for local development server
- Basic knowledge of HTML, CSS, JavaScript
- Understanding of Leaflet.js for mapping functionality

### Development Setup
1. Fork the repository
2. Clone your fork locally
3. Run the setup script: `./setup.sh`
4. Open `http://localhost:4001` in your browser

## 📝 Code Style Guidelines

### JavaScript
- Use ES6+ features where appropriate
- Follow camelCase naming convention
- Add JSDoc comments for functions
- Keep functions focused and single-purpose
- Use meaningful variable names

```javascript
/**
 * Calculate efficiency ratio for vendor performance analysis
 * @param {number} visitors - Total visitors from ZIP code
 * @param {number} printPieces - Number of print pieces distributed
 * @returns {number} Efficiency percentage (visitors/pieces * 100)
 */
const calculateEfficiency = (visitors, printPieces) => {
    return printPieces > 0 ? (visitors / printPieces) * 100 : 0;
};
```

### CSS
- Use BEM methodology for class naming
- Group related styles together
- Include responsive design considerations
- Use CSS custom properties for consistent theming

### HTML
- Use semantic HTML5 elements
- Ensure accessibility with proper ARIA labels
- Keep markup clean and minimal

## 🔧 Architecture Guidelines

### Business Logic
The application follows a clear separation of concerns:

- **Data Processing**: CSV parsing and validation in `processMapData()`
- **Visualization**: Choropleth rendering and layer management
- **Interaction**: User controls and event handling
- **Business Metrics**: Efficiency calculations and performance tiers

### Key Components

1. **Data Layer**: Handles CSV processing and GeoJSON integration
2. **Visualization Layer**: Manages Leaflet map and choropleth rendering
3. **Control Layer**: User interface and interaction management
4. **Business Logic**: Vendor assignment and efficiency calculations

## 📊 Data Format Requirements

### CSV File Standards
Ensure your data follows these formats:

**Print Distribution** (`input/print_distribution.csv`):
```csv
zip,quantity,vendor,notes
12345,1500,Vendor Name,Optional notes
```

**Visitor Data** (`input/visitor_data.csv`):
```csv
zipcode,visitors
12345,750
12345,N/A
```

**Store Locations** (`input/store_locations.csv`):
```csv
name,lat,lng,address
Store Name,40.7128,-74.0060,123 Main St
```

## 🧪 Testing Guidelines

### Manual Testing Checklist
- [ ] Map loads with correct initial view
- [ ] All CSV files parse without errors
- [ ] Vendor colors are distinct and consistent
- [ ] Efficiency shading works correctly
- [ ] Interactive controls function properly
- [ ] Tooltips display accurate information
- [ ] Click interactions highlight territories
- [ ] Legend updates with filter changes

### Browser Testing
Test on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

### Data Validation Testing
- Test with various CSV formats
- Verify handling of N/A values
- Confirm aggregation of multiple visitor entries
- Test with missing data scenarios

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment**: Browser, OS, device type
2. **Steps to Reproduce**: Detailed steps that trigger the issue
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Data Context**: Describe the data being used (without sensitive info)
6. **Console Errors**: Any JavaScript errors from browser console

## ✨ Feature Requests

For new features, please:

1. **Business Justification**: Explain the business value
2. **User Story**: Describe from user's perspective
3. **Technical Approach**: Suggest implementation method
4. **Impact Assessment**: Consider performance and complexity

## 📈 Performance Considerations

When contributing, keep in mind:

- **Large Datasets**: Application should handle 50-200 ZIP codes efficiently
- **Memory Usage**: Be mindful of GeoJSON data size (40MB+ files)
- **Rendering Performance**: Optimize choropleth updates and interactions
- **Network Requests**: Minimize external API calls

## 🔒 Security and Privacy

- **Data Sensitivity**: Never commit actual business data to repository
- **Sample Data**: Use anonymized or generated data for examples
- **API Keys**: Use environment variables for any external service keys
- **Input Validation**: Always validate CSV data before processing

## 📚 Documentation Requirements

For any contribution, please:

1. Update README.md if changing core functionality
2. Add JSDoc comments for new functions
3. Update this CONTRIBUTING.md for process changes
4. Include inline comments for complex business logic

## 🎯 Business Context

Remember this tool is used for:
- Strategic marketing decisions
- Budget allocation planning
- Vendor performance evaluation
- Territory optimization

Ensure changes align with these business objectives.

## ✅ Pull Request Process

1. **Fork and Branch**: Create a feature branch from main
2. **Develop**: Make changes following guidelines above
3. **Test**: Verify functionality across browsers and data scenarios
4. **Document**: Update relevant documentation
5. **Submit**: Create pull request with detailed description

### Pull Request Template
```markdown
## Change Description
Brief description of what this PR accomplishes

## Business Value
How this change benefits business users

## Testing Done
- [ ] Manual testing across browsers
- [ ] Data validation testing
- [ ] Performance impact assessment

## Documentation Updated
- [ ] README.md (if applicable)
- [ ] Code comments
- [ ] CONTRIBUTING.md (if applicable)
```

## 🤝 Code Review Guidelines

### For Reviewers
- Focus on business logic correctness
- Verify data handling security
- Check performance implications
- Ensure documentation quality

### For Contributors
- Respond promptly to feedback
- Explain business reasoning for changes
- Be open to alternative approaches
- Test suggested modifications

## 📞 Getting Help

For questions about:
- **Business Requirements**: Contact business intelligence team
- **Technical Implementation**: Open a GitHub issue
- **Data Format Issues**: Check sample data in repository
- **Performance Concerns**: Include profiling information

---

Thank you for contributing to making vendor performance analysis more effective and user-friendly! 