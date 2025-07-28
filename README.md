# DFU Demand Transfer Management Tool

A web-based application for managing demand transfers between product variants within Distribution Fulfillment Units (DFUs). This tool helps consolidate demand from multiple product variants into preferred variants for better inventory management.

## Features

- **Excel File Import**: Supports .xlsx and .xls files with automatic column detection
- **Multi-Variant DFU Detection**: Automatically identifies DFUs with multiple product variants
- **Two Transfer Methods**:
  - **Bulk Transfer**: Transfer all variants to a single target variant
  - **Individual Transfer**: Specify custom transfer mappings for each variant
- **Plant Location Filtering**: Filter DFUs by manufacturing plant location
- **Real-time Search**: Search and filter DFUs and variants
- **Transfer History Tracking**: Maintains audit trail of all transfers with timestamps
- **Data Export**: Export updated demand data to Excel format

## File Format Requirements

Your Excel file should contain the following columns:

| Column Name | Description | Required |
|-------------|-------------|----------|
| `DFU` | DFU codes | ✅ Yes |
| `Product Number` | Part/product codes | ✅ Yes |
| `weekly fcst` | Demand/forecast values | ✅ Yes |
| `PartDescription` | Product descriptions | ✅ Yes |
| `Plant Location` | Plant location codes | ✅ Yes |
| `Calendar.week` | Calendar week information | ✅ Yes |
| `Source Location` | Source location codes | ✅ Yes |

The tool will automatically look for a sheet named "Total Demand" but can also work with other sheet names.

## Getting Started

### Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- No server installation required - runs entirely in the browser

### Installation

1. Clone or download this repository:
```bash
git clone https://github.com/yourusername/dfu-demand-transfer.git
cd dfu-demand-transfer
```

2. Open `index.html` in your web browser, or serve it using a local server:
```bash
# Option 1: Simple Python server
python -m http.server 8000
# Then open http://localhost:8000

# Option 2: Node.js server (if you have Node.js installed)
npx http-server
```

### Usage

1. **Upload Data**: Click the file input area and select your Excel file
2. **Review DFUs**: Browse the list of DFUs with multiple variants
3. **Select Transfer Method**:
   - **Bulk Transfer**: Click a purple button to set all variants to transfer to that target
   - **Individual Transfer**: Use the dropdown menus to specify where each variant should go
4. **Execute Transfer**: Click "Execute Transfer" to apply your changes
5. **Export Results**: Click "Export Updated Data" to download the modified Excel file

## How It Works

### Transfer Logic

1. **Bulk Transfer**: All demand from non-target variants is consolidated into the target variant
2. **Individual Transfer**: Each source variant's demand is transferred to its specified target variant
3. **Record Consolidation**: Records with the same part number, calendar week, and source location are automatically consolidated
4. **Transfer History**: All transfers are logged with PIPO (Part In, Part Out) notation and timestamps

### Data Processing

- The tool groups records by DFU code and identifies variants (unique product numbers)
- Only DFUs with multiple variants are shown for review
- Demand values are summed across all records for each variant
- Zero-demand records are retained for audit purposes after transfers

## Technical Details

### Architecture

- **Frontend Only**: Pure JavaScript application with no backend dependencies
- **Libraries Used**:
  - [SheetJS](https://sheetjs.com/) for Excel file processing
  - [Tailwind CSS](https://tailwindcss.com/) for styling
- **Browser Compatibility**: ES6+ required (most modern browsers)

### File Structure

```
├── index.html          # Main HTML file
├── script.js           # Application logic
├── style.css           # Custom styles
├── package.json        # Project metadata
└── README.md          # This file
```

### Version History

- **v2.6.0** (2025-07-28): Updated for new Excel format with proper column mapping
- **v2.5.0** (2025-07-20): Added plant location filtering and improved UI
- **v2.4.0** (2025-07-15): Enhanced transfer logic and consolidation
- **v2.0.0** (2025-07-01): Major rewrite with bulk and individual transfer support

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:

1. Check the browser console for error messages
2. Ensure your Excel file matches the expected format
3. Verify all required columns are present
4. Open an issue on GitHub with details about your problem

## Troubleshooting

### Common Issues

**File not loading**: 
- Check that your file has the required columns
- Ensure the file format is .xlsx or .xls
- Try with a smaller file to test

**No DFUs found**:
- Verify that your data has DFUs with multiple product variants
- Check that the DFU column contains data
- Ensure plant location filtering isn't excluding all records

**Transfer not working**:
- Make sure you've selected either bulk or individual transfer options
- Check the browser console for any error messages
- Verify that the selected DFU has pending transfers configured
