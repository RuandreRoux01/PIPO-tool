// DFU Demand Transfer Management Application
// Version: 2.6.0 - Build: 2025-07-28-updated
// Updated for new Excel format with proper column mapping

class DemandTransferApp {
    constructor() {
        this.rawData = [];
        this.multiVariantDFUs = {};
        this.filteredDFUs = {};
        this.selectedDFU = null;
        this.searchTerm = '';
        this.selectedPlantLocation = '';
        this.availablePlantLocations = [];
        this.transfers = {}; // Format: { dfuCode: { sourceVariant: targetVariant } }
        this.bulkTransfers = {}; // Format: { dfuCode: targetVariant }
        this.granularTransfers = {}; // Format: { dfuCode: { sourceVariant: { targetVariant: { weekKey: { selected: boolean, customQuantity: number } } } } }
        this.completedTransfers = {}; // Format: { dfuCode: { type: 'bulk'|'individual', targetVariant, timestamp } }
        this.isProcessed = false;
        this.isLoading = false;
        
        this.init();
    }
    
    init() {
        console.log('🚀 DFU Demand Transfer App v2.6.0 - Build: 2025-07-28-updated');
        console.log('📋 Updated for new Excel format with proper column mapping');
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
            
            // Updated sheet name detection for new format
            let sheetName = 'Total Demand';
            if (!workbook.Sheets[sheetName]) {
                // Try other common sheet names
                const possibleNames = ['Open Fcst', 'Demand', 'Sheet1'];
                sheetName = possibleNames.find(name => workbook.Sheets[name]) || workbook.SheetNames[0];
                console.log('Using sheet:', sheetName);
            }
            
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);
            
            console.log('Data conversion complete');
            console.log('Loaded data:', data.length, 'records');
            
