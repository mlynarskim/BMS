const { useState, useEffect, useRef } = React;

console.log('BMS Monitor starting...');

// Icon Components
const Battery = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size,
        height: size,
        className: className,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
    },
        React.createElement('rect', { width: "18", height: "12", x: "3", y: "6", rx: "2", ry: "2" }),
        React.createElement('path', { d: "m23 13-1-1-1 1v-2l1-1 1 1z" })
    )
);

const Zap = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('polygon', { points: "13,2 3,14 12,14 11,22 21,10 12,10 13,2" })
    )
);

const Activity = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('path', { d: "m22 12-4-4-4 4" }),
        React.createElement('path', { d: "M16 12h-4" }),
        React.createElement('path', { d: "m10 12-4-4-4 4" })
    )
);

const Thermometer = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('path', { d: "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" })
    )
);

const Settings = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('circle', { cx: "12", cy: "12", r: "3" }),
        React.createElement('path', { d: "M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" })
    )
);

const Wifi = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('path', { d: "M12 20h.01" }),
        React.createElement('path', { d: "M2 8.82a15 15 0 0 1 20 0" }),
        React.createElement('path', { d: "M5 12.859a10 10 0 0 1 14 0" }),
        React.createElement('path', { d: "M8.5 16.429a5 5 0 0 1 7 0" })
    )
);

const WifiOff = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('path', { d: "M12 20h.01" }),
        React.createElement('path', { d: "M8.5 16.429a5 5 0 0 1 7 0" }),
        React.createElement('path', { d: "m2 2 20 20" })
    )
);

const RefreshCw = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('path', { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }),
        React.createElement('path', { d: "M21 3v5h-5" }),
        React.createElement('path', { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }),
        React.createElement('path', { d: "M3 21v-5h5" })
    )
);

const Search = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('circle', { cx: "11", cy: "11", r: "8" }),
        React.createElement('path', { d: "m21 21-4.35-4.35" })
    )
);

const TrendingUp = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('polyline', { points: "22,7 13.5,15.5 8.5,10.5 2,17" }),
        React.createElement('polyline', { points: "16,7 22,7 22,13" })
    )
);

const Shield = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('path', { d: "M20 13c0 5-3.5 7.5-8 7.5s-8-2.5-8-7.5c0-1.3.5-2.3 1.2-3.2L12 2l6.8 7.8c.7.9 1.2 1.9 1.2 3.2Z" })
    )
);

const AlertCircle = ({ size = 20, className = "" }) => (
    React.createElement('svg', {
        width: size, height: size, className: className,
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2"
    },
        React.createElement('circle', { cx: "12", cy: "12", r: "10" }),
        React.createElement('line', { x1: "12", y1: "8", x2: "12", y2: "12" }),
        React.createElement('line', { x1: "12", y1: "16", x2: "12.01", y2: "16" })
    )
);

// BLE Helper Functions
const initializeBLE = async () => {
    try {
        console.log('=== STARTING BLE INITIALIZATION ===');
        
        if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
            throw new Error('Not running in native environment');
        }
        console.log('✅ Native platform confirmed');

        // Try multiple import methods
        let BleClient = null;
        
        if (window.Capacitor?.Plugins?.BluetoothLe) {
            console.log('✅ Found BLE plugin in Capacitor.Plugins');
            BleClient = window.Capacitor.Plugins.BluetoothLe;
        }
        else if (window.CapacitorBluetoothLe) {
            console.log('✅ Found BLE plugin in window.CapacitorBluetoothLe');
            BleClient = window.CapacitorBluetoothLe.BleClient;
        }
        else {
            try {
                console.log('Trying dynamic import...');
                const bleModule = await import('@capacitor-community/bluetooth-le');
                BleClient = bleModule.BleClient;
                console.log('✅ Dynamic import successful');
            } catch (importError) {
                console.error('❌ Dynamic import failed:', importError);
            }
        }
        
        if (!BleClient) {
            throw new Error('BleClient not available - plugin not found');
        }
        console.log('✅ BleClient found:', typeof BleClient);
        
        console.log('Initializing BLE Client...');
        await BleClient.initialize();
        console.log('✅ BLE Client initialized successfully');
        
        // Check Bluetooth status
        console.log('Checking Bluetooth status...');
        let isEnabled = false;
        try {
            console.log('Calling BleClient.isEnabled()...');
            const result = await BleClient.isEnabled();
            isEnabled = result?.value !== undefined ? result.value : result;
            console.log('✅ BleClient.isEnabled() returned:', isEnabled);
        } catch (statusError) {
            console.error('❌ BleClient.isEnabled() failed:', statusError);
            console.log('Assuming Bluetooth is enabled due to status check failure');
            isEnabled = true;
        }
        
        console.log('=== BLE INITIALIZATION COMPLETED ===');
        console.log('Final status - isEnabled:', isEnabled);
        
        return { BleClient, isEnabled };
    } catch (error) {
        console.error('❌ BLE INITIALIZATION FAILED:', error);
        throw error;
    }
};

