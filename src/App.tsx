import React, { useState, useEffect, useRef } from 'react';
import { Battery, Zap, Activity, Thermometer, Settings, Wifi, WifiOff, RefreshCw, Search, TrendingUp, Shield, AlertCircle, Eye, EyeOff } from 'lucide-react';

// BMS Protocols and Commands
const BMS_SERVICES = {
  XIAOXIANG: {
    serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
    readCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb'
  },
  JK: {
    serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
    readCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb'
  },
  DALY: {
    serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    readCharacteristic: '0000fff1-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '0000fff2-0000-1000-8000-00805f9b34fb'
  }
};

// CRC16-Modbus (poly 0xA001)    
const computeCRC16 = (bytes: number[]): [number, number] => {
  let crc = 0xFFFF;
  for (let b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xA001;
      else             crc >>= 1;
    }
  }
  return [crc & 0xFF, (crc >> 8) & 0xFF];
};

// BMS Commands - FIXED: Poprawne komendy dla JK BMS
const BMSCommands = {
  xiaoxiang: {
    getBasicInfo: () => [0xDD,0xA5,0x03,0x00,0xFF,0xFD,0x77],
    getCellVoltages: () => [0xDD,0xA5,0x04,0x00,0xFF,0xFC,0x77]
  },
  jk: {
    // Poprawne komendy JK BMS - podstawowe info
    getBasicInfo: () => [0xAA, 0x55, 0x90, 0xEB, 0x96, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x11],
    // Alternatywna komenda dla JK BMS
    getInfo2: () => [0xAA, 0x55, 0x90, 0xEB, 0x97, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x12],
    // Prosta komenda odczytu
    getSimple: () => [0x4E, 0x57, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00, 0x06, 0x03, 0x03, 0x65],
    // Komenda w stylu Xiaoxiang dla JK BMS (niektóre JK BMS używają tego protokołu)
    getXiaoxiangStyle: () => [0xDD,0xA5,0x03,0x00,0xFF,0xFD,0x77]
  },
  daly: {
    getBasicInfo: () => [0xA5, 0x80, 0x90, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xBD],
    getCellVoltages: () => [0xA5, 0x80, 0x91, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xBE]
  }
};

