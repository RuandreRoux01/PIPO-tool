// DFU Demand Transfer Management Application
class DemandTransferApp {
    constructor() {
        this.rawData = [];
        this.multiVariantDFUs = {};
        this.filteredDFUs = {};
        this.selectedDFU = null;
        this.searchTerm = '';
        this.transfers = {};
        this.isProcessed = false;
        this.isLoading = false;
        
        this.init();
    }
    
    init() {
        this.render();
        this.attachEventListeners();
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    }
    
    handleFileUpload(event) {
        const file = event.target.files[0];
        console.log('File selected:', file);
        
        if (!file) {
            console.log('No file selected');
            return;
        }
        
        if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
            this.showNotification('Please select an Excel file (.xlsx or .xls)', 'error');
            return;
        }
        
        this.loadData(file);
    }
    
    async loadData(file) {
        console.log('Starting to load data...');
        this.isLoading = true;
        this.render();
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            console.log('Array buffer size:', arrayBuffer.byteLength);
            
            const workbook = XLSX.read(arrayBuffer, { 
                cellStyles: true, 
                cellFormulas: true, 
                cellDates: true,
                cellNF: true,
                sheetStubs: true
            });
            
            console.log('Available sheets:', workbook.SheetNames);
            
            let sheetName = 'Open Fcst';
            if (!workbook.Sheets[sheetName]) {
                sheetName = workbook.SheetNames[0];
                console.log('Using first sheet:', sheetName);
            }
            
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);
            
            console.log('Data conversion complete');
            console.log('Loaded data:', data.length, 'records');
            
            if (data.length > 0) {
                console.log('Sample record:', data[0]);
                this.rawData = data;
                this.processMultiVariantDFUs(data);
                this.isProcessed = true;
                this.showNotification(`Successfully loaded ${data.length} records`);
            } else {
                this.showNotification('No data found in the Excel file', 'error');
            }
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('Error loading data: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
            this.render();
        }
    }
    
    processMultiVariantDFUs(data) {
        console.log('Processing data:', data.length, 'records');
        
        if (data.length === 0) {
            this.showNotification('No data found in the file', 'error');
            return;
        }
        
        const sampleRecord = data[0];
        console.log('Sample record:', sampleRecord);
        console.log('Available columns:', Object.keys(sampleRecord));
        
        const columns = Object.keys(sampleRecord);
        const dfuColumn = columns.find(col => col.toLowerCase().includes('dfu')) || 'DFU';
        const partNumberColumn = columns.find(col => 
            col.toLowerCase().includes('product') || 
            col.toLowerCase().includes('part')
        ) || 'Product Number';
        const demandColumn = columns.find(col => 
            col.toLowerCase().includes('fcst') || 
            col.toLowerCase().includes('demand')
        ) || 'weekly fcst';
        
        console.log('Using columns:', { dfuColumn, partNumberColumn, demandColumn });
        
        if (!sampleRecord[dfuColumn] || !sampleRecord[partNumberColumn] || !sampleRecord[demandColumn]) {
            this.showNotification(`Could not find required columns. Found: ${Object.keys(sampleRecord).join(', ')}`, 'error');
            return;
        }
        
        const groupedByDFU = {};
        
        data.forEach(record => {
            const dfuCode = record[dfuColumn];
            if (dfuCode) {
                if (!groupedByDFU[dfuCode]) {
                    groupedByDFU[dfuCode] = [];
                }
                groupedByDFU[dfuCode].push(record);
            }
        });

        console.log('Grouped by DFU:', Object.keys(groupedByDFU).length, 'unique DFUs');

        const multiVariants = {};
        let multiVariantCount = 0;
        
        Object.keys(groupedByDFU).forEach(dfuCode => {
            const records = groupedByDFU[dfuCode];
            const uniquePartCodes = [...new Set(records.map(r => r[partNumberColumn]))].filter(Boolean);
            
            if (uniquePartCodes.length > 1) {
                multiVariantCount++;
                const variantDemand = {};
                uniquePartCodes.forEach(partCode => {
                    const partCodeRecords = records.filter(r => r[partNumberColumn] === partCode);
                    const totalDemand = partCodeRecords.reduce((sum, r) => {
                        const demand = parseFloat(r[demandColumn]) || 0;
                        return sum + demand;
                    }, 0);
                    variantDemand[partCode] = {
                        totalDemand,
                        recordCount: partCodeRecords.length,
                        records: partCodeRecords
                    };
                });
                
                multiVariants[dfuCode] = {
                    variants: uniquePartCodes,
                    variantDemand,
                    totalRecords: records.length,
                    dfuColumn,
                    partNumberColumn,
                    demandColumn
                };
            }
        });

        console.log('Multi-variant DFUs found:', multiVariantCount);

        this.multiVariantDFUs = multiVariants;
        this.filteredDFUs = multiVariants;
        
        if (multiVariantCount === 0) {
            this.showNotification('No DFU codes with multiple variants found in the data', 'error');
        } else {
            this.showNotification(`Found ${multiVariantCount} DFU codes with multiple variants`);
        }
    }
    
    filterDFUs() {
        if (this.searchTerm) {
            const filtered = {};
            Object.keys(this.multiVariantDFUs).forEach(dfuCode => {
                if (dfuCode.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                    this.multiVariantDFUs[dfuCode].variants.some(v => 
                        v.toString().toLowerCase().includes(this.searchTerm.toLowerCase()))) {
                    filtered[dfuCode] = this.multiVariantDFUs[dfuCode];
                }
            });
            this.filteredDFUs = filtered;
        } else {
            this.filteredDFUs = this.multiVariantDFUs;
        }
        this.render();
    }
    
    selectDFU(dfuCode) {
        this.selectedDFU = dfuCode;
        this.render();
    }
    
    selectVariant(dfuCode, variant) {
        this.transfers[dfuCode] = variant;
        this.render();
    }
    
    executeTransfer(dfuCode) {
        const targetVariant = this.transfers[dfuCode];
        if (!targetVariant) return;

        const dfuData = this.multiVariantDFUs[dfuCode];
        const { dfuColumn, partNumberColumn, demandColumn } = dfuData;
        
        const dfuRecords = this.rawData.filter(record => record[dfuColumn] === dfuCode);
        
        console.log(`Executing transfer for DFU ${dfuCode} to variant ${targetVariant}`);
        
        dfuRecords.forEach(record => {
            if (record[partNumberColumn] !== targetVariant) {
                const targetRecord = dfuRecords.find(r => 
                    r[partNumberColumn] === targetVariant && 
                    r['Calendar.week'] === record['Calendar.week'] &&
                    r['Source Location'] === record['Source Location']
                );
                
                if (targetRecord) {
                    const oldDemand = parseFloat(targetRecord[demandColumn]) || 0;
                    const transferDemand = parseFloat(record[demandColumn]) || 0;
                    targetRecord[demandColumn] = oldDemand + transferDemand;
                    record[demandColumn] = 0;
                } else {
                    record[partNumberColumn] = targetVariant;
                }
            }
        });

        this.processMultiVariantDFUs(this.rawData);
        delete this.transfers[dfuCode];
        this.showNotification(`Transfer completed for DFU ${dfuCode}`);
        this.render();
    }
    
    cancelTransfer(dfuCode) {
        delete this.transfers[dfuCode];
        this.render();
    }
    
    exportData() {
        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(this.rawData);
            XLSX.utils.book_append_sheet(wb, ws, 'Updated Demand');
            XLSX.writeFile(wb, 'Updated_Demand_Data.xlsx');
            this.showNotification('Data exported successfully');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showNotification('Error exporting data: ' + error.message, 'error');
        }
    }
    
    render() {
        const app = document.getElementById('app');
        
        if (!this.isProcessed) {
            app.innerHTML = `
                <div class="max-w-6xl mx-auto p-6 bg-white min-h-screen">
                    <div class="text-center py-12">
                        <div class="bg-blue-50 rounded-lg p-8 inline-block">
                            <div class="icon-lg mb-4 mx-auto bg-blue-600 rounded-full flex items-center justify-center">
                                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <h2 class="text-xl font-semibold mb-2">Upload Demand Data</h2>
                            <p class="text-gray-600 mb-4">
                                Upload your Excel file containing demand data with DFU codes and part codes
                            </p>
                            
                            ${this.isLoading ? `
                                <div class="text-blue-600">
                                    <div class="loading-spinner mb-2"></div>
                                    <p>Processing file...</p>
                                </div>
                            ` : `
                                <div class="space-y-4">
                                    <div>
                                        <input type="file" accept=".xlsx,.xls" class="file-input" id="fileInput">
                                        <p class="text-sm text-gray-500 mt-2">
                                            Supported formats: .xlsx, .xls
                                        </p>
                                    </div>
                                    
                                    <div class="text-left text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                                        <p class="font-medium mb-2">Expected file structure:</p>
                                        <ul class="list-disc list-inside space-y-1">
                                            <li>DFU column (containing DFU codes)</li>
                                            <li>Product Number column (containing part codes)</li>
                                            <li>Demand column (weekly forecast or demand values)</li>
                                            <li>Calendar week and Source Location columns</li>
                                        </ul>
                                    </div>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
            
            if (!this.isLoading) {
                const fileInput = document.getElementById('fileInput');
                fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
            }
            
            return;
        }
        
        app.innerHTML = `
            <div class="max-w-6xl mx-auto p-6 bg-white min-h-screen">
                <div class="mb-6">
                    <h1 class="text-2xl font-bold text-gray-800 mb-2">DFU Demand Transfer Management</h1>
                    <p class="text-gray-600">
                        Manage demand transfers for DFU codes with multiple variants. Found ${Object.keys(this.multiVariantDFUs).length} DFUs with multiple variants.
                    </p>
                </div>

                <div class="flex gap-4 mb-6 flex-responsive">
                    <div class="relative flex-1">
                        <svg class="absolute left-3 top-3 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input 
                            type="text" 
                            placeholder="Search DFU codes or part codes..." 
                            value="${this.searchTerm}"
                            class="search-input"
                            id="searchInput"
                        >
                    </div>
                    <button class="btn btn-success" id="exportBtn">
                        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Updated Data
                    </button>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 grid-responsive">
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            DFUs Requiring Review (${Object.keys(this.filteredDFUs).length})
                        </h3>
                        <div class="space-y-3 max-h-96 overflow-y-auto">
                            ${Object.keys(this.filteredDFUs).map(dfuCode => {
                                const dfuData = this.filteredDFUs[dfuCode];
                                if (!dfuData || !dfuData.variants) return '';
                                
                                return `
                                    <div class="dfu-card ${this.selectedDFU === dfuCode ? 'selected' : ''}" data-dfu="${dfuCode}">
                                        <div class="flex justify-between items-start">
                                            <div>
                                                <h4 class="font-medium text-gray-800">DFU: ${dfuCode}</h4>
                                                <p class="text-sm text-gray-600">${dfuData.variants.length} variants</p>
                                            </div>
                                            <div class="text-right">
                                                ${this.transfers[dfuCode] ? `
                                                    <span class="inline-flex items-center gap-1 text-green-600 text-sm">
                                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Ready
                                                    </span>
                                                ` : `
                                                    <span class="text-amber-600 text-sm">Pending</span>
                                                `}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <div class="bg-white border border-gray-200 rounded-lg p-4">
                        ${this.selectedDFU && this.multiVariantDFUs[this.selectedDFU] ? `
                            <div>
                                <h3 class="font-semibold text-gray-800 mb-4">
                                    DFU: ${this.selectedDFU} - Variant Details
                                </h3>
                                <div class="space-y-3">
                                    ${this.multiVariantDFUs[this.selectedDFU].variants.map(variant => {
                                        const demandData = this.multiVariantDFUs[this.selectedDFU].variantDemand[variant];
                                        const isSelected = this.transfers[this.selectedDFU] === variant;
                                        
                                        return `
                                            <div class="variant-card ${isSelected ? 'selected' : ''}" data-variant="${variant}">
                                                <div class="flex justify-between items-center">
                                                    <div>
                                                        <h4 class="font-medium text-gray-800">Part: ${variant}</h4>
                                                        <p class="text-sm text-gray-600">${demandData?.recordCount || 0} records</p>
                                                    </div>
                                                    <div class="text-right">
                                                        <p class="font-medium text-gray-800">${this.formatNumber(demandData?.totalDemand || 0)}</p>
                                                        <p class="text-sm text-gray-600">demand</p>
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                                
                                ${this.transfers[this.selectedDFU] ? `
                                    <div class="mt-4 p-3 bg-blue-50 rounded-lg">
                                        <p class="text-sm text-blue-800 mb-3">
                                            Transfer all demand to variant: <strong>${this.transfers[this.selectedDFU]}</strong>
                                        </p>
                                        <div class="flex gap-2">
                                            <button class="btn btn-success" id="executeBtn">
                                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                </svg>
                                                Execute Transfer
                                            </button>
                                            <button class="btn btn-secondary" id="cancelBtn">
                                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        ` : `
                            <div class="text-center py-12 text-gray-500">
                                Select a DFU from the list to view variant details
                            </div>
                        `}
                    </div>
                </div>

                <div class="mt-6 bg-blue-50 rounded-lg p-4">
                    <h3 class="font-semibold text-blue-800 mb-2">How to Use</h3>
                    <ul class="text-sm text-blue-700 space-y-1">
                        <li>1. Select a DFU code from the left panel to view its variants</li>
                        <li>2. Click on the variant you want to consolidate demand to</li>
                        <li>3. Click "Execute Transfer" to move all demand to the selected variant</li>
                        <li>4. Export the updated data when you're done with all transfers</li>
                    </ul>
                </div>
            </div>
        `;
        
        this.attachEventListeners();
    }
    
    attachEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.filterDFUs();
            });
        }
        
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }
        
        const executeBtn = document.getElementById('executeBtn');
        if (executeBtn) {
            executeBtn.addEventListener('click', () => this.executeTransfer(this.selectedDFU));
        }
        
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelTransfer(this.selectedDFU));
        }
        
        // DFU card click handlers
        document.querySelectorAll('.dfu-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const dfuCode = e.currentTarget.dataset.dfu;
                this.selectDFU(dfuCode);
            });
        });
        
        // Variant card click handlers
        document.querySelectorAll('.variant-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const variant = e.currentTarget.dataset.variant;
                this.selectVariant(this.selectedDFU, variant);
            });
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DemandTransferApp();
});
