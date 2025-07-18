# DFU Demand Transfer Management

A web application for managing demand transfers between multiple variants of the same DFU (Demand Forecast Unit) code.

## Features

- **File Upload**: Upload Excel files with demand data
- **Multi-Variant Detection**: Automatically identifies DFU codes with multiple part code variants
- **Demand Transfer**: Transfer demand from multiple variants to a single consolidated variant
- **Search & Filter**: Search through DFU codes and part codes
- **Data Export**: Export updated demand data to Excel

## Usage

1. Open `index.html` in a web browser
2. Upload your Excel file containing demand data
3. Review DFU codes with multiple variants
4. Select target variants for demand consolidation
5. Execute transfers and export updated data

## Expected Data Format

Your Excel file should contain:
- DFU column (containing DFU codes)
- Product Number column (containing part codes)
- Demand column (weekly forecast or demand values)
- Calendar week and Source Location columns

## Deployment

### GitHub Pages
1. Create a new repository on GitHub
2. Upload all files to the repository
3. Go to Settings → Pages
4. Select "Deploy from a branch" and choose "main"
5. Your site will be available at `https://yourusername.github.io/repository-name`

### Local Development
Simply open `index.html` in a web browser.

## Technologies Used

- React 18
- Tailwind CSS
- XLSX.js for Excel file processing
- Lucide React for icons

## License

MIT License