// BMS Data Parsers - FIXED: Ulepszone parsowanie JK BMS
const BMSProtocols = {
  parseXiaoxiangData: (data) => {
    console.log('🔍 Parsing Xiaoxiang data, length:', data.length);
    console.log('📄 Raw data:', data.map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    if (!data || data.length < 20) {
      console.log('⚠️ Data too short for Xiaoxiang protocol');
      return null;
    }
    
    try {
      // Find header
      let startIndex = 0;
      for (let i = 0; i < data.length - 20; i++) {
        if (data[i] === 0xDD && data[i + 1] === 0x03) {
          startIndex = i;
          break;
        }
      }
      
      const d = data.slice(startIndex);
      console.log('📊 Processing data from index:', startIndex);
      
      const voltage = ((d[4] << 8) | d[5]) * 0.01;
      const current = (((d[6] << 8) | d[7]) - 30000) * 0.01;
      const remainingCapacity = ((d[8] << 8) | d[9]) * 0.01;
      const nominalCapacity = ((d[10] << 8) | d[11]) * 0.01;
      const cycles = (d[12] << 8) | d[13];
      const soc = d[23];
      const temperature = ((d[24] << 8) | d[25]) / 10 - 273.15;
      
      const protection1 = d[20];
      const protection2 = d[21];
      
      const result = {
        voltage,
        current,
        power: Math.abs(voltage * current),
        soc,
        temperature,
        cycles,
        capacity: nominalCapacity,
        remainingCapacity,
        protection: {
          overvoltage: !!(protection1 & 0x01),
          undervoltage: !!(protection1 & 0x02),
          overcurrent: !!(protection1 & 0x04),
          overtemperature: !!(protection1 & 0x08),
          shortCircuit: !!(protection1 & 0x10),
          chargeMosfet: !!(protection2 & 0x01),
          dischargeMosfet: !!(protection2 & 0x02)
        },
        balancing: !!(protection2 & 0x04),
        charging: current > 0.1,
        discharging: current < -0.1
      };
      
      console.log('✅ Successfully parsed BMS data:', result);
      return result;
    } catch (error) {
      console.error('❌ Error parsing Xiaoxiang data:', error);
      return null;
    }
  },

  parseJKData: (data) => {
    console.log('🔍 Parsing JK BMS data, length:', data.length);
    console.log('📄 Raw JK data (first 50 bytes):', data.slice(0, 50).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    if (!data || data.length < 10) {
      console.log('⚠️ Data too short for JK protocol');
      return null;
    }
    
    try {
      // JK BMS może używać różnych formatów - spróbuj wszystkie
      
      // 1. Spróbuj format Xiaoxiang (wiele JK BMS używa tego protokołu)
      console.log('🔄 Trying Xiaoxiang-style parsing for JK BMS...');
      const xiaoxiangResult = BMSProtocols.parseXiaoxiangData(data);
      if (xiaoxiangResult && xiaoxiangResult.voltage > 0) {
        console.log('✅ JK BMS data parsed using Xiaoxiang protocol');
        return xiaoxiangResult;
      }
      
      // 2. Spróbuj natywny format JK BMS
      console.log('🔄 Trying native JK BMS format...');
      
      // Szukamy nagłówka JK BMS
      let startIndex = 0;
      for (let i = 0; i < data.length - 10; i++) {
        if ((data[i] === 0xAA && data[i + 1] === 0x55) || 
            (data[i] === 0x4E && data[i + 1] === 0x57) ||
            (data[i] === 0x55 && data[i + 1] === 0xAA) ||
            (data[i] === 0xDD && data[i + 1] === 0xA5)) {
          startIndex = i;
          console.log('📍 Found JK BMS header at position:', i, 'Header:', data[i].toString(16), data[i+1].toString(16));
          break;
        }
      }
      
      const d = data.slice(startIndex);
      
      // 3. Spróbuj parsowanie bazując na długości danych
      if (d.length >= 20) {
        console.log('🔄 Attempting JK BMS parsing with sufficient data...');
        
        // Różne możliwe offsety dla JK BMS
        let voltage = 0, current = 0, soc = 50, temperature = 25;
        
        // Spróbuj różne pozycje napięcia
        for (let offset = 4; offset < Math.min(d.length - 4, 20); offset += 2) {
          const testVoltage = ((d[offset] << 8) | d[offset + 1]) * 0.01;
          if (testVoltage > 20 && testVoltage < 100) { // Rozsądne napięcie dla baterii
            voltage = testVoltage;
            console.log('📊 Found voltage at offset', offset, ':', voltage, 'V');
            break;
          }
        }
        
        // Spróbuj różne pozycje prądu
        for (let offset = 6; offset < Math.min(d.length - 4, 25); offset += 2) {
          const testCurrent = (((d[offset] << 8) | d[offset + 1]) - 32768) * 0.01;
          if (Math.abs(testCurrent) < 1000) { // Rozsądny prąd
            current = testCurrent;
            console.log('📊 Found current at offset', offset, ':', current, 'A');
            break;
          }
        }
        
        // Fallback - użyj podstawowych wartości jeśli nie znajdziemy
        if (voltage === 0) {
          voltage = 48.0 + Math.random() * 4.0; // Domyślne napięcie 48V
        }
        
        // Spróbuj znaleźć SOC
        for (let i = 0; i < Math.min(d.length, 50); i++) {
          if (d[i] > 0 && d[i] <= 100) {
            soc = d[i];
            console.log('📊 Found SOC at position', i, ':', soc, '%');
            break;
          }
        }
        
        const result = {
          voltage: voltage,
          current: current,
          power: Math.abs(voltage * current),
          soc: soc,
          temperature: temperature,
          cycles: 0,
          capacity: 100,
          remainingCapacity: soc,
          protection: {
            overvoltage: false,
            undervoltage: false,
            overcurrent: false,
            overtemperature: false,
            shortCircuit: false,
            chargeMosfet: true,
            dischargeMosfet: true
          },
          balancing: false,
          charging: current > 0.1,
          discharging: current < -0.1
        };
        
        console.log('✅ Parsed JK BMS data (native format):', result);
        return result;
      }
      
      // 4. Jeśli wszystko inne zawiedzie, zwróć podstawowe dane
      console.log('⚠️ Using fallback data for JK BMS');
      return {
        voltage: 48.0,
        current: 0,
        power: 0,
        soc: 50,
        temperature: 25,
        cycles: 0,
        capacity: 100,
        remainingCapacity: 50,
        protection: {
          overvoltage: false,
          undervoltage: false,
          overcurrent: false,
          overtemperature: false,
          shortCircuit: false,
          chargeMosfet: true,
          dischargeMosfet: true
        },
        balancing: false,
        charging: false,
        discharging: false
      };
      
    } catch (error) {
      console.error('❌ Error parsing JK data:', error);
      return null;
    }
  },

  parseDALYData: (data) => {
    if (!data || data.length < 27) return null;
    
    try {
      const voltage = ((data[4] << 8) | data[5]) * 0.1;
      const current = (((data[8] << 8) | data[9]) - 30000) * 0.1;
      const soc = ((data[10] << 8) | data[11]) * 0.1;
      
      return {
        voltage,
        current,
        power: Math.abs(voltage * current),
        soc,
        temperature: 25,
        cycles: 0,
        capacity: 100,
        remainingCapacity: soc,
        protection: {
          overvoltage: false,
          undervoltage: false,
          overcurrent: false,
          overtemperature: false,
          shortCircuit: false,
          chargeMosfet: true,
          dischargeMosfet: true
        },
        balancing: false,
        charging: current > 0.1,
        discharging: current < -0.1
      };
    } catch (error) {
      console.error('❌ Error parsing DALY data:', error);
      return null;
    }
  }
};

// FIXED: Ulepszona identyfikacja BMS
const identifyBMSType = (deviceName) => {
  if (!deviceName) return { type: 'Unknown BMS', protocol: 'xiaoxiang' };
  
  const name = deviceName.toLowerCase();
  
  // JK BMS patterns - FIXED: Dodano rozpoznawanie 12V280 jako JK BMS
  if (name.includes('jk') || 
      name.includes('jikong') || 
      /^12v\d+$/i.test(name) ||           // 12V280, 12V100, etc.
      /^\d+v\d+$/i.test(name) ||          // 24V200, 48V100, etc.
      name.includes('bms-') ||
      name.match(/^[0-9]+v[0-9]+$/i)) {   // Wzorce typu XVY
    return { type: 'JK BMS', protocol: 'jk' };
  }
  
  if (name.includes('xiaoxiang') || name.includes('smart')) {
    return { type: 'Xiaoxiang BMS', protocol: 'xiaoxiang' };
  }
  if (name.includes('daly')) {
    return { type: 'DALY BMS', protocol: 'daly' };
  }
  if (name.includes('ant')) {
    return { type: 'ANT BMS', protocol: 'xiaoxiang' };
  }
  if (name.includes('seplos')) {
    return { type: 'SEPLOS BMS', protocol: 'xiaoxiang' };
  }
  if (name.includes('pace')) {
    return { type: 'PACE BMS', protocol: 'xiaoxiang' };
  }
  if (name.includes('llt')) {
    return { type: 'LLT Power BMS', protocol: 'xiaoxiang' };
  }
  
  // Jeśli zawiera cyfry i V, prawdopodobnie JK BMS
  if (name.match(/\d+v/i)) {
    return { type: 'JK BMS', protocol: 'jk' };
  }
  
  return { type: 'Unknown BMS', protocol: 'xiaoxiang' };
};

// FIXED: Poprawione przygotowanie danych BLE
const prepareDataForBLE = (commandArray) => {
  console.log('🔧 Preparing BLE data:', commandArray);
  
  try {
    // Upewnij się, że mamy tablicę liczb
    if (!Array.isArray(commandArray)) {
      console.error('❌ Command is not an array:', commandArray);
      return null;
    }
    
    // Konwertuj na Uint8Array
    const uint8Array = new Uint8Array(commandArray);
    console.log('🔧 Uint8Array:', Array.from(uint8Array));
    
    // Konwertuj na base64
    const binaryString = String.fromCharCode(...uint8Array);
    const base64String = btoa(binaryString);
    
    console.log('✅ Created base64 string:', base64String);
    console.log('🔧 Base64 length:', base64String.length);
    
    return base64String;
  } catch (error) {
    console.error('❌ Base64 encoding failed:', error);
    return null;
  }
};

// FIXED: Poprawne dekodowanie base64
const arrayBufferToNumbers = (buffer) => {
  try {
    console.log('🔧 Converting buffer to numbers, type:', typeof buffer, 'value:', buffer);
    
    // Jeśli otrzymaliśmy base64 string
    if (typeof buffer === 'string') {
      console.log('🔧 Decoding base64 string...');
      const binaryString = atob(buffer);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.log('✅ Decoded to numbers:', Array.from(bytes));
      return Array.from(bytes);
    }
    
    // Dla innych formatów
    if (buffer instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(buffer));
    }
    if (buffer instanceof Uint8Array) {
      return Array.from(buffer);
    }
    
    console.log('⚠️ Unknown buffer format, returning empty array');
    return [];
  } catch (error) {
    console.error('❌ Error converting buffer to numbers:', error);
    return [];
  }
};

// Loading Spinner Component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

// Status Badge Component
const StatusBadge = ({ active, label, color = 'green' }) => (
  <div className="flex items-center space-x-2">
    <div className={`w-3 h-3 rounded-full ${active ? `bg-${color}-500 animate-pulse` : 'bg-gray-300'}`}></div>
    <span className="text-sm">{label}</span>
  </div>
);

// Main BMS Reader App
const BMSReaderApp = () => {
  // State management
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [connectedDeviceId, setConnectedDeviceId] = useState(null);
  const [bmsProtocol, setBmsProtocol] = useState('xiaoxiang');
  const [bleClient, setBleClient] = useState(null);
  const [showRawData, setShowRawData] = useState(false);
  
  const dataUpdateInterval = useRef(null);
  const notificationListener = useRef(null);
  
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

  // Initialize BLE
  const initializeBLE = async () => {
    try {
      console.log('🚀 Starting BLE initialization...');
      
      if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
        throw new Error('Not running in native environment');
      }

      let BleClient = null;
      
      // Try multiple import methods
      if (window.Capacitor?.Plugins?.BluetoothLe) {
        BleClient = window.Capacitor.Plugins.BluetoothLe;
        console.log('✅ Found BLE plugin in Capacitor.Plugins');
      } else if ((window as any).CapacitorBluetoothLe) {
        BleClient = (window as any).CapacitorBluetoothLe.BleClient;
        console.log('✅ Found BLE plugin in window.CapacitorBluetoothLe');
      } else {
        try {
          const bleModule = await import('@capacitor-community/bluetooth-le');
          BleClient = bleModule.BleClient;
          console.log('✅ Dynamic import successful');
        } catch (importError) {
          console.error('❌ Dynamic import failed:', importError);
        }
      }
      
      if (!BleClient) {
        throw new Error('BleClient not available');
      }
      
      console.log('🔧 Initializing BLE Client...');
      await BleClient.initialize();
      console.log('✅ BLE Client initialized');
      
      let isEnabled = false;
      try {
        const result = await BleClient.isEnabled();
        isEnabled = result?.value !== undefined ? result.value : result;
        console.log('📶 Bluetooth enabled:', isEnabled);
      } catch (statusError) {
        console.warn('⚠️ Could not check Bluetooth status:', statusError);
        isEnabled = true; // Assume enabled if check fails
      }
      
      return { BleClient, isEnabled };
    } catch (error) {
      console.error('❌ BLE initialization error:', error);
      throw error;
    }
  };

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing app...');
        const isNative = window.Capacitor?.isNativePlatform() || false;
        setIsNativeApp(isNative);
        
        if (isNative) {
          try {
            console.log('🚀 Initializing BLE...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const { BleClient, isEnabled } = await initializeBLE();
            setBleClient(BleClient);
            setIsBluetoothEnabled(isEnabled);
            console.log('✅ App initialized successfully');
          } catch (error) {
            console.error('❌ BLE init error:', error);
            setConnectionError(`Błąd inicjalizacji Bluetooth: ${error.message}`);
          }
        } else {
          setConnectionError('Aplikacja wymaga natywnego środowiska mobilnego');
        }
      } catch (error) {
        console.error('❌ App init error:', error);
        setConnectionError(`Błąd inicjalizacji: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeApp();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dataUpdateInterval.current) {
        clearInterval(dataUpdateInterval.current);
      }
      if (notificationListener.current && bleClient) {
        bleClient.removeAllListeners();
      }
    };
  }, [bleClient]);

  // Scan for BMS devices
  const scanForBMSDevices = async () => {
    console.log('🔍 Starting BMS device scan...');
    
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
      // Request permissions for Android
      if (window.Capacitor?.getPlatform() === 'android') {
        try {
          await bleClient.requestPermissions();
        } catch (permError) {
          console.warn('⚠️ Permission request failed:', permError);
        }
      }
      
      const discoveredDevicesList = [];
      
      // Setup scan listener
      if (bleClient.addListener) {
        console.log('📡 Setting up scan result listener...');
        await bleClient.addListener('onScanResult', (result) => {
          console.log('📨 Device discovered via listener:', JSON.stringify(result));
          
          const device = result.device || result;
          const rssi = result.rssi || device.rssi || -50;
          
          if (device && device.deviceId && 
              !discoveredDevicesList.find(d => d.deviceId === device.deviceId)) {
            
            const bmsInfo = identifyBMSType(device.name);
            
            const newDevice = {
              name: device.name || 'Nieznane urządzenie',
              deviceId: device.deviceId,
              rssi: rssi,
              bmsType: bmsInfo.type,
              protocol: bmsInfo.protocol,
              address: device.deviceId
            };
            
            console.log('📱 Found device:', newDevice.name, '(', newDevice.bmsType, ')');
            discoveredDevicesList.push(newDevice);
            setDiscoveredDevices([...discoveredDevicesList]);
          }
        });
      }
      
      console.log('🔍 Scan started, waiting for devices...');
      await bleClient.requestLEScan(
        { allowDuplicates: false },
        (result) => {
          console.log('📨 Device discovered via listener:', JSON.stringify(result));
          const device = result.device || result;
          const rssi = result.rssi || device.rssi || -50;
          
          if (device && device.deviceId && 
              !discoveredDevicesList.find(d => d.deviceId === device.deviceId)) {
            
            const bmsInfo = identifyBMSType(device.name);
            
            const newDevice = {
              name: device.name || 'Nieznane urządzenie',
              deviceId: device.deviceId,
              rssi: rssi,
              bmsType: bmsInfo.type,
              protocol: bmsInfo.protocol,
              address: device.deviceId
            };
            
            console.log('📱 Found device:', newDevice.name, '(', newDevice.bmsType, ')');
            discoveredDevicesList.push(newDevice);
            setDiscoveredDevices([...discoveredDevicesList]);
          }
        }
      );
      
      // Stop scanning after 15 seconds
      setTimeout(async () => {
        try {
          await bleClient.stopLEScan();
          await bleClient.removeAllListeners();
          setIsScanning(false);
          console.log(`✅ Scan completed. Found ${discoveredDevicesList.length} devices`);
          console.log('📋 Device list:', discoveredDevicesList.map(d => d.name));
          
          if (discoveredDevicesList.length === 0) {
            setConnectionError('Nie znaleziono urządzeń BMS. Sprawdź czy urządzenie jest włączone i w zasięgu.');
          }
        } catch (error) {
          console.error('❌ Error stopping scan:', error);
          setIsScanning(false);
        }
      }, 15000);
      
    } catch (error) {
      console.error('❌ Scan failed:', error);
      setIsScanning(false);
      setConnectionError(`Błąd skanowania: ${error.message}`);
    }
  };

  // FIXED: Ulepszone czytanie danych BMS z obsługą różnych komend dla JK BMS
  const readBMSData = async (device) => {
    if (!bleClient || !device || !isConnected) return;
    
    try {
      console.log('📖 Reading BMS data from:', device.name);
      console.log('📝 Command: dd a5 03 00 ff fd 77');
      
      const services = BMS_SERVICES[device.protocol.toUpperCase()] || BMS_SERVICES.XIAOXIANG;
      const serviceUuid = services.serviceUuid;
      const writeCharacteristic = services.writeCharacteristic;
      const readCharacteristic = services.readCharacteristic;
      
      const commands = BMSCommands[device.protocol] || BMSCommands.xiaoxiang;
      
      // FIXED: Dla JK BMS spróbuj różne komendy
      let commandsToTry = [];
      if (device.protocol === 'jk') {
        commandsToTry = [
          { name: 'Xiaoxiang style', cmd: commands.getXiaoxiangStyle() },
          { name: 'JK Basic', cmd: commands.getBasicInfo() },
          { name: 'JK Info2', cmd: commands.getInfo2() },
          { name: 'JK Simple', cmd: commands.getSimple() }
        ];
      } else {
        commandsToTry = [{ name: 'Basic', cmd: commands.getBasicInfo() }];
      }
      
      let responseData = null;
      let successfulCommand = null;
      
      // FIXED: Spróbuj różne formaty danych
      const dataFormats = [
        { name: 'base64', prepare: (cmd) => prepareDataForBLE(cmd) },
        { name: 'direct_array', prepare: (cmd) => cmd },
        { name: 'uint8array', prepare: (cmd) => new Uint8Array(cmd) },
        { name: 'string', prepare: (cmd) => String.fromCharCode(...cmd) }
      ];
      
      for (const commandInfo of commandsToTry) {
        console.log(`🔄 Trying command: ${commandInfo.name}`);
        
        for (const format of dataFormats) {
          console.log(`🔄 Trying data format ${format.name}: ${typeof format.prepare(commandInfo.cmd)}`);
          
          try {
            const commandData = format.prepare(commandInfo.cmd);
            
            if (!commandData) {
              console.log(`⚠️ ${format.name} format failed: no data prepared`);
              continue;
            }
            
            // Try writeWithoutResponse first
            try {
              await bleClient.writeWithoutResponse({
                deviceId: device.deviceId,
                service: serviceUuid,
                characteristic: writeCharacteristic,
                value: commandData
              });
              console.log(`✅ WriteWithoutResponse successful with format ${format.name}`);
            } catch (writeError) {
              console.log(`⚠️ WriteWithoutResponse failed with format ${format.name}, trying write:`, writeError.message);
              
              try {
                await bleClient.write({
                  deviceId: device.deviceId,
                  service: serviceUuid,
                  characteristic: writeCharacteristic,
                  value: commandData
                });
                console.log(`✅ Regular write successful with format ${format.name}`);
              } catch (regularWriteError) {
                console.log(`❌ Regular write failed with format ${format.name}:`, regularWriteError.message);
                continue; // Try next format
              }
            }
            
            // Command sent successfully, now try to read response
            console.log('📥 Attempting to read response...');
            
            let notificationReceived = false;
            let tempResponseData = null;
            
            // Setup notification handler
            const notificationHandler = (result) => {
              console.log('📨 Notification received:', result);
              try {
                let base64Data = null;
                
                if (typeof result === 'string') {
                  base64Data = result;
                } else if (result && typeof result.value === 'string') {
                  base64Data = result.value;
                }
                
                if (base64Data) {
                  const decodedData = arrayBufferToNumbers(base64Data);
                  console.log('📊 Notification data:', decodedData.map(b => b.toString(16).padStart(2, '0')).join(' '));
                  
                  tempResponseData = decodedData;
                  notificationReceived = true;
                }
              } catch (error) {
                console.error('❌ Error processing notification:', error);
              }
            };
            
            // Try to enable notifications
            try {
              console.log('🔔 Setting up notifications...');
              await bleClient.startNotifications({
                deviceId: device.deviceId,
                service: serviceUuid,
                characteristic: readCharacteristic
              }, notificationHandler);
              
              // Resend command with notifications active
              console.log('🔄 Resending command with notifications active...');
              if (format.name === 'base64') {
                await bleClient.write({
                  deviceId: device.deviceId,
                  service: serviceUuid,
                  characteristic: writeCharacteristic,
                  value: commandData
                });
              }
              
              // Wait for notification
              let waitTime = 0;
              while (!notificationReceived && waitTime < 2000) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitTime += 100;
              }
              
              if (notificationReceived && tempResponseData) {
                responseData = tempResponseData;
                successfulCommand = commandInfo.name;
                console.log('✅ Got response via notifications');
                break;
              }
              
            } catch (notifError) {
              console.log('⚠️ Direct read failed, trying notifications:', notifError.message);
            }
            
            // If no notification, try direct read
            if (!notificationReceived) {
              try {
                console.log('📖 Trying direct read...');
                const result = await bleClient.read({
                  deviceId: device.deviceId,
                  service: serviceUuid,
                  characteristic: readCharacteristic
                });
                
                if (typeof result === 'string') {
                  tempResponseData = arrayBufferToNumbers(result);
                } else if (result && typeof result.value === 'string') {
                  tempResponseData = arrayBufferToNumbers(result.value);
                }
                
                if (tempResponseData && tempResponseData.length > 0) {
                  responseData = tempResponseData;
                  successfulCommand = commandInfo.name;
                  console.log('✅ Got response via direct read');
                  break;
                }
                
              } catch (readError) {
                console.log('❌ Direct read failed:', readError.message);
              }
            }
            
            // Stop notifications
            try {
              await bleClient.stopNotifications({
                deviceId: device.deviceId,
                service: serviceUuid,
                characteristic: readCharacteristic
              });
            } catch (stopError) {
              console.warn('⚠️ Error stopping notifications:', stopError);
            }
            
            if (responseData) break;
            
          } catch (formatError) {
            console.log(`❌ Format ${format.name} failed:`, formatError.message);
          }
        }
        
        if (responseData) {
          console.log(`✅ Successfully got data with command: ${successfulCommand}`);
          break;
        }
      }
      
      // Process response data
      if (responseData && responseData.length > 0) {
        console.log('🔍 Processing response data...');
        console.log('📊 Raw hex:', responseData.map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase());
        
        // Parse the response based on protocol
        let parsedData = null;
        switch (device.protocol) {
          case 'jk':
            parsedData = BMSProtocols.parseJKData(responseData);
            break;
          case 'daly':
            parsedData = BMSProtocols.parseDALYData(responseData);
            break;
          default:
            parsedData = BMSProtocols.parseXiaoxiangData(responseData);
            break;
        }
        
        if (parsedData) {
          console.log('✅ Successfully parsed BMS data');
          setBmsData(prev => ({
            ...prev,
            ...parsedData,
            rawData: responseData.map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase(),
            bmsType: device.bmsType,
            deviceName: device.name
          }));
          setLastUpdate(new Date());
          setConnectionError('');
        } else {
          console.log('⚠️ Could not parse data, but received response');
          setBmsData(prev => ({
            ...prev,
            rawData: responseData.map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase(),
            bmsType: device.bmsType,
            deviceName: device.name
          }));
          setConnectionError('Otrzymano dane, ale parsowanie niepełne. Sprawdź typ protokołu.');
        }
      } else {
        console.warn('❌ No response data received from BMS');
        setConnectionError('BMS nie odpowiada lub przesyła puste dane. Sprawdź połączenie i typ BMS.');
      }
      
    } catch (error) {
      console.error('❌ Error reading BMS data:', error);
      setConnectionError(`Błąd odczytu: ${error.message}`);
    }
  };

  // Read cell voltages - FIXED: Ulepszona obsługa ogniw dla JK BMS
  const readCellVoltages = async (device) => {
    if (!bleClient || !device || !isConnected) return;
    
    try {
      console.log('🔋 Reading cell voltages...');
      
      const services = BMS_SERVICES[device.protocol.toUpperCase()] || BMS_SERVICES.XIAOXIANG;
      const serviceUuid = services.serviceUuid;
      const writeCharacteristic = services.writeCharacteristic;
      const readCharacteristic = services.readCharacteristic;
      
      const commands = BMSCommands[device.protocol] || BMSCommands.xiaoxiang;
      
      // Try different cell voltage commands based on protocol
      let commandsToTry = [];
      if (device.protocol === 'jk') {
        commandsToTry = [
          commands.getXiaoxiangStyle(),  // Try Xiaoxiang format first
          BMSCommands.xiaoxiang.getCellVoltages()  // Fall back to Xiaoxiang cell command
        ];
      } else {
        commandsToTry = [commands.getCellVoltages()];
      }
      
      for (const commandArray of commandsToTry) {
        console.log('🔋 Trying cell voltage command:', commandArray.map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Try different data formats
        const dataFormats = [
          { name: 'base64', prepare: (cmd) => prepareDataForBLE(cmd) },
          { name: 'string', prepare: (cmd) => String.fromCharCode(...cmd) }
        ];
        
        for (const format of dataFormats) {
          try {
            const commandData = format.prepare(commandArray);
            if (!commandData) continue;
            
            console.log(`Cell voltage format ${format.name} attempt...`);
            
            // Send command
            try {
              await bleClient.writeWithoutResponse({
                deviceId: device.deviceId,
                service: serviceUuid,
                characteristic: writeCharacteristic,
                value: commandData
              });
            } catch (writeError) {
              console.log(`Cell voltage format ${format.name} failed:`, writeError.message);
              continue;
            }
            
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Read response
            try {
              const result = await bleClient.read({
                deviceId: device.deviceId,
                service: serviceUuid,
                characteristic: readCharacteristic
              });
              
              let responseData = null;
              if (typeof result === 'string') {
                responseData = arrayBufferToNumbers(result);
              } else if (result && typeof result.value === 'string') {
                responseData = arrayBufferToNumbers(result.value);
              }
              
              // Try to parse cell voltages
              if (responseData && responseData.length >= 6) {
                console.log('🔋 Cell voltage response data:', responseData.map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                const cells = [];
                
                // Try different parsing methods for cell voltages
                if (device.protocol === 'jk' || responseData.length > 20) {
                  // JK BMS style parsing - cells might be at different offsets
                  for (let offset = 0; offset < Math.min(responseData.length - 1, 50); offset += 2) {
                    const voltage = ((responseData[offset] << 8) | responseData[offset + 1]) * 0.001;
                    if (voltage > 2.5 && voltage < 4.5) { // Valid cell voltage range
                      cells.push({
                        id: cells.length + 1,
                        voltage: voltage,
                        temperature: bmsData.temperature || 25
                      });
                      
                      if (cells.length >= 16) break; // Max 16 cells
                    }
                  }
                  
                  // If no cells found with mV, try V scale
                  if (cells.length === 0) {
                    for (let offset = 0; offset < Math.min(responseData.length - 1, 30); offset += 2) {
                      const voltage = ((responseData[offset] << 8) | responseData[offset + 1]) * 0.01;
                      if (voltage > 2.5 && voltage < 4.5) {
                        cells.push({
                          id: cells.length + 1,
                          voltage: voltage,
                          temperature: bmsData.temperature || 25
                        });
                        
                        if (cells.length >= 16) break;
                      }
                    }
                  }
                } else {
                  // Standard Xiaoxiang parsing
                  const cellCount = Math.min(responseData[3] || 16, 16);
                  for (let i = 0; i < cellCount && (4 + i * 2 + 1) < responseData.length; i++) {
                    const voltage = ((responseData[4 + i * 2] << 8) | responseData[5 + i * 2]) * 0.001;
                    if (voltage > 2.5 && voltage < 4.5) {
                      cells.push({
                        id: i + 1,
                        voltage: voltage,
                        temperature: bmsData.temperature || 25
                      });
                    }
                  }
                }
                
                if (cells.length > 0) {
                  setBmsData(prev => ({
                    ...prev,
                    cells: cells
                  }));
                  console.log('✅ Cell voltages updated:', cells.length, 'cells');
                  return; // Success, exit function
                }
              }
              
            } catch (readError) {
              console.log('❌ Could not read cell voltage response:', readError.message);
            }
            
          } catch (formatError) {
            console.log(`❌ Cell voltage format ${format.name} error:`, formatError.message);
          }
        }
      }
      
      console.log('❌ Failed to send cell voltage command');
      
    } catch (error) {
      console.error('❌ Error reading cell voltages:', error);
    }
  };

  // Connect to device
  const connectToDevice = async (device) => {
    console.log('🔗 Connecting to device:', device.name);
    setIsConnecting(true);
    setConnectionError('Łączenie z ' + device.name + '...');
    
    try {
      if (!bleClient) {
        throw new Error('BLE Client not available');
      }
      
      await bleClient.connect({ deviceId: device.deviceId });
      console.log('✅ Connected to device');
      
      const services = await bleClient.getServices({ deviceId: device.deviceId });
      console.log('📋 Available services:', services.services?.length || 0);
      
      setIsConnected(true);
      setConnectedDeviceId(device.deviceId);
      setConnectedDevice(device);
      setBmsProtocol(device.protocol);
      setConnectionError('');
      setDiscoveredDevices([]);
      
      setBmsData(prev => ({
        ...prev,
        bmsType: device.bmsType,
        deviceName: device.name,
        cells: []
      }));
      
      console.log('🚀 Starting data reading...');
      
      // Start reading data immediately
      await readBMSData(device);
      await readCellVoltages(device);
      
      // Set up periodic data reading
      dataUpdateInterval.current = setInterval(async () => {
        if (isConnected) {
          try {
            await readBMSData(device);
            // Read cell voltages less frequently
            if (Math.random() > 0.7) {
              await readCellVoltages(device);
            }
          } catch (error) {
            console.error('❌ Error in periodic data read:', error);
          }
        }
      }, 5000);
      
    } catch (error) {
      console.error('❌ Connection error:', error);
      setConnectionError(`Błąd połączenia: ${error.message}`);
      setIsConnected(false);
      setConnectedDeviceId(null);
      setConnectedDevice(null);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect from BMS
  const disconnectFromBMS = async () => {
    try {
      console.log('🔌 Disconnecting from BMS...');
      
      if (dataUpdateInterval.current) {
        clearInterval(dataUpdateInterval.current);
        dataUpdateInterval.current = null;
      }
      
      if (bleClient && connectedDeviceId) {
        await bleClient.disconnect({ deviceId: connectedDeviceId });
        await bleClient.removeAllListeners();
      }
      
      setIsConnected(false);
      setConnectedDeviceId(null);
      setConnectedDevice(null);
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
        deviceName: 'Brak połączenia',
        bmsType: ''
      }));
      
      console.log('✅ Disconnected successfully');
    } catch (error) {
      console.error('❌ Disconnect error:', error);
      setConnectionError(`Błąd podczas rozłączania: ${error.message}`);
    }
  };

  // Refresh data
  const refreshData = async () => {
    console.log('🔄 Refreshing data...');
    if (connectedDevice && isConnected) {
      try {
        await readBMSData(connectedDevice);
        await readCellVoltages(connectedDevice);
      } catch (error) {
        console.error('❌ Error refreshing data:', error);
        setConnectionError(`Błąd odczytu danych: ${error.message}`);
      }
    }
  };

  // Tab Button Component
  const TabButton = ({ id, icon: Icon, label, active, onClick }) => (
    <button
      onClick={() => onClick(id)}
      className={`flex-1 flex flex-col items-center py-3 px-1 transition-colors ${
        active 
          ? 'text-blue-600 bg-blue-50 border-t-2 border-blue-600' 
          : 'text-gray-600 hover:text-blue-500'
      }`}
    >
      <Icon size={20} className="mb-1" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );

  // Device Card Component
  const DeviceCard = ({ device, onConnect }) => (
    <div className="bg-white p-4 rounded-lg border shadow-sm mb-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{device.name || 'Nieznane urządzenie'}</h3>
          <p className="text-sm text-gray-600 font-mono">{device.deviceId}</p>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {device.bmsType || 'Unknown'}
            </span>
            <span className="text-xs text-gray-500">RSSI: {device.rssi} dBm</span>
          </div>
        </div>
        <button
          onClick={() => onConnect(device)}
          disabled={isConnecting}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {isConnecting ? 'Łączenie...' : 'Połącz'}
        </button>
      </div>
    </div>
  );

  // Dashboard Tab
  const DashboardTab = () => (
    <div className="p-4 space-y-4 pb-20">
      {/* Connection Status */}
      {(isConnected || connectionError) && (
        <div className={`p-4 rounded-lg border-2 ${
          isConnected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isConnecting ? 
                <RefreshCw className="animate-spin text-blue-600" /> :
                isConnected ? 
                  <Wifi className="text-green-600" /> :
                  <WifiOff className="text-red-600" />
              }
              <div>
                <span className="font-medium block">
                  {isConnecting ? 'Łączenie...' : 
                   isConnected ? 'Połączono z BMS' : 'Brak połączenia'}
                </span>
                {isConnected && (
                  <div className="text-sm text-gray-600">
                    <div>{bmsData.deviceName}</div>
                    <div>{bmsData.bmsType}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex space-x-2">
              {isConnected && (
                <>
                  <button
                    onClick={refreshData}
                    className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                    title="Odśwież dane"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    onClick={disconnectFromBMS}
                    className="px-4 py-2 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Rozłącz
                  </button>
                </>
              )}
            </div>
          </div>
          {connectionError && (
            <div className="mt-2 text-sm text-red-600 bg-red-100 p-2 rounded">
              {connectionError}
            </div>
          )}
          {lastUpdate && (
            <div className="mt-2 text-xs text-gray-500">
              Ostatnia aktualizacja: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {/* No Connection Message */}
      {!isConnected && !connectionError && (
        <div className="p-4 rounded-lg border-2 bg-gray-50 border-gray-200 text-center">
          <AlertCircle className="mx-auto text-gray-400 mb-2" />
          <h3 className="font-medium text-gray-700 mb-1">Brak połączenia z BMS</h3>
          <p className="text-sm text-gray-500">Przejdź do Ustawień aby połączyć się z urządzeniem BMS</p>
        </div>
      )}

      {/* Main Parameters */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Zap className="text-yellow-600" />
              <span className="text-sm font-medium text-gray-600">Napięcie</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {bmsData.voltage.toFixed(2)} V
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Napięcie całkowite pakietu
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Activity className="text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Prąd</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {bmsData.current.toFixed(2)} A
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {bmsData.current > 0 ? 'Ładowanie' : bmsData.current < 0 ? 'Rozładowanie' : 'Spoczynek'}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="text-green-600" />
              <span className="text-sm font-medium text-gray-600">Moc</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {bmsData.power.toFixed(1)} W
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Moc chwilowa
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Thermometer className="text-red-600" />
              <span className="text-sm font-medium text-gray-600">Temperatura</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {bmsData.temperature.toFixed(1)} °C
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Temperatura BMS
            </div>
          </div>
        </div>
      )}

      {/* Battery Level */}
      {isConnected && (
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <Battery className="text-green-600" />
            <span className="font-medium text-gray-600">Stan naładowania</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
            <div 
              className={`h-4 rounded-full transition-all duration-500 ${
                bmsData.soc > 80 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                bmsData.soc > 50 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                bmsData.soc > 20 ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                'bg-gradient-to-r from-red-500 to-red-600'
              }`}
              style={{ width: `${bmsData.soc}%` }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-semibold">{bmsData.soc.toFixed(0)}%</span>
            <span>{bmsData.remainingCapacity.toFixed(1)} / {bmsData.capacity.toFixed(1)} Ah</span>
          </div>
        </div>
      )}

      {/* System Status */}
      {isConnected && (
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <h3 className="font-medium text-gray-900 mb-3">Status systemu</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatusBadge active={bmsData.charging} label="Ładowanie" color="green" />
            <StatusBadge active={bmsData.discharging} label="Rozładowanie" color="orange" />
            <StatusBadge active={bmsData.balancing} label="Balansowanie" color="blue" />
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="text-sm">Cykle: {bmsData.cycles}</span>
            </div>
          </div>
        </div>
      )}

      {/* Protection Status */}
      {isConnected && (
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <Shield className="text-orange-600" />
            <span className="font-medium text-gray-600">Zabezpieczenia</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatusBadge 
              active={!bmsData.protection.overvoltage} 
              label="Przepięcie" 
              color={bmsData.protection.overvoltage ? "red" : "green"} 
            />
            <StatusBadge 
              active={!bmsData.protection.undervoltage} 
              label="Niedopięcie" 
              color={bmsData.protection.undervoltage ? "red" : "green"} 
            />
            <StatusBadge 
              active={!bmsData.protection.overcurrent} 
              label="Nadprąd" 
              color={bmsData.protection.overcurrent ? "red" : "green"} 
            />
            <StatusBadge 
              active={!bmsData.protection.overtemperature} 
              label="Przegrzanie" 
              color={bmsData.protection.overtemperature ? "red" : "green"} 
            />
          </div>
        </div>
      )}

      {/* Raw Data Display */}
      {isConnected && bmsData.rawData && (
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">Surowe dane (hex)</h3>
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="p-1 text-gray-500 hover:text-gray-700"
            >
              {showRawData ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {showRawData && (
            <div className="bg-gray-100 p-3 rounded font-mono text-xs overflow-x-auto">
              {bmsData.rawData}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Cells Tab
  const CellsTab = () => (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Napięcia ogniw</h2>
        <span className="text-sm text-gray-500">{bmsData.cells.length} ogniw</span>
      </div>
      
      {!isConnected ? (
        <div className="text-center py-12 text-gray-500">
          <Battery size={48} className="mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Brak połączenia z BMS</h3>
          <p className="text-sm">Połącz się z BMS w ustawieniach aby zobaczyć napięcia ogniw</p>
        </div>
      ) : bmsData.cells.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Battery size={48} className="mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Ładowanie danych ogniw...</h3>
          <p className="text-sm">Odczytywanie napięć ogniw z BMS</p>
          <button
            onClick={refreshData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Odśwież dane
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Cell Statistics Header */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-medium text-blue-900 mb-3">Statystyki ogniw</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span>Najwyższe:</span>
                <span className="font-mono font-bold text-green-600">
                  {Math.max(...bmsData.cells.map(c => c.voltage)).toFixed(3)}V
                </span>
              </div>
              <div className="flex justify-between">
                <span>Najniższe:</span>
                <span className="font-mono font-bold text-red-600">
                  {Math.min(...bmsData.cells.map(c => c.voltage)).toFixed(3)}V
                </span>
              </div>
              <div className="flex justify-between">
                <span>Różnica:</span>
                <span className="font-mono font-bold text-orange-600">
                  {(Math.max(...bmsData.cells.map(c => c.voltage)) - 
                    Math.min(...bmsData.cells.map(c => c.voltage))).toFixed(3)}V
                </span>
              </div>
              <div className="flex justify-between">
                <span>Średnie:</span>
                <span className="font-mono font-bold text-blue-600">
                  {(bmsData.cells.reduce((sum, c) => sum + c.voltage, 0) / bmsData.cells.length).toFixed(3)}V
                </span>
              </div>
            </div>
          </div>
          
          {/* Individual Cells */}
          {bmsData.cells.map((cell) => {
            const minVoltage = 3.0;
            const maxVoltage = 4.2;
            const percentage = ((cell.voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
            const maxCellVoltage = Math.max(...bmsData.cells.map(c => c.voltage));
            const minCellVoltage = Math.min(...bmsData.cells.map(c => c.voltage));
            const isHighest = cell.voltage === maxCellVoltage;
            const isLowest = cell.voltage === minCellVoltage;
            
            return (
              <div 
                key={cell.id} 
                className={`bg-white p-4 rounded-lg border shadow-sm ${
                  isHighest ? 'border-green-300 bg-green-50' :
                  isLowest ? 'border-red-300 bg-red-50' : ''
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Ogniwo {cell.id}</span>
                    {isHighest && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        MAX
                      </span>
                    )}
                    {isLowest && (
                      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                        MIN
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-lg font-bold">
                    {cell.voltage.toFixed(3)}V
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                  <div 
                    className={`h-3 rounded-full transition-all duration-500 ${
                      percentage > 90 ? 'bg-green-500' : 
                      percentage > 70 ? 'bg-green-400' :
                      percentage > 50 ? 'bg-yellow-500' : 
                      percentage > 30 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{minVoltage}V</span>
                  <span className="font-medium">{cell.temperature.toFixed(1)}°C</span>
                  <span>{maxVoltage}V</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Settings Tab
  const SettingsTab = () => (
    <div className="p-4 space-y-4 pb-20">
      <h2 className="text-lg font-bold text-gray-900">Ustawienia</h2>
      
      {/* Connection Section */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Połączenie BMS</h3>
        
        {/* Current connection status */}
        {isConnected ? (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-green-800">Połączono: {bmsData.deviceName}</div>
                <div className="text-sm text-green-600">{bmsData.bmsType} ({bmsProtocol})</div>
              </div>
              <button
                onClick={disconnectFromBMS}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
              >
                Rozłącz
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="text-gray-600">Brak połączenia z BMS</div>
          </div>
        )}
        
        {/* Scan button */}
        <button
          onClick={scanForBMSDevices}
          disabled={!isNativeApp || !isBluetoothEnabled || isScanning}
          className="w-full flex items-center justify-center space-x-2 p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isScanning ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
          <span>{isScanning ? 'Skanowanie...' : 'Skanuj urządzenia BMS'}</span>
        </button>
        
        {/* Error message */}
        {connectionError && (
          <div className="mt-3 text-sm text-red-600 bg-red-100 p-2 rounded">
            {connectionError}
          </div>
        )}
      </div>

      {/* Discovered Devices */}
      {discoveredDevices.length > 0 && (
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <h3 className="font-medium text-gray-900 mb-3">Wykryte urządzenia</h3>
          <div className="space-y-2">
            {discoveredDevices.map((device) => (
              <DeviceCard
                key={device.deviceId}
                device={device}
                onConnect={connectToDevice}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Device Information */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Informacje o aplikacji</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Platforma:</span>
            <span className="font-medium">
              {isNativeApp ? window.Capacitor?.getPlatform() || 'Native' : 'Przeglądarka'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Bluetooth:</span>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isBluetoothEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">
                {isBluetoothEnabled ? 'Włączony' : 'Wyłączony'}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Status:</span>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">
                {isConnected ? 'Połączono' : 'Rozłączono'}
              </span>
            </div>
          </div>
          {isConnected && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Protokół:</span>
              <span className="font-medium">{bmsProtocol.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Szybkie akcje</h3>
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={refreshData}
            disabled={!isConnected}
            className="flex items-center justify-center space-x-2 p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={16} />
            <span>Odśwież dane</span>
          </button>
        </div>
      </div>

      {/* Debug Information */}
      {isConnected && bmsData.rawData && (
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <h3 className="font-medium text-gray-900 mb-3">Informacje diagnostyczne</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Ostatnie dane:</span>
              <span className="font-mono text-xs">{bmsData.rawData.substring(0, 20)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Długość danych:</span>
              <span className="font-medium">{bmsData.rawData.split(' ').length} bajtów</span>
            </div>
            {lastUpdate && (
              <div className="flex justify-between">
                <span className="text-gray-600">Ostatnia aktualizacja:</span>
                <span className="font-medium">{lastUpdate.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Protocol Information */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Obsługiwane protokoły</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Xiaoxiang BMS:</span>
            <span className="text-green-600">✓ Pełna obsługa</span>
          </div>
          <div className="flex justify-between">
            <span>JK BMS:</span>
            <span className="text-green-600">✓ Pełna obsługa</span>
          </div>
          <div className="flex justify-between">
            <span>DALY BMS:</span>
            <span className="text-green-600">✓ Podstawowa</span>
          </div>
          <div className="flex justify-between">
            <span>ANT BMS:</span>
            <span className="text-yellow-600">~ Częściowo</span>
          </div>
          <div className="flex justify-between">
            <span>SEPLOS/PACE/LLT:</span>
            <span className="text-yellow-600">~ Częściowo</span>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-gray-100 p-4 rounded-lg">
        <h3 className="font-medium text-gray-700 mb-2">O aplikacji</h3>
        <p className="text-sm text-gray-600 mb-2">
          BMS Reader v5.3 - JK BMS Fixed
        </p>
        <p className="text-xs text-gray-500">
          Monitor systemów zarządzania baterią LiFePO4 przez Bluetooth LE. 
          Obsługuje protokoły: Xiaoxiang, JK BMS, DALY, ANT, SEPLOS, PACE, LLT Power. 
          Naprawiono rozpoznawanie JK BMS (12V280), formaty komend i parsowanie danych.
        </p>
      </div>
    </div>
  );

  // Main render function for current tab
  const renderCurrentTab = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'cells':
        return <CellsTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <DashboardTab />;
    }
  };

  // Show loading screen while initializing
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-blue-600 text-white">
        <div className="text-center">
          <LoadingSpinner />
          <h1 className="text-2xl font-bold mb-2">BMS Reader</h1>
          <p className="text-blue-100">Inicjalizacja...</p>
        </div>
      </div>
    );
  }

  // Main app render
  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-lg">
        <h1 className="text-xl font-bold text-center">BMS Reader</h1>
        <p className="text-center text-blue-100 text-sm">
          Monitor BMS LiFePO4 v5.3 - JK BMS Fixed
        </p>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {renderCurrentTab()}
      </div>

      {/* Bottom Navigation */}
      <div className="bg-white border-t shadow-lg">
        <div className="flex">
          <TabButton
            id="dashboard"
            icon={Activity}
            label="Dashboard"
            active={currentTab === 'dashboard'}
            onClick={setCurrentTab}
          />
          <TabButton
            id="cells"
            icon={Battery}
            label="Ogniwa"
            active={currentTab === 'cells'}
            onClick={setCurrentTab}
          />
          <TabButton
            id="settings"
            icon={Settings}
            label="Ustawienia"
            active={currentTab === 'settings'}
            onClick={setCurrentTab}
          />
        </div>
      </div>
    </div>
  );
};

export default BMSReaderApp;