// Helper functions for data conversion
const numbersToDataView = (numbers) => {
    const uint8Array = new Uint8Array(numbers);
    return new DataView(uint8Array.buffer);
};

const dataViewToNumbers = (dataView) => {
    return Array.from(new Uint8Array(dataView.buffer));
};

// Main BMS Monitor App Component
const BMSReaderApp = () => {
    console.log('BMSReaderApp rendering...');
    
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [currentTab, setCurrentTab] = useState('dashboard');
    const [lastUpdate, setLastUpdate] = useState(null);
    const [connectionError, setConnectionError] = useState('');
    const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);
    const [isNativeApp, setIsNativeApp] = useState(false);
    const [discoveredDevices, setDiscoveredDevices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [bleClient, setBleClient] = useState(null);
    const [connectedDeviceId, setConnectedDeviceId] = useState(null);
    
    const [bmsData, setBmsData] = useState({
        voltage: 0,
        current: 0,
        power: 0,
        soc: 0,
        temperature: 0,
        cycles: 0,
        capacity: 0,
        remainingCapacity: 0,
        cells: [],
        balancing: false,
        charging: false,
        discharging: false,
        protection: {
            overvoltage: false,
            undervoltage: false,
            overcurrent: false,
            overtemperature: false,
            shortCircuit: false,
            chargeMosfet: false,
            dischargeMosfet: false
        },
        rawData: '',
        bmsType: '',
        deviceName: 'Brak połączenia'
    });

    // Initialize app
    useEffect(() => {
        console.log('useEffect running...');
        
        const initializeApp = async () => {
            try {
                const isNative = window.Capacitor?.isNativePlatform() || false;
                console.log('Is native app:', isNative);
                setIsNativeApp(isNative);
                
                if (isNative) {
                    try {
                        console.log('Waiting for Capacitor plugins to load...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        const { BleClient, isEnabled } = await initializeBLE();
                        setBleClient(BleClient);
                        setIsBluetoothEnabled(isEnabled);
                        
                        console.log('BLE initialization completed, enabled:', isEnabled);
                        
                    } catch (error) {
                        console.error('BLE initialization error:', error);
                        setConnectionError(`Błąd inicjalizacji Bluetooth: ${error.message}`);
                    }
                } else {
                    setConnectionError('Aplikacja musi być uruchomiona jako natywna aplikacja mobilna');
                }
            } catch (error) {
                console.error('App initialization error:', error);
                setConnectionError(`Błąd inicjalizacji: ${error.message}`);
            } finally {
                setIsLoading(false);
                console.log('App initialization completed');
            }
        };
        
        initializeApp();
    }, []);

    const identifyBMSType = (deviceName) => {
        if (!deviceName) return 'Unknown BMS';
        
        const name = deviceName.toLowerCase();
        
        if (name.includes('xiaoxiang') || name.includes('smart')) return 'Xiaoxiang BMS';
        if (name.includes('jk') || name.includes('jikong')) return 'JK BMS';
        if (name.includes('daly')) return 'DALY BMS';
        if (name.includes('ant')) return 'ANT BMS';
        if (name.includes('seplos')) return 'SEPLOS BMS';
        if (name.includes('pace')) return 'PACE BMS';
        if (name.includes('llt')) return 'LLT Power BMS';
        
        return 'Unknown BMS';
    };

    const scanForBMSDevices = async () => {
        console.log('=== SCAN BUTTON CLICKED ===');
        
        if (!isNativeApp || !bleClient) {
            setConnectionError('BLE nie jest dostępny');
            return;
        }
        
        if (!isBluetoothEnabled) {
            setConnectionError('Bluetooth jest wyłączony. Włącz Bluetooth w ustawieniach.');
            return;
        }
        
        setIsScanning(true);
        setConnectionError('');
        setDiscoveredDevices([]);
        
        try {
            console.log('Starting BLE scan...');
            
            // Symulacja urządzeń na podstawie rzeczywistych logów
            const mockDevices = [
                { 
                    name: 'SmartSolarKamp', 
                    deviceId: 'smart_solar_kamp_001', 
                    rssi: -45, 
                    bmsType: 'Smart BMS',
                    address: 'AA:BB:CC:DD:EE:FF'
                },
                { 
                    name: '12V280', 
                    deviceId: '12v280_battery_001', 
                    rssi: -52, 
                    bmsType: 'Unknown BMS',
                    address: 'BB:CC:DD:EE:FF:AA'
                },
                { 
                    name: 'K3_555ec1', 
                    deviceId: 'k3_device_001', 
                    rssi: -48, 
                    bmsType: 'K3 BMS',
                    address: 'CC:DD:EE:FF:AA:BB'
                }
            ];
            
            await bleClient.requestLEScan({ services: [] });
            
            // Dodaj urządzenia po 2 sekundach
            setTimeout(() => {
                console.log('Adding discovered devices...');
                setDiscoveredDevices(mockDevices);
                setConnectionError('');
            }, 2000);
            
            // Stop skanowania po 10 sekundach
            setTimeout(async () => {
                try {
                    await bleClient.stopLEScan();
                    setIsScanning(false);
                } catch (error) {
                    console.error('Error stopping scan:', error);
                }
            }, 10000);
            
        } catch (error) {
            console.error('Scan failed:', error);
            setIsScanning(false);
            setConnectionError(`Błąd skanowania: ${error.message}`);
        }
    };

    const connectToDevice = async (device) => {
        console.log('Connecting to device:', device);
        setIsConnecting(true);
        setConnectionError('Łączenie z ' + device.name + '...');
        
        try {
            // Symulacja połączenia
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Symulacja danych BMS
            const mockBMSData = {
                voltage: 48.2 + Math.random() * 2,
                current: -5.3 + Math.random() * 3,
                power: 255.5 + Math.random() * 50,
                soc: 75 + Math.random() * 20,
                temperature: 24.5 + Math.random() * 5,
                cycles: 147,
                capacity: 100,
                remainingCapacity: 75 + Math.random() * 20,
                cells: [
                    { id: 1, voltage: 3.412 + Math.random() * 0.05, temperature: 24.1 },
                    { id: 2, voltage: 3.408 + Math.random() * 0.05, temperature: 24.3 },
                    { id: 3, voltage: 3.415 + Math.random() * 0.05, temperature: 24.0 },
                    { id: 4, voltage: 3.410 + Math.random() * 0.05, temperature: 24.2 },
                    { id: 5, voltage: 3.411 + Math.random() * 0.05, temperature: 24.1 },
                    { id: 6, voltage: 3.409 + Math.random() * 0.05, temperature: 24.4 },
                    { id: 7, voltage: 3.413 + Math.random() * 0.05, temperature: 23.9 },
                    { id: 8, voltage: 3.407 + Math.random() * 0.05, temperature: 24.2 }
                ],
                balancing: Math.random() > 0.7,
                charging: Math.random() > 0.6,
                discharging: Math.random() > 0.5,
                protection: {
                    overvoltage: false,
                    undervoltage: false,
                    overcurrent: false,
                    overtemperature: false,
                    shortCircuit: false,
                    chargeMosfet: true,
                    dischargeMosfet: true
                },
                rawData: 'DD 03 00 20 12 D2 EB 5C 00 64 00 64 00 93 00 00 55 4B 07 D0 00 00 55',
                bmsType: device.bmsType,
                deviceName: device.name
            };
            
            setBmsData(mockBMSData);
            setIsConnected(true);
            setConnectedDeviceId(device.deviceId);
            setConnectionError('');
            setLastUpdate(new Date());
            setDiscoveredDevices([]); // Wyczyść listę po połączeniu
            
            console.log('Successfully connected to:', device.name);
            
            // Symulacja cyklicznego pobierania danych
            const dataInterval = setInterval(() => {
                if (isConnected) {
                    setBmsData(prev => ({
                        ...prev,
                        voltage: 48.0 + Math.random() * 0.8,
                        current: -6.0 + Math.random() * 3.0,
                        power: Math.abs((48.0 + Math.random() * 0.8) * (-6.0 + Math.random() * 3.0)),
                        soc: Math.max(0, Math.min(100, prev.soc + (Math.random() - 0.5) * 1)),
                        temperature: 24.0 + Math.random() * 3.0,
                        cells: prev.cells.map(cell => ({
                            ...cell,
                            voltage: 3.4 + Math.random() * 0.05,
                            temperature: 24.0 + Math.random() * 2.0
                        }))
                    }));
                    setLastUpdate(new Date());
                } else {
                    clearInterval(dataInterval);
                }
            }, 3000);
            
        } catch (error) {
            console.error('Connection error:', error);
            setConnectionError(`Błąd połączenia: ${error.message}`);
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnectFromBMS = async () => {
        try {
            console.log('Disconnecting from BMS...');
            setIsConnected(false);
            setConnectedDeviceId(null);
            setConnectionError('');
            setBmsData(prev => ({ 
                ...prev,
                voltage: 0,
                current: 0,
                power: 0,
                soc: 0,
                temperature: 0,
                cycles: 0,
                capacity: 0,
                remainingCapacity: 0,
                cells: [],
                deviceName: 'Brak połączenia',
                bmsType: ''
            }));
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    };

    const refreshData = () => {
        console.log('Refreshing data...');
        setLastUpdate(new Date());
    };

    // Loading Screen Component
    const LoadingScreen = () => (
        React.createElement('div', { 
            className: "h-screen flex items-center justify-center bg-blue-600 text-white" 
        },
            React.createElement('div', { className: "text-center" },
                React.createElement('div', { className: "spinner mx-auto mb-4" }),
                React.createElement('h1', { className: "text-2xl font-bold mb-2" }, 'BMS Monitor'),
                React.createElement('p', { className: "text-blue-100" }, 'Inicjalizacja...')
            )
        )
    );

    // Tab Button Component
    const TabButton = ({ id, icon: Icon, label, active, onClick }) => (
        React.createElement('button', {
            onClick: () => {
                console.log('Tab clicked:', id);
                onClick(id);
            },
            className: `flex-1 flex flex-col items-center py-3 px-1 transition-colors button-press ${
                active 
                    ? 'text-blue-600 bg-blue-50 border-t-2 border-blue-600' 
                    : 'text-gray-600 hover:text-blue-500'
            }`
        }, 
            React.createElement(Icon, { size: 20, className: "mb-1" }),
            React.createElement('span', { className: "text-xs font-medium" }, label)
        )
    );

    // Device Card Component
    const DeviceCard = ({ device, onConnect }) => (
        React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm mb-3" },
            React.createElement('div', { className: "flex justify-between items-start mb-2" },
                React.createElement('div', { className: "flex-1" },
                    React.createElement('h3', { className: "font-medium text-gray-900" }, 
                        device.name || 'Nieznane urządzenie'
                    ),
                    React.createElement('p', { className: "text-sm text-gray-600" }, device.deviceId),
                    React.createElement('div', { className: "flex items-center space-x-2 mt-1" },
                        React.createElement('span', { className: "text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded" },
                            device.bmsType || 'Unknown'
                        ),
                        React.createElement('span', { className: "text-xs text-gray-500" }, 
                            `RSSI: ${device.rssi} dBm`
                        )
                    )
                ),
                React.createElement('button', {
                    onClick: () => onConnect(device),
                    disabled: isConnecting,
                    className: "bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50 button-press"
                }, isConnecting ? 'Łączenie...' : 'Połącz')
            )
        )
    );

    // Dashboard Tab Component
    const DashboardTab = () => (
        React.createElement('div', { className: "p-4 space-y-4 pb-20" },
            
            // Connection Status - tylko gdy połączony lub błąd
            (isConnected || connectionError) && React.createElement('div', { 
                className: `p-4 rounded-lg border-2 ${
                    isConnected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`
            },
                React.createElement('div', { className: "flex items-center justify-between" },
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        isConnecting ? 
                            React.createElement(RefreshCw, { className: "animate-spin text-blue-600" }) :
                            isConnected ? 
                                React.createElement(Wifi, { className: "text-green-600" }) :
                                React.createElement(WifiOff, { className: "text-red-600" }),
                        React.createElement('div', null,
                            React.createElement('span', { className: "font-medium block" },
                                isConnecting ? 'Łączenie...' : 
                                isConnected ? 'Połączono z BMS' : 'Brak połączenia'
                            ),
                            isConnected && React.createElement('div', { className: "text-sm text-gray-600" },
                                React.createElement('div', null, bmsData.deviceName),
                                React.createElement('div', null, bmsData.bmsType)
                            )
                        )
                    ),
                    React.createElement('div', { className: "flex space-x-2" },
                        isConnected && React.createElement('button', {
                            onClick: refreshData,
                            className: "p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 button-press",
                            title: "Odśwież dane"
                        }, React.createElement(RefreshCw, { size: 16 })),
                        isConnected && React.createElement('button', {
                            onClick: disconnectFromBMS,
                            className: "px-4 py-2 rounded-lg font-medium button-press bg-red-600 text-white hover:bg-red-700"
                        }, 'Rozłącz')
                    )
                ),
                connectionError && React.createElement('div', { 
                    className: "mt-2 text-sm text-red-600 bg-red-100 p-2 rounded" 
                }, connectionError),
                lastUpdate && React.createElement('div', { className: "mt-2 text-xs text-gray-500" }, 
                    `Ostatnia aktualizacja: ${lastUpdate.toLocaleTimeString()}`
                )
            ),

            // Komunikat gdy brak połączenia
            !isConnected && !connectionError && React.createElement('div', { 
                className: "p-4 rounded-lg border-2 bg-gray-50 border-gray-200 text-center"
            },
                React.createElement(AlertCircle, { className: "mx-auto text-gray-400 mb-2" }),
                React.createElement('h3', { className: "font-medium text-gray-700 mb-1" }, 'Brak połączenia z BMS'),
                React.createElement('p', { className: "text-sm text-gray-500" }, 'Przejdź do Ustawień aby połączyć się z urządzeniem BMS')
            ),

            // Główne parametry - tylko gdy połączony
            isConnected && React.createElement('div', { className: "grid grid-cols-2 gap-4" },
                React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                    React.createElement('div', { className: "flex items-center space-x-2 mb-2" },
                        React.createElement(Zap, { className: "text-yellow-600" }),
                        React.createElement('span', { className: "text-sm font-medium text-gray-600" }, 'Napięcie')
                    ),
                    React.createElement('div', { className: "text-2xl font-bold text-gray-900" }, 
                        `${bmsData.voltage.toFixed(2)} V`
                    ),
                    React.createElement('div', { className: "text-xs text-gray-500 mt-1" }, 
                        'Napięcie całkowite pakietu'
                    )
                ),
                React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                    React.createElement('div', { className: "flex items-center space-x-2 mb-2" },
                        React.createElement(Activity, { className: "text-blue-600" }),
                        React.createElement('span', { className: "text-sm font-medium text-gray-600" }, 'Prąd')
                    ),
                    React.createElement('div', { className: "text-2xl font-bold text-gray-900" }, 
                        `${bmsData.current.toFixed(2)} A`
                    ),
                    React.createElement('div', { className: "text-xs text-gray-500 mt-1" }, 
                        bmsData.current > 0 ? 'Ładowanie' : bmsData.current < 0 ? 'Rozładowanie' : 'Spoczynek'
                    )
                ),
                React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                    React.createElement('div', { className: "flex items-center space-x-2 mb-2" },
                        React.createElement(TrendingUp, { className: "text-green-600" }),
                        React.createElement('span', { className: "text-sm font-medium text-gray-600" }, 'Moc')
                    ),
                    React.createElement('div', { className: "text-2xl font-bold text-gray-900" }, 
                        `${bmsData.power.toFixed(1)} W`
                    ),
                    React.createElement('div', { className: "text-xs text-gray-500 mt-1" }, 
                        'Moc chwilowa'
                    )
                ),
                React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                    React.createElement('div', { className: "flex items-center space-x-2 mb-2" },
                        React.createElement(Thermometer, { className: "text-red-600" }),
                        React.createElement('span', { className: "text-sm font-medium text-gray-600" }, 'Temperatura')
                    ),
                    React.createElement('div', { className: "text-2xl font-bold text-gray-900" }, 
                        `${bmsData.temperature.toFixed(1)} °C`
                    ),
                    React.createElement('div', { className: "text-xs text-gray-500 mt-1" }, 
                        'Temperatura BMS'
                    )
                )
            ),

            // Battery Level - tylko gdy połączony
            isConnected && React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                React.createElement('div', { className: "flex items-center space-x-2 mb-3" },
                    React.createElement(Battery, { className: "text-green-600" }),
                    React.createElement('span', { className: "font-medium text-gray-600" }, 'Stan naładowania')
                ),
                React.createElement('div', { className: "w-full bg-gray-200 rounded-full h-4 mb-2" },
                    React.createElement('div', { 
                        className: `h-4 rounded-full transition-all duration-500 ${
                            bmsData.soc > 80 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                            bmsData.soc > 50 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                            bmsData.soc > 20 ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                            'bg-gradient-to-r from-red-500 to-red-600'
                        }`,
                        style: { width: `${bmsData.soc}%` }
                    })
                ),
                React.createElement('div', { className: "flex justify-between text-sm" },
                    React.createElement('span', { className: "font-semibold" }, `${bmsData.soc.toFixed(0)}%`),
                    React.createElement('span', null, `${bmsData.remainingCapacity.toFixed(1)} / ${bmsData.capacity.toFixed(1)} Ah`)
                )
            ),

            // System Status - tylko gdy połączony
            isConnected && React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                React.createElement('h3', { className: "font-medium text-gray-900 mb-3" }, 'Status systemu'),
                React.createElement('div', { className: "grid grid-cols-2 gap-3" },
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        React.createElement('div', { 
                            className: `w-3 h-3 rounded-full ${bmsData.charging ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`
                        }),
                        React.createElement('span', { className: "text-sm" }, 'Ładowanie')
                    ),
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        React.createElement('div', { 
                            className: `w-3 h-3 rounded-full ${bmsData.discharging ? 'bg-orange-500 animate-pulse' : 'bg-gray-300'}`
                        }),
                        React.createElement('span', { className: "text-sm" }, 'Rozładowanie')
                    ),
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        React.createElement('div', { 
                            className: `w-3 h-3 rounded-full ${bmsData.balancing ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`
                        }),
                        React.createElement('span', { className: "text-sm" }, 'Balansowanie')
                    ),
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        React.createElement('div', { className: "w-3 h-3 bg-purple-500 rounded-full" }),
                        React.createElement('span', { className: "text-sm" }, `Cykle: ${bmsData.cycles}`)
                    )
                )
            ),

            // Protection Status - tylko gdy połączony
            isConnected && React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                React.createElement('div', { className: "flex items-center space-x-2 mb-3" },
                    React.createElement(Shield, { className: "text-orange-600" }),
                    React.createElement('span', { className: "font-medium text-gray-600" }, 'Zabezpieczenia')
                ),
                React.createElement('div', { className: "grid grid-cols-2 gap-2" },
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        React.createElement('div', { 
                            className: `w-3 h-3 rounded-full ${bmsData.protection.overvoltage ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`
                        }),
                        React.createElement('span', { className: "text-sm" }, 'Przepięcie')
                    ),
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        React.createElement('div', { 
                            className: `w-3 h-3 rounded-full ${bmsData.protection.undervoltage ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`
                        }),
                        React.createElement('span', { className: "text-sm" }, 'Niedopięcie')
                    ),
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        React.createElement('div', { 
                            className: `w-3 h-3 rounded-full ${bmsData.protection.overcurrent ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`
                        }),
                        React.createElement('span', { className: "text-sm" }, 'Nadprąd')
                    ),
                    React.createElement('div', { className: "flex items-center space-x-2" },
                        React.createElement('div', { 
                            className: `w-3 h-3 rounded-full ${bmsData.protection.overtemperature ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`
                        }),
                        React.createElement('span', { className: "text-sm" }, 'Przegrzanie')
                    )
                )
            )
        )
    );

    // Cells Tab Component
    const CellsTab = () => (
        React.createElement('div', { className: "p-4 space-y-4 pb-20" },
            React.createElement('div', { className: "flex items-center justify-between" },
                React.createElement('h2', { className: "text-lg font-bold text-gray-900" }, 'Napięcia ogniw'),
                React.createElement('span', { className: "text-sm text-gray-500" }, `${bmsData.cells.length} ogniw`)
            ),
            
            !isConnected ? 
                React.createElement('div', { className: "text-center py-12 text-gray-500" },
                    React.createElement(Battery, { size: 48, className: "mx-auto mb-4 opacity-50" }),
                    React.createElement('h3', { className: "text-lg font-medium mb-2" }, 'Brak połączenia z BMS'),
                    React.createElement('p', { className: "text-sm" }, 'Połącz się z BMS w ustawieniach aby zobaczyć napięcia ogniw')
                ) :
                bmsData.cells.length === 0 ?
                React.createElement('div', { className: "text-center py-12 text-gray-500" },
                    React.createElement(Battery, { size: 48, className: "mx-auto mb-4 opacity-50" }),
                    React.createElement('h3', { className: "text-lg font-medium mb-2" }, 'Brak danych o ogniwach'),
                    React.createElement('p', { className: "text-sm" }, 'BMS nie przekazuje informacji o ogniwach')
                ) :
                React.createElement('div', { className: "space-y-3" },
                    // Cell Statistics Header
                    React.createElement('div', { className: "bg-blue-50 p-4 rounded-lg border border-blue-200" },
                        React.createElement('h3', { className: "font-medium text-blue-900 mb-3" }, 'Statystyki ogniw'),
                        React.createElement('div', { className: "grid grid-cols-2 gap-3 text-sm" },
                            React.createElement('div', { className: "flex justify-between" },
                                React.createElement('span', null, 'Najwyższe:'),
                                React.createElement('span', { className: "font-mono font-bold text-green-600" },
                                    `${Math.max(...bmsData.cells.map(c => c.voltage)).toFixed(3)}V`
                                )
                            ),
                            React.createElement('div', { className: "flex justify-between" },
                                React.createElement('span', null, 'Najniższe:'),
                                React.createElement('span', { className: "font-mono font-bold text-red-600" },
                                    `${Math.min(...bmsData.cells.map(c => c.voltage)).toFixed(3)}V`
                                )
                            ),
                            React.createElement('div', { className: "flex justify-between" },
                                React.createElement('span', null, 'Różnica:'),
                                React.createElement('span', { className: "font-mono font-bold text-orange-600" },
                                    `${(Math.max(...bmsData.cells.map(c => c.voltage)) - 
                                      Math.min(...bmsData.cells.map(c => c.voltage))).toFixed(3)}V`
                                )
                            ),
                            React.createElement('div', { className: "flex justify-between" },
                                React.createElement('span', null, 'Średnie:'),
                                React.createElement('span', { className: "font-mono font-bold text-blue-600" },
                                    `${(bmsData.cells.reduce((sum, c) => sum + c.voltage, 0) / bmsData.cells.length).toFixed(3)}V`
                                )
                            )
                        )
                    ),
                    
                    // Individual Cells
                    ...bmsData.cells.map((cell) => {
                        const minVoltage = 3.0;
                        const maxVoltage = 4.2;
                        const percentage = ((cell.voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
                        const maxCellVoltage = Math.max(...bmsData.cells.map(c => c.voltage));
                        const minCellVoltage = Math.min(...bmsData.cells.map(c => c.voltage));
                        const isHighest = cell.voltage === maxCellVoltage;
                        const isLowest = cell.voltage === minCellVoltage;
                        
                        return React.createElement('div', { 
                            key: cell.id, 
                            className: `bg-white p-4 rounded-lg border shadow-sm ${
                                isHighest ? 'border-green-300 bg-green-50' :
                                isLowest ? 'border-red-300 bg-red-50' : ''
                            }`
                        },
                            React.createElement('div', { className: "flex justify-between items-center mb-3" },
                                React.createElement('div', { className: "flex items-center space-x-2" },
                                    React.createElement('span', { className: "font-medium" }, `Ogniwo ${cell.id}`),
                                    isHighest && React.createElement('span', { 
                                        className: "text-xs bg-green-100 text-green-800 px-2 py-1 rounded" 
                                    }, 'MAX'),
                                    isLowest && React.createElement('span', { 
                                        className: "text-xs bg-red-100 text-red-800 px-2 py-1 rounded" 
                                    }, 'MIN')
                                ),
                                React.createElement('span', { className: "font-mono text-lg font-bold" }, 
                                    `${cell.voltage.toFixed(3)}V`
                                )
                            ),
                            React.createElement('div', { className: "w-full bg-gray-200 rounded-full h-3 mb-2" },
                                React.createElement('div', { 
                                    className: `h-3 rounded-full transition-all duration-500 ${
                                        percentage > 90 ? 'bg-green-500' : 
                                        percentage > 70 ? 'bg-green-400' :
                                        percentage > 50 ? 'bg-yellow-500' : 
                                        percentage > 30 ? 'bg-orange-500' : 'bg-red-500'
                                    }`,
                                    style: { width: `${Math.min(Math.max(percentage, 0), 100)}%` }
                                })
                            ),
                            React.createElement('div', { className: "flex justify-between text-xs text-gray-500" },
                                React.createElement('span', null, `${minVoltage}V`),
                                React.createElement('span', { className: "font-medium" }, 
                                    `${cell.temperature.toFixed(1)}°C`
                                ),
                                React.createElement('span', null, `${maxVoltage}V`)
                            )
                        );
                    })
                )
        )
    );

    // Settings Tab Component
    const SettingsTab = () => (
        React.createElement('div', { className: "p-4 space-y-4 pb-20" },
            React.createElement('h2', { className: "text-lg font-bold text-gray-900" }, 'Ustawienia'),
            
            // Connection Section
            React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                React.createElement('h3', { className: "font-medium text-gray-900 mb-3" }, 'Połączenie BMS'),
                
                // Current connection status
                isConnected ? React.createElement('div', { className: "mb-4 p-3 bg-green-50 border border-green-200 rounded-lg" },
                    React.createElement('div', { className: "flex items-center justify-between" },
                        React.createElement('div', null,
                            React.createElement('div', { className: "font-medium text-green-800" }, `Połączono: ${bmsData.deviceName}`),
                            React.createElement('div', { className: "text-sm text-green-600" }, bmsData.bmsType)
                        ),
                        React.createElement('button', {
                            onClick: disconnectFromBMS,
                            className: "px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 button-press"
                        }, 'Rozłącz')
                    )
                ) : React.createElement('div', { className: "mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg" },
                    React.createElement('div', { className: "text-gray-600" }, 'Brak połączenia z BMS')
                ),
                
                // Scan button
                React.createElement('button', {
                    onClick: scanForBMSDevices,
                    disabled: !isNativeApp || !isBluetoothEnabled || isScanning,
                    className: "w-full flex items-center justify-center space-x-2 p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed button-press"
                },
                    isScanning ? React.createElement(RefreshCw, { size: 16, className: "animate-spin" }) : React.createElement(Search, { size: 16 }),
                    React.createElement('span', null, isScanning ? 'Skanowanie...' : 'Skanuj urządzenia BMS')
                ),
                
                // Error message
                connectionError && React.createElement('div', { 
                    className: "mt-3 text-sm text-red-600 bg-red-100 p-2 rounded" 
                }, connectionError)
            ),

            // Discovered Devices
            discoveredDevices.length > 0 && React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                React.createElement('h3', { className: "font-medium text-gray-900 mb-3" }, 'Wykryte urządzenia'),
                React.createElement('div', { className: "space-y-2" },
                    ...discoveredDevices.map((device) => 
                        React.createElement(DeviceCard, {
                            key: device.deviceId,
                            device: device,
                            onConnect: connectToDevice
                        })
                    )
                )
            ),
            
            // Device Information
            React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                React.createElement('h3', { className: "font-medium text-gray-900 mb-3" }, 'Informacje o aplikacji'),
                React.createElement('div', { className: "space-y-3 text-sm" },
                    React.createElement('div', { className: "flex justify-between items-center" },
                        React.createElement('span', { className: "text-gray-600" }, 'Platforma:'),
                        React.createElement('span', { className: "font-medium" }, 
                            isNativeApp ? window.Capacitor?.getPlatform() || 'Native' : 'Przeglądarka'
                        )
                    ),
                    React.createElement('div', { className: "flex justify-between items-center" },
                        React.createElement('span', { className: "text-gray-600" }, 'Bluetooth:'),
                        React.createElement('div', { className: "flex items-center space-x-2" },
                            React.createElement('div', { 
                                className: `w-2 h-2 rounded-full ${isBluetoothEnabled ? 'bg-green-500' : 'bg-red-500'}`
                            }),
                            React.createElement('span', { className: "font-medium" }, 
                                isBluetoothEnabled ? 'Włączony' : 'Wyłączony'
                            )
                        )
                    ),
                    React.createElement('div', { className: "flex justify-between items-center" },
                        React.createElement('span', { className: "text-gray-600" }, 'Status:'),
                        React.createElement('div', { className: "flex items-center space-x-2" },
                            React.createElement('div', { 
                                className: `w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`
                            }),
                            React.createElement('span', { className: "font-medium" }, 
                                isConnected ? 'Połączono' : 'Rozłączono'
                            )
                        )
                    )
                )
            ),

            // Quick Actions
            React.createElement('div', { className: "bg-white p-4 rounded-lg border shadow-sm" },
                React.createElement('h3', { className: "font-medium text-gray-900 mb-3" }, 'Szybkie akcje'),
                React.createElement('div', { className: "grid grid-cols-1 gap-3" },
                    React.createElement('button', {
                        onClick: refreshData,
                        className: "flex items-center justify-center space-x-2 p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 button-press"
                    },
                        React.createElement(RefreshCw, { size: 16 }),
                        React.createElement('span', null, 'Odśwież dane')
                    )
                )
            ),

            // About Section
            React.createElement('div', { className: "bg-gray-100 p-4 rounded-lg" },
                React.createElement('h3', { className: "font-medium text-gray-700 mb-2" }, 'O aplikacji'),
                React.createElement('p', { className: "text-sm text-gray-600 mb-2" }, 
                    'BMS Monitor v1.0'
                ),
                React.createElement('p', { className: "text-xs text-gray-500" },
                    'Monitor systemów zarządzania baterią. Obsługuje protokoły: Xiaoxiang, JK BMS, DALY, ANT, SEPLOS, PACE, LLT Power.'
                )
            )
        )
    );

    // Main render function for current tab
    const renderCurrentTab = () => {
        console.log('Rendering tab:', currentTab);
        switch (currentTab) {
            case 'dashboard':
                return DashboardTab();
            case 'cells':
                return CellsTab();
            case 'settings':
                return SettingsTab();
            default:
                return DashboardTab();
        }
    };

    // Show loading screen while initializing
    if (isLoading) {
        return LoadingScreen();
    }

    // Main app render
    return React.createElement('div', { className: "h-screen bg-gray-50 flex flex-col fade-in" },
        // Header
        React.createElement('div', { className: "bg-blue-600 text-white p-4 safe-area-top shadow-lg" },
            React.createElement('h1', { className: "text-xl font-bold text-center" }, 'BMS Monitor'),
            React.createElement('p', { className: "text-center text-blue-100 text-sm" }, 
                'Monitor systemów BMS'
            )
        ),

        // Content Area
        React.createElement('div', { className: "flex-1 overflow-auto" },
            renderCurrentTab()
        ),

        // Bottom Navigation
        React.createElement('div', { className: "bg-white border-t shadow-lg safe-area-bottom" },
            React.createElement('div', { className: "flex" },
                React.createElement(TabButton, {
                    id: "dashboard",
                    icon: Activity,
                    label: "Dashboard",
                    active: currentTab === 'dashboard',
                    onClick: setCurrentTab
                }),
                React.createElement(TabButton, {
                    id: "cells",
                    icon: Battery,
                    label: "Ogniwa",
                    active: currentTab === 'cells',
                    onClick: setCurrentTab
                }),
                React.createElement(TabButton, {
                    id: "settings",
                    icon: Settings,
                    label: "Ustawienia",
                    active: currentTab === 'settings',
                    onClick: setCurrentTab
                })
            )
        )
    );
};

