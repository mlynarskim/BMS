import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Battery, Zap, Activity, Thermometer, Settings, Wifi, WifiOff, RefreshCw, Search, TrendingUp, AlertCircle, Eye, EyeOff } from 'lucide-react';

// JK-BMS GATT (nRF Connect confirms Service FFE0; Write-NoRsp often on FFE2; Notify on FFE1)
const BMS_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const BMS_CHAR_NOTIFY = '0000ffe1-0000-1000-8000-00805f9b34fb';
const BMS_CHAR_WRITE_ALT = '0000ffe2-0000-1000-8000-00805f9b34fb';
const BMS_CHAR_WRITE_PRIMARY = '0000ffe1-0000-1000-8000-00805f9b34fb';

// Proste komendy JK BMS
const BMS_COMMANDS = {
  readAll: [0xAA, 0x55, 0x90, 0xEB, 0x96, 0x00, 0x4C, 0x7E],
  readBasic: [0x4E, 0x57, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00, 0x06, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x68, 0x00, 0x00, 0x01, 0x29]
};

// Konwersja do Base64 dla Capacitor
const toBase64 = (arr) => {
  const bytes = new Uint8Array(arr);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// Convert number array to DataView (preferred by Capacitor BLE)
const toDataView = (arr: number[]) => {
  const u8 = Uint8Array.from(arr);
  return new DataView(u8.buffer);
};

type GattPaths = { service: string; notify: string; write: string };
const gattCache: Record<string, GattPaths> = {};

const bleGetServices = async (client: any, deviceId: string) => {
  if (!client?.getServices) return null;
  try {
    // Many iOS builds of the Capacitor BLE plugin expose a positional signature
    if (client.getServices.length >= 1) {
      return client.getServices(deviceId);
    }
    // Fallback to object form
    return client.getServices({ deviceId });
  } catch (_e) {
    // Last fallback: object form
    return client.getServices({ deviceId });
  }
};

const discoverGatt = async (client: any, deviceId: string): Promise<GattPaths> => {
  // Prefer cached
  if (gattCache[deviceId]) return gattCache[deviceId];
  let service = BMS_SERVICE;
  let notify = BMS_CHAR_NOTIFY;
  let write = BMS_CHAR_WRITE_ALT; // prefer FFE2 per JK practice

  try {
    const info = await bleGetServices(client, deviceId);
    // Capacitor returns { services: [{ uuid, characteristics: [{ uuid, properties: {...}}]}] }
    const services = info?.services || info || [];
    for (const s of services) {
      const su = String(s.uuid || s.service || '').toLowerCase();
      if (!su) continue;
      if (su.endsWith('ffe0')) service = su;
      const chars = s.characteristics || [];
      for (const ch of chars) {
        const cu = String(ch.uuid || ch.characteristic || '').toLowerCase();
        const props = ch.properties || {};
        if (cu.endsWith('ffe1')) {
          notify = cu;
          // Some firmwares also accept write on FFE1
          if (props?.write || props?.writeWithoutResponse) {
            // keep as fallback; do not override if we later find FFE2
            if (!write || write.endsWith('ffe1')) write = cu;
          }
        }
        if (cu.endsWith('ffe2')) {
          if (props?.write || props?.writeWithoutResponse || true) {
            write = cu; // prefer FFE2 when present
          }
        }
      }
    }
  } catch (e) {
    console.warn('Service discovery failed (using defaults):', (e as any)?.message || e);
  }

  const paths: GattPaths = { service, notify, write };
  gattCache[deviceId] = paths;
  console.log('Gatt paths for', deviceId, paths);
  return paths;
};

const writeCommandJK = async (
  client: any,
  deviceId: string,
  cmd: number[],
  preferred?: 'FFE1' | 'FFE2'
): Promise<'FFE1' | 'FFE2'> => {
  const payload = toDataView(cmd);

  const paths = await discoverGatt(client, deviceId);
  let writeChar = paths.write;
  let notifyChar = paths.notify;

  // Allow explicit override via preferred flag
  if (preferred) {
    const want = preferred.toLowerCase();
    const pick = (suffix: 'ffe1' | 'ffe2') => {
      if (String(paths.write).toLowerCase().endsWith(suffix)) return paths.write;
      if (String(paths.notify).toLowerCase().endsWith(suffix)) return paths.notify;
      return suffix === 'ffe2' ? BMS_CHAR_WRITE_ALT : BMS_CHAR_WRITE_PRIMARY;
    };
    writeChar = want === 'ffe2' ? pick('ffe2') : pick('ffe1');
  }

  // Try writeWithoutResponse first, then write()
  try {
    await bleWriteNoRsp(client, deviceId, paths.service, writeChar, payload);
    return writeChar.toLowerCase().endsWith('ffe2') ? 'FFE2' : 'FFE1';
  } catch (e1: any) {
    console.warn('writeWithoutResponse failed, trying write():', e1?.message || e1);
    if (client?.write) {
      try {
        if (client.write.length >= 4) {
          await client.write(deviceId, paths.service, writeChar, payload);
        } else {
          await client.write({ deviceId, service: paths.service, characteristic: writeChar, value: payload });
        }
        return writeChar.toLowerCase().endsWith('ffe2') ? 'FFE2' : 'FFE1';
      } catch (e2: any) {
        // Last fallback: try other char
        const altChar = writeChar.toLowerCase().endsWith('ffe2') ? BMS_CHAR_WRITE_PRIMARY : BMS_CHAR_WRITE_ALT;
        try {
          await bleWriteNoRsp(client, deviceId, paths.service, altChar, payload);
          return altChar.toLowerCase().endsWith('ffe2') ? 'FFE2' : 'FFE1';
        } catch (e3: any) {
          throw new Error('BLE write failed: ' + (e3?.message || e3));
        }
      }
    }
    // If no write(), try alternate char for no-rsp
    const altChar = writeChar.toLowerCase().endsWith('ffe2') ? BMS_CHAR_WRITE_PRIMARY : BMS_CHAR_WRITE_ALT;
    await bleWriteNoRsp(client, deviceId, paths.service, altChar, payload);
    return altChar.toLowerCase().endsWith('ffe2') ? 'FFE2' : 'FFE1';
  }
};

// Read BLE value (supports both return shapes)
const normalizeReadResult = (res: any): Uint8Array => {
  if (!res) return new Uint8Array();
  if (res instanceof ArrayBuffer) return new Uint8Array(res);
  if (res?.buffer instanceof ArrayBuffer) return new Uint8Array(res.buffer);
  if (res?.value) {
    // base64 string -> bytes
    try {
      const binary = atob(res.value);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    } catch {}
  }
  if (typeof res === 'string') {
    // base64 or hex
    try {
      const bin = atob(res);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      const cleaned = res.replace(/\s+/g, '');
      const out = new Uint8Array(cleaned.length / 2);
      for (let i = 0; i < cleaned.length; i += 2) out[i / 2] = parseInt(cleaned.substr(i, 2), 16);
      return out;
    }
  }
  if (res instanceof Uint8Array) return res;
  return new Uint8Array();
};

// Compat wrappers for plugin signatures (object vs positional)
const bleWriteNoRsp = async (client: any, deviceId: string, service: string, characteristic: string, value: DataView | Uint8Array | ArrayBuffer | string) => {
  if (!client?.writeWithoutResponse) throw new Error('writeWithoutResponse not available');
  if (client.writeWithoutResponse.length >= 4) {
    // positional: (deviceId, service, characteristic, value)
    return client.writeWithoutResponse(deviceId, service, characteristic, value);
  }
  // object form
  return client.writeWithoutResponse({ deviceId, service, characteristic, value });
};

const bleRead = async (client: any, deviceId: string, service: string, characteristic: string) => {
  if (!client?.read) throw new Error('read not available');
  if (client.read.length >= 3) {
    // positional: (deviceId, service, characteristic)
    return client.read(deviceId, service, characteristic);
  }
  return client.read({ deviceId, service, characteristic });
};

const bleStartNotifications = async (
  client: any,
  deviceId: string,
  service: string,
  characteristic: string,
  cb: (data: any) => void
) => {
  if (!client?.startNotifications) throw new Error('startNotifications not available');
  if (client.startNotifications.length >= 4) {
    // positional: (deviceId, service, characteristic, callback)
    return client.startNotifications(deviceId, service, characteristic, cb);
  }
  // object form
  return client.startNotifications({ deviceId, service, characteristic }, cb);
};

const bleStopNotifications = async (
  client: any,
  deviceId: string,
  service: string,
  characteristic: string
) => {
  if (!client?.stopNotifications) throw new Error('stopNotifications not available');
  if (client.stopNotifications.length >= 3) {
    // positional: (deviceId, service, characteristic)
    return client.stopNotifications(deviceId, service, characteristic);
  }
  // object form
  return client.stopNotifications({ deviceId, service, characteristic });
};

// Konwersja z Base64/Hex
const fromBLEData = (data) => {
  if (!data) return [];
  
  // Base64
  if (typeof data === 'string' && !/^[0-9a-fA-F]+$/.test(data)) {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return Array.from(bytes);
    } catch (e) {
      console.log('Not base64');
    }
  }
  
  // Hex string
  if (typeof data === 'string') {
    const bytes = [];
    for (let i = 0; i < data.length; i += 2) {
      bytes.push(parseInt(data.substr(i, 2), 16));
    }
    return bytes;
  }
  
  // Object with value
  if (data.value) return fromBLEData(data.value);
  
  // ArrayBuffer
  if (data instanceof ArrayBuffer) return Array.from(new Uint8Array(data));
  
  // Uint8Array
  if (data instanceof Uint8Array) return Array.from(data);
  
  // Already array
  if (Array.isArray(data)) return data;
  
  return [];
};

