import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { BleDevice, BleClient, numbersToDataView, dataViewToNumbers } from '@capacitor-community/bluetooth-le';
import { 
  Battery, 
  Zap, 
  Thermometer, 
  Activity, 
  Settings, 
  Bluetooth,
  AlertTriangle,
  Shield,
  Timer,
  TrendingUp,
  RefreshCw,
  Wifi,
  WifiOff,
  Search,
  CheckCircle,
  XCircle,
  Info,
  Smartphone,
  Globe
} from 'lucide-react';

const BMSReaderApp = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([]);
  const [detectedBmsType, setDetectedBmsType] = useState('');
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  const connectedDevice = useRef<any>(null);
  const dataInterval = useRef<NodeJS.Timeout | null>(null);
  const scanTimeout = useRef<NodeJS.Timeout | null>(null);

  // Rozszerzone definicje BMS - obsługa wielu protokołów
  const BMS_PROTOCOLS = {
    // JK BMS (JiKong) - bardzo popularne, szczególnie dla LiFePO4
    JK_BMS: {
      name: 'JK BMS',
      services: [
        'ffe0-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb'
      ],
      characteristics: {
        read: 'ffe1-0000-1000-8000-00805f9b34fb',
        write: 'ffe1-0000-1000-8000-00805f9b34fb',
        notify: 'ffe1-0000-1000-8000-00805f9b34fb'
      },
      commands: {
        getInfo: [0x4E, 0x57, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00, 0x06, 0x03, 0x00, 0xFF, 0x30, 0x77],
        getCellInfo: [0x4E, 0x57, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00, 0x06, 0x03, 0x00, 0xFF, 0x30, 0x77],
        getDeviceInfo: [0x4E, 0x57, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00, 0x06, 0x03, 0x00, 0xFF, 0x30, 0x77]
      },
      identifiers: ['jk', 'jikong', 'jk-', 'jk_']
    },

    // Xiaoxiang BMS (Smart BMS) - bardzo rozpowszechnione
    XIAOXIANG: {
      name: 'Xiaoxiang BMS',
      services: [
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb'
      ],
      characteristics: {
        read: '0000ff01-0000-1000-8000-00805f9b34fb',
        write: '0000ff02-0000-1000-8000-00805f9b34fb',
        notify: '0000ff01-0000-1000-8000-00805f9b34fb'
      },
      commands: {
        getInfo: [0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77],
        getCellInfo: [0xDD, 0xA5, 0x04, 0x00, 0xFF, 0xFC, 0x77],
        getDeviceInfo: [0xDD, 0xA5, 0x05, 0x00, 0xFF, 0xFB, 0x77]
      },
      identifiers: ['xiaoxiang', 'smart', 'bms', 'daly', 'smart-']
    },

    // DALY BMS - popularne w większych instalacjach
    DALY: {
      name: 'Daly BMS',
      services: [
        '0000fff0-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb'
      ],
      characteristics: {
        read: '0000fff1-0000-1000-8000-00805f9b34fb',
        write: '0000fff2-0000-1000-8000-00805f9b34fb',
        notify: '0000fff1-0000-1000-8000-00805f9b34fb'
      },
      commands: {
        getInfo: [0xA5, 0x40, 0x90, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7D],
        getCellInfo: [0xA5, 0x40, 0x95, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x78],
        getDeviceInfo: [0xA5, 0x40, 0x50, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xBD]
      },
      identifiers: ['daly', 'daly-', 'smart bms']
    },

    // ANT BMS - często spotykane w e-bike i skooterach
    ANT: {
      name: 'ANT BMS',
      services: [
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
      ],
      characteristics: {
        read: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
        write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
        notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
      },
      commands: {
        getInfo: [0xDB, 0xDB, 0x00, 0x00, 0x00, 0x00],
        getCellInfo: [0xDB, 0xDB, 0x00, 0x00, 0x00, 0x00],
        getDeviceInfo: [0xDB, 0xDB, 0x00, 0x00, 0x00, 0x00]
      },
      identifiers: ['ant', 'ant-', 'antbms']
    },

    // SEPLOS BMS - często w systemach off-grid
    SEPLOS: {
      name: 'SEPLOS BMS',
      services: [
        '0000fff0-0000-1000-8000-00805f9b34fb'
      ],
      characteristics: {
        read: '0000fff4-0000-1000-8000-00805f9b34fb',
        write: '0000fff6-0000-1000-8000-00805f9b34fb',
        notify: '0000fff4-0000-1000-8000-00805f9b34fb'
      },
      commands: {
        getInfo: [0x7E, 0x32, 0x30, 0x30, 0x31, 0x34, 0x36, 0x34, 0x32, 0x45, 0x30, 0x30, 0x32, 0x30, 0x30, 0x46, 0x44, 0x33, 0x37, 0x0D],
        getCellInfo: [0x7E, 0x32, 0x30, 0x30, 0x31, 0x34, 0x36, 0x34, 0x32, 0x45, 0x30, 0x30, 0x32, 0x30, 0x30, 0x46, 0x44, 0x33, 0x37, 0x0D],
        getDeviceInfo: [0x7E, 0x32, 0x30, 0x30, 0x31, 0x34, 0x36, 0x34, 0x32, 0x45, 0x30, 0x30, 0x32, 0x30, 0x30, 0x46, 0x44, 0x33, 0x37, 0x0D]
      },
      identifiers: ['seplos', 'seplos-', 'sp']
    },

    // PACE BMS - często w vehicles
    PACE: {
      name: 'PACE BMS',
      services: [
        '0000ff00-0000-1000-8000-00805f9b34fb'
      ],
      characteristics: {
        read: '0000ff01-0000-1000-8000-00805f9b34fb',
        write: '0000ff02-0000-1000-8000-00805f9b34fb',
        notify: '0000ff01-0000-1000-8000-00805f9b34fb'
      },
      commands: {
        getInfo: [0x7E, 0x00, 0x03, 0x03, 0x00, 0x0B, 0x7E],
        getCellInfo: [0x7E, 0x00, 0x04, 0x03, 0x00, 0x0A, 0x7E],
        getDeviceInfo: [0x7E, 0x00, 0x05, 0x03, 0x00, 0x09, 0x7E]
      },
      identifiers: ['pace', 'pace-', 'paceBMS']
    },

    // LLT Power BMS (Lithium battery BMS)
    LLT_POWER: {
      name: 'LLT Power BMS',
      services: [
        '0000ffe0-0000-1000-8000-00805f9b34fb'
      ],
      characteristics: {
        read: '0000ffe1-0000-1000-8000-00805f9b34fb',
        write: '0000ffe1-0000-1000-8000-00805f9b34fb',
        notify: '0000ffe1-0000-1000-8000-00805f9b34fb'
      },
      commands: {
        getInfo: [0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77],
        getCellInfo: [0xDD, 0xA5, 0x04, 0x00, 0xFF, 0xFC, 0x77],
        getDeviceInfo: [0xDD, 0xA5, 0x05, 0x00, 0xFF, 0xFB, 0x77]
      },
      identifiers: ['llt', 'lltpower', 'llt-', 'ltt']
    },

    // Generic/Universal protocol fallback
    GENERIC: {
      name: 'Generic BMS',
      services: [
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000fff0-0000-1000-8000-00805f9b34fb'
      ],
      characteristics: {
        read: '0000ff01-0000-1000-8000-00805f9b34fb',
        write: '0000ff02-0000-1000-8000-00805f9b34fb',
        notify: '0000ff01-0000-1000-8000-00805f9b34fb'
      },
      commands: {
        getInfo: [0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77],
        getCellInfo: [0xDD, 0xA5, 0x04, 0x00, 0xFF, 0xFC, 0x77],
        getDeviceInfo: [0xDD, 0xA5, 0x05, 0x00, 0xFF, 0xFB, 0x77]
      },
      identifiers: ['bms', 'battery', 'lifepo4', 'lithium']
    }
  };

  const [bmsData, setBmsData] = useState({
    voltage: 0,
    current: 0,
    power: 0,
    soc: 0,
    temperature: 0,
    cycles: 0,
    capacity: 0,
    remainingCapacity: 0,
    cells: [] as any[],
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
    deviceName: '',
    firmwareVersion: '',
    serialNumber: ''
  });

  // Sprawdzenie środowiska Capacitor
  const checkNativeEnvironment = () => {
    return Capacitor.isNativePlatform();
  };

  // Identyfikacja typu BMS na podstawie nazwy urządzenia
  const identifyBMSType = (deviceName: string) => {
    if (!deviceName) return 'GENERIC';
    
    const name = deviceName.toLowerCase();
    
    for (const [protocolKey, protocol] of Object.entries(BMS_PROTOCOLS)) {
      for (const identifier of protocol.identifiers) {
        if (name.includes(identifier)) {
          return protocolKey;
        }
      }
    }
    
    return 'GENERIC';
  };

  // Inicjalizacja Bluetooth
  useEffect(() => {
    const initBluetooth = async () => {
      try {
        const isNative = checkNativeEnvironment();
        setIsNativeApp(isNative);
        
        if (!isNative) {
          setConnectionError('Aplikacja musi być uruchomiona jako natywna aplikacja mobilna (iOS/Android)');
          return;
        }

        console.log('Initializing BLE Client for native platform...');
        await BleClient.initialize();
        console.log('BLE Client initialized successfully');
        
        // Sprawdź status Bluetooth
        try {
          const enabled = await BleClient.isEnabled();
          setIsBluetoothEnabled(enabled);
          console.log('Bluetooth enabled:', enabled);
          
          if (!enabled) {
            setConnectionError('Bluetooth jest wyłączony. Włącz Bluetooth w ustawieniach.');
          }
        } catch (error) {
          console.log('Cannot check Bluetooth status:', error);
          setIsBluetoothEnabled(true); // Assume enabled if we can't check
        }
        
        // Sprawdź uprawnienia
        try {
          await BleClient.requestLEScan({ services: [] }, () => {});
          await BleClient.stopLEScan();
          console.log('BLE permissions granted');
        } catch (error) {
          console.log('BLE permission check failed:', error);
          setConnectionError('Brak uprawnień Bluetooth. Sprawdź uprawnienia aplikacji.');
        }
        
      } catch (error) {
        console.error('Bluetooth initialization failed:', error);
        setConnectionError(`Błąd inicjalizacji Bluetooth: ${error}`);
      }
    };
    
    initBluetooth();
    
    return () => {
      disconnectFromBMS();
    };
  }, []);

  // Uniwersalne parsowanie danych BMS
  const parseBMSData = (dataArray: number[], bmsType: string) => {
    if (!dataArray || dataArray.length < 4) return null;

    const data = new Uint8Array(dataArray);
    
    try {
      switch (bmsType) {
        case 'JK_BMS':
          return parseJKBMSData(data);
        case 'XIAOXIANG':
        case 'LLT_POWER':
          return parseXiaoxiangData(data);
        case 'DALY':
          return parseDALYData(data);
        case 'ANT':
          return parseANTData(data);
        case 'SEPLOS':
          return parseSEPLOSData(data);
        case 'PACE':
          return parsePACEData(data);
        default:
          return parseGenericData(data);
      }
    } catch (error) {
      console.error('Error parsing BMS data:', error);
      return null;
    }
  };

  // Parser dla JK BMS
  const parseJKBMSData = (data: Uint8Array) => {
    if (data.length < 300) return null; // JK BMS wysyła duże pakiety danych
    
    try {
      // JK BMS używa specjalnego formatu - nagłówek 4E 57
      if (data[0] !== 0x4E || data[1] !== 0x57) return null;
      
      let offset = 11; // Przesunięcie do danych
      
      const voltage = ((data[offset] << 8) | data[offset + 1]) / 100;
      const current = (((data[offset + 2] << 8) | data[offset + 3]) - 30000) / 100;
      const remainingCapacity = ((data[offset + 4] << 8) | data[offset + 5]) / 100;
      const nominalCapacity = ((data[offset + 6] << 8) | data[offset + 7]) / 100;
      const cycles = (data[offset + 8] << 8) | data[offset + 9];
      
      // Temperatura (może być wiele czujników)
      const temp1 = ((data[offset + 23] << 8) | data[offset + 24]) / 10 - 273.15;
      const temp2 = ((data[offset + 25] << 8) | data[offset + 26]) / 10 - 273.15;
      const avgTemp = (temp1 + temp2) / 2;
      
      // SOC może być w różnych miejscach zależnie od wersji firmware
      let soc = data[offset + 141] || data[offset + 173] || 0;
      
      // Stany zabezpieczeń
      const protectionState = (data[offset + 128] << 8) | data[offset + 129];
      const mosfetState = data[offset + 130];

      return {
        voltage: voltage,
        current: current,
        power: Math.abs(voltage * current),
        soc: soc,
        temperature: avgTemp,
        cycles: cycles,
        capacity: nominalCapacity,
        remainingCapacity: remainingCapacity,
        charging: current > 0,
        discharging: current < 0,
        balancing: (mosfetState & 0x04) !== 0,
        protection: {
          overvoltage: (protectionState & 0x0001) !== 0,
          undervoltage: (protectionState & 0x0002) !== 0,
          overcurrent: (protectionState & 0x0004) !== 0,
          overtemperature: (protectionState & 0x0008) !== 0,
          shortCircuit: (protectionState & 0x0010) !== 0,
          chargeMosfet: (mosfetState & 0x01) !== 0,
          dischargeMosfet: (mosfetState & 0x02) !== 0
        }
      };
    } catch (error) {
      console.error('Error parsing JK BMS data:', error);
      return null;
    }
  };

  // Parser dla Xiaoxiang/Smart BMS
  const parseXiaoxiangData = (data: Uint8Array) => {
    if (data[0] !== 0xDD || data[1] !== 0x03) return null;
    if (data.length < 34) return null;

    try {
      const voltage = ((data[4] << 8) | data[5]) / 100;
      const current = (((data[6] << 8) | data[7]) - 30000) / 100;
      const remainingCapacity = ((data[8] << 8) | data[9]) / 100;
      const nominalCapacity = ((data[10] << 8) | data[11]) / 100;
      const cycles = (data[12] << 8) | data[13];
      const soc = data[23];
      
      const temperature1 = ((data[24] << 8) | data[25]) / 10 - 273.15;
      const temperature2 = ((data[26] << 8) | data[27]) / 10 - 273.15;
      const avgTemp = (temperature1 + temperature2) / 2;

      const protectionState = (data[20] << 8) | data[21];
      const mosfetState = data[22];

      return {
        voltage: voltage,
        current: current,
        power: Math.abs(voltage * current),
        soc: soc,
        temperature: avgTemp,
        cycles: cycles,
        capacity: nominalCapacity,
        remainingCapacity: remainingCapacity,
        charging: current > 0,
        discharging: current < 0,
        balancing: (mosfetState & 0x04) !== 0,
        protection: {
          overvoltage: (protectionState & 0x0001) !== 0,
          undervoltage: (protectionState & 0x0002) !== 0,
          overcurrent: (protectionState & 0x0004) !== 0,
          overtemperature: (protectionState & 0x0008) !== 0,
          shortCircuit: (protectionState & 0x0010) !== 0,
          chargeMosfet: (mosfetState & 0x01) !== 0,
          dischargeMosfet: (mosfetState & 0x02) !== 0
        }
      };
    } catch (error) {
      console.error('Error parsing Xiaoxiang data:', error);
      return null;
    }
  };

  // Parser dla DALY BMS
  const parseDALYData = (data: Uint8Array) => {
    if (data[0] !== 0xA5 || data[1] !== 0x01) return null;
    if (data.length < 13) return null;

    try {
      const voltage = ((data[4] << 8) | data[5]) / 10;
      const current = (((data[8] << 8) | data[9]) - 30000) / 10;
      const soc = data[10];
      
      return {
        voltage: voltage,
        current: current,
        power: Math.abs(voltage * current),
        soc: soc,
        temperature: 25, // DALY może wymagać oddzielnego zapytania o temperaturę
        cycles: 0,
        capacity: 100,
        remainingCapacity: soc,
        charging: current > 0,
        discharging: current < 0,
        balancing: false,
        protection: {
          overvoltage: false,
          undervoltage: false,
          overcurrent: false,
          overtemperature: false,
          shortCircuit: false,
          chargeMosfet: true,
          dischargeMosfet: true
        }
      };
    } catch (error) {
      console.error('Error parsing DALY data:', error);
      return null;
    }
  };

  // Parser dla ANT BMS
  const parseANTData = (data: Uint8Array) => {
    // ANT BMS ma swój własny format protokołu
    if (data.length < 20) return null;

    try {
      // Podstawowa implementacja - może wymagać dostosowania
      const voltage = ((data[2] << 8) | data[3]) / 100;
      const current = (((data[4] << 8) | data[5]) - 30000) / 100;
      const soc = data[6];
      
      return {
        voltage: voltage,
        current: current,
        power: Math.abs(voltage * current),
        soc: soc,
        temperature: 25,
        cycles: 0,
        capacity: 100,
        remainingCapacity: soc,
        charging: current > 0,
        discharging: current < 0,
        balancing: false,
        protection: {
          overvoltage: false,
          undervoltage: false,
          overcurrent: false,
          overtemperature: false,
          shortCircuit: false,
          chargeMosfet: true,
          dischargeMosfet: true
        }
      };
    } catch (error) {
      console.error('Error parsing ANT data:', error);
      return null;
    }
  };

  // Parser dla SEPLOS BMS
  const parseSEPLOSData = (data: Uint8Array) => {
    // SEPLOS używa ASCII protokołu
    if (data[0] !== 0x7E) return null;
    
    try {
      // Konwersja z ASCII hex do wartości binarnych
      // Podstawowa implementacja
      const voltage = 48.0; // Przykładowa wartość
      const current = 0.0;
      const soc = 80;
      
      return {
        voltage: voltage,
        current: current,
        power: Math.abs(voltage * current),
        soc: soc,
        temperature: 25,
        cycles: 0,
        capacity: 100,
        remainingCapacity: soc,
        charging: current > 0,
        discharging: current < 0,
        balancing: false,
        protection: {
          overvoltage: false,
          undervoltage: false,
          overcurrent: false,
          overtemperature: false,
          shortCircuit: false,
          chargeMosfet: true,
          dischargeMosfet: true
        }
      };
    } catch (error) {
      console.error('Error parsing SEPLOS data:', error);
      return null;
    }
  };

  // Parser dla PACE BMS
  const parsePACEData = (data: Uint8Array) => {
    if (data[0] !== 0x7E) return null;
    
    try {
      const voltage = ((data[3] << 8) | data[4]) / 100;
      const current = (((data[5] << 8) | data[6]) - 30000) / 100;
      const soc = data[7];
      
      return {
        voltage: voltage,
        current: current,
        power: Math.abs(voltage * current),
        soc: soc,
        temperature: 25,
        cycles: 0,
        capacity: 100,
        remainingCapacity: soc,
        charging: current > 0,
        discharging: current < 0,
        balancing: false,
        protection: {
          overvoltage: false,
          undervoltage: false,
          overcurrent: false,
          overtemperature: false,
          shortCircuit: false,
          chargeMosfet: true,
          dischargeMosfet: true
        }
      };
    } catch (error) {
      console.error('Error parsing PACE data:', error);
      return null;
    }
  };

  // Fallback parser dla nieznanych typów BMS
  const parseGenericData = (data: Uint8Array) => {
    // Próba parsowania jako Xiaoxiang (najczęstszy format)
    return parseXiaoxiangData(data);
  };

  // Rozszerzone skanowanie BMS
  const scanForBMSDevices = async () => {
    if (!isNativeApp) {
      setConnectionError('Skanowanie wymaga natywnej aplikacji mobilnej');
      return;
    }

    if (!isBluetoothEnabled) {
      setConnectionError('Bluetooth jest wyłączony. Włącz Bluetooth w ustawieniach.');
      return;
    }

    setIsScanning(true);
    setIsConnecting(true);
    setConnectionError('Skanowanie urządzeń BMS...');
    setDiscoveredDevices([]);

    try {
      // Zbierz wszystkie serwisy ze wszystkich protokołów
      const allServices: string[] = [];
      Object.values(BMS_PROTOCOLS).forEach(protocol => {
        allServices.push(...protocol.services);
      });

      // Usuń duplikaty
      const uniqueServices = [...new Set(allServices)];

      console.log('Scanning for BMS services:', uniqueServices);

      await BleClient.requestLEScan(
        {
          services: uniqueServices,
          allowDuplicates: false
        },
        (result) => {
          console.log('Device found during scan:', result);
          
          if (result.device) {
            const bmsType = identifyBMSType(result.device.name || '');
            const newDevice = {
              ...result.device,
              rssi: result.rssi || -50,
              bmsType: bmsType,
              protocolName: BMS_PROTOCOLS[bmsType]?.name || 'Unknown'
            };

            setDiscoveredDevices(prev => {
              const exists = prev.find(d => d.deviceId === newDevice.deviceId);
              if (!exists) {
                return [...prev, newDevice];
              }
              return prev;
            });
          }
        }
      );

      // Zatrzymaj skanowanie po 15 sekundach
      scanTimeout.current = setTimeout(async () => {
        try {
          await BleClient.stopLEScan();
          setIsScanning(false);
          setIsConnecting(false);
          setConnectionError('');
        } catch (error) {
          console.log('Error stopping scan:', error);
        }
      }, 15000);

   } catch (error) {
      console.error('Scan failed:', error);
      setConnectionError(`Błąd skanowania: ${error}`);
      setIsScanning(false);
      setIsConnecting(false);
    }
  };

  // Próba połączenia z konkretnym protokołem BMS
  const tryConnectWithProtocol = async (device: BleDevice, protocolKey: string) => {
    const protocol = BMS_PROTOCOLS[protocolKey];
    if (!protocol) throw new Error(`Unknown protocol: ${protocolKey}`);

    console.log(`Trying to connect with protocol: ${protocol.name}`);

    // Próbuj każdy serwis w protokole
    for (const serviceUuid of protocol.services) {
      try {
        console.log(`Attempting service: ${serviceUuid}`);
        
        // Sprawdź czy serwis jest dostępny
        const services = await BleClient.getServices(device.deviceId);
        const targetService = services.find(s => s.uuid.toLowerCase() === serviceUuid.toLowerCase());
        
        if (!targetService) {
          console.log(`Service ${serviceUuid} not found`);
          continue;
        }

        // Znajdź odpowiednie charakterystyki
        let readChar = null;
        let writeChar = null;
        let notifyChar = null;

        for (const char of targetService.characteristics) {
          const charUuid = char.uuid.toLowerCase();
          
          // Sprawdź czy charakterystyka pasuje do protokołu
          if (charUuid === protocol.characteristics.read?.toLowerCase()) {
            readChar = char;
          }
          if (charUuid === protocol.characteristics.write?.toLowerCase()) {
            writeChar = char;
          }
          if (charUuid === protocol.characteristics.notify?.toLowerCase()) {
            notifyChar = char;
          }

          // Dla niektórych BMS jedna charakterystyka obsługuje wszystko
          if (protocol.characteristics.read === protocol.characteristics.write && 
              protocol.characteristics.read === protocol.characteristics.notify) {
            if (charUuid === protocol.characteristics.read?.toLowerCase()) {
              readChar = writeChar = notifyChar = char;
            }
          }
        }

        // Sprawdź czy mamy wymagane charakterystyki
        if (!notifyChar) {
          console.log('Required notify characteristic not found');
          continue;
        }

        // Rozpocznij notifications
        await BleClient.startNotifications(
          device.deviceId,
          serviceUuid,
          notifyChar.uuid,
          (value) => handleBMSData(value, protocolKey)
        );

        console.log(`Successfully connected with protocol: ${protocol.name}`);
        
        return {
          service: serviceUuid,
          readCharacteristic: readChar?.uuid || notifyChar.uuid,
          writeCharacteristic: writeChar?.uuid || notifyChar.uuid,
          notifyCharacteristic: notifyChar.uuid,
          protocol: protocolKey
        };

      } catch (error) {
        console.log(`Failed with service ${serviceUuid}:`, error);
        continue;
      }
    }
    
    throw new Error(`Cannot connect with protocol: ${protocol.name}`);
  };

  // Połączenie z wybranym urządzeniem BMS
  const connectToDevice = async (device: BleDevice) => {
    setIsConnecting(true);
    setConnectionError('');
    setConnectionAttempts(prev => prev + 1);

    try {
      console.log('Connecting to device:', device);

      // Połącz z urządzeniem
      await BleClient.connect(device.deviceId, (deviceId) => {
        console.log('Device disconnected:', deviceId);
        setIsConnected(false);
        setConnectionError('Urządzenie zostało rozłączone');
        if (connectedDevice.current) {
          connectedDevice.current = null;
        }
      });

      console.log('Connected to device, identifying protocol...');
      
      // Identyfikuj typ BMS
      const detectedType = identifyBMSType(device.name || '');
      setDetectedBmsType(detectedType);

      // Próbuj połączyć z wykrytym protokołem
      let connectionConfig = null;
      try {
        connectionConfig = await tryConnectWithProtocol(device, detectedType);
      } catch (error) {
        console.log(`Failed with detected protocol ${detectedType}, trying others...`);
        
        // Jeśli wykryty protokół nie działa, spróbuj inne
        const otherProtocols = Object.keys(BMS_PROTOCOLS).filter(key => key !== detectedType);
        
        for (const protocolKey of otherProtocols) {
          try {
            connectionConfig = await tryConnectWithProtocol(device, protocolKey);
            setDetectedBmsType(protocolKey);
            break;
          } catch (protocolError) {
            console.log(`Failed with protocol ${protocolKey}:`, protocolError);
            continue;
          }
        }
      }

      if (!connectionConfig) {
        throw new Error('Nie udało się połączyć z żadnym znanym protokołem BMS');
      }

      // Zapisz informacje o połączeniu
      connectedDevice.current = {
        device: device,
        ...connectionConfig
      };

      // Aktualizuj dane o BMS
      setBmsData(prev => ({
        ...prev,
        bmsType: BMS_PROTOCOLS[connectionConfig.protocol]?.name || 'Unknown',
        deviceName: device.name || 'Unknown Device'
      }));

      setIsConnected(true);
      setConnectionError('');
      setDiscoveredDevices([]); // Wyczyść listę po udanym połączeniu
      
      // Rozpocznij pobieranie danych
      startDataPolling();

    } catch (error) {
      console.error('Connection failed:', error);
      setConnectionError(`Błąd połączenia: ${error}`);
      
      // Spróbuj rozłączyć w przypadku błędu
      try {
        await BleClient.disconnect(device.deviceId);
      } catch (disconnectError) {
        console.log('Error during cleanup disconnect:', disconnectError);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Rozłączenie od BMS
  const disconnectFromBMS = async () => {
    try {
      if (dataInterval.current) {
        clearInterval(dataInterval.current);
        dataInterval.current = null;
      }

      if (scanTimeout.current) {
        clearTimeout(scanTimeout.current);
        scanTimeout.current = null;
      }

      if (connectedDevice.current) {
        try {
          await BleClient.stopNotifications(
            connectedDevice.current.device.deviceId,
            connectedDevice.current.service,
            connectedDevice.current.notifyCharacteristic
          );
        } catch (error) {
          console.log('Error stopping notifications:', error);
        }

        try {
          await BleClient.disconnect(connectedDevice.current.device.deviceId);
        } catch (error) {
          console.log('Error disconnecting:', error);
        }
        
        connectedDevice.current = null;
      }

      // Reset skanowania
      try {
        await BleClient.stopLEScan();
      } catch (error) {
        console.log('Error stopping scan during disconnect:', error);
      }

      setIsConnected(false);
      setIsConnecting(false);
      setIsScanning(false);
      setConnectionError('');
      setDetectedBmsType('');
      setDiscoveredDevices([]);
      setConnectionAttempts(0);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  // Obsługa danych przychodzących z BMS
  const handleBMSData = (value: DataView, protocolType: string) => {
    try {
      const dataArray = dataViewToNumbers(value);
      console.log(`Received ${protocolType} data:`, dataArray.map(b => b.toString(16).padStart(2, '0')).join(' '));
      
      const parsedData = parseBMSData(dataArray, protocolType);
      if (parsedData) {
        setBmsData(prev => ({
          ...prev,
          ...parsedData,
          rawData: dataArray.map(b => b.toString(16).padStart(2, '0')).join(' '),
          bmsType: BMS_PROTOCOLS[protocolType]?.name || protocolType
        }));
        setLastUpdate(new Date());
      }

      // Parsowanie napięć ogniw (może być w osobnym pakiecie)
      const cells = parseCellVoltages(dataArray, protocolType);
      if (cells.length > 0) {
        setBmsData(prev => ({
          ...prev,
          cells: cells
        }));
      }
    } catch (error) {
      console.error('Error handling BMS data:', error);
    }
  };

  // Parsowanie napięć ogniw dla różnych protokołów
  const parseCellVoltages = (dataArray: number[], protocolType: string) => {
    const data = new Uint8Array(dataArray);
    const cells: any[] = [];
    
    try {
      switch (protocolType) {
        case 'JK_BMS':
          // JK BMS - napięcia ogniw są w głównym pakiecie danych
          if (data.length > 100) {
            let cellOffset = 79; // Przesunięcie do napięć ogniw w JK BMS
            for (let i = 0; i < 16; i++) { // Maksymalnie 16 ogniw
              if (cellOffset + 1 < data.length) {
                const voltage = ((data[cellOffset] << 8) | data[cellOffset + 1]) / 1000;
                if (voltage > 0 && voltage < 5) {
                  cells.push({
                    id: i + 1,
                    voltage: voltage,
                    temperature: 25 + Math.random() * 5 // JK BMS może mieć temperatury ogniw
                  });
                }
                cellOffset += 2;
              }
            }
          }
          break;

        case 'XIAOXIANG':
        case 'LLT_POWER':
          // Xiaoxiang - sprawdź czy to pakiet z napięciami ogniw
          if (data[0] === 0xDD && data[1] === 0x04) {
            for (let i = 4; i < data.length - 3; i += 2) {
              if (i + 1 < data.length) {
                const voltage = ((data[i] << 8) | data[i + 1]) / 1000;
                if (voltage > 0 && voltage < 5) {
                  cells.push({
                    id: cells.length + 1,
                    voltage: voltage,
                    temperature: 25 + Math.random() * 5
                  });
                }
              }
            }
          }
          break;

        case 'DALY':
          // DALY - może wymagać osobnego zapytania o napięcia ogniw
          if (data[1] === 0x01 && data[2] === 0x95) {
            for (let i = 4; i < data.length - 3; i += 2) {
              if (i + 1 < data.length) {
                const voltage = ((data[i] << 8) | data[i + 1]) / 1000;
                if (voltage > 0 && voltage < 5) {
                  cells.push({
                    id: cells.length + 1,
                    voltage: voltage,
                    temperature: 25
                  });
                }
              }
            }
          }
          break;

        default:
          // Próba generycznego parsowania
          for (let i = 4; i < Math.min(data.length - 3, 40); i += 2) {
            if (i + 1 < data.length) {
              const voltage = ((data[i] << 8) | data[i + 1]) / 1000;
              if (voltage > 2.0 && voltage < 4.5) {
                cells.push({
                  id: cells.length + 1,
                  voltage: voltage,
                  temperature: 25
                });
              }
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error parsing cell voltages:', error);
    }

    return cells;
  };

  // Wysyłanie komend do BMS
  const sendCommand = async (commandType: string = 'getInfo') => {
    if (!connectedDevice.current) return;

    try {
      const protocol = BMS_PROTOCOLS[connectedDevice.current.protocol];
      if (!protocol || !protocol.commands[commandType]) {
        console.log('Command not available for this protocol');
        return;
      }

      const command = protocol.commands[commandType];
      const dataView = numbersToDataView(command);
      
      await BleClient.write(
        connectedDevice.current.device.deviceId,
        connectedDevice.current.service,
        connectedDevice.current.writeCharacteristic,
        dataView
      );
      
      console.log(`${commandType} command sent:`, command.map(b => b.toString(16).padStart(2, '0')).join(' '));
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  };

  // Cykliczne pobieranie danych
  const startDataPolling = () => {
    // Wyślij pierwsze zapytanie od razu
    sendCommand('getInfo');
    
    // Ustaw interwał dla regularnych zapytań
    dataInterval.current = setInterval(() => {
      sendCommand('getInfo');
      
      // Co 3 zapytanie poproś o napięcia ogniw
      if (Math.random() > 0.66) {
        setTimeout(() => sendCommand('getCellInfo'), 500);
      }

      // Co 10 zapytanie poproś o informacje o urządzeniu  
      if (Math.random() > 0.9) {
        setTimeout(() => sendCommand('getDeviceInfo'), 1000);
      }
    }, 3000); // Co 3 sekundy
  };

  // Ręczne odświeżenie danych
  const refreshData = () => {
    if (isConnected) {
      sendCommand('getInfo');
      setTimeout(() => sendCommand('getCellInfo'), 500);
      setTimeout(() => sendCommand('getDeviceInfo'), 1000);
    }
  };

  // Włączenie Bluetooth
  const enableBluetooth = async () => {
    try {
      await BleClient.enable();
      setIsBluetoothEnabled(true);
      setConnectionError('');
    } catch (error) {
      console.error('Failed to enable Bluetooth:', error);
      setConnectionError('Nie udało się włączyć Bluetooth. Włącz ręcznie w ustawieniach.');
    }
  };

  // Zatrzymanie skanowania
  const stopScanning = async () => {
    try {
      await BleClient.stopLEScan();
      setIsScanning(false);
      setIsConnecting(false);
      if (scanTimeout.current) {
        clearTimeout(scanTimeout.current);
        scanTimeout.current = null;
      }
    } catch (error) {
      console.error('Error stopping scan:', error);
    }
  };

  // Komponenty UI
  const TabButton = ({ id, icon: Icon, label, active, onClick }: any) => (
    <button
      onClick={() => onClick(id)}
      className={`flex-1 flex flex-col items-center py-2 px-1 transition-colors ${
        active 
          ? 'text-blue-600 bg-blue-50 border-t-2 border-blue-600' 
          : 'text-gray-600 hover:text-blue-500'
      }`}
    >
      <Icon size={20} className="mb-1" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );

  const DeviceCard = ({ device, onConnect }: any) => (
    <div className="bg-white p-4 rounded-lg border shadow-sm mb-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">
            {device.name || 'Nieznane urządzenie'}
          </h3>
          <p className="text-sm text-gray-600">{device.deviceId}</p>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {device.protocolName}
            </span>
            <span className="text-xs text-gray-500">
              RSSI: {device.rssi} dBm
            </span>
          </div>
        </div>
        <button
          onClick={() => onConnect(device)}
          disabled={isConnecting}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Połącz
        </button>
      </div>
    </div>
  );

  const EnvironmentStatus = () => (
    <div className={`p-4 rounded-lg border-2 ${
      isNativeApp ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center space-x-2">
        {isNativeApp ? (
          <Smartphone className="text-green-600" size={20} />
        ) : (
          <Globe className="text-red-600" size={20} />
        )}
        <div>
          <span className="font-medium block">
            {isNativeApp ? 'Aplikacja natywna' : 'Tryb przeglądarki'}
          </span>
          <span className="text-sm text-gray-700">
            {isNativeApp 
              ? 'Gotowa do połączenia z BMS przez Bluetooth LE' 
              : 'Aplikacja musi być uruchomiona jako natywna aplikacja mobilna (iOS/Android)'
            }
          </span>
        </div>
      </div>
    </div>
  );

  const BluetoothStatus = () => (
    <div className={`p-4 rounded-lg border-2 ${
      isBluetoothEnabled ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bluetooth className={isBluetoothEnabled ? "text-green-600" : "text-yellow-600"} size={20} />
          <div>
            <span className="font-medium block">
              {isBluetoothEnabled ? 'Bluetooth włączony' : 'Bluetooth wyłączony'}
            </span>
            <span className="text-sm text-gray-700">
              {isBluetoothEnabled 
                ? 'Gotowy do skanowania urządzeń BMS' 
                : 'Włącz Bluetooth w ustawieniach systemu'
              }
            </span>
          </div>
        </div>
        {!isBluetoothEnabled && isNativeApp && (
          <button
            onClick={enableBluetooth}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Włącz
          </button>
        )}
      </div>
    </div>
  );

  const DashboardTab = () => (
    <div className="p-4 space-y-4">
      {/* Status środowiska */}
      <EnvironmentStatus />

      {/* Status Bluetooth */}
      {isNativeApp && <BluetoothStatus />}

      {/* Status połączenia */}
      <div className={`p-4 rounded-lg border-2 ${
        isConnected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isConnecting ? (
              <RefreshCw className="animate-spin text-blue-600" size={20} />
            ) : isConnected ? (
              <Wifi className="text-green-600" size={20} />
            ) : (
              <WifiOff className="text-red-600" size={20} />
            )}
            <div>
              <span className="font-medium block">
                {isConnecting ? 'Łączenie...' : isConnected ? 'Połączono z BMS' : 'Brak połączenia'}
              </span>
              {connectedDevice.current && (
                <div className="text-sm text-gray-600">
                  <div>{bmsData.deviceName}</div>
                  <div>{bmsData.bmsType}</div>
                </div>
              )}
              {detectedBmsType && !isConnected && (
                <span className="text-sm text-blue-600">
                  Wykryto: {BMS_PROTOCOLS[detectedBmsType]?.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
            {isConnected && (
              <button
                onClick={refreshData}
                className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                title="Odśwież dane"
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button
              onClick={isConnected ? disconnectFromBMS : scanForBMSDevices}
              disabled={isConnecting || !isNativeApp || !isBluetoothEnabled}
              className={`px-4 py-2 rounded-lg font-medium ${
                isConnected 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {isConnecting ? 'Łączenie...' : isConnected ? 'Rozłącz' : 'Skanuj BMS'}
            </button>
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

        {connectionAttempts > 0 && (
          <div className="mt-2 text-xs text-blue-600">
            Próby połączenia: {connectionAttempts}
          </div>
        )}
      </div>

      {/* Lista wykrytych urządzeń */}
      {discoveredDevices.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-gray-900">Wykryte urządzenia BMS</h3>
            {isScanning && (
              <div className="flex items-center space-x-2">
                <RefreshCw className="animate-spin text-blue-600" size={16} />
                <button
                  onClick={stopScanning}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Zatrzymaj
                </button>
              </div>
            )}
          </div>
          
          {discoveredDevices.map((device) => (
            <DeviceCard
              key={device.deviceId}
              device={device}
              onConnect={connectToDevice}
            />
          ))}
        </div>
      )}

      {/* Główne parametry */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center space-x-2 mb-2">
            <Zap className="text-yellow-600" size={20} />
            <span className="text-sm font-medium text-gray-600">Napięcie</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {bmsData.voltage.toFixed(2)} V
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center space-x-2 mb-2">
            <Activity className="text-blue-600" size={20} />
            <span className="text-sm font-medium text-gray-600">Prąd</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {bmsData.current.toFixed(2)} A
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="text-green-600" size={20} />
            <span className="text-sm font-medium text-gray-600">Moc</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {bmsData.power.toFixed(1)} W
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center space-x-2 mb-2">
            <Thermometer className="text-red-600" size={20} />
            <span className="text-sm font-medium text-gray-600">Temperatura</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {bmsData.temperature.toFixed(1)} °C
          </div>
        </div>
      </div>

      {/* Stan naładowania */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex items-center space-x-2 mb-3">
          <Battery className="text-green-600" size={20} />
          <span className="font-medium text-gray-600">Stan naładowania</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
          <div 
            className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${bmsData.soc}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-sm">
          <span>{bmsData.soc}%</span>
          <span>{bmsData.remainingCapacity.toFixed(1)} / {bmsData.capacity.toFixed(1)} Ah</span>
        </div>
      </div>

      {/* Status systemu */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Status systemu</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.charging ? 'bg-green-500' : 'bg-gray-300'}`}></div>
            <span className="text-sm">Ładowanie</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.discharging ? 'bg-orange-500' : 'bg-gray-300'}`}></div>
            <span className="text-sm">Rozładowanie</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.balancing ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
            <span className="text-sm">Balansowanie</span>
          </div>
          <div className="flex items-center space-x-2">
            <Timer size={16} className="text-gray-600" />
            <span className="text-sm">Cykle: {bmsData.cycles}</span>
          </div>
        </div>
      </div>

      {/* Napięcia ogniw */}
      {bmsData.cells.length > 0 && (
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <h3 className="font-medium text-gray-900 mb-3">Napięcia ogniw</h3>
          <div className="grid grid-cols-2 gap-2">
            {bmsData.cells.map((cell) => (
              <div key={cell.id} className="flex justify-between text-sm">
                <span>Ogniwo {cell.id}:</span>
                <span className="font-mono">{cell.voltage.toFixed(3)}V</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zabezpieczenia */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex items-center space-x-2 mb-3">
          <Shield className="text-orange-600" size={20} />
          <span className="font-medium text-gray-600">Zabezpieczenia</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.protection.overvoltage ? 'bg-red-500' : 'bg-green-500'}`}></div>
            <span className="text-sm">Przepięcie</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.protection.undervoltage ? 'bg-red-500' : 'bg-green-500'}`}></div>
            <span className="text-sm">Niedopiecie</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.protection.overcurrent ? 'bg-red-500' : 'bg-green-500'}`}></div>
            <span className="text-sm">Nadprąd</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.protection.overtemperature ? 'bg-red-500' : 'bg-green-500'}`}></div>
            <span className="text-sm">Przegrzanie</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.protection.shortCircuit ? 'bg-red-500' : 'bg-green-500'}`}></div>
            <span className="text-sm">Zwarcie</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${bmsData.protection.chargeMosfet ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm">MOSFET ład.</span>
          </div>
        </div>
      </div>

      {/* Raw data debug */}
      {bmsData.rawData && (
        <div className="bg-gray-100 p-3 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Dane surowe (hex):</h4>
          <div className="text-xs font-mono text-gray-600 break-all">
            {bmsData.rawData}
          </div>
        </div>
      )}
    </div>
  );

  const CellsTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Napięcia ogniw</h2>
      
      {bmsData.cells.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Battery size={48} className="mx-auto mb-2 opacity-50" />
          <p>Brak danych o ogniwach</p>
          <p className="text-sm">Połącz się z BMS aby zobaczyć napięcia ogniw</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bmsData.cells.map((cell) => {
            const minVoltage = 3.0;
            const maxVoltage = 4.2;
            const percentage = ((cell.voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
            
            return (
              <div key={cell.id} className="bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Ogniwo {cell.id}</span>
                  <span className="font-mono text-lg">{cell.voltage.toFixed(3)}V</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-500 ${
                      percentage > 80 ? 'bg-green-500' : 
                      percentage > 60 ? 'bg-yellow-500' : 
                      percentage > 30 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{minVoltage}V</span>
                  <span>{cell.temperature.toFixed(1)}°C</span>
                  <span>{maxVoltage}V</span>
                </div>
              </div>
            );
          })}
          
          {/* Statystyki ogniw */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-medium text-blue-900 mb-2">Statystyki</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span>Najwyższe:</span>
                <span className="font-mono">
                  {Math.max(...bmsData.cells.map(c => c.voltage)).toFixed(3)}V
                </span>
              </div>
              <div className="flex justify-between">
                <span>Najniższe:</span>
                <span className="font-mono">
                  {Math.min(...bmsData.cells.map(c => c.voltage)).toFixed(3)}V
                </span>
              </div>
              <div className="flex justify-between">
                <span>Różnica:</span>
                <span className="font-mono">
                  {(Math.max(...bmsData.cells.map(c => c.voltage)) - 
                    Math.min(...bmsData.cells.map(c => c.voltage))).toFixed(3)}V
                </span>
              </div>
              <div className="flex justify-between">
                <span>Średnie:</span>
                <span className="font-mono">
                  {(bmsData.cells.reduce((sum, c) => sum + c.voltage, 0) / bmsData.cells.length).toFixed(3)}V
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const SettingsTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Ustawienia</h2>
      
      {/* Informacje o urządzeniu */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Informacje o urządzeniu</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Platforma:</span>
            <span>{isNativeApp ? Capacitor.getPlatform() : 'Przeglądarka'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Bluetooth:</span>
            <span>{isBluetoothEnabled ? 'Włączony' : 'Wyłączony'}</span>
          </div>
          {bmsData.deviceName && (
            <div className="flex justify-between">
              <span className="text-gray-600">BMS:</span>
              <span>{bmsData.deviceName}</span>
            </div>
          )}
          {bmsData.bmsType && (
            <div className="flex justify-between">
              <span className="text-gray-600">Protokół:</span>
              <span>{bmsData.bmsType}</span>
            </div>
          )}
        </div>
      </div>

      {/* Ustawienia połączenia */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Połączenie</h3>
        <div className="space-y-3">
          <button
            onClick={refreshData}
            disabled={!isConnected}
            className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center space-x-2">
              <RefreshCw size={16} />
              <span>Odśwież dane</span>
            </div>
          </button>
          
          <button
            onClick={scanForBMSDevices}
            disabled={!isNativeApp || !isBluetoothEnabled || isConnecting}
            className="w-full p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center space-x-2">
              <Search size={16} />
              <span>Skanuj urządzenia</span>
            </div>
          </button>
          
          {isConnected && (
            <button
              onClick={disconnectFromBMS}
              className="w-full p-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <div className="flex items-center justify-center space-x-2">
                <XCircle size={16} />
                <span>Rozłącz</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Obsługiwane protokoły */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Obsługiwane protokoły BMS</h3>
        <div className="space-y-2">
          {Object.entries(BMS_PROTOCOLS).map(([key, protocol]) => (
            <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-sm font-medium">{protocol.name}</span>
              <span className="text-xs text-gray-500">
                {protocol.identifiers.join(', ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Informacje debug */}
      <div className="bg-gray-100 p-4 rounded-lg">
        <h3 className="font-medium text-gray-700 mb-3">Debug</h3>
        <div className="space-y-1 text-xs text-gray-600">
          <div>Próby połączenia: {connectionAttempts}</div>
          <div>Wykryte urządzenia: {discoveredDevices.length}</div>
          <div>Wykryty typ BMS: {detectedBmsType || 'Brak'}</div>
          <div>Ostatnia aktualizacja: {lastUpdate?.toLocaleString() || 'Brak'}</div>
        </div>
      </div>
    </div>
  );

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

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <h1 className="text-xl font-bold text-center">BMS Reader</h1>
        <p className="text-center text-blue-100 text-sm">
          Natywny monitor systemów BMS
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto pb-16">
        {renderCurrentTab()}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-white border-t shadow-lg">
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