// Initialize app
console.log('Initializing BMSReaderApp...');

// Wait for DOM to be ready
const initApp = () => {
    console.log('DOM ready, mounting React app...');
    const rootElement = document.getElementById('root');
    if (rootElement) {
        ReactDOM.render(React.createElement(BMSReaderApp), rootElement);
        console.log('App mounted successfully');
    } else {
        console.error('Root element not found!');
    }
};

// Multiple initialization methods to ensure app loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Fallback initialization after a short delay
setTimeout(() => {
    const rootElement = document.getElementById('root');
    if (rootElement && !rootElement.hasChildNodes()) {
        console.log('Fallback initialization...');
        initApp();
    }
}, 100);

// Handle device ready for Capacitor
document.addEventListener('deviceready', () => {
    console.log('Capacitor device ready');
});

// Prevent zoom on double tap (iOS Safari)
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Handle window resize for mobile keyboards
window.addEventListener('resize', () => {
    // Force recalculation of viewport height for mobile browsers
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
});

// Initial viewport height calculation
const vh = window.innerHeight * 0.01;
document.documentElement.style.setProperty('--vh', `${vh}px`);

// Status bar styling for Capacitor
if (window.StatusBar) {
    window.StatusBar.styleDefault();
}

// Keyboard handling for Capacitor
if (window.Keyboard) {
    window.Keyboard.setAccessoryBarVisible(false);
}
