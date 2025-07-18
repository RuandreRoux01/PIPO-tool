const { useState, useEffect } = React;
const { Upload, Download, Search, AlertTriangle, CheckCircle, X, ArrowRight } = lucide;

const DemandTransferInterface = () => {
  const [rawData, setRawData] = useState([]);
  const [multiVariantDFUs, setMultiVariantDFUs] = useState({});
  const [filteredDFUs, setFilteredDFUs] = useState({});
  const [selectedDFU, setSelectedDFU] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [transfers, setTransfers] = useState({});
  const [isProcessed, setIsProcessed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    console.log('File selected:', file);
    
    if (!file) {
      console.log('No file selected');
      return;
    }
    
    console.log('File details:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    // Check file type
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      alert('Please select an Excel file (.xlsx or .xls)');
      return;
    }
    
    loadData(file);
  };

  // Load and process data
  const loadData = async (file) => {
    console.log('Starting to load data...');
    setIsLoading(true);
    
    try {
      console.log('Reading file as array buffer...');
      const arrayBuffer = await file.arrayBuffer();
      console.log('Array buffer size:', arrayBuffer.byteLength);
      
      console.log('Reading workbook...');
      const workbook = XLSX.read(arrayBuffer, { 
        cellStyles: true, 
        cellFormulas: true, 
        cellDates: true,
        cellNF: true,
        sheetStubs: true
      });
      
      console.log('Available sheets:', workbook.SheetNames);
      
      // Try to find the correct sheet
      let sheetName = 'Open Fcst';
      if (!workbook.Sheets[sheetName]) {
        sheetName = workbook.SheetNames[0]; // Use first sheet if 'Open Fcst' doesn't exist
        console.log('Using first sheet:', sheetName);
      }
      
      const worksheet = workbook.Sheets[sheetName];
      console.log('Converting sheet to JSON...');
      
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      console.log('Data conversion complete');
      console.log('Loaded data:', data.length, 'records');
      
      if (data.length > 0) {
        console.log('Sample record:', data[0]);
        setRawData(data);
        processMultiVariantDFUs(data);
        setIsProcessed(true);
      } else {
        alert('No data found in the Excel file');
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      console.error('Error stack:', error.stack);
      alert('Error loading data: ' + error.message);
    } finally {
      console.log('Setting loading to false');
      setIsLoading(false);
    }
  };

  const processMultiVariantDFUs = (data) => {
    console.log('Processing data:', data.length, 'records');
    
    if (data.length === 0) {
      alert('No data found in the file');
      return;
    }
    
    // Check the column structure
    const sampleRecord = data[0];
    console.log('Sample record:', sampleRecord);
    console.log('Available columns:', Object.keys(sampleRecord));
    
    // Try to identify the correct column names
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
    
    // Check if we have the required columns
    if (!sampleRecord[dfuColumn] || !sampleRecord[partNumberColumn] || !sampleRecord[demandColumn]) {
      alert(`Could not find required columns. Found: ${Object.keys(sampleRecord).join(', ')}`);
      return;
    }
    
    const groupedByDFU = {};
    
    // Group by DFU
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

    // Find DFU codes with multiple variants
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
    console.log('Sample multi-variant DFU:', Object.keys(multiVariants)[0], multiVariants[Object.keys(multiVariants)[0]]);

    setMultiVariantDFUs(multiVariants);
    setFilteredDFUs(multiVariants);
    
    if (multiVariantCount === 0) {
      alert('No DFU codes with multiple variants found in the data');
    }
  };

  // Filter DFUs based on search term
  useEffect(() => {
    if (searchTerm) {
      const filtered = {};
      Object.keys(multiVariantDFUs).forEach(dfuCode => {
        if (dfuCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            multiVariantDFUs[dfuCode].variants.some(v => 
              v.toString().toLowerCase().includes(searchTerm.toLowerCase()))) {
          filtered[dfuCode] = multiVariantDFUs[dfuCode];
        }
      });
      setFilteredDFUs(filtered);
    } else {
      setFilteredDFUs(multiVariantDFUs);
    }
  }, [searchTerm, multiVariantDFUs]);

  const handleTransferSelection = (dfuCode, targetVariant) => {
    setTransfers(prev => ({
      ...prev,
      [dfuCode]: targetVariant
    }));
  };

  const executeTransfer = (dfuCode) => {
    const targetVariant = transfers[dfuCode];
    if (!targetVariant) return;

    const dfuData = multiVariantDFUs[dfuCode];
    const { dfuColumn, partNumberColumn, demandColumn } = dfuData;
    
    const updatedData = [...rawData];
    
    // Find all records for this DFU
    const dfuRecords = updatedData.filter(record => record[dfuColumn] === dfuCode);
    
    console.log(`Executing transfer for DFU ${dfuCode} to variant ${targetVariant}`);
    console.log(`Found ${dfuRecords.length} records for this DFU`);
    
    // Update records to transfer demand to target variant
    dfuRecords.forEach(record => {
      if (record[partNumberColumn] !== targetVariant) {
        // Find corresponding record with target variant or create new one
        const targetRecord = dfuRecords.find(r => 
          r[partNumberColumn] === targetVariant && 
          r['Calendar.week'] === record['Calendar.week'] &&
          r['Source Location'] === record['Source Location']
        );
        
        if (targetRecord) {
          const oldDemand = parseFloat(targetRecord[demandColumn]) || 0;
          const transferDemand = parseFloat(record[demandColumn]) || 0;
          targetRecord[demandColumn] = oldDemand + transferDemand;
          record[demandColumn] = 0; // Zero out the old variant
        } else {
          // Create new record for target variant
          record[partNumberColumn] = targetVariant;
        }
      }
    });

    setRawData(updatedData);
    processMultiVariantDFUs(updatedData);
    
    // Remove from transfers
    setTransfers(prev => {
      const newTransfers = { ...prev };
      delete newTransfers[dfuCode];
      return newTransfers;
    });
    
    alert(`Transfer completed for DFU ${dfuCode}`);
  };

  const exportData = () => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rawData);
      XLSX.utils.book_append_sheet(wb, ws, 'Updated Demand');
      XLSX.writeFile(wb, 'Updated_Demand_Data.xlsx');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Error exporting data: ' + error.message);
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  if (!isProcessed) {
    return React.createElement('div', { className: "max-w-6xl mx-auto p-6 bg-white" },
      React.createElement('div', { className: "text-center py-12" },
        React.createElement('div', { className: "bg-blue-50 rounded-lg p-8 inline-block" },
          React.createElement(Upload, { className: "w-12 h-12 mx-auto mb-4 text-blue-600" }),
          React.createElement('h2', { className: "text-xl font-semibold mb-2" }, "Upload Demand Data"),
          React.createElement('p', { className: "text-gray-600 mb-4" },
            "Upload your Excel file containing demand data with DFU codes and part codes"
          ),
          
          isLoading ? 
            React.createElement('div', { className: "text-blue-600" },
              React.createElement('div', { className: "loading-spinner mx-auto mb-2" }),
              React.createElement('p', null, "Processing file...")
            ) :
            React.createElement('div', { className: "space-y-4" },
              React.createElement('div', null,
                React.createElement('input', {
                  type: "file",
                  accept: ".xlsx,.xls",
                  onChange: handleFileUpload,
                  className: "block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                }),
                React.createElement('p', { className: "text-sm text-gray-500 mt-2" },
                  "Supported formats: .xlsx, .xls"
                )
              ),
              
              React.createElement('div', { className: "text-left text-sm text-gray-600 bg-gray-50 p-4 rounded-lg" },
                React.createElement('p', { className: "font-medium mb-2" }, "Expected file structure:"),
                React.createElement('ul', { className: "list-disc list-inside space-y-1" },
                  React.createElement('li', null, "DFU column (containing DFU codes)"),
                  React.createElement('li', null, "Product Number column (containing part codes)"),
                  React.createElement('li', null, "Demand column (weekly forecast or demand values)"),
                  React.createElement('li', null, "Calendar week and Source Location columns")
                )
              )
            )
        )
      )
    );
  }

  return React.createElement('div', { className: "max-w-6xl mx-auto p-6 bg-white" },
    React.createElement('div', { className: "mb-6" },
      React.createElement('h1', { className: "text-2xl font-bold text-gray-800 mb-2" }, "DFU Demand Transfer Management"),
      React.createElement('p', { className: "text-gray-600" },
        `Manage demand transfers for DFU codes with multiple variants. Found ${Object.keys(multiVariantDFUs).length} DFUs with multiple variants.`
      )
    ),

    React.createElement('div', { className: "flex gap-4 mb-6" },
      React.createElement('div', { className: "relative flex-1" },
        React.createElement(Search, { className: "absolute left-3 top-3 h-4 w-4 text-gray-400" }),
        React.createElement('input', {
          type: "text",
          placeholder: "Search DFU codes or part codes...",
          value: searchTerm,
          onChange: (e) => setSearchTerm(e.target.value),
          className: "w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        })
      ),
      React.createElement('button', {
        onClick: exportData,
        className: "bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
      },
        React.createElement(Download, { className: "w-4 h-4" }),
        "Export Updated Data"
      )
    ),

    React.createElement('div', { className: "grid grid-cols-1 lg:grid-cols-2 gap-6" },
      React.createElement('div', { className: "bg-gray-50 rounded-lg p-4" },
        React.createElement('h3', { className: "font-semibold text-gray-800 mb-4 flex items-center gap-2" },
          React.createElement(AlertTriangle, { className: "w-5 h-5 text-amber-600" }),
          `DFUs Requiring Review (${Object.keys(filteredDFUs).length})`
        ),
        React.createElement('div', { className: "space-y-3 max-h-96 overflow-y-auto" },
          Object.keys(filteredDFUs).map(dfuCode => {
            const dfuData = filteredDFUs[dfuCode];
            if (!dfuData || !dfuData.variants) return null;
            
            return React.createElement('div', {
              key: dfuCode,
              className: `p-3 rounded-lg border-2 cursor-pointer transition-all card-hover ${
                selectedDFU === dfuCode 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`,
              onClick: () => setSelectedDFU(dfuCode)
            },
              React.createElement('div', { className: "flex justify-between items-start" },
                React.createElement('div', null,
                  React.createElement('h4', { className: "font-medium text-gray-800" }, `DFU: ${dfuCode}`),
                  React.createElement('p', { className: "text-sm text-gray-600" },
                    `${dfuData.variants.length} variants`
                  )
                ),
                React.createElement('div', { className: "text-right" },
                  transfers[dfuCode] ? 
                    React.createElement('span', { className: "inline-flex items-center gap-1 text-green-600 text-sm" },
                      React.createElement(CheckCircle, { className: "w-4 h-4" }),
                      "Ready"
                    ) :
                    React.createElement('span', { className: "text-amber-600 text-sm" }, "Pending")
                )
              )
            );
          })
        )
      ),

      React.createElement('div', { className: "bg-white border border-gray-200 rounded-lg p-4" },
        selectedDFU && multiVariantDFUs[selectedDFU] ?
          React.createElement('div', null,
            React.createElement('h3', { className: "font-semibold text-gray-800 mb-4" },
              `DFU: ${selectedDFU} - Variant Details`
            ),
            React.createElement('div', { className: "space-y-3" },
              multiVariantDFUs[selectedDFU].variants.map(variant => {
                const demandData = multiVariantDFUs[selectedDFU].variantDemand[variant];
                const isSelected = transfers[selectedDFU] === variant;
                
                return React.createElement('div', {
                  key: variant,
                  className: `p-3 rounded-lg border-2 cursor-pointer transition-all card-hover ${
                    isSelected 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`,
                  onClick: () => handleTransferSelection(selectedDFU, variant)
                },
                  React.createElement('div', { className: "flex justify-between items-center" },
                    React.createElement('div', null,
                      React.createElement('h4', { className: "font-medium text-gray-800" },
                        `Part: ${variant}`
                      ),
                      React.createElement('p', { className: "text-sm text-gray-600" },
                        `${demandData?.recordCount || 0} records`
                      )
                    ),
                    React.createElement('div', { className: "text-right" },
                      React.createElement('p', { className: "font-medium text-gray-800" },
                        formatNumber(demandData?.totalDemand || 0)
                      ),
                      React.createElement('p', { className: "text-sm text-gray-600" }, "demand")
                    )
                  )
                );
              })
            ),
            
            transfers[selectedDFU] &&
              React.createElement('div', { className: "mt-4 p-3 bg-blue-50 rounded-lg" },
                React.createElement('p', { className: "text-sm text-blue-800 mb-3" },
                  `Transfer all demand to variant: `,
                  React.createElement('strong', null, transfers[selectedDFU])
                ),
                React.createElement('div', { className: "flex gap-2" },
                  React.createElement('button', {
                    onClick: () => executeTransfer(selectedDFU),
                    className: "bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                  },
                    React.createElement(ArrowRight, { className: "w-4 h-4" }),
                    "Execute Transfer"
                  ),
                  React.createElement('button', {
                    onClick: () => setTransfers(prev => {
                      const newTransfers = { ...prev };
                      delete newTransfers[selectedDFU];
                      return newTransfers;
                    }),
                    className: "bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
                  },
                    React.createElement(X, { className: "w-4 h-4" }),
                    "Cancel"
                  )
                )
              )
          ) :
          React.createElement('div', { className: "text-center py-12 text-gray-500" },
            "Select a DFU from the list to view variant details"
          )
      )
    ),

    React.createElement('div', { className: "mt-6 bg-blue-50 rounded-lg p-4" },
      React.createElement('h3', { className: "font-semibold text-blue-800 mb-2" }, "How to Use"),
      React.createElement('ul', { className: "text-sm text-blue-700 space-y-1" },
        React.createElement('li', null, "1. Select a DFU code from the left panel to view its variants"),
        React.createElement('li', null, "2. Click on the variant you want to consolidate demand to"),
        React.createElement('li', null, "3. Click \"Execute Transfer\" to move all demand to the selected variant"),
        React.createElement('li', null, "4. Export the updated data when you're done with all transfers")
      )
    )
  );
};

// Render the app
ReactDOM.render(React.createElement(DemandTransferInterface), document.getElementById('root'));