// Parser danych
const parseData = (bytes) => {
  if (!bytes || bytes.length < 8) return null;
  
  console.log('Parsing', bytes.length, 'bytes:', bytes.slice(0, 20).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
  
  let voltage = 0, current = 0, soc = 50, temp = 25;
  
  // Szukaj napięcia (10-60V typowo dla JK BMS)
  for (let i = 0; i < Math.min(bytes.length - 1, 60); i++) {
    const v1 = ((bytes[i] << 8) | bytes[i + 1]) * 0.01;
    const v2 = ((bytes[i] << 8) | bytes[i + 1]) * 0.1;
    
    if (v1 >= 10 && v1 <= 60) {
      voltage = v1;
      console.log('Found voltage:', voltage, 'V at offset', i);
      break;
    }
    if (v2 >= 10 && v2 <= 60 && voltage === 0) {
      voltage = v2;
      console.log('Found voltage:', voltage, 'V at offset', i);
      break;
    }
  }
  
  // Szukaj prądu (-100A do +100A)
  for (let i = 2; i < Math.min(bytes.length - 1, 60); i++) {
    const raw = (bytes[i] << 8) | bytes[i + 1];
    const options = [
      (raw - 30000) * 0.01,
      (raw - 10000) * 0.01,
      raw * 0.01 - 300
    ];
    
    for (const opt of options) {
      if (Math.abs(opt) <= 100) {
        current = opt;
        console.log('Found current:', current, 'A at offset', i);
        break;
      }
    }
    if (current !== 0) break;
  }
  
  // SOC
  for (let i = 8; i < Math.min(bytes.length, 80); i++) {
    if (bytes[i] >= 0 && bytes[i] <= 100 && 
        Math.abs(bytes[i] - voltage) > 5 && 
        Math.abs(bytes[i] - Math.abs(current)) > 5) {
      soc = bytes[i];
      console.log('Found SOC:', soc, '% at offset', i);
      break;
    }
  }
  
  // Temperatura
  for (let i = 8; i < Math.min(bytes.length, 80); i++) {
    if (bytes[i] >= 0 && bytes[i] <= 80 && bytes[i] !== soc) {
      temp = bytes[i];
      console.log('Found temp:', temp, '°C at offset', i);
      break;
    }
  }
  
  return {
    voltage,
    current,
    power: Math.abs(voltage * current),
    soc,
    temperature: temp,
    charging: current > 0.1,
    discharging: current < -0.1
  };
};

// Mock BLE dla testów
const createMockBLE = () => {
  let v = 48.2, c = -12.5, soc = 73, t = 26;
  
  return {
    initialize: async () => console.log('Mock BLE ready'),
    isEnabled: async () => true,
    requestLEScan: async (opts, cb) => {
      console.log('Mock scan started');
      setTimeout(() => {
        cb({ device: { name: 'JK-BMS-12V', deviceId: 'mock-jk-1' }, rssi: -45 });
        setTimeout(() => {
          cb({ device: { name: '48V100AH', deviceId: 'mock-jk-2' }, rssi: -52 });
        }, 500);
      }, 800);
    },
    stopLEScan: async () => console.log('Mock scan stopped'),
    connect: async () => console.log('Mock connected'),
    disconnect: async () => console.log('Mock disconnected'),
    read: async () => {
      v += (Math.random() - 0.5) * 0.1;
      c += (Math.random() - 0.5) * 1;
      soc = Math.max(0, Math.min(100, soc + (Math.random() - 0.5) * 0.2));
      t += (Math.random() - 0.5) * 0.3;
      
      const vHex = Math.round(v * 100);
      const cHex = Math.round((c + 300) * 100);
      
      const data = [
        0x4E, 0x57, 0x00, 0x32,
        0x00, 0x00, 0x00, 0x00,
        0x06, 0x03, 0x01, 0x00,
        (vHex >> 8) & 0xFF, vHex & 0xFF,
        (cHex >> 8) & 0xFF, cHex & 0xFF,
        Math.round(soc), Math.round(t),
        0x00, 0x00, 0x68
      ];
      
      return toBase64(data);
    },
    writeWithoutResponse: async () => console.log('Mock write')
  };
};

// Komponenty UI
const LoadingSpinner = () => (
  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
);

const StatusBadge = ({ active, label, color = 'green' }) => (
  <div className="flex items-center space-x-2">
    <div className={`w-3 h-3 rounded-full ${active ? 
      (color === 'green' ? 'bg-green-500 animate-pulse' : 
       color === 'orange' ? 'bg-orange-500 animate-pulse' : 
       'bg-blue-500 animate-pulse') : 'bg-gray-300'}`} />
    <span className="text-sm">{label}</span>
  </div>
);

// Główna aplikacja
const BMSReaderApp = () => {
  const [tab, setTab] = useState('dashboard');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [btEnabled, setBtEnabled] = useState(false);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [device, setDevice] = useState(null);
  const [ble, setBle] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);
  
  const [data, setData] = useState({
    voltage: 0,
    current: 0,
    power: 0,
    soc: 0,
    temperature: 0,
    charging: false,
    discharging: false,
    rawData: ''
  });

  const notifActiveRef = useRef(false);
  const lastNotifRef = useRef<Uint8Array | null>(null);

  // Inicjalizacja
  useEffect(() => {
    const init = async () => {
      try {
        console.log('Initializing app...');
        
        const isNative = window.Capacitor?.isNativePlatform() || false;
        console.log('Native platform:', isNative);
        
        await new Promise(r => setTimeout(r, 800));
        
        if (!mountedRef.current) return;
        
        let client;
        
        if (!isNative) {
          console.log('Using mock BLE');
          client = createMockBLE();
        } else {
          try {
            const mod = await import('@capacitor-community/bluetooth-le');
            client = mod.BleClient;
            await client.initialize();
            console.log('Real BLE initialized');
          } catch (e) {
            console.error('BLE init failed:', e);
            client = createMockBLE();
          }
        }
        
        if (mountedRef.current) {
          setBle(client);
          setBtEnabled(true);
          console.log('BLE ready');
        }
        
      } catch (e) {
        console.error('Init error:', e);
        setError('Initialization failed: ' + e.message);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    
    init();
    
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Ensure notifications are armed for the session and last payload is tracked
  const ensureNotifications = useCallback(async (devId: string) => {
    if (!ble || !devId) return;
    if (notifActiveRef.current) return;
    try {
      const paths = await discoverGatt(ble, String(devId));
      console.log('Arming notifications on', paths);

      await bleStartNotifications(
        ble,
        String(devId),
        paths.service,
        paths.notify,
        (res: any) => {
          try {
            const u8 = normalizeReadResult(res?.value || res);
            if (!u8 || !u8.length) return;

            // Buffer fragments (MTU ~23 on iOS)
            if (!lastNotifRef.current || !(lastNotifRef.current instanceof Uint8Array)) {
              lastNotifRef.current = u8;
            } else {
              const combined = new Uint8Array(lastNotifRef.current.length + u8.length);
              combined.set(lastNotifRef.current, 0);
              combined.set(u8, lastNotifRef.current.length);
              lastNotifRef.current = combined;
            }

            const buf = lastNotifRef.current;
            console.log(
              'JK notify chunk',
              Array.from(u8.slice(0, 20)).map(b => b.toString(16).padStart(2,'0')).join(' '),
              'len=', u8.length, 'total=', buf.length
            );
          } catch (e) {
            console.warn('Notification parse error', e);
          }
        }
      );
      notifActiveRef.current = true;
      console.log('✅ Notifications armed on FFE1');
    } catch (e) {
      console.error('ensureNotifications failed:', (e as any)?.message || e);
    }
  }, [ble]);

  // Skanowanie
  const scan = useCallback(async () => {
    if (!ble || scanning) return;
    
    console.log('Starting scan...');
    setScanning(true);
    setError('');
    setDevices([]);
    
    const found = [];
    
    try {
      await ble.requestLEScan({ allowDuplicates: false }, (result) => {
        if (!mountedRef.current) return;

        const d = result.device || result;
        const id = d?.deviceId || d?.id || d?.address;
        if (!d || !id) return;

        const deviceId = String(id);
        if (found.find(f => f.deviceId === deviceId)) return;

        const newDev = {
          name: d.name || result.localName || 'Unknown BMS',
          deviceId,
          rssi: typeof result.rssi === 'number' ? result.rssi : (d.rssi ?? -60)
        };

        console.log('Found:', newDev.name);
        found.push(newDev);
        setDevices([...found]);
      });
      
      setTimeout(async () => {
        if (!mountedRef.current) return;
        try {
          await ble.stopLEScan();
          console.log('Scan stopped. Found', found.length, 'devices');
          setScanning(false);
          if (found.length === 0) {
            setError('No BMS devices found');
          }
        } catch (e) {
          console.error('Stop scan error:', e);
          setScanning(false);
        }
      }, 12000);
      
    } catch (e) {
      console.error('Scan error:', e);
      setScanning(false);
      setError('Scan failed: ' + e.message);
    }
  }, [ble, scanning]);

  // Odczyt danych
  const readData = useCallback(async (dev) => {
    if (!ble || !dev || !connected) return;

    try {
      console.log('Reading data from', dev.name);

      const gpaths = await discoverGatt(ble, String(dev.deviceId));
      console.log('Using discovered GATT', gpaths);

      // Wyślij komendę
      const cmd = BMS_COMMANDS.readBasic; // JK expects the 0x4E 0x57 frame
      console.log(
        'Sending command:',
        cmd.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' ')
      );

      console.log(
        'Using service:',
        gpaths.service,
        'characteristic:',
        gpaths.notify,
        'deviceId:',
        String(dev.deviceId)
      );

      await ensureNotifications(String(dev.deviceId));
      await new Promise(r => setTimeout(r, 350));
      lastNotifRef.current = null;

      const preferredPath: 'FFE1' | 'FFE2' =
        String(gpaths.write).toLowerCase().endsWith('ffe2') ? 'FFE2' : 'FFE1';

      let writePath: 'FFE1' | 'FFE2' =
        await writeCommandJK(ble, String(dev.deviceId), cmd, preferredPath);

      console.log('Command written via', writePath);

      // Wait up to 12s for a notification frame; resend every 1.5s
      lastNotifRef.current = null;
      const startTs = Date.now();
      let notifBytes: Uint8Array | null = null;
      let attempts = 0;
      while (!notifBytes && Date.now() - startTs < 12000) {
        if (lastNotifRef.current && lastNotifRef.current.length >= 24) {
          notifBytes = lastNotifRef.current;
          break;
        }
        if (Date.now() - startTs > 1500 * (attempts + 1)) {
          attempts++;
          try {
            await writeCommandJK(ble, String(dev.deviceId), cmd, 'FFE2');
            console.log('Resent 4E57 to FFE2, attempt', attempts);
          } catch (e) {
            console.warn('Resend failed:', (e as any)?.message || e);
          }
        }
        await new Promise(r => setTimeout(r, 120));
      }

      // If still nothing, try legacy AA55 frame once on FFE2 then FFE1
      if (!notifBytes) {
        const aa = BMS_COMMANDS.readAll;
        try {
          await writeCommandJK(ble, String(dev.deviceId), aa, 'FFE2');
          await new Promise(r => setTimeout(r, 250));
          if (lastNotifRef.current && lastNotifRef.current.length >= 24) notifBytes = lastNotifRef.current;
        } catch {}
        if (!notifBytes) {
          try {
            await writeCommandJK(ble, String(dev.deviceId), aa, 'FFE1');
            await new Promise(r => setTimeout(r, 250));
            if (lastNotifRef.current && lastNotifRef.current.length >= 24) notifBytes = lastNotifRef.current;
          } catch {}
        }
      }

      if (!notifBytes || !notifBytes.length) {
        throw new Error('No notify data from JK-BMS. Ensure FFE1 notifications are enabled and try again.');
      }

      console.log('Received response (notify)', notifBytes);

      const bytes = Array.from(notifBytes);
      console.log('Decoded to', bytes.length, 'bytes');

      if (bytes.length < 8) {
        console.log('Response too short');
        return;
      }

      const parsed = parseData(bytes);

      if (parsed && mountedRef.current) {
        console.log('Parsed data:', parsed);
        setData({
          ...parsed,
          rawData: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ').toUpperCase(),
        });
        setLastUpdate(new Date());
        setError('');
      }
    } catch (e) {
      console.error('Read error:', e);
      setError('Failed to read data: ' + e.message);
    }
  }, [ble, connected, ensureNotifications]);

  // Połączenie
  const connect = useCallback(async (dev) => {
    if (!ble || connecting) return;

    const candidateId = dev?.deviceId || dev?.id || dev?.address;
    if (!candidateId) {
      console.log('❌ connect() without deviceId', dev);
      setError('Connection failed: deviceId missing');
      return;
    }
    const deviceId = String(candidateId);

    console.log('Connecting to', dev.name, 'id:', deviceId);
    setConnecting(true);
    setError('Connecting...');

    try {
      // iOS: stop scanning before connecting to avoid race
      try { await ble.stopLEScan(); } catch (_e) {}

      // Primary: object form
      try {
        await ble.connect({ deviceId });
      } catch (e1) {
        console.warn('connect({ deviceId }) failed, trying string form:', (e1 as any)?.message || e1);
        // Fallback: some plugin builds accept string directly
        await (ble as any).connect(deviceId);
      }

      if (!mountedRef.current) return;

      console.log('Connected successfully');
      const normalized = { ...dev, deviceId };
      setConnected(true);
      setDevice(normalized);
      setDevices([]);
      setError('');

      // Discover services/characteristics and cache paths
      try { await discoverGatt(ble, deviceId); } catch {}

      // Arm notifications for the session
      await ensureNotifications(deviceId);

      // Give iOS a little time after CCCD write
      await new Promise(r => setTimeout(r, 250));

      // Pierwszy odczyt
      setTimeout(() => readData(normalized), 800);

      // Cykliczny odczyt
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (mountedRef.current && connected) readData(normalized);
      }, 8000);

    } catch (e) {
      console.error('Connect error:', e);
      setError('Connection failed: ' + e.message);
      setConnected(false);
      setDevice(null);
    } finally {
      setConnecting(false);
    }
  }, [ble, connecting, connected, readData, ensureNotifications]);

  // Rozłączenie
  const disconnect = useCallback(async () => {
    try {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      if (ble && device) {
        await ble.disconnect({ deviceId: String(device.deviceId) });
        notifActiveRef.current = false;
      }
      
      setConnected(false);
      setDevice(null);
      setError('');
      setData({
        voltage: 0,
        current: 0,
        power: 0,
        soc: 0,
        temperature: 0,
        charging: false,
        discharging: false,
        rawData: ''
      });
      
      console.log('Disconnected');
    } catch (e) {
      console.error('Disconnect error:', e);
    }
  }, [ble, device]);

  // Tab button
  const TabBtn = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 flex flex-col items-center py-3 transition ${
        tab === id ? 'text-blue-600 bg-blue-50 border-t-2 border-blue-600' : 'text-gray-600'
      }`}
    >
      <Icon size={20} className="mb-1" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );

  // Device card
  const DeviceCard = ({ dev }) => (
    <div className="bg-white p-4 rounded-xl border shadow mb-3">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-medium">{dev.name}</h3>
          <p className="text-sm text-gray-500 font-mono">
            {String(dev.deviceId).length > 24 ? `${String(dev.deviceId).slice(0, 24)}…` : String(dev.deviceId)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Signal: {dev.rssi} dBm</p>
        </div>
        <button
          onClick={() => connect(dev)}
          disabled={connecting}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  );

  // Dashboard
  const Dashboard = () => (
    <div className="p-4 space-y-4 pb-20">
      {(connected || error) && (
        <div className={`p-4 rounded-xl border-2 ${
          connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {connecting ? <RefreshCw className="animate-spin text-blue-600" /> :
               connected ? <Wifi className="text-green-600" /> :
               <WifiOff className="text-red-600" />}
              <div>
                <div className="font-medium">
                  {connecting ? 'Connecting...' : connected ? 'Connected to BMS' : 'Not connected'}
                </div>
                {connected && device && (
                  <div className="text-sm text-gray-600">{device.name}</div>
                )}
              </div>
            </div>
            {connected && (
              <div className="flex space-x-2">
                <button
                  onClick={() => readData(device)}
                  className="p-2 bg-blue-100 text-blue-600 rounded-lg"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={disconnect}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
          {error && (
            <div className="mt-2 text-sm text-red-600 bg-red-100 p-2 rounded">
              {error}
            </div>
          )}
          {lastUpdate && (
            <div className="mt-2 text-xs text-gray-500">
              Last update: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {!connected && !error && (
        <div className="p-6 rounded-xl border-2 bg-gray-50 text-center">
          <AlertCircle className="mx-auto text-gray-400 mb-2" />
          <h3 className="font-medium text-gray-700 mb-1">Not connected</h3>
          <p className="text-sm text-gray-500">Go to Settings to connect to a BMS device</p>
        </div>
      )}

      {connected && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border shadow">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="text-yellow-600" />
                <span className="text-sm font-medium text-gray-600">Voltage</span>
              </div>
              <div className="text-2xl font-bold">{data.voltage.toFixed(2)} V</div>
            </div>

            <div className="bg-white p-4 rounded-xl border shadow">
              <div className="flex items-center space-x-2 mb-2">
                <Activity className="text-blue-600" />
                <span className="text-sm font-medium text-gray-600">Current</span>
              </div>
              <div className="text-2xl font-bold">{data.current.toFixed(2)} A</div>
            </div>

            <div className="bg-white p-4 rounded-xl border shadow">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="text-green-600" />
                <span className="text-sm font-medium text-gray-600">Power</span>
              </div>
              <div className="text-2xl font-bold">{data.power.toFixed(1)} W</div>
            </div>

            <div className="bg-white p-4 rounded-xl border shadow">
              <div className="flex items-center space-x-2 mb-2">
                <Thermometer className="text-red-600" />
                <span className="text-sm font-medium text-gray-600">Temperature</span>
              </div>
              <div className="text-2xl font-bold">{data.temperature.toFixed(1)} °C</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border shadow">
            <div className="flex items-center space-x-2 mb-3">
              <Battery className="text-green-600" />
              <span className="font-medium">Battery Level</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
              <div 
                className={`h-4 rounded-full transition-all ${
                  data.soc > 80 ? 'bg-green-500' :
                  data.soc > 50 ? 'bg-yellow-500' :
                  data.soc > 20 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, data.soc))}%` }}
              />
            </div>
            <div className="text-center font-bold text-xl">{data.soc.toFixed(0)}%</div>
          </div>

          <div className="bg-white p-4 rounded-xl border shadow">
            <h3 className="font-medium mb-3">Status</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatusBadge active={data.charging} label="Charging" color="green" />
              <StatusBadge active={data.discharging} label="Discharging" color="orange" />
            </div>
          </div>

          {data.rawData && (
            <div className="bg-white p-4 rounded-xl border shadow">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Raw Data (hex)</h3>
                <button onClick={() => setShowRaw(!showRaw)} className="text-gray-500">
                  {showRaw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {showRaw && (
                <div className="bg-gray-100 p-3 rounded font-mono text-xs break-all">
                  {data.rawData}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  // Settings
  const SettingsView = () => (
    <div className="p-4 space-y-4 pb-20">
      <h2 className="text-lg font-bold">Settings</h2>
      
      <div className="bg-white p-4 rounded-xl border shadow">
        <h3 className="font-medium mb-3">Connection</h3>
        
        {connected ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-green-800">Connected: {device?.name}</div>
              </div>
              <button
                onClick={disconnect}
                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg mb-3">
            <div className="text-gray-600">Not connected</div>
          </div>
        )}
        
        <button
          onClick={scan}
          disabled={scanning || !ble}
          className="w-full flex items-center justify-center space-x-2 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {scanning ? <LoadingSpinner /> : <Search size={16} />}
          <span>{scanning ? 'Scanning...' : 'Scan for BMS Devices'}</span>
        </button>
        
        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-100 p-2 rounded">
            {error}
          </div>
        )}
      </div>

      {devices.length > 0 && (
        <div className="bg-white p-4 rounded-xl border shadow">
          <h3 className="font-medium mb-3">Found Devices ({devices.length})</h3>
          {devices.map(d => <DeviceCard key={d.deviceId} dev={d} />)}
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border shadow">
        <h3 className="font-medium mb-3">Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Bluetooth:</span>
            <span className={btEnabled ? 'text-green-600' : 'text-red-600'}>
              {btEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className={connected ? 'text-green-600' : 'text-red-600'}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
        <h3 className="font-medium text-blue-800 mb-1">JK BMS Reader v3</h3>
        <p className="text-xs text-blue-700">Simplified and optimized version</p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-blue-600 text-white">
        <div className="text-center">
          <LoadingSpinner />
          <h1 className="text-2xl font-bold mt-4 mb-2">JK BMS Reader</h1>
          <p className="text-blue-100">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-5 shadow-lg">
        <h1 className="text-2xl font-bold text-center">JK BMS Reader</h1>
        <p className="text-center text-blue-100 text-sm mt-1"></p>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'dashboard' ? <Dashboard /> : <SettingsView />}
      </div>

      <div className="bg-white border-t shadow-lg">
        <div className="flex">
          <TabBtn id="dashboard" icon={Activity} label="Dashboard" />
          <TabBtn id="settings" icon={Settings} label="Settings" />
        </div>
      </div>
    </div>
  );
};

export default BMSReaderApp;