            if (data.length > 0) {
                console.log('Sample record:', data[0]);
                console.log('Available columns:', Object.keys(data[0]));
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
        
        // Updated column mapping for new file format
        const dfuColumn = 'DFU';
        const partNumberColumn = 'Product Number';
        const demandColumn = 'weekly fcst';
        const partDescriptionColumn = 'PartDescription';
        const plantLocationColumn = 'Plant Location';
        const calendarWeekColumn = 'Calendar.week';
        const sourceLocationColumn = 'Source Location';
        const weekNumberColumn = 'Week Number';
        
        console.log('Using column mapping:', { 
            dfuColumn, 
            partNumberColumn, 
            demandColumn, 
            partDescriptionColumn, 
            plantLocationColumn,
            calendarWeekColumn,
            sourceLocationColumn,
            weekNumberColumn
        });
        
        // Validate required columns exist
        const requiredColumns = [dfuColumn, partNumberColumn, demandColumn, plantLocationColumn, weekNumberColumn];
        const missingColumns = requiredColumns.filter(col => !columns.includes(col));
        
        if (missingColumns.length > 0) {
            this.showNotification(`Missing required columns: ${missingColumns.join(', ')}`, 'error');
            console.error('Missing columns:', missingColumns);
            console.log('Available columns:', columns);
            return;
        }
        
        // Extract unique plant locations for filtering
        this.availablePlantLocations = [...new Set(data.map(record => record[plantLocationColumn]))].filter(Boolean).sort();
        console.log('Available Plant Locations:', this.availablePlantLocations);
        
        const groupedByDFU = {};
        
        // Filter data by plant location if selected
        const filteredData = this.selectedPlantLocation ? 
            data.filter(record => record[plantLocationColumn] && record[plantLocationColumn].toString() === this.selectedPlantLocation.toString()) : 
            data;
            
        console.log('Total data records:', data.length);
        console.log('Filtered data records:', filteredData.length, 'for plant location:', this.selectedPlantLocation || 'All');
        
        if (this.selectedPlantLocation && filteredData.length === 0) {
            console.warn('No records found for plant location:', this.selectedPlantLocation);
        }
        
        filteredData.forEach(record => {
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
            
            // Get unique part codes, ensuring we treat them as strings for consistency
            const uniquePartCodes = [...new Set(records.map(r => r[partNumberColumn].toString()))].filter(Boolean);
            
            // Check if this DFU has completed transfers
            const isCompleted = this.completedTransfers[dfuCode];
            
            if (uniquePartCodes.length > 1 || isCompleted) {
                multiVariantCount++;
                const variantDemand = {};
                
                uniquePartCodes.forEach(partCode => {
                    // Filter records for this part code, ensuring string comparison
                    const partCodeRecords = records.filter(r => r[partNumberColumn].toString() === partCode);
                    
                    // Sum up all demand for this variant across all records
                    const totalDemand = partCodeRecords.reduce((sum, r) => {
                        const demand = parseFloat(r[demandColumn]) || 0;
                        return sum + demand;
                    }, 0);
                    
                    // Get part description from the first record
                    const partDescription = partCodeRecords[0] ? partCodeRecords[0][partDescriptionColumn] : '';
                    
                    // Include all variants that have records
                    if (partCodeRecords.length > 0) {
                        // Group records by week for granular control
                        const weeklyRecords = {};
                        partCodeRecords.forEach(record => {
                            const weekNum = record[weekNumberColumn];
                            const demand = parseFloat(record[demandColumn]) || 0;
                            const sourceLocation = record[sourceLocationColumn];
                            
                            const weekKey = `${weekNum}-${sourceLocation}`;
                            if (!weeklyRecords[weekKey]) {
                                weeklyRecords[weekKey] = {
                                    weekNumber: weekNum,
                                    sourceLocation: sourceLocation,
                                    demand: 0,
                                    records: []
                                };
                            }
                            weeklyRecords[weekKey].demand += demand;
                            weeklyRecords[weekKey].records.push(record);
                        });
                        
                        variantDemand[partCode] = {
                            totalDemand,
                            recordCount: partCodeRecords.length,
                            records: partCodeRecords,
                            partDescription: partDescription || 'Description not available',
                            weeklyRecords: weeklyRecords
                        };
                    }
                });
                
                // Always include DFUs that have completed transfers, even if they now have only one variant
                const activeVariants = Object.keys(variantDemand);
                if (activeVariants.length > 1 || isCompleted) {
                    multiVariants[dfuCode] = {
                        variants: activeVariants,
                        variantDemand,
                        totalRecords: records.length,
                        dfuColumn,
                        partNumberColumn,
                        demandColumn,
                        partDescriptionColumn,
                        plantLocationColumn,
                        calendarWeekColumn,
                        sourceLocationColumn,
                        weekNumberColumn,
                        isCompleted: !!isCompleted,
                        completionInfo: isCompleted || null,
                        plantLocation: records[0] ? records[0][plantLocationColumn] : null
                    };
                    
                    console.log(`DFU ${dfuCode} variants after processing:`, activeVariants.map(v => ({
                        variant: v,
                        demand: variantDemand[v].totalDemand,
                        records: variantDemand[v].recordCount,
                        description: variantDemand[v].partDescription
                    })));
                } else if (activeVariants.length === 1) {
                    // If only one variant remains and no completion record, it's no longer multi-variant
                    multiVariantCount--;
                }
            }
        });

        console.log('Multi-variant DFUs found:', multiVariantCount);

        this.multiVariantDFUs = multiVariants;
        this.filteredDFUs = multiVariants;
        
        if (multiVariantCount === 0) {
            this.showNotification('No DFU codes with multiple variants found in the data', 'error');
        } else {
            this.showNotification(`Found ${multiVariantCount} DFUs with multiple variants`);
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
    
    filterByPlantLocation(plantLocation) {
        console.log('Filtering by plant location:', plantLocation);
        this.selectedPlantLocation = plantLocation;
        
        // Clear existing data and re-process with filter
        this.multiVariantDFUs = {};
        this.filteredDFUs = {};
        
        // Re-process data with the new plant location filter
        this.processMultiVariantDFUs(this.rawData);
        this.render();
    }
    
    selectDFU(dfuCode) {
        this.selectedDFU = dfuCode;
        this.render();
    }
    
    selectBulkTarget(dfuCode, targetVariant) {
        this.bulkTransfers[dfuCode] = targetVariant;
        // Clear individual transfers when bulk transfer is selected
        this.transfers[dfuCode] = {};
        this.render();
    }
    
    setIndividualTransfer(dfuCode, sourceVariant, targetVariant) {
        if (!this.transfers[dfuCode]) {
            this.transfers[dfuCode] = {};
        }
        this.transfers[dfuCode][sourceVariant] = targetVariant;
        
        // Clear granular transfers when setting individual transfer
        if (this.granularTransfers[dfuCode] && this.granularTransfers[dfuCode][sourceVariant]) {
            delete this.granularTransfers[dfuCode][sourceVariant];
        }
        
        this.render();
    }
    
    toggleGranularWeek(dfuCode, sourceVariant, targetVariant, weekKey) {
        if (!this.granularTransfers[dfuCode]) {
            this.granularTransfers[dfuCode] = {};
        }
        if (!this.granularTransfers[dfuCode][sourceVariant]) {
            this.granularTransfers[dfuCode][sourceVariant] = {};
        }
        if (!this.granularTransfers[dfuCode][sourceVariant][targetVariant]) {
            this.granularTransfers[dfuCode][sourceVariant][targetVariant] = {};
        }
        
        // Toggle selection
        const current = this.granularTransfers[dfuCode][sourceVariant][targetVariant][weekKey];
        if (current && current.selected) {
            delete this.granularTransfers[dfuCode][sourceVariant][targetVariant][weekKey];
        } else {
            this.granularTransfers[dfuCode][sourceVariant][targetVariant][weekKey] = {
                selected: true,
                customQuantity: null // null means use full quantity
            };
        }
        
        // Clear individual transfer when granular is used
        if (this.transfers[dfuCode] && this.transfers[dfuCode][sourceVariant]) {
            delete this.transfers[dfuCode][sourceVariant];
        }
        
        this.render();
    }
    
    updateGranularQuantity(dfuCode, sourceVariant, targetVariant, weekKey, quantity) {
        if (this.granularTransfers[dfuCode] && 
            this.granularTransfers[dfuCode][sourceVariant] && 
            this.granularTransfers[dfuCode][sourceVariant][targetVariant] && 
            this.granularTransfers[dfuCode][sourceVariant][targetVariant][weekKey]) {
            
            this.granularTransfers[dfuCode][sourceVariant][targetVariant][weekKey].customQuantity = 
                quantity === '' ? null : parseFloat(quantity);
        }
    }
    
    executeTransfer(dfuCode) {
        const dfuData = this.multiVariantDFUs[dfuCode];
        const { dfuColumn, partNumberColumn, demandColumn, calendarWeekColumn, sourceLocationColumn } = dfuData;
        
        let transferCount = 0;
        const transferHistory = []; // Track all transfers for audit trail
        const timestamp = new Date().toLocaleString('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Handle bulk transfer
        if (this.bulkTransfers[dfuCode]) {
            const targetVariant = this.bulkTransfers[dfuCode];
            const dfuRecords = this.rawData.filter(record => record[dfuColumn] === dfuCode);
            
            console.log(`Executing bulk transfer for DFU ${dfuCode} to ${targetVariant}`);
            console.log(`Found ${dfuRecords.length} records for this DFU`);
            
            dfuRecords.forEach(record => {
                if (record[partNumberColumn].toString() !== targetVariant.toString()) {
                    const sourceVariant = record[partNumberColumn];
                    const transferDemand = parseFloat(record[demandColumn]) || 0;
                    
                    const targetRecord = dfuRecords.find(r => 
                        r[partNumberColumn].toString() === targetVariant.toString() && 
                        r[calendarWeekColumn] === record[calendarWeekColumn] &&
                        r[sourceLocationColumn] === record[sourceLocationColumn]
                    );
                    
                    if (targetRecord) {
                        const oldDemand = parseFloat(targetRecord[demandColumn]) || 0;
                        targetRecord[demandColumn] = oldDemand + transferDemand;
                        
                        // Add transfer history to target record
                        const existingHistory = targetRecord['Transfer History'] || '';
                        const newHistoryEntry = `[${sourceVariant} → ${transferDemand} @ ${timestamp}]`;
                        const pipoPrefix = existingHistory.startsWith('PIPO') ? '' : 'PIPO ';
                        targetRecord['Transfer History'] = existingHistory ? 
                            `${existingHistory} ${newHistoryEntry}` : `${pipoPrefix}${newHistoryEntry}`;
                        
                        record[demandColumn] = 0;
                        transferCount++;
                        
                        transferHistory.push({
                            from: sourceVariant,
                            to: targetVariant,
                            amount: transferDemand,
                            timestamp
                        });
                    } else {
                        // Change the source record to target variant
                        const originalVariant = record[partNumberColumn];
                        record[partNumberColumn] = targetVariant;
                        
                        // Add transfer history
                        record['Transfer History'] = `PIPO [${originalVariant} → ${transferDemand} @ ${timestamp}]`;
                        
                        transferCount++;
                        
                        transferHistory.push({
                            from: originalVariant,
                            to: targetVariant,
                            amount: transferDemand,
                            timestamp
                        });
                    }
                }
            });
            
            delete this.bulkTransfers[dfuCode];
            
            // Mark as completed transfer
            this.completedTransfers[dfuCode] = {
                type: 'bulk',
                targetVariant: targetVariant,
                timestamp: timestamp,
                originalVariantCount: dfuData.variants.length,
                transferHistory
            };
            
            this.showNotification(`Bulk transfer completed for DFU ${dfuCode}: ${dfuData.variants.length - 1} variants transferred to ${targetVariant}`);
        }
        
        // Handle individual transfers
        else if (this.transfers[dfuCode] && Object.keys(this.transfers[dfuCode]).length > 0) {
            const individualTransfers = this.transfers[dfuCode];
            const dfuRecords = this.rawData.filter(record => record[dfuColumn] === dfuCode);
            
            console.log(`Executing individual transfers for DFU ${dfuCode}`);
            console.log(`Individual transfers:`, individualTransfers);
            console.log(`Found ${dfuRecords.length} records for this DFU`);
            
            // Process each individual transfer
            Object.keys(individualTransfers).forEach(sourceVariant => {
                const targetVariant = individualTransfers[sourceVariant];
                
                console.log(`Processing transfer: ${sourceVariant} → ${targetVariant}`);
                
                // Only transfer if source and target are different
                if (sourceVariant !== targetVariant) {
                    // Find all records for this source variant
                    const sourceRecords = dfuRecords.filter(r => 
                        r[partNumberColumn].toString() === sourceVariant.toString()
                    );
                    
                    console.log(`Found ${sourceRecords.length} records for source variant ${sourceVariant}`);
                    
                    sourceRecords.forEach(record => {
                        const transferDemand = parseFloat(record[demandColumn]) || 0;
                        
                        // Try to find a matching target record with same week and location
                        const targetRecord = dfuRecords.find(r => 
                            r[partNumberColumn].toString() === targetVariant.toString() && 
                            r[calendarWeekColumn] === record[calendarWeekColumn] &&
                            r[sourceLocationColumn] === record[sourceLocationColumn]
                        );
                        
                        if (targetRecord) {
                            // Add to existing target record
                            const oldDemand = parseFloat(targetRecord[demandColumn]) || 0;
                            targetRecord[demandColumn] = oldDemand + transferDemand;
                            
                            // Add transfer history to target record
                            const existingHistory = targetRecord['Transfer History'] || '';
                            const newHistoryEntry = `[${sourceVariant} → ${transferDemand} @ ${timestamp}]`;
                            const pipoPrefix = existingHistory.startsWith('PIPO') ? '' : 'PIPO ';
                            targetRecord['Transfer History'] = existingHistory ? 
                                `${existingHistory} ${newHistoryEntry}` : `${pipoPrefix}${newHistoryEntry}`;
                            
                            record[demandColumn] = 0; // Zero out source
                            console.log(`Added ${transferDemand} demand to existing target record`);
                        } else {
                            // Change the source record to target variant
                            const originalVariant = record[partNumberColumn];
                            record[partNumberColumn] = targetVariant;
                            
                            // Add transfer history
                            record['Transfer History'] = `PIPO [${originalVariant} → ${transferDemand} @ ${timestamp}]`;
                            
                            console.log(`Changed record part number from ${sourceVariant} to ${targetVariant}`);
                        }
                        
                        transferHistory.push({
                            from: sourceVariant,
                            to: targetVariant,
                            amount: transferDemand,
                            timestamp
                        });
                    });
                    
                    transferCount++;
                }
            });
            
            this.transfers[dfuCode] = {};
            
            // Mark as completed transfer
            this.completedTransfers[dfuCode] = {
                type: 'individual',
                transfers: individualTransfers,
                timestamp: timestamp,
                transferCount: transferCount,
                transferHistory
            };
            
            this.showNotification(`Individual transfers completed for DFU ${dfuCode}: ${transferCount} variant transfers executed`);
        }
        
        // Handle granular transfers
        else if (this.granularTransfers[dfuCode] && Object.keys(this.granularTransfers[dfuCode]).length > 0) {
            const granularTransfers = this.granularTransfers[dfuCode];
            const dfuRecords = this.rawData.filter(record => record[dfuColumn] === dfuCode);
            
            console.log(`Executing granular transfers for DFU ${dfuCode}`);
            console.log(`Granular transfers:`, granularTransfers);
            
            let granularTransferCount = 0;
            
            // Process each source variant's granular transfers
            Object.keys(granularTransfers).forEach(sourceVariant => {
                const sourceTargets = granularTransfers[sourceVariant];
                
                Object.keys(sourceTargets).forEach(targetVariant => {
                    const weekTransfers = sourceTargets[targetVariant];
                    
                    Object.keys(weekTransfers).forEach(weekKey => {
                        const weekTransfer = weekTransfers[weekKey];
                        if (!weekTransfer.selected) return;
                        
                        const [weekNumber, sourceLocation] = weekKey.split('-');
                        
                        // Find the specific source record for this week and location
                        const sourceRecord = dfuRecords.find(r => 
                            r[partNumberColumn].toString() === sourceVariant.toString() &&
                            r[weekNumberColumn].toString() === weekNumber.toString() &&
                            r[sourceLocationColumn].toString() === sourceLocation.toString()
                        );
                        
                        if (sourceRecord) {
                            const originalDemand = parseFloat(sourceRecord[demandColumn]) || 0;
                            const transferAmount = weekTransfer.customQuantity !== null ? 
                                weekTransfer.customQuantity : originalDemand;
                            
                            console.log(`Transferring ${transferAmount} from ${sourceVariant} to ${targetVariant} for week ${weekNumber}`);
                            
                            // Find matching target record
                            const targetRecord = dfuRecords.find(r => 
                                r[partNumberColumn].toString() === targetVariant.toString() && 
                                r[weekNumberColumn].toString() === weekNumber.toString() &&
                                r[sourceLocationColumn].toString() === sourceLocation.toString()
                            );
                            
                            if (targetRecord) {
                                // Add to existing target record
                                const oldDemand = parseFloat(targetRecord[demandColumn]) || 0;
                                targetRecord[demandColumn] = oldDemand + transferAmount;
                                
                                // Add transfer history
                                const existingHistory = targetRecord['Transfer History'] || '';
                                const newHistoryEntry = `[W${weekNumber} ${sourceVariant} → ${transferAmount} @ ${timestamp}]`;
                                const pipoPrefix = existingHistory.startsWith('PIPO') ? '' : 'PIPO ';
                                targetRecord['Transfer History'] = existingHistory ? 
                                    `${existingHistory} ${newHistoryEntry}` : `${pipoPrefix}${newHistoryEntry}`;
                                
                                // Update source record
                                sourceRecord[demandColumn] = originalDemand - transferAmount;
                                
                            } else {
                                // Create new record by modifying source
                                if (transferAmount === originalDemand) {
                                    // Transfer full amount - change part number
                                    const originalVariant = sourceRecord[partNumberColumn];
                                    sourceRecord[partNumberColumn] = targetVariant;
                                    sourceRecord['Transfer History'] = `PIPO [W${weekNumber} ${originalVariant} → ${transferAmount} @ ${timestamp}]`;
                                } else {
                                    // Partial transfer - need to create new record and update source
                                    const newRecord = { ...sourceRecord };
                                    newRecord[partNumberColumn] = targetVariant;
                                    newRecord[demandColumn] = transferAmount;
                                    newRecord['Transfer History'] = `PIPO [W${weekNumber} ${sourceVariant} → ${transferAmount} @ ${timestamp}]`;
                                    
                                    // Update source record
                                    sourceRecord[demandColumn] = originalDemand - transferAmount;
                                    
                                    // Add new record
                                    this.rawData.push(newRecord);
                                }
                            }
                            
                            transferHistory.push({
                                from: sourceVariant,
                                to: targetVariant,
                                amount: transferAmount,
                                week: weekNumber,
                                timestamp
                            });
                            
                            granularTransferCount++;
                        }
                    });
                });
            });
            
            this.granularTransfers[dfuCode] = {};
            
            // Mark as completed transfer
            this.completedTransfers[dfuCode] = {
                type: 'granular',
                timestamp: timestamp,
                transferCount: granularTransferCount,
                transferHistory
            };
            
            this.showNotification(`Granular transfers completed for DFU ${dfuCode}: ${granularTransferCount} week-level transfers executed`);
        }

        // CRITICAL: Consolidate records FIRST before recalculating UI data
        console.log('Step 1: Consolidating records...');
        this.consolidateRecords(dfuCode);
        
        // THEN clear cached data and recalculate
        console.log('Step 2: Clearing cached data...');
        this.multiVariantDFUs = {};
        this.filteredDFUs = {};
        
        console.log('Step 3: Recalculating variant demands...');
        this.processMultiVariantDFUs(this.rawData);
        
        console.log('Step 4: Updating UI...');
        // Force complete UI refresh by clearing selection and re-rendering
        const currentSelection = this.selectedDFU;
        this.selectedDFU = null;
        
        // First render to clear old data
        this.render();
        
        // Restore selection and render again to show fresh data
        setTimeout(() => {
            console.log('Step 5: Restoring selection with fresh data...');
            this.selectedDFU = currentSelection;
            
            // Log the current DFU data to verify it's correct
            if (this.multiVariantDFUs[currentSelection]) {
                console.log('Fresh DFU data for UI:', this.multiVariantDFUs[currentSelection]);
                console.log('Fresh variant demand data:', this.multiVariantDFUs[currentSelection].variantDemand);
            }
            
            // Force a complete DOM rebuild for the selected DFU section
            this.forceUIRefresh();
            console.log('Transfer and UI update complete!');
        }, 300);
    }
    
    consolidateRecords(dfuCode) {
        console.log(`Consolidating records for DFU ${dfuCode}`);
        
        // Get the column information from the current DFU data
        const currentDFUData = this.multiVariantDFUs[dfuCode] || Object.values(this.multiVariantDFUs)[0];
        if (!currentDFUData) {
            console.error('No DFU data available for consolidation');
            return;
        }
        
        const { dfuColumn, partNumberColumn, demandColumn, calendarWeekColumn, sourceLocationColumn, weekNumberColumn } = currentDFUData;
        
        // Get all records for this DFU
        const allRecords = this.rawData;
        const dfuRecords = allRecords.filter(record => record[dfuColumn] === dfuCode);
        
        console.log(`Found ${dfuRecords.length} records for DFU ${dfuCode} before consolidation`);
        
        // Create a map of consolidated records
        const consolidatedMap = new Map();
        
        dfuRecords.forEach((record) => {
            const partNumber = record[partNumberColumn].toString();
            const calendarWeek = record[calendarWeekColumn];
            const weekNumber = record[weekNumberColumn];
            const sourceLocation = record[sourceLocationColumn];
            const demand = parseFloat(record[demandColumn]) || 0;
            const transferHistory = record['Transfer History'] || '';
            
            // Create a unique key for this combination
            const key = `${partNumber}|${weekNumber}|${sourceLocation}`;
            
            if (consolidatedMap.has(key)) {
                // Add to existing consolidated record
                const existing = consolidatedMap.get(key);
                existing[demandColumn] = (parseFloat(existing[demandColumn]) || 0) + demand;
                
                // Consolidate transfer histories
                if (transferHistory && existing['Transfer History']) {
                    existing['Transfer History'] = `${existing['Transfer History']} ${transferHistory}`;
                } else if (transferHistory) {
                    existing['Transfer History'] = transferHistory;
                }
                
                console.log(`Consolidated ${demand} into existing record for ${partNumber}, total now: ${existing[demandColumn]}`);
            } else {
                // Create new consolidated record
                const consolidatedRecord = { ...record };
                consolidatedRecord[demandColumn] = demand;
                if (transferHistory) {
                    consolidatedRecord['Transfer History'] = transferHistory;
                }
                consolidatedMap.set(key, consolidatedRecord);
            }
        });
        
        console.log(`Consolidated into ${consolidatedMap.size} unique records`);
        
        // Remove old DFU records from rawData
        this.rawData = this.rawData.filter(record => record[dfuColumn] !== dfuCode);
        
        // Add consolidated records back to rawData
        consolidatedMap.forEach((record) => {
            this.rawData.push(record);
        });
        
        const newDfuRecords = this.rawData.filter(record => record[dfuColumn] === dfuCode);
        console.log(`After consolidation: ${newDfuRecords.length} records for DFU ${dfuCode}`);
        
        // Log the consolidated variants
        const variantSummary = {};
        newDfuRecords.forEach(record => {
            const partNumber = record[partNumberColumn].toString();
            const demand = parseFloat(record[demandColumn]) || 0;
            
            if (!variantSummary[partNumber]) {
                variantSummary[partNumber] = { totalDemand: 0, recordCount: 0 };
            }
            variantSummary[partNumber].totalDemand += demand;
            variantSummary[partNumber].recordCount += 1;
        });
        
        console.log(`DFU ${dfuCode} variant summary after consolidation:`, variantSummary);
    }
    
    forceUIRefresh() {
        // Get the app container and force a complete re-render
        const app = document.getElementById('app');
        
        // Store current state
        const currentSearch = this.searchTerm;
        
        // Temporarily clear the container
        app.innerHTML = '<div class="max-w-6xl mx-auto p-6 bg-white min-h-screen"><div class="text-center py-12"><div class="loading-spinner mb-2"></div><p>Refreshing interface...</p></div></div>';
        
        // Force a short delay then rebuild
        setTimeout(() => {
            // Restore search term
            this.searchTerm = currentSearch;
            
            // Rebuild the entire interface
            this.render();
            
            console.log('Forced UI refresh complete - interface rebuilt from scratch');
        }, 100);
    }
    
    cancelTransfer(dfuCode) {
        delete this.transfers[dfuCode];
        delete this.bulkTransfers[dfuCode];
        delete this.granularTransfers[dfuCode];
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
                            <div class="w-12 h-12 mb-4 mx-auto bg-blue-600 rounded-full flex items-center justify-center">
                                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <h2 class="text-xl font-semibold mb-2">Upload Demand Data</h2>
                            <p class="text-gray-600 mb-4">
                                Upload your Excel file with the new "Total Demand" format
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
                                        <p class="font-medium mb-2">Expected columns in your Excel file:</p>
                                        <ul class="list-disc list-inside space-y-1">
                                            <li><strong>DFU</strong> - DFU codes</li>
                                            <li><strong>Product Number</strong> - Part/product codes</li>
                                            <li><strong>weekly fcst</strong> - Demand/forecast values</li>
                                            <li><strong>PartDescription</strong> - Product descriptions</li>
                                            <li><strong>Plant Location</strong> - Plant location codes</li>
                                            <li><strong>Week Number</strong> - Week number values</li>
                                            <li><strong>Source Location</strong> - Source location codes</li>
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
                    <div class="flex justify-between items-center">
                        <div>
                            <h1 class="text-3xl font-bold text-gray-800 mb-2">DFU Demand Transfer Management</h1>
                            <p class="text-gray-600">
                                Manage demand transfers for DFU codes with multiple variants. Found ${Object.keys(this.multiVariantDFUs).length} DFUs with multiple variants.
                            </p>
                        </div>
                        <div class="text-right text-xs text-gray-400">
                            <p>Version 2.6.0</p>
                            <p>Build: 2025-07-28-updated</p>
                        </div>
                    </div>
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
                    <div class="relative">
                        <select class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" id="plantLocationFilter">
                            <option value="">All Plant Locations</option>
                            ${this.availablePlantLocations.map(location => `
                                <option value="${location}" ${this.selectedPlantLocation === location.toString() ? 'selected' : ''}>
                                    Plant ${location}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <button class="btn btn-success" id="exportBtn">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Updated Data
                    </button>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 grid-responsive">
                    <div class="bg-gray-50 rounded-lg p-6">
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
                                                <p class="text-sm text-gray-600">
                                                    ${dfuData.plantLocation ? `Plant ${dfuData.plantLocation} • ` : ''}${dfuData.isCompleted ? `1 variant (consolidated)` : `${dfuData.variants.length} variants`}
                                                </p>
                                            </div>
                                            <div class="text-right">
                                                ${dfuData.isCompleted ? `
                                                    <span class="inline-flex items-center gap-1 text-green-600 text-sm">
                                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Done
                                                    </span>
                                                ` : (this.transfers[dfuCode] && Object.keys(this.transfers[dfuCode]).length > 0) || this.bulkTransfers[dfuCode] ? `
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

                    <div class="bg-white border border-gray-200 rounded-lg p-6">
                        ${this.selectedDFU && this.multiVariantDFUs[this.selectedDFU] ? `
                            <div>
                                <h3 class="font-semibold text-gray-800 mb-4">
                                    DFU: ${this.selectedDFU}${this.multiVariantDFUs[this.selectedDFU].plantLocation ? ` (Plant: ${this.multiVariantDFUs[this.selectedDFU].plantLocation})` : ''} - Variant Details
                                    ${this.multiVariantDFUs[this.selectedDFU].isCompleted ? `
                                        <span class="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                                            ✓ Transfer Complete
                                        </span>
                                    ` : ''}
                                </h3>
                                
                                ${this.multiVariantDFUs[this.selectedDFU].isCompleted ? `
                                    <!-- Completed Transfer Summary -->
                                    <div class="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                                        <h4 class="font-semibold text-green-800 mb-3">✓ Transfer Completed</h4>
                                        <div class="text-sm text-green-700">
                                            <p><strong>Type:</strong> ${this.multiVariantDFUs[this.selectedDFU].completionInfo.type === 'bulk' ? 'Bulk Transfer' : 'Individual Transfers'}</p>
                                            <p><strong>Date:</strong> ${this.multiVariantDFUs[this.selectedDFU].completionInfo.timestamp}</p>
                                            ${this.multiVariantDFUs[this.selectedDFU].completionInfo.type === 'bulk' ? `
                                                <p><strong>Target Variant:</strong> ${this.multiVariantDFUs[this.selectedDFU].completionInfo.targetVariant}</p>
                                                <p><strong>Variants Consolidated:</strong> ${this.multiVariantDFUs[this.selectedDFU].completionInfo.originalVariantCount - 1} → 1</p>
                                            ` : `
                                                <p><strong>Individual Transfers:</strong> ${this.multiVariantDFUs[this.selectedDFU].completionInfo.transferCount} completed</p>
                                            `}
                                        </div>
                                    </div>
                                    
                                    <!-- Current Variant Status -->
                                    <div class="mb-6">
                                        <h4 class="font-semibold text-gray-800 mb-3">Current Variant Status</h4>
                                        <div class="space-y-3">
                                            ${this.multiVariantDFUs[this.selectedDFU].variants.map(variant => {
                                                const demandData = this.multiVariantDFUs[this.selectedDFU].variantDemand[variant];
                                                
                                                return `
                                                    <div class="border rounded-lg p-3 bg-white">
                                                        <div class="flex justify-between items-center">
                                                            <div class="flex-1">
                                                                <h5 class="font-medium text-gray-800">Part: ${variant}</h5>
                                                                <p class="text-xs text-gray-500 mb-1 max-w-md break-words">${demandData?.partDescription || 'Description not available'}</p>
                                                                <p class="text-sm text-gray-600">${demandData?.recordCount || 0} records</p>
                                                            </div>
                                                            <div class="text-right">
                                                                <p class="font-medium text-gray-800">${this.formatNumber(demandData?.totalDemand || 0)}</p>
                                                                <p class="text-sm text-gray-600">consolidated demand</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                    </div>
                                ` : `
                                    <!-- Bulk Transfer Section -->
                                    <div class="mb-6 p-4 bg-purple-50 rounded-lg border">
                                        <h4 class="font-semibold text-purple-800 mb-3">Bulk Transfer (All Variants → One Target)</h4>
                                        <p class="text-sm text-purple-600 mb-3">Transfer all variants to a single target variant:</p>
                                        <div class="flex flex-wrap gap-2">
                                            ${this.multiVariantDFUs[this.selectedDFU].variants.map(variant => {
                                                const isSelected = this.bulkTransfers[this.selectedDFU] === variant;
                                                return `
                                                    <button 
                                                        class="px-3 py-1 rounded-full text-sm font-medium transition-all ${isSelected ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}"
                                                        data-bulk-target="${variant}"
                                                    >
                                                        ${variant}
                                                    </button>
                                                `;
                                            }).join('')}
                                        </div>
                                        ${this.bulkTransfers[this.selectedDFU] ? `
                                            <p class="text-sm text-purple-700 mt-2">
                                                → All variants will transfer to: <strong>${this.bulkTransfers[this.selectedDFU]}</strong>
                                            </p>
                                        ` : ''}
                                    </div>
                                    
                                    <!-- Individual Transfer Section -->
                                    <div class="mb-6">
                                        <h4 class="font-semibold text-gray-800 mb-3">Individual Transfers (Variant → Specific Target)</h4>
                                        <div class="space-y-4">
                                            ${this.multiVariantDFUs[this.selectedDFU].variants.map(variant => {
                                                const demandData = this.multiVariantDFUs[this.selectedDFU].variantDemand[variant];
                                                const currentTransfer = this.transfers[this.selectedDFU]?.[variant];
                                                const hasGranularTransfers = this.granularTransfers[this.selectedDFU] && 
                                                    this.granularTransfers[this.selectedDFU][variant] && 
                                                    Object.keys(this.granularTransfers[this.selectedDFU][variant]).length > 0;
                                                
                                                return `
                                                    <div class="border rounded-lg p-4 bg-gray-50">
                                                        <div class="flex justify-between items-center mb-3">
                                                            <div class="flex-1">
                                                                <h5 class="font-medium text-gray-800">Part: ${variant}</h5>
                                                                <p class="text-xs text-gray-500 mb-1 max-w-md break-words">${demandData?.partDescription || 'Description not available'}</p>
                                                                <p class="text-sm text-gray-600">${demandData?.recordCount || 0} records • ${this.formatNumber(demandData?.totalDemand || 0)} total demand</p>
                                                            </div>
                                                        </div>
                                                        
                                                        <div class="flex items-center gap-2 text-sm mb-3">
                                                            <span class="text-gray-600">Transfer all to:</span>
                                                            <select class="px-2 py-1 border rounded text-sm" data-source-variant="${variant}">
                                                                <option value="">Select target...</option>
                                                                ${this.multiVariantDFUs[this.selectedDFU].variants.map(targetVariant => `
                                                                    <option value="${targetVariant}" ${currentTransfer === targetVariant ? 'selected' : ''}>
                                                                        ${targetVariant}${targetVariant === variant ? ' (self)' : ''}
                                                                    </option>
                                                                `).join('')}
                                                            </select>
                                                            ${currentTransfer && currentTransfer !== variant ? `
                                                                <span class="text-green-600 text-sm">→ ${currentTransfer}</span>
                                                            ` : ''}
                                                        </div>
                                                        
                                                        <!-- Granular Week-Level Transfers -->
                                                        <div class="border-t pt-3 mt-3">
                                                            <h6 class="font-medium text-gray-700 mb-2 text-sm">Or transfer specific weeks:</h6>
                                                            <div class="space-y-2 max-h-40 overflow-y-auto">
                                                                ${Object.keys(demandData?.weeklyRecords || {}).map(weekKey => {
                                                                    const weekData = demandData.weeklyRecords[weekKey];
                                                                    
                                                                    return `
                                                                        <div class="bg-white rounded border p-2 text-xs">
                                                                            <div class="flex items-center justify-between mb-2">
                                                                                <span class="font-medium">Week ${weekData.weekNumber} (Loc: ${weekData.sourceLocation})</span>
                                                                                <span class="text-gray-600">${this.formatNumber(weekData.demand)} demand</span>
                                                                            </div>
                                                                            <div class="grid grid-cols-1 gap-1">
                                                                                ${this.multiVariantDFUs[this.selectedDFU].variants.filter(tv => tv !== variant).map(targetVariant => {
                                                                                    const isSelected = this.granularTransfers[this.selectedDFU] && 
                                                                                        this.granularTransfers[this.selectedDFU][variant] && 
                                                                                        this.granularTransfers[this.selectedDFU][variant][targetVariant] && 
                                                                                        this.granularTransfers[this.selectedDFU][variant][targetVariant][weekKey] && 
                                                                                        this.granularTransfers[this.selectedDFU][variant][targetVariant][weekKey].selected;
                                                                                    
                                                                                    const customQty = isSelected ? 
                                                                                        this.granularTransfers[this.selectedDFU][variant][targetVariant][weekKey].customQuantity : null;
                                                                                    
                                                                                    return `
                                                                                        <div class="flex items-center gap-2">
                                                                                            <input type="checkbox" 
                                                                                                   class="w-3 h-3" 
                                                                                                   ${isSelected ? 'checked' : ''}
                                                                                                   data-granular-toggle
                                                                                                   data-dfu="${this.selectedDFU}"
                                                                                                   data-source="${variant}"
                                                                                                   data-target="${targetVariant}"
                                                                                                   data-week="${weekKey}"
                                                                                            >
                                                                                            <span class="text-xs">→ ${targetVariant}</span>
                                                                                            <input type="number" 
                                                                                                   class="w-16 px-1 py-0 text-xs border rounded" 
                                                                                                   placeholder="${weekData.demand}"
                                                                                                   value="${customQty !== null ? customQty : ''}"
                                                                                                   ${!isSelected ? 'disabled' : ''}
                                                                                                   data-granular-qty
                                                                                                   data-dfu="${this.selectedDFU}"
                                                                                                   data-source="${variant}"
                                                                                                   data-target="${targetVariant}"
                                                                                                   data-week="${weekKey}"
                                                                                            >
                                                                                        </div>
                                                                                    `;
                                                                                }).join('')}
                                                                            </div>
                                                                        </div>
                                                                    `;
                                                                }).join('')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                    </div>
                                    
                                    <!-- Action Buttons -->
                                    ${((this.transfers[this.selectedDFU] && Object.keys(this.transfers[this.selectedDFU]).length > 0) || 
                                       this.bulkTransfers[this.selectedDFU] || 
                                       (this.granularTransfers[this.selectedDFU] && Object.keys(this.granularTransfers[this.selectedDFU]).length > 0)) ? `
                                        <div class="p-3 bg-blue-50 rounded-lg">
                                            <div class="text-sm text-blue-800 mb-3">
                                                ${this.bulkTransfers[this.selectedDFU] ? `
                                                    <p><strong>Bulk Transfer:</strong> All variants → ${this.bulkTransfers[this.selectedDFU]}</p>
                                                ` : ''}
                                                ${this.transfers[this.selectedDFU] && Object.keys(this.transfers[this.selectedDFU]).length > 0 ? `
                                                    <p><strong>Individual Transfers:</strong></p>
                                                    <ul class="list-disc list-inside ml-4">
                                                        ${Object.keys(this.transfers[this.selectedDFU]).map(sourceVariant => {
                                                            const targetVariant = this.transfers[this.selectedDFU][sourceVariant];
                                                            return sourceVariant !== targetVariant ? 
                                                                `<li>${sourceVariant} → ${targetVariant}</li>` : '';
                                                        }).filter(Boolean).join('')}
                                                    </ul>
                                                ` : ''}
                                                ${this.granularTransfers[this.selectedDFU] && Object.keys(this.granularTransfers[this.selectedDFU]).length > 0 ? `
                                                    <p><strong>Granular Transfers:</strong></p>
                                                    <ul class="list-disc list-inside ml-4 text-xs">
                                                        ${Object.keys(this.granularTransfers[this.selectedDFU]).map(sourceVariant => {
                                                            const sourceTransfers = this.granularTransfers[this.selectedDFU][sourceVariant];
                                                            return Object.keys(sourceTransfers).map(targetVariant => {
                                                                const weekTransfers = sourceTransfers[targetVariant];
                                                                const weekCount = Object.keys(weekTransfers).length;
                                                                return weekCount > 0 ? `<li>${sourceVariant} → ${targetVariant} (${weekCount} weeks)</li>` : '';
                                                            }).filter(Boolean).join('');
                                                        }).filter(Boolean).join('')}
                                                    </ul>
                                                ` : ''}
                                            </div>
                                            <div class="flex gap-2">
                                                <button class="btn btn-success" id="executeBtn">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                    </svg>
                                                    Execute Transfer
                                                </button>
                                                <button class="btn btn-secondary" id="cancelBtn">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ` : ''}
                                `}
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
                        <li><strong>Bulk Transfer:</strong> Click a purple button to transfer all variants to that target</li>
                        <li><strong>Individual Transfer:</strong> Use dropdowns to specify where each variant should go</li>
                        <li><strong>Execute:</strong> Click "Execute Transfer" to apply your chosen transfers</li>
                        <li><strong>Export:</strong> Export the updated data when you're done with all transfers</li>
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

        const plantLocationFilter = document.getElementById('plantLocationFilter');
        if (plantLocationFilter) {
            plantLocationFilter.addEventListener('change', (e) => {
                this.filterByPlantLocation(e.target.value);
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
        
        // Bulk target selection handlers
        document.querySelectorAll('[data-bulk-target]').forEach(button => {
            button.addEventListener('click', (e) => {
                const targetVariant = e.target.dataset.bulkTarget;
                this.selectBulkTarget(this.selectedDFU, targetVariant);
            });
        });
        
        // Individual transfer dropdown handlers  
        document.querySelectorAll('[data-source-variant]').forEach(select => {
            select.addEventListener('change', (e) => {
                const sourceVariant = e.target.dataset.sourceVariant;
                const targetVariant = e.target.value;
                if (targetVariant) {
                    this.setIndividualTransfer(this.selectedDFU, sourceVariant, targetVariant);
                } else {
                    // Remove transfer if empty selection
                    if (this.transfers[this.selectedDFU]) {
                        delete this.transfers[this.selectedDFU][sourceVariant];
                    }
                    this.render();
                }
            });
        });
        
        // Granular transfer checkbox handlers
        document.querySelectorAll('[data-granular-toggle]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const dfuCode = e.target.dataset.dfu;
                const sourceVariant = e.target.dataset.source;
                const targetVariant = e.target.dataset.target;
                const weekKey = e.target.dataset.week;
                
                this.toggleGranularWeek(dfuCode, sourceVariant, targetVariant, weekKey);
            });
        });
        
        // Granular transfer quantity handlers
        document.querySelectorAll('[data-granular-qty]').forEach(input => {
            input.addEventListener('input', (e) => {
                const dfuCode = e.target.dataset.dfu;
                const sourceVariant = e.target.dataset.source;
                const targetVariant = e.target.dataset.target;
                const weekKey = e.target.dataset.week;
                const quantity = e.target.value;
                
                this.updateGranularQuantity(dfuCode, sourceVariant, targetVariant, weekKey, quantity);
            });
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DemandTransferApp();
});
