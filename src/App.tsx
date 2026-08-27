import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Share } from '@capacitor/share';
import { BleClient, type BleService, type ScanResult } from '@capacitor-community/bluetooth-le';
import {
  Activity, AlertTriangle, BatteryMedium, Bluetooth, ChartNoAxesCombined,
  Check, ChevronRight, CircleGauge, CircleHelp, Clock3, Download, ExternalLink, FileText, Gauge, History, Languages,
  LayoutDashboard, LockKeyhole, Radio, RefreshCw, RotateCcw, Save, Search, Settings, Upload,
  ShieldCheck, SlidersHorizontal, Sparkles, Thermometer, Unplug, Zap, type LucideIcon,
} from 'lucide-react';
import {
  JK_SETTING_DEFINITIONS, JkFrameAssembler, buildSettingWrite, parseJkFrame,
  selectJkGattPath, writeJkCommand, writeJkTextCommand, type JkBatteryData, type JkDeviceInfo,
  type JkGattPath, type JkProtocol, type JkSettingDefinition, type JkSettingKey, type JkSettings,
} from './jkBms';
import { APP_VERSION } from './version';
import { useAdMob } from './useAdMob';

interface FoundDevice { name: string; deviceId: string; rssi: number }
interface HistoryPoint { time: number; soc: number; voltage: number; current: number; temperature: number }
interface ChartPoint { time: number; value: number }
type ChartKind = 'soc' | 'voltage' | 'current' | 'temperature';
interface SettingsBackup { savedAt: number; protocol: JkProtocol; device?: string; settings: JkSettings }
interface LowTemperatureChange { protection: number; recovery: number }
type Tab = 'dashboard' | 'cells' | 'history' | 'settings';
type ConnectionState = 'initializing' | 'ready' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'error';
type Language = 'pl' | 'en';

const HISTORY_KEY = 'jk_bms_history_v2';
const BACKUP_KEY = 'jk_bms_settings_backup_v1';
const LANGUAGE_KEY = 'jk_bms_language_v1';
const SETTINGS_PASSWORD_REGISTER = 0x70;
const PRIVACY_URL = 'https://mlynarskimateusz.pl/BMS/Privacy.html';
const TERMS_URL = 'https://mlynarskimateusz.pl/BMS/Terms.html';
const HISTORY_LIMIT = 720;
const CONTROL_SETTING_KEYS = new Set<JkSettingKey>(['chargingEnabled', 'dischargingEnabled']);
const LOW_TEMPERATURE_SETTING_KEYS = new Set<JkSettingKey>(['chargeUnderTemperature', 'chargeUnderTemperatureRecovery']);
const CONTROL_SETTINGS = JK_SETTING_DEFINITIONS.filter((definition) => CONTROL_SETTING_KEYS.has(definition.key));
const LOW_TEMPERATURE_SETTINGS = JK_SETTING_DEFINITIONS.filter((definition) => LOW_TEMPERATURE_SETTING_KEYS.has(definition.key));
const OTHER_SETTINGS = JK_SETTING_DEFINITIONS.filter((definition) => !CONTROL_SETTING_KEYS.has(definition.key) && !LOW_TEMPERATURE_SETTING_KEYS.has(definition.key));
const DEMO_DEVICE: FoundDevice = { name: 'Demo 12V 280Ah', deviceId: 'demo-jk-bms', rssi: -48 };
const DEMO_DEVICE_INFO: JkDeviceInfo = {
  model: 'JK-B2A8S20P', hardwareVersion: 'V11.XW', softwareVersion: 'V11.42', uptimeSeconds: 864000,
  powerOnCount: 47, deviceName: 'Demo 12V 280Ah', bluetoothPassword: '1234', settingsPassword: '123456',
  manufacturingDate: '2025.06.18', serialNumber: 'DEMO0000001',
};
const DEMO_SETTINGS: JkSettings = {
  smartSleepVoltage: 3.2, cellUvp: 2.6, cellUvpr: 2.9, cellOvp: 3.6, cellOvpr: 3.5,
  balanceTriggerDelta: 0.01, soc100Voltage: 3.45, soc0Voltage: 2.8, requestedChargeVoltage: 14.2,
  requestedFloatVoltage: 13.6, powerOffVoltage: 10.4, maxChargeCurrent: 100, maxDischargeCurrent: 150,
  maxBalanceCurrent: 2, chargeOverTemperature: 55, chargeOverTemperatureRecovery: 50,
  dischargeOverTemperature: 65, dischargeOverTemperatureRecovery: 60, chargeUnderTemperature: 0,
  chargeUnderTemperatureRecovery: 5, mosOverTemperature: 80, mosOverTemperatureRecovery: 70,
  cellCount: 4, chargingEnabled: true, dischargingEnabled: true, balancerEnabled: true, capacity: 280,
  balancingStartVoltage: 3.4, shortCircuitDelay: 300,
};
const DEMO_BATTERY: JkBatteryData = {
  voltage: 13.29, current: -8.4, power: -111.64, soc: 78, temperatures: [24.6, 25.1], mosTemperature: 26.2,
  charging: false, discharging: true, balancing: true, balanceCurrent: 0.42, chargeMosEnabled: true,
  dischargeMosEnabled: true, precharging: false, heating: false, remainingCapacity: 218.4, capacity: 280,
  cycles: 47, cycleCapacity: 12140, soh: 99, runtimeSeconds: 864000, cells: [3.321, 3.324, 3.323, 3.322],
  cellResistances: [0.118, 0.121, 0.116, 0.119], minCellVoltage: 3.321, maxCellVoltage: 3.324,
  averageCellVoltage: 3.3225, minVoltageCell: 1, maxVoltageCell: 2, deltaCellVoltage: 0.003,
  errorMask: 0, errors: [], protocol: 'JK02 24S', rawData: '',
};
const DEMO_HISTORY: HistoryPoint[] = Array.from({ length: 60 }, (_, index) => ({
  time: Date.now() - (59 - index) * 10000,
  soc: 79.2 - index * 0.02,
  voltage: 13.34 - index * 0.0008,
  current: -7.8 - Math.sin(index / 6) * 1.1,
  temperature: 24.2 + index * 0.007,
}));
const tr = (language: Language, polish: string, english: string) => language === 'pl' ? polish : english;
const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isJkName = (name: string) => /JK|JIKONG|BMS/i.test(name);
const bytes = (value: DataView) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
const format = (value: number | undefined, digits: number, unit: string, language: Language) => value === undefined || !Number.isFinite(value) ? tr(language, 'Brak danych', 'No data') : `${value.toFixed(digits)} ${unit}`;
const duration = (seconds: number, language: Language) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days} ${tr(language, 'd', 'd')} ${hours} h` : `${hours} h`;
};
const remainingTime = (battery: JkBatteryData, language: Language) => {
  if (battery.current >= 0.05) return tr(language, 'Akumulator jest ładowany', 'Battery is charging');
  const load = Math.abs(battery.current);
  if (load < 0.1) return tr(language, 'Za mały pobór do obliczenia', 'Load is too low to estimate');
  const available = battery.remainingCapacity > 0 ? battery.remainingCapacity : battery.capacity * battery.soc / 100;
  if (!Number.isFinite(available) || available <= 0) return tr(language, 'Brak danych do obliczenia', 'Not enough data to estimate');
  const totalMinutes = Math.max(1, Math.round(available / load * 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (language === 'pl') return `${days ? `${days} dni, ` : ''}${hours ? `${hours} godz., ` : ''}${minutes} min`;
  return `${days ? `${days} d, ` : ''}${hours ? `${hours} h, ` : ''}${minutes} min`;
};
const loadHistory = (): HistoryPoint[] => {
  try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); return Array.isArray(value) ? value.slice(-HISTORY_LIMIT) : []; }
  catch { return []; }
};
const parseBackup = (raw: string): SettingsBackup => {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file.');
  const backup = parsed as Partial<SettingsBackup>;
  if (!backup.settings || typeof backup.settings !== 'object' || !backup.savedAt || (backup.protocol !== 'JK02 24S' && backup.protocol !== 'JK02 32S')) throw new Error('Invalid backup file.');
  for (const definition of JK_SETTING_DEFINITIONS) {
    const value = backup.settings[definition.key];
    const valid = definition.kind === 'switch'
      ? typeof value === 'boolean'
      : typeof value === 'number' && Number.isFinite(value) && value >= definition.min && value <= definition.max;
    if (!valid) throw new Error(`Invalid value for ${definition.key}.`);
  }
  return backup as SettingsBackup;
};
const backupToDraft = (backup: SettingsBackup): Partial<Record<JkSettingKey, number | boolean>> => Object.fromEntries(
  JK_SETTING_DEFINITIONS.map((definition) => [definition.key, backup.settings[definition.key]]),
);

const captureSafeAreaInsets = () => {
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'inset:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top)',
    'padding-bottom:env(safe-area-inset-bottom)',
  ].join(';');
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe);
  const top = Number.parseFloat(computed.paddingTop);
  const bottom = Number.parseFloat(computed.paddingBottom);
  const root = document.documentElement.style;
  if (Number.isFinite(top) && top > 0) root.setProperty('--safe-area-top-static', `${top}px`);
  if (Number.isFinite(bottom) && bottom > 0) root.setProperty('--safe-area-bottom-static', `${bottom}px`);
  probe.remove();
};

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === 'pl' || stored === 'en') return stored;
    return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
  });
  const [tab, setTab] = useState<Tab>('settings');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('initializing');
  const [bluetoothReady, setBluetoothReady] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [notificationsActive, setNotificationsActive] = useState(false);
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [device, setDevice] = useState<FoundDevice | null>(null);
  const [error, setError] = useState('');
  const [battery, setBattery] = useState<JkBatteryData | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<JkDeviceInfo | null>(null);
  const [bmsSettings, setBmsSettings] = useState<JkSettings | null>(null);
  const [lastDataAt, setLastDataAt] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>(loadHistory);
  const [now, setNow] = useState(Date.now());
  const [expertCode, setExpertCode] = useState('');
  const [expertUnlocked, setExpertUnlocked] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<JkSettingKey, number | boolean>>>({});
  const [pendingWrite, setPendingWrite] = useState<JkSettingDefinition | null>(null);
  const [pendingLowTemperature, setPendingLowTemperature] = useState<LowTemperatureChange | null>(null);
  const [writeMessage, setWriteMessage] = useState('');
  const [lowTemperatureMessage, setLowTemperatureMessage] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [unlockMessage, setUnlockMessage] = useState('');
  const [newSettingsCode, setNewSettingsCode] = useState('');
  const [confirmSettingsCode, setConfirmSettingsCode] = useState('');
  const [settingsCodeMessage, setSettingsCodeMessage] = useState('');
  const [changingSettingsCode, setChangingSettingsCode] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [backupAt, setBackupAt] = useState<number | null>(() => {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY) ?? 'null')?.savedAt ?? null; } catch { return null; }
  });
  const adMob = useAdMob((tab === 'dashboard' || tab === 'history') && !pendingWrite && !pendingLowTemperature);

  const mounted = useRef(true);
  const languageRef = useRef(language);
  const connected = useRef(false);
  const activeDevice = useRef<FoundDevice | null>(null);
  const pathRef = useRef<JkGattPath | null>(null);
  const assembler = useRef(new JkFrameAssembler());
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsCodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHistoryAt = useRef(0);
  const lastDataAtRef = useRef<number | null>(null);
  const refreshStartedAt = useRef(0);
  const batteryRef = useRef<JkBatteryData | null>(null);
  const draftRef = useRef<Partial<Record<JkSettingKey, number | boolean>>>({});
  const pendingWriteRef = useRef<JkSettingDefinition | null>(null);
  const pendingLowTemperatureRef = useRef<LowTemperatureChange | null>(null);
  const writingRef = useRef(false);
  const pendingSettingsCodeRef = useRef<string | null>(null);

  useEffect(() => { batteryRef.current = battery; }, [battery]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { pendingWriteRef.current = pendingWrite; }, [pendingWrite]);
  useEffect(() => { writingRef.current = writing; }, [writing]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    captureSafeAreaInsets();
    let orientationTimer: ReturnType<typeof setTimeout> | null = null;
    const onOrientationChange = () => {
      if (orientationTimer) clearTimeout(orientationTimer);
      orientationTimer = setTimeout(captureSafeAreaInsets, 300);
    };
    window.addEventListener('orientationchange', onOrientationChange);
    return () => {
      if (orientationTimer) clearTimeout(orientationTimer);
      window.removeEventListener('orientationchange', onOrientationChange);
    };
  }, []);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const isTextField = (element: Element | null) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
    const onFocusIn = (event: FocusEvent) => { if (isTextField(event.target as Element)) setKeyboardOpen(true); };
    const onFocusOut = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => setKeyboardOpen(isTextField(document.activeElement)), 80);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    const listeners: PluginListenerHandle[] = [];
    const keyboardHidden = () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setKeyboardOpen(false);
      window.requestAnimationFrame(() => {
        captureSafeAreaInsets();
        window.scrollTo(0, 0);
      });
    };
    const registerListeners = async () => {
      if (Capacitor.getPlatform() === 'ios') await Keyboard.setResizeMode({ mode: KeyboardResize.None });
      const willShow = await Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
      const willHide = await Keyboard.addListener('keyboardWillHide', keyboardHidden);
      const didHide = await Keyboard.addListener('keyboardDidHide', keyboardHidden);
      if (cancelled) {
        await Promise.all([willShow.remove(), willHide.remove(), didHide.remove()]);
        return;
      }
      listeners.push(willShow, willHide, didHide);
    };
    void registerListeners().catch(() => {
      setKeyboardOpen(false);
      captureSafeAreaInsets();
    });
    return () => {
      cancelled = true;
      for (const listener of listeners) void listener.remove();
    };
  }, []);
  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language;
    if (!Capacitor.isNativePlatform()) setError(tr(language, 'Połączenie z BMS jest dostępne w aplikacji na telefonie.', 'BMS connection is available in the mobile app.'));
  }, [language]);
  useEffect(() => {
    const timer = setTimeout(() => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* Pamięć może być niedostępna. */ } }, 300);
    return () => clearTimeout(timer);
  }, [history]);

  const clearTimers = useCallback(() => {
    if (scanTimer.current) clearTimeout(scanTimer.current);
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (settingsCodeTimer.current) clearTimeout(settingsCodeTimer.current);
    scanTimer.current = null;
    pollTimer.current = null;
    settingsCodeTimer.current = null;
  }, []);

  const resetConnection = useCallback((message = '') => {
    clearTimers(); connected.current = false; activeDevice.current = null; pathRef.current = null; assembler.current.reset();
    if (!mounted.current) return;
    pendingSettingsCodeRef.current = null; pendingLowTemperatureRef.current = null; lastDataAtRef.current = null; setRefreshing(false); setNotificationsActive(false); setDevice(null); setDemoMode(false); setConnectionState(message ? 'error' : 'disconnected'); setError(message);
    setExpertUnlocked(false); setExpertCode(''); setUnlockMessage(''); setNewSettingsCode(''); setConfirmSettingsCode(''); setSettingsCodeMessage(''); setChangingSettingsCode(false); setLowTemperatureMessage('');
  }, [clearTimers]);

  const addHistoryPoint = useCallback((value: JkBatteryData) => {
    const time = Date.now();
    if (time - lastHistoryAt.current < 10000) return;
    lastHistoryAt.current = time;
    setHistory((current) => [...current, { time, soc: value.soc, voltage: value.voltage, current: value.current, temperature: value.temperatures[0] ?? value.mosTemperature }].slice(-HISTORY_LIMIT));
  }, []);

  const handleNotification = useCallback((value: DataView) => {
    const frames = assembler.current.push(bytes(value));
    for (const frame of frames) {
      try {
        const parsed = parseJkFrame(frame, batteryRef.current?.protocol);
        if (!mounted.current) return;
        if (parsed.type === 'status') {
          const receivedAt = Date.now();
          lastDataAtRef.current = receivedAt; setBattery(parsed.value); setLastDataAt(receivedAt); addHistoryPoint(parsed.value);
          if (refreshStartedAt.current && receivedAt >= refreshStartedAt.current) setRefreshing(false);
        } else if (parsed.type === 'device') {
          setDeviceInfo(parsed.value);
          const pendingSettingsCode = pendingSettingsCodeRef.current;
          if (pendingSettingsCode && parsed.value.settingsPassword === pendingSettingsCode) {
            pendingSettingsCodeRef.current = null;
            if (settingsCodeTimer.current) clearTimeout(settingsCodeTimer.current);
            settingsCodeTimer.current = null;
            setChangingSettingsCode(false); setNewSettingsCode(''); setConfirmSettingsCode('');
            setSettingsCodeMessage(tr(languageRef.current, 'Nowy kod ustawień został zapisany i potwierdzony przez BMS.', 'The new settings code was saved and confirmed by the BMS.'));
          }
        }
        else if (parsed.type === 'settings') {
          setBmsSettings(parsed.value);
          setDraft((current) => Object.keys(current).length ? current : Object.fromEntries(JK_SETTING_DEFINITIONS.map((definition) => [definition.key, parsed.value[definition.key]])));
          const lowTemperatureWrite = pendingLowTemperatureRef.current;
          const activeWrite = pendingWriteRef.current;
          if (writingRef.current && lowTemperatureWrite) {
            const protectionConfirmed = Math.abs(parsed.value.chargeUnderTemperature - lowTemperatureWrite.protection) < 0.05;
            const recoveryConfirmed = Math.abs(parsed.value.chargeUnderTemperatureRecovery - lowTemperatureWrite.recovery) < 0.05;
            if (protectionConfirmed && recoveryConfirmed) {
              writingRef.current = false; pendingLowTemperatureRef.current = null;
              setLowTemperatureMessage(tr(languageRef.current, 'Ochrona ładowania w niskiej temperaturze została zapisana i potwierdzona przez BMS.', 'Low temperature charging protection was saved and confirmed by the BMS.'));
              setWriting(false); setPendingLowTemperature(null);
            }
          } else if (writingRef.current && activeWrite) {
            const received = parsed.value[activeWrite.key];
            const expected = draftRef.current[activeWrite.key];
            if (received === expected || (typeof received === 'number' && typeof expected === 'number' && Math.abs(received - expected) < activeWrite.step / 2 + 0.0001)) {
              writingRef.current = false; pendingWriteRef.current = null;
              setWriteMessage(tr(languageRef.current, 'Zmiana została potwierdzona przez BMS.', 'The change was confirmed by the BMS.')); setWriting(false); setPendingWrite(null);
            }
          }
        }
        setError('');
      } catch (parseError) {
        setError(`${tr(languageRef.current, 'Nie udało się odczytać danych JK', 'Could not read JK data')}: ${toErrorMessage(parseError)}`);
      }
    }
  }, [addHistoryPoint]);

  const initializeBluetooth = useCallback(async () => {
    setConnectionState('initializing'); setError('');
    if (!Capacitor.isNativePlatform()) {
      setConnectionState('error'); setError(tr(languageRef.current, 'Połączenie z BMS jest dostępne w aplikacji na telefonie.', 'BMS connection is available in the mobile app.')); return;
    }
    try {
      await BleClient.initialize(Capacitor.getPlatform() === 'android' ? { androidNeverForLocation: true } : undefined);
      const enabled = await BleClient.isEnabled();
      if (!mounted.current) return;
      setBluetoothReady(true); setBluetoothEnabled(enabled); setConnectionState(enabled ? 'ready' : 'error');
      if (!enabled) setError(tr(languageRef.current, 'Bluetooth jest wyłączony. Włącz go w ustawieniach telefonu.', 'Bluetooth is disabled. Enable it in your phone settings.'));
      await BleClient.startEnabledNotifications((state) => {
        if (!mounted.current) return;
        setBluetoothEnabled(state);
        if (!state) resetConnection(tr(languageRef.current, 'Bluetooth został wyłączony.', 'Bluetooth was turned off.'));
        else if (!connected.current) { setConnectionState('ready'); setError(''); }
      });
    } catch (initError) {
      setBluetoothReady(false); setBluetoothEnabled(false); setConnectionState('error'); setError(`${tr(languageRef.current, 'Nie udało się uruchomić Bluetooth', 'Could not initialize Bluetooth')}: ${toErrorMessage(initError)}`);
    }
  }, [resetConnection]);

  useEffect(() => {
    mounted.current = true; void initializeBluetooth();
    return () => {
      mounted.current = false; clearTimers(); void BleClient.stopLEScan().catch(() => undefined); void BleClient.stopEnabledNotifications().catch(() => undefined);
      const currentDevice = activeDevice.current; const path = pathRef.current;
      if (currentDevice && path) void BleClient.stopNotifications(currentDevice.deviceId, path.service, path.notify).catch(() => undefined);
      if (currentDevice) void BleClient.disconnect(currentDevice.deviceId).catch(() => undefined);
    };
  }, [clearTimers, initializeBluetooth]);

  const stopScan = useCallback(async () => {
    if (scanTimer.current) clearTimeout(scanTimer.current); scanTimer.current = null;
    try { await BleClient.stopLEScan(); } catch { /* Skan mógł zakończyć się wcześniej. */ }
    if (mounted.current && !connected.current) setConnectionState('ready');
  }, []);

  const scan = useCallback(async () => {
    if (connectionState === 'scanning' || connectionState === 'connecting') return;
    setDevices([]); setError('');
    if (!bluetoothReady) { await initializeBluetooth(); return; }
    if (!bluetoothEnabled) {
      if (Capacitor.getPlatform() === 'android') { try { await BleClient.requestEnable(); } catch { setError(tr(languageRef.current, 'Nie udało się włączyć Bluetooth.', 'Could not enable Bluetooth.')); return; } }
      else { setError(tr(languageRef.current, 'Włącz Bluetooth w ustawieniach iPhone.', 'Enable Bluetooth in iPhone settings.')); return; }
    }
    const found = new Map<string, FoundDevice>(); setConnectionState('scanning');
    try {
      await BleClient.requestLEScan({ allowDuplicates: false }, (result: ScanResult) => {
        if (!mounted.current || !result.device.deviceId) return;
        const item = { name: result.device.name || result.localName || tr(languageRef.current, 'Urządzenie bez nazwy', 'Unnamed device'), deviceId: result.device.deviceId, rssi: result.rssi ?? -100 };
        found.set(item.deviceId, item);
        setDevices(Array.from(found.values()).sort((a, b) => Number(isJkName(b.name)) - Number(isJkName(a.name)) || b.rssi - a.rssi));
      });
      scanTimer.current = setTimeout(() => void stopScan().then(() => { if (!found.size) setError(tr(languageRef.current, 'Nie znaleziono urządzeń. Zamknij aplikację JK, obudź BMS i spróbuj ponownie.', 'No devices found. Close the JK app, wake the BMS and try again.')); }), 12000);
    } catch (scanError) { setConnectionState('error'); setError(`${tr(languageRef.current, 'Błąd wyszukiwania', 'Scan error')}: ${toErrorMessage(scanError)}`); }
  }, [bluetoothEnabled, bluetoothReady, connectionState, initializeBluetooth, stopScan]);

  const connect = useCallback(async (selected: FoundDevice) => {
    if (connected.current || connectionState === 'connecting') return;
    setConnectionState('connecting'); setError(''); assembler.current.reset(); lastDataAtRef.current = null;
    try {
      await stopScan();
      await BleClient.connect(selected.deviceId, () => resetConnection(tr(languageRef.current, 'Połączenie z BMS zostało przerwane.', 'The BMS connection was interrupted.')), { timeout: 15000 });
      connected.current = true; activeDevice.current = selected;
      let services: BleService[] = await BleClient.getServices(selected.deviceId);
      if (!services.length) { await BleClient.discoverServices(selected.deviceId); services = await BleClient.getServices(selected.deviceId); }
      const path = selectJkGattPath(services); pathRef.current = path;
      await BleClient.startNotifications(selected.deviceId, path.service, path.notify, handleNotification);
      if (!mounted.current) return;
      setDevice(selected); setNotificationsActive(true); setConnectionState('connected'); setDevices([]); setTab('dashboard');
      await writeJkCommand(BleClient, selected.deviceId, path, 0x97);
      await new Promise((resolve) => setTimeout(resolve, 250));
      await writeJkCommand(BleClient, selected.deviceId, path, 0x96);
      pollTimer.current = setInterval(() => {
        const lastReceived = lastDataAtRef.current;
        if (!lastReceived || Date.now() - lastReceived >= 8000) void writeJkCommand(BleClient, selected.deviceId, path, 0x96).catch(() => undefined);
      }, 5000);
    } catch (connectError) {
      try { await BleClient.disconnect(selected.deviceId); } catch { /* Połączenie mogło nie zostać ustanowione. */ }
      resetConnection(`${tr(languageRef.current, 'Nie udało się połączyć z BMS', 'Could not connect to the BMS')}: ${toErrorMessage(connectError)}`);
    }
  }, [connectionState, handleNotification, resetConnection, stopScan]);

  const enterDemoMode = useCallback(() => {
    clearTimers(); assembler.current.reset(); connected.current = true; activeDevice.current = null; pathRef.current = null;
    const receivedAt = Date.now();
    lastDataAtRef.current = receivedAt; batteryRef.current = DEMO_BATTERY;
    setDemoMode(true); setDevice(DEMO_DEVICE); setBattery(DEMO_BATTERY); setDeviceInfo(DEMO_DEVICE_INFO);
    setBmsSettings(DEMO_SETTINGS); setDraft(Object.fromEntries(JK_SETTING_DEFINITIONS.map((definition) => [definition.key, DEMO_SETTINGS[definition.key]])));
    setLastDataAt(receivedAt); setNotificationsActive(true); setConnectionState('connected'); setExpertUnlocked(true);
    setDevices([]); setError(''); setWriteMessage(''); setTab('dashboard');
  }, [clearTimers]);

  const disconnect = useCallback(async () => {
    const current = activeDevice.current; const path = pathRef.current; clearTimers();
    try { if (current && path) await BleClient.stopNotifications(current.deviceId, path.service, path.notify); } catch { /* Stan zostanie wyczyszczony lokalnie. */ }
    try { if (current) await BleClient.disconnect(current.deviceId); } catch { /* Stan zostanie wyczyszczony lokalnie. */ }
    resetConnection(); setDemoMode(false); setBattery(null); setBmsSettings(null); setDeviceInfo(null); setLastDataAt(null); setExpertUnlocked(false); setExpertCode(''); setUnlockMessage(''); setBackupMessage(''); setDraft({}); setPendingWrite(null); setPendingLowTemperature(null);
  }, [clearTimers, resetConnection]);

  const requestRefresh = useCallback(async () => {
    if (demoMode) {
      const receivedAt = Date.now();
      setRefreshing(true); setLastDataAt(receivedAt); lastDataAtRef.current = receivedAt;
      setTimeout(() => { if (mounted.current) setRefreshing(false); }, 350);
      return;
    }
    const current = activeDevice.current; const path = pathRef.current;
    if (!current || !path || refreshing) return;
    refreshStartedAt.current = Date.now(); setRefreshing(true); setError('');
    try {
      await writeJkCommand(BleClient, current.deviceId, path, 0x97);
      await new Promise((resolve) => setTimeout(resolve, 250));
      await writeJkCommand(BleClient, current.deviceId, path, 0x96);
      setTimeout(() => { if (mounted.current) setRefreshing(false); }, 2500);
    } catch (refreshError) {
      setRefreshing(false); setError(`${tr(language, 'Nie udało się odświeżyć danych', 'Could not refresh data')}: ${toErrorMessage(refreshError)}`);
    }
  }, [demoMode, language, refreshing]);

  const settingsValidation = useMemo(() => {
    const number = (key: JkSettingKey) => Number(draft[key]);
    if (number('cellUvpr') <= number('cellUvp')) return tr(language, 'Napięcie powrotu po rozładowaniu musi być wyższe od progu ochrony.', 'Undervoltage recovery must be higher than the protection threshold.');
    if (number('cellOvpr') >= number('cellOvp')) return tr(language, 'Napięcie powrotu po przeładowaniu musi być niższe od progu ochrony.', 'Overvoltage recovery must be lower than the protection threshold.');
    if (number('chargeUnderTemperature') < 0 || number('chargeUnderTemperature') > 14) return tr(language, 'Minimalna temperatura ładowania musi mieścić się w zakresie od 0°C do 14°C.', 'Minimum charging temperature must be between 0°C and 14°C.');
    if (number('chargeUnderTemperatureRecovery') < 1 || number('chargeUnderTemperatureRecovery') > 15) return tr(language, 'Temperatura powrotu ładowania musi mieścić się w zakresie od 1°C do 15°C.', 'Low temperature charging recovery must be between 1°C and 15°C.');
    if (number('chargeUnderTemperatureRecovery') <= number('chargeUnderTemperature')) return tr(language, 'Temperatura powrotu ładowania musi być wyższa od progu minimalnego.', 'Low temperature charging recovery must be higher than the protection threshold.');
    if (number('chargeOverTemperatureRecovery') >= number('chargeOverTemperature')) return tr(language, 'Temperatura powrotu ładowania musi być niższa od progu maksymalnego.', 'High temperature charging recovery must be lower than the protection threshold.');
    return '';
  }, [draft, language]);

  const confirmWrite = useCallback(async () => {
    if (demoMode || !pendingWrite || !battery || !bmsSettings) return;
    const current = activeDevice.current; const path = pathRef.current; const newValue = draft[pendingWrite.key];
    if (!current || !path || newValue === undefined) return;
    try {
      writingRef.current = true; setWriting(true); setWriteMessage(tr(language, 'Zapisywanie i oczekiwanie na potwierdzenie BMS', 'Saving and waiting for BMS confirmation'));
      const command = buildSettingWrite(pendingWrite, newValue, battery.protocol);
      await writeJkCommand(BleClient, current.deviceId, path, command.register, command.value, command.length);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await writeJkCommand(BleClient, current.deviceId, path, 0x96);
      setTimeout(() => { if (mounted.current && writingRef.current) { writingRef.current = false; setWriting(false); setWriteMessage(tr(language, 'BMS nie potwierdził jeszcze zmiany. Odśwież ustawienia i sprawdź wartość.', 'The BMS has not confirmed the change yet. Refresh settings and verify the value.')); } }, 6000);
    } catch (writeError) { writingRef.current = false; setWriting(false); setWriteMessage(`${tr(language, 'Zapis nie powiódł się', 'Save failed')}: ${toErrorMessage(writeError)}`); }
  }, [battery, bmsSettings, demoMode, draft, language, pendingWrite]);

  const requestLowTemperatureChange = useCallback(() => {
    if (demoMode) return;
    const protection = Number(draftRef.current.chargeUnderTemperature);
    const recovery = Number(draftRef.current.chargeUnderTemperatureRecovery);
    if (!Number.isFinite(protection) || protection < 0 || protection > 14 || !Number.isFinite(recovery) || recovery < 1 || recovery > 15 || recovery <= protection) {
      setLowTemperatureMessage(tr(language, 'Sprawdź zakres temperatur. Próg ochrony musi wynosić od 0°C do 14°C, a powrót od 1°C do 15°C i musi być wyższy od progu ochrony.', 'Check the temperature range. The protection threshold must be between 0°C and 14°C, and recovery between 1°C and 15°C and higher than the protection threshold.'));
      return;
    }
    setLowTemperatureMessage('');
    setPendingLowTemperature({ protection, recovery });
  }, [demoMode, language]);

  const confirmLowTemperatureChange = useCallback(async () => {
    if (demoMode || !pendingLowTemperature || !battery || !bmsSettings) return;
    const current = activeDevice.current; const path = pathRef.current;
    const protectionDefinition = LOW_TEMPERATURE_SETTINGS.find((definition) => definition.key === 'chargeUnderTemperature');
    const recoveryDefinition = LOW_TEMPERATURE_SETTINGS.find((definition) => definition.key === 'chargeUnderTemperatureRecovery');
    if (!current || !path || !protectionDefinition || !recoveryDefinition) return;
    try {
      pendingLowTemperatureRef.current = pendingLowTemperature; writingRef.current = true; setWriting(true);
      setLowTemperatureMessage(tr(language, 'Zapisywanie obu progów temperatury i oczekiwanie na potwierdzenie BMS.', 'Saving both temperature thresholds and waiting for BMS confirmation.'));
      const protectionCommand = buildSettingWrite(protectionDefinition, pendingLowTemperature.protection, battery.protocol);
      const recoveryCommand = buildSettingWrite(recoveryDefinition, pendingLowTemperature.recovery, battery.protocol);
      const writeProtection = () => writeJkCommand(BleClient, current.deviceId, path, protectionCommand.register, protectionCommand.value, protectionCommand.length);
      const writeRecovery = () => writeJkCommand(BleClient, current.deviceId, path, recoveryCommand.register, recoveryCommand.value, recoveryCommand.length);
      if (pendingLowTemperature.protection >= bmsSettings.chargeUnderTemperatureRecovery) {
        await writeRecovery();
        await new Promise((resolve) => setTimeout(resolve, 350));
        await writeProtection();
      } else {
        await writeProtection();
        await new Promise((resolve) => setTimeout(resolve, 350));
        await writeRecovery();
      }
      setDraft((currentDraft) => ({ ...currentDraft, chargeUnderTemperature: pendingLowTemperature.protection, chargeUnderTemperatureRecovery: pendingLowTemperature.recovery }));
      setPendingLowTemperature(null);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await writeJkCommand(BleClient, current.deviceId, path, 0x96);
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (pendingLowTemperatureRef.current) await writeJkCommand(BleClient, current.deviceId, path, 0x96);
      setTimeout(() => {
        if (mounted.current && writingRef.current && pendingLowTemperatureRef.current) {
          writingRef.current = false; pendingLowTemperatureRef.current = null; setWriting(false);
          setLowTemperatureMessage(tr(language, 'BMS nie potwierdził obu progów temperatury. Odśwież ustawienia i sprawdź wartości.', 'The BMS did not confirm both temperature thresholds. Refresh settings and verify the values.'));
        }
      }, 6000);
    } catch (writeError) {
      writingRef.current = false; pendingLowTemperatureRef.current = null; setWriting(false); setPendingLowTemperature(null);
      setLowTemperatureMessage(`${tr(language, 'Zapis progów temperatury nie powiódł się', 'Saving the temperature thresholds failed')}: ${toErrorMessage(writeError)}`);
    }
  }, [battery, bmsSettings, demoMode, language, pendingLowTemperature]);

  const unlockSettings = useCallback(() => {
    const actualCode = deviceInfo?.settingsPassword;
    if (!actualCode) {
      setUnlockMessage(tr(language, 'Nie udało się odczytać kodu ustawień z BMS. Odśwież dane i spróbuj ponownie.', 'The settings code could not be read from the BMS. Refresh the data and try again.'));
      return;
    }
    if (expertCode === actualCode) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (Capacitor.isNativePlatform()) void Keyboard.hide();
      else setKeyboardOpen(false);
      setExpertUnlocked(true); setExpertCode('');
      setUnlockMessage('');
      return;
    }
    setUnlockMessage(tr(language, 'Kod nie zgadza się z kodem ustawień zapisanym w BMS.', 'The code does not match the settings code stored in the BMS.'));
  }, [deviceInfo, expertCode, language]);

  const updateExpertCode = useCallback((value: string) => {
    const normalized = value.replace(/\D/g, '').slice(0, 6);
    setExpertCode(normalized); setUnlockMessage('');
  }, []);

  const changeSettingsCode = useCallback(async () => {
    if (!/^\d{6}$/.test(newSettingsCode)) {
      setSettingsCodeMessage(tr(language, 'Nowy kod musi zawierać dokładnie 6 cyfr.', 'The new code must contain exactly 6 digits.'));
      return;
    }
    if (newSettingsCode !== confirmSettingsCode) {
      setSettingsCodeMessage(tr(language, 'Wpisane nowe kody nie są identyczne.', 'The new codes do not match.'));
      return;
    }
    if (newSettingsCode === deviceInfo?.settingsPassword) {
      setSettingsCodeMessage(tr(language, 'Nowy kod jest taki sam jak obecny kod BMS.', 'The new code is the same as the current BMS code.'));
      return;
    }
    const current = activeDevice.current; const path = pathRef.current;
    if (!current || !path || !connected.current || demoMode) return;
    setChangingSettingsCode(true); setSettingsCodeMessage(tr(language, 'Zapisywanie kodu i oczekiwanie na potwierdzenie BMS.', 'Saving the code and waiting for BMS confirmation.'));
    pendingSettingsCodeRef.current = newSettingsCode;
    try {
      await writeJkTextCommand(BleClient, current.deviceId, path, SETTINGS_PASSWORD_REGISTER, newSettingsCode);
      await new Promise((resolve) => setTimeout(resolve, 700));
      await writeJkCommand(BleClient, current.deviceId, path, 0x97);
      settingsCodeTimer.current = setTimeout(() => {
        if (!mounted.current || !pendingSettingsCodeRef.current) return;
        pendingSettingsCodeRef.current = null; setChangingSettingsCode(false);
        setSettingsCodeMessage(tr(languageRef.current, 'BMS nie potwierdził zmiany kodu. Poprzedni kod może nadal obowiązywać.', 'The BMS did not confirm the code change. The previous code may still be active.'));
      }, 6000);
    } catch (changeError) {
      pendingSettingsCodeRef.current = null; setChangingSettingsCode(false);
      setSettingsCodeMessage(`${tr(language, 'Nie udało się zmienić kodu ustawień', 'The settings code could not be changed')}: ${toErrorMessage(changeError)}`);
    }
  }, [confirmSettingsCode, demoMode, deviceInfo, language, newSettingsCode]);

  const makeBackup = useCallback((): SettingsBackup | null => {
    if (!bmsSettings || !battery) return null;
    return { savedAt: Date.now(), protocol: battery.protocol, device: deviceInfo?.model || device?.name, settings: bmsSettings };
  }, [battery, bmsSettings, device, deviceInfo]);

  const saveBackup = useCallback(() => {
    const backup = makeBackup();
    if (!backup) {
      setBackupMessage(tr(language, 'Najpierw połącz się z BMS i poczekaj na odczyt ustawień.', 'Connect to the BMS and wait for settings to be read first.'));
      return;
    }
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup)); setBackupAt(backup.savedAt);
      setBackupMessage(tr(language, 'Kopia została zapisana lokalnie na tym telefonie.', 'The backup was saved locally on this phone.'));
    } catch {
      setBackupMessage(tr(language, 'Nie udało się zapisać lokalnej kopii.', 'The local backup could not be saved.'));
    }
  }, [language, makeBackup]);

  const exportBackup = useCallback(async () => {
    const backup = makeBackup();
    if (!backup) {
      setBackupMessage(tr(language, 'Najpierw połącz się z BMS i poczekaj na odczyt ustawień.', 'Connect to the BMS and wait for settings to be read first.'));
      return;
    }
    setBackupBusy(true); setBackupMessage(tr(language, 'Przygotowywanie pliku JSON', 'Preparing the JSON file'));
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup)); setBackupAt(backup.savedAt);
      const timestamp = new Date(backup.savedAt).toISOString().replace(/[:.]/g, '').slice(0, 15);
      const fileName = `bms-monitor-settings-${timestamp}.json`;
      const content = JSON.stringify(backup, null, 2);
      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.writeFile({ path: fileName, data: content, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
        await Share.share({ title: 'BMS Monitor settings backup', text: tr(language, 'Kopia ustawień BMS', 'BMS settings backup'), url: file.uri, dialogTitle: tr(language, 'Zapisz lub udostępnij kopię', 'Save or share the backup') });
      } else {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url);
      }
      setBackupMessage(tr(language, 'Plik JSON został utworzony. Na iPhonie wybierz Zachowaj w Plikach.', 'The JSON file was created. On iPhone, choose Save to Files.'));
    } catch (exportError) {
      setBackupMessage(`${tr(language, 'Nie udało się wyeksportować kopii', 'The backup could not be exported')}: ${toErrorMessage(exportError)}`);
    } finally {
      setBackupBusy(false);
    }
  }, [language, makeBackup]);

  const applyBackup = useCallback((backup: SettingsBackup, source: 'local' | 'file') => {
    if (!battery) {
      setBackupMessage(tr(language, 'Połącz się z BMS przed wczytaniem kopii.', 'Connect to the BMS before loading a backup.'));
      return;
    }
    if (backup.protocol !== battery.protocol) {
      setBackupMessage(tr(language, 'Kopia pochodzi z innej wersji protokołu JK i nie została wczytana.', 'The backup uses a different JK protocol version and was not loaded.'));
      return;
    }
    setDraft(backupToDraft(backup));
    setBackupMessage(source === 'local'
      ? tr(language, 'Lokalna kopia została wczytana do edytora. Odblokuj ustawienia, aby ją sprawdzić. Nic nie zostało jeszcze wysłane do BMS.', 'The local backup was loaded into the editor. Unlock settings to review it. Nothing has been sent to the BMS yet.')
      : tr(language, 'Plik został zaimportowany do edytora. Odblokuj ustawienia, aby go sprawdzić. Nic nie zostało jeszcze wysłane do BMS.', 'The file was imported into the editor. Unlock settings to review it. Nothing has been sent to the BMS yet.'));
  }, [battery, language]);

  const loadStoredBackup = useCallback(() => {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (!raw) { setBackupMessage(tr(language, 'Brak lokalnej kopii ustawień.', 'No local settings backup was found.')); return; }
      applyBackup(parseBackup(raw), 'local');
    } catch {
      setBackupMessage(tr(language, 'Lokalna kopia jest uszkodzona i nie może zostać wczytana.', 'The local backup is damaged and cannot be loaded.'));
    }
  }, [applyBackup, language]);

  const importBackup = useCallback(async (file: File) => {
    setBackupBusy(true); setBackupMessage(tr(language, 'Wczytywanie wybranego pliku', 'Loading the selected file'));
    try { applyBackup(parseBackup(await file.text()), 'file'); }
    catch { setBackupMessage(tr(language, 'Wybrany plik nie jest prawidłową kopią ustawień tej aplikacji.', 'The selected file is not a valid settings backup for this app.')); }
    finally { setBackupBusy(false); }
  }, [applyBackup, language]);

  const freshness = lastDataAt ? now - lastDataAt : Number.POSITIVE_INFINITY;
  const freshLabel = demoMode ? tr(language, 'Dane demonstracyjne', 'Demo data') : freshness < 10000 ? tr(language, 'Dane aktualne', 'Data up to date') : lastDataAt ? tr(language, 'Dane nieaktualne', 'Data out of date') : tr(language, 'Oczekiwanie na dane', 'Waiting for data');
  const stateLabel = demoMode ? tr(language, 'Tryb demo', 'Demo mode') : connectionState === 'connected' ? tr(language, 'Połączono', 'Connected') : connectionState === 'connecting' ? tr(language, 'Łączenie', 'Connecting') : connectionState === 'scanning' ? tr(language, 'Wyszukiwanie', 'Scanning') : connectionState === 'initializing' ? tr(language, 'Uruchamianie', 'Starting') : connectionState === 'error' ? tr(language, 'Wymaga uwagi', 'Needs attention') : tr(language, 'Nie połączono', 'Disconnected');

  return (
    <div className="app-shell bg-[#f4f6f8] text-slate-950">
      <header className="safe-top shrink-0 border-b border-slate-200/80 bg-white/95 px-4 pb-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">BMS MONITOR</p>
            <h1 className="truncate text-lg font-semibold">{deviceInfo?.deviceName || device?.name || tr(language, 'Monitor baterii', 'Battery monitor')}</h1>
          </div>
          <button disabled={refreshing} onClick={() => connected.current ? void requestRefresh() : setTab('settings')} className="flex h-10 min-w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm disabled:opacity-60" aria-label={tr(language, 'Odśwież lub połącz', 'Refresh or connect')}>
            {connectionState === 'connecting' || connectionState === 'scanning' || refreshing ? <RefreshCw className="animate-spin" size={18} /> : connected.current ? <RefreshCw size={18} /> : <Bluetooth size={19} />}
          </button>
        </div>
        <div className="mx-auto mt-2 flex h-6 max-w-3xl items-center gap-2 text-xs text-slate-500">
          <span className={`h-2 w-2 shrink-0 rounded-full ${connected.current ? 'bg-emerald-500' : connectionState === 'error' ? 'bg-amber-500' : 'bg-slate-300'}`} />
          <span className="w-24 shrink-0 font-medium text-slate-700">{stateLabel}</span>
          <span className="truncate">{connected.current ? demoMode ? freshLabel : `${refreshing ? tr(language, 'Odświeżanie', 'Refreshing') : freshLabel}  •  ${device?.rssi ?? 0} dBm` : tr(language, 'Wybierz urządzenie w ustawieniach', 'Choose a device in Settings')}</span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl px-4 py-4 pb-8">
          {error && <Notice tone="warning" text={error} />}
          {tab === 'dashboard' && <Dashboard battery={battery} connected={connected.current} onConnect={() => setTab('settings')} freshness={freshness} language={language} />}
          {tab === 'cells' && <CellsView battery={battery} language={language} />}
          {tab === 'history' && <HistoryView history={demoMode ? DEMO_HISTORY : history} onClear={() => { if (!demoMode) setHistory([]); }} language={language} />}
          {tab === 'settings' && (
            <SettingsView
              bluetoothReady={bluetoothReady} bluetoothEnabled={bluetoothEnabled} connectionState={connectionState}
              notificationsActive={notificationsActive} devices={devices} device={device} battery={battery}
              deviceInfo={deviceInfo} bmsSettings={bmsSettings} draft={draft} expertCode={expertCode}
              expertUnlocked={expertUnlocked} backupAt={backupAt} validation={settingsValidation}
              writeMessage={writeMessage} lowTemperatureMessage={lowTemperatureMessage} backupMessage={backupMessage} unlockMessage={unlockMessage} backupBusy={backupBusy}
              newSettingsCode={newSettingsCode} confirmSettingsCode={confirmSettingsCode} settingsCodeMessage={settingsCodeMessage}
              changingSettingsCode={changingSettingsCode} writing={writing} refreshing={refreshing} language={language} demoMode={demoMode}
              onLanguage={setLanguage} onDemo={enterDemoMode}
              onScan={() => void scan()} onConnect={(item) => void connect(item)} onDisconnect={() => void disconnect()}
              onRefresh={() => void requestRefresh()} onCode={updateExpertCode} onUnlock={() => unlockSettings()}
              onNewSettingsCode={(value) => { setNewSettingsCode(value.replace(/\D/g, '').slice(0, 6)); setSettingsCodeMessage(''); }}
              onConfirmSettingsCode={(value) => { setConfirmSettingsCode(value.replace(/\D/g, '').slice(0, 6)); setSettingsCodeMessage(''); }}
              onChangeSettingsCode={() => void changeSettingsCode()}
              onDraft={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
              onRequestWrite={setPendingWrite} onSaveBackup={saveBackup} onExportBackup={() => void exportBackup()}
              onLowTemperatureChange={requestLowTemperatureChange}
              onLoadBackup={loadStoredBackup} onImportBackup={(file) => void importBackup(file)}
              adState={adMob.state} adBannerState={adMob.bannerState} adError={adMob.errorMessage}
              adTestMode={adMob.testMode} adPrivacyAvailable={adMob.privacyOptionsRequired}
              onAdPrivacy={() => void adMob.showPrivacyOptions()}
            />
          )}
        </div>
      </main>

      <nav className={`safe-bottom shrink-0 border-t border-slate-200 bg-white/95 px-2 pt-1 backdrop-blur transition-opacity ${keyboardOpen ? 'pointer-events-none invisible opacity-0' : 'opacity-100'}`}>
        <div className="mx-auto flex max-w-3xl">
          <TabButton id="dashboard" label={tr(language, 'Pulpit', 'Dashboard')} icon={LayoutDashboard} active={tab === 'dashboard'} onSelect={setTab} />
          <TabButton id="cells" label={tr(language, 'Ogniwa', 'Cells')} icon={BatteryMedium} active={tab === 'cells'} onSelect={setTab} />
          <TabButton id="history" label={tr(language, 'Historia', 'History')} icon={History} active={tab === 'history'} onSelect={setTab} />
          <TabButton id="settings" label={tr(language, 'Ustawienia', 'Settings')} icon={Settings} active={tab === 'settings'} onSelect={setTab} />
        </div>
      </nav>

      {pendingWrite && (
        <ConfirmSheet definition={pendingWrite} oldValue={bmsSettings?.[pendingWrite.key]} newValue={draft[pendingWrite.key]} validation={settingsValidation} writing={writing} language={language}
          onCancel={() => { if (!writing) setPendingWrite(null); }} onConfirm={() => void confirmWrite()} />
      )}
      {pendingLowTemperature && bmsSettings && (
        <LowTemperatureConfirmSheet change={pendingLowTemperature} currentProtection={bmsSettings.chargeUnderTemperature} currentRecovery={bmsSettings.chargeUnderTemperatureRecovery}
          writing={writing} language={language} onCancel={() => { if (!writing) setPendingLowTemperature(null); }} onConfirm={() => void confirmLowTemperatureChange()} />
      )}
    </div>
  );
}

function Dashboard({ battery, connected, onConnect, freshness, language }: { battery: JkBatteryData | null; connected: boolean; onConnect: () => void; freshness: number; language: Language }) {
  if (!connected) return <EmptyState icon={Bluetooth} title={tr(language, 'Połącz z BMS', 'Connect to BMS')} text={tr(language, 'Wyszukaj moduł Bluetooth akumulatora, aby zobaczyć bieżące parametry.', 'Find the battery Bluetooth module to view live data.')} action={tr(language, 'Przejdź do połączenia', 'Open connection')} onAction={onConnect} />;
  if (!battery) return <div className="space-y-4"><SkeletonCard height="h-48" /><div className="grid grid-cols-3 gap-2"><SkeletonCard height="h-24" /><SkeletonCard height="h-24" /><SkeletonCard height="h-24" /></div><Notice tone="info" text={tr(language, 'Połączono. Oczekiwanie na pierwszy odczyt BMS.', 'Connected. Waiting for the first BMS reading.')} /></div>;
  const soc = Math.max(0, Math.min(100, battery.soc));
  const flowCurrent = battery.current;
  const flowPower = battery.power;
  const isCharging = flowCurrent > 0.05;
  const isDischarging = flowCurrent < -0.05;
  return <div className="space-y-4">
    {freshness >= 10000 && <Notice tone="warning" text={tr(language, 'Połączenie jest aktywne, ale dane nie zostały ostatnio odświeżone.', 'The connection is active, but data has not been refreshed recently.')} />}
    {battery.errors.length > 0 && <Notice tone="danger" text={`${tr(language, 'Alarm BMS', 'BMS alarm')}: ${battery.errors.join(', ')}`} />}
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-500">{tr(language, 'Stan naładowania', 'State of charge')}</p><p className="mt-1 text-5xl font-semibold tracking-tight">{soc.toFixed(0)}<span className="text-2xl text-slate-400">%</span></p></div><div className="relative grid h-24 w-24 place-items-center rounded-full" style={{ background: `conic-gradient(#0f766e ${soc * 3.6}deg, #e2e8f0 0deg)` }}><div className="grid h-16 w-16 place-items-center rounded-full bg-white"><BatteryMedium className="text-teal-700" size={28} /></div></div></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-700 transition-[width] duration-500" style={{ width: `${soc}%` }} /></div>
      <div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">{tr(language, 'Pozostało', 'Remaining')}</span><strong>{battery.remainingCapacity.toFixed(1)} {tr(language, 'z', 'of')} {battery.capacity.toFixed(1)} Ah</strong></div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900"><Clock3 size={20} className="shrink-0" /><div className="min-w-0"><p className="text-xs font-medium text-teal-700">{tr(language, 'Szacowany czas przy obecnym poborze', 'Estimated time at current load')}</p><p className="mt-0.5 font-semibold">{remainingTime(battery, language)}</p></div></div>
    </section>
    <div className="grid grid-cols-2 gap-2">
      <Metric icon={Gauge} label={tr(language, 'Napięcie', 'Voltage')} value={format(battery.voltage, 2, 'V', language)} />
      <Metric icon={Activity} label={tr(language, 'Ładowanie', 'Charging')} value={`${isCharging ? '+' : ''}${(isCharging ? flowCurrent : 0).toFixed(2)} A`} />
      <Metric icon={CircleGauge} label={tr(language, 'Pobór', 'Load')} value={`${isDischarging ? flowCurrent.toFixed(2) : '0.00'} A`} />
      <Metric icon={Zap} label={tr(language, 'Moc', 'Power')} value={format(flowPower, 0, 'W', language)} />
    </div>
    <section className="card">
      <SectionTitle title={tr(language, 'Temperatury', 'Temperatures')} icon={Thermometer} />
      <div className="mt-4 grid grid-cols-3 gap-2"><MiniValue label={tr(language, 'Czujnik 1', 'Sensor 1')} value={format(battery.temperatures[0], 1, '°C', language)} /><MiniValue label={tr(language, 'Czujnik 2', 'Sensor 2')} value={format(battery.temperatures[1], 1, '°C', language)} /><MiniValue label="MOS" value={format(battery.mosTemperature, 1, '°C', language)} /></div>
    </section>
    <section className="card">
      <SectionTitle title={tr(language, 'Przepływ energii', 'Energy flow')} icon={CircleGauge} />
      <div className="mt-4 grid grid-cols-2 gap-3"><StatePill label={tr(language, 'Ładowanie', 'Charging')} active={isCharging} detail={isCharging ? `+${Math.abs(flowCurrent).toFixed(2)} A` : '0.00 A'} /><StatePill label={tr(language, 'Pobór', 'Load')} active={isDischarging} detail={isDischarging ? `${flowCurrent.toFixed(2)} A` : '0.00 A'} /><StatePill label={tr(language, 'Balansowanie', 'Balancing')} active={battery.balancing} detail={`${Math.abs(battery.balanceCurrent).toFixed(2)} A`} /><StatePill label={tr(language, 'Podgrzewanie', 'Heating')} active={battery.heating} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4"><MiniValue label={tr(language, 'Kondycja', 'Health')} value={`${battery.soh}%`} /><MiniValue label={tr(language, 'Cykle', 'Cycles')} value={`${battery.cycles}`} /><MiniValue label={tr(language, 'Czas pracy BMS', 'BMS runtime')} value={duration(battery.runtimeSeconds, language)} /></div>
    </section>
  </div>;
}

function CellsView({ battery, language }: { battery: JkBatteryData | null; language: Language }) {
  if (!battery) return <EmptyState icon={BatteryMedium} title={tr(language, 'Brak danych ogniw', 'No cell data')} text={tr(language, 'Połącz z BMS i poczekaj na pierwszy odczyt.', 'Connect to the BMS and wait for the first reading.')} />;
  const range = Math.max(0.01, battery.maxCellVoltage - battery.minCellVoltage);
  return <div className="space-y-4">
    <section className="card"><SectionTitle title={`${battery.cells.length} ${tr(language, 'aktywne ogniwa', 'active cells')}`} icon={BatteryMedium} /><div className="mt-4 grid grid-cols-3 gap-2"><MiniValue label={tr(language, 'Minimum', 'Minimum')} value={`${battery.minCellVoltage.toFixed(3)} V`} /><MiniValue label={tr(language, 'Średnia', 'Average')} value={`${battery.averageCellVoltage.toFixed(3)} V`} /><MiniValue label={tr(language, 'Maksimum', 'Maximum')} value={`${battery.maxCellVoltage.toFixed(3)} V`} /></div><div className={`mt-4 rounded-xl px-3 py-2 text-center text-sm font-semibold ${battery.deltaCellVoltage <= 0.015 ? 'bg-emerald-50 text-emerald-700' : battery.deltaCellVoltage <= 0.04 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{tr(language, 'Różnica', 'Difference')} {(battery.deltaCellVoltage * 1000).toFixed(0)} mV</div></section>
    <section className="card space-y-3">
      {battery.cells.map((voltage, index) => {
        const isMin = index + 1 === battery.minVoltageCell; const isMax = index + 1 === battery.maxVoltageCell;
        const width = 24 + ((voltage - battery.minCellVoltage) / range) * 76;
        return <div key={index} className="grid grid-cols-[42px_1fr_70px] items-center gap-3"><span className="text-sm font-semibold text-slate-500">{index + 1}</span><div className="h-7 overflow-hidden rounded-lg bg-slate-100"><div aria-label={isMin ? tr(language, 'Najniższe napięcie', 'Lowest voltage') : isMax ? tr(language, 'Najwyższe napięcie', 'Highest voltage') : undefined} className={`h-full rounded-lg ${isMin ? 'bg-amber-300' : isMax ? 'bg-teal-700' : 'bg-teal-100'}`} style={{ width: `${width}%` }} /></div><div className="text-right"><strong className="text-sm">{voltage.toFixed(3)} V</strong><p className="text-[10px] text-slate-400">{battery.cellResistances[index]?.toFixed(3) ?? '0.000'} Ω</p></div></div>;
      })}
    </section>
  </div>;
}

function HistoryView({ history, onClear, language }: { history: HistoryPoint[]; onClear: () => void; language: Language }) {
  const recent = history.slice(-180);
  if (!recent.length) return <EmptyState icon={History} title={tr(language, 'Historia jest pusta', 'History is empty')} text={tr(language, 'Po połączeniu aplikacja zapisuje lokalnie próbkę co dziesięć sekund.', 'Once connected, the app stores a local sample every ten seconds.')} />;
  return <div className="space-y-4">
    <section className="card"><div className="flex items-center justify-between"><SectionTitle title={tr(language, 'Historia lokalna', 'Local history')} icon={ChartNoAxesCombined} /><button onClick={onClear} className="text-xs font-semibold text-rose-600">{tr(language, 'Wyczyść', 'Clear')}</button></div><p className="mt-2 text-xs text-slate-500">{new Date(recent[0].time).toLocaleString(language)}  •  {recent.length} {tr(language, 'próbek', 'samples')}</p></section>
    <ChartCard label={tr(language, 'Poziom energii', 'State of charge')} unit="%" color="#0f766e" kind="soc" points={recent.map((item) => ({ time: item.time, value: item.soc }))} language={language} />
    <ChartCard label={tr(language, 'Napięcie', 'Voltage')} unit="V" color="#2563eb" kind="voltage" points={recent.map((item) => ({ time: item.time, value: item.voltage }))} language={language} />
    <ChartCard label={tr(language, 'Prąd', 'Current')} unit="A" color="#ea580c" kind="current" points={recent.map((item) => ({ time: item.time, value: item.current }))} language={language} />
    <ChartCard label={tr(language, 'Temperatura', 'Temperature')} unit="°C" color="#dc2626" kind="temperature" points={recent.map((item) => ({ time: item.time, value: item.temperature }))} language={language} />
  </div>;
}

const SETTING_LABELS_EN: Record<JkSettingKey, string> = {
  cellUvp: 'Cell undervoltage protection',
  cellUvpr: 'Cell undervoltage recovery',
  cellOvp: 'Cell overvoltage protection',
  cellOvpr: 'Cell overvoltage recovery',
  balanceTriggerDelta: 'Balancing trigger difference',
  balancingStartVoltage: 'Balancing start voltage',
  maxChargeCurrent: 'Maximum charging current',
  maxDischargeCurrent: 'Maximum discharge current',
  maxBalanceCurrent: 'Maximum balancing current',
  chargeOverTemperature: 'Maximum charging temperature',
  chargeOverTemperatureRecovery: 'High charging temperature recovery',
  chargeUnderTemperature: 'Minimum charging temperature',
  chargeUnderTemperatureRecovery: 'Low charging temperature recovery',
  capacity: 'Rated capacity',
  chargingEnabled: 'Charging',
  dischargingEnabled: 'Discharging',
  balancerEnabled: 'Balancing',
};
const settingLabel = (definition: JkSettingDefinition, language: Language) => language === 'pl' ? definition.label : SETTING_LABELS_EN[definition.key];

function SettingsView(props: {
  bluetoothReady: boolean; bluetoothEnabled: boolean; connectionState: ConnectionState; notificationsActive: boolean;
  devices: FoundDevice[]; device: FoundDevice | null; battery: JkBatteryData | null; deviceInfo: JkDeviceInfo | null;
  bmsSettings: JkSettings | null; draft: Partial<Record<JkSettingKey, number | boolean>>; expertCode: string;
  expertUnlocked: boolean; backupAt: number | null; validation: string; writeMessage: string; lowTemperatureMessage: string; backupMessage: string; unlockMessage: string;
  newSettingsCode: string; confirmSettingsCode: string; settingsCodeMessage: string; changingSettingsCode: boolean;
  backupBusy: boolean; writing: boolean; refreshing: boolean; language: Language; demoMode: boolean;
  onScan: () => void; onConnect: (device: FoundDevice) => void; onDisconnect: () => void; onRefresh: () => void;
  onCode: (value: string) => void; onUnlock: () => void; onDraft: (key: JkSettingKey, value: number | boolean) => void;
  onNewSettingsCode: (value: string) => void; onConfirmSettingsCode: (value: string) => void; onChangeSettingsCode: () => void;
  onRequestWrite: (definition: JkSettingDefinition) => void; onSaveBackup: () => void; onExportBackup: () => void;
  onLowTemperatureChange: () => void;
  onLoadBackup: () => void; onImportBackup: (file: File) => void; onLanguage: (language: Language) => void; onDemo: () => void;
  adState: 'unavailable' | 'initializing' | 'ready' | 'limited' | 'error'; adBannerState: 'hidden' | 'loading' | 'visible' | 'failed';
  adError: string; adTestMode: boolean; adPrivacyAvailable: boolean; onAdPrivacy: () => void;
}) {
  const isConnected = props.connectionState === 'connected';
  const [showSettingsCodeChange, setShowSettingsCodeChange] = useState(false);
  useEffect(() => { if (!props.expertUnlocked) setShowSettingsCodeChange(false); }, [props.expertUnlocked]);
  return <div className="space-y-4">
    {props.demoMode && <Notice tone="info" text={tr(props.language, 'Tryb demonstracyjny używa przykładowych danych. Żadne polecenia nie są wysyłane do BMS, a edycja ustawień jest zablokowana.', 'Demo mode uses sample data. No commands are sent to a BMS and settings editing is locked.')} />}
    <section className="card"><SectionTitle title={tr(props.language, 'Język', 'Language')} icon={Languages} />
      <div className="mt-4 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
        <button onClick={() => props.onLanguage('pl')} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${props.language === 'pl' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>Polski</button>
        <button onClick={() => props.onLanguage('en')} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${props.language === 'en' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>English</button>
      </div>
    </section>
    <section className="card"><SectionTitle title={tr(props.language, 'Połączenie', 'Connection')} icon={Bluetooth} />
      <div className="mt-4 grid grid-cols-2 gap-2"><Diagnostic label="Bluetooth" ok={props.bluetoothReady && props.bluetoothEnabled} value={props.bluetoothEnabled ? tr(props.language, 'Włączony', 'Enabled') : tr(props.language, 'Wyłączony', 'Disabled')} /><Diagnostic label={tr(props.language, 'Dane', 'Data')} ok={props.notificationsActive} value={props.notificationsActive ? tr(props.language, 'Aktywne', 'Active') : tr(props.language, 'Nieaktywne', 'Inactive')} /></div>
      {isConnected ? <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{props.device?.name}</p><p className="text-xs text-slate-500">{props.demoMode ? tr(props.language, 'Dane symulowane', 'Simulated data') : `${tr(props.language, 'Sygnał', 'Signal')} ${props.device?.rssi} dBm`}</p></div><button onClick={props.onDisconnect} className="button-secondary text-rose-600"><Unplug size={16} /> {props.demoMode ? tr(props.language, 'Wyjdź z demo', 'Exit demo') : tr(props.language, 'Rozłącz', 'Disconnect')}</button></div>
        <button disabled={props.refreshing} onClick={props.onRefresh} className="button-primary mt-3">{props.refreshing ? <RefreshCw className="animate-spin" size={17} /> : <RefreshCw size={17} />} {props.refreshing ? tr(props.language, 'Odświeżanie', 'Refreshing') : tr(props.language, 'Odśwież dane i ustawienia', 'Refresh data and settings')}</button>
        {props.expertUnlocked && !props.demoMode && <button type="button" onClick={() => setShowSettingsCodeChange((visible) => !visible)} className="button-secondary mt-2 w-full justify-center"><LockKeyhole size={17} /> {tr(props.language, 'Zmień kod dostępu do ustawień BMS', 'Change BMS settings access code')}</button>}
      </div> : <div className="mt-4 space-y-2"><button onClick={props.onScan} disabled={props.connectionState === 'scanning' || props.connectionState === 'connecting'} className="button-primary"><Search size={18} />{props.connectionState === 'scanning' ? tr(props.language, 'Wyszukiwanie urządzeń', 'Scanning for devices') : tr(props.language, 'Wyszukaj BMS', 'Find BMS')}</button><button onClick={props.onDemo} disabled={props.connectionState === 'scanning' || props.connectionState === 'connecting'} className="button-secondary w-full justify-center"><Sparkles size={17} /> {tr(props.language, 'Wypróbuj tryb demonstracyjny', 'Try demo mode')}</button></div>}
    </section>
    {showSettingsCodeChange && props.expertUnlocked && !props.demoMode && <section className="card">
      <SectionTitle title={tr(props.language, 'Zmiana kodu dostępu', 'Change access code')} icon={LockKeyhole} />
      <p className="mt-2 text-xs leading-5 text-slate-500">{tr(props.language, 'Ustaw nowy sześciocyfrowy kod. Zapis zostanie potwierdzony ponownym odczytem z BMS.', 'Set a new six digit code. The write will be confirmed by reading it back from the BMS.')}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <input disabled={props.changingSettingsCode} type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]*" maxLength={6} value={props.newSettingsCode} onInput={(event) => props.onNewSettingsCode(event.currentTarget.value)} placeholder={tr(props.language, 'Nowy kod', 'New code')} aria-label={tr(props.language, 'Nowy kod ustawień', 'New settings code')} className="input min-w-0 w-full text-center" />
        <input disabled={props.changingSettingsCode} type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]*" maxLength={6} value={props.confirmSettingsCode} onInput={(event) => props.onConfirmSettingsCode(event.currentTarget.value)} placeholder={tr(props.language, 'Powtórz kod', 'Repeat code')} aria-label={tr(props.language, 'Powtórz nowy kod ustawień', 'Repeat new settings code')} className="input min-w-0 w-full text-center" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={props.changingSettingsCode} onClick={() => setShowSettingsCodeChange(false)} className="button-secondary w-full justify-center">{tr(props.language, 'Anuluj', 'Cancel')}</button><button type="button" disabled={props.changingSettingsCode || props.newSettingsCode.length !== 6 || props.confirmSettingsCode.length !== 6} onClick={props.onChangeSettingsCode} className="button-primary">{props.changingSettingsCode ? <RefreshCw className="animate-spin" size={17} /> : <Save size={17} />} {tr(props.language, 'Zapisz nowy kod', 'Save new code')}</button></div>
      {props.settingsCodeMessage && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-700">{props.settingsCodeMessage}</p>}
    </section>}
    {props.devices.length > 0 && <section className="card"><SectionTitle title={tr(props.language, 'Znalezione urządzenia', 'Found devices')} icon={Radio} /><div className="mt-3 space-y-2">{props.devices.map((item) => <button key={item.deviceId} onClick={() => props.onConnect(item)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left"><div className={`grid h-10 w-10 place-items-center rounded-xl ${isJkName(item.name) ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}><Bluetooth size={19} /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.name}</p><p className="truncate text-xs text-slate-400">{item.deviceId}</p></div><span className="text-xs text-slate-500">{item.rssi} dBm</span><ChevronRight size={18} /></button>)}</div></section>}
    {props.deviceInfo && <section className="card"><SectionTitle title={tr(props.language, 'Informacje o urządzeniu', 'Device information')} icon={CircleHelp} /><div className="mt-4 divide-y divide-slate-100 text-sm"><InfoRow label={tr(props.language, 'Model', 'Model')} value={props.deviceInfo.model} /><InfoRow label={tr(props.language, 'Sprzęt', 'Hardware')} value={props.deviceInfo.hardwareVersion} /><InfoRow label={tr(props.language, 'Oprogramowanie', 'Software')} value={props.deviceInfo.softwareVersion} /><InfoRow label={tr(props.language, 'Numer seryjny', 'Serial number')} value={props.deviceInfo.serialNumber} /><InfoRow label={tr(props.language, 'Data produkcji', 'Manufacturing date')} value={props.deviceInfo.manufacturingDate || tr(props.language, 'Brak danych', 'No data')} /><InfoRow label={tr(props.language, 'Uruchomienia', 'Power cycles')} value={`${props.deviceInfo.powerOnCount}`} /></div></section>}
    {isConnected && !props.bmsSettings && <Notice tone="info" text={tr(props.language, 'Oczekiwanie na ustawienia BMS. Dotknij odświeżania, aby ponowić odczyt.', 'Waiting for BMS settings. Tap refresh to try again.')} />}
    {props.bmsSettings && <>
      {!props.demoMode && <section className="card"><SectionTitle title={tr(props.language, 'Kopia ustawień', 'Settings backup')} icon={Save} /><p className="mt-3 text-sm leading-6 text-slate-500">{tr(props.language, 'Kopia lokalna jest przechowywana w prywatnej pamięci aplikacji na tym telefonie. Eksport otwiera systemowe menu, z którego możesz zachować plik JSON w aplikacji Pliki.', 'The local backup is stored in the app private storage on this phone. Export opens the system share sheet, where you can save the JSON file in Files.')}</p><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={props.backupBusy} onClick={props.onSaveBackup} className="button-secondary justify-center"><Save size={16} /> {tr(props.language, 'Zapisz lokalnie', 'Save locally')}</button><button disabled={props.backupBusy} onClick={props.onLoadBackup} className="button-secondary justify-center"><RotateCcw size={16} /> {tr(props.language, 'Wczytaj lokalną', 'Load local')}</button><button disabled={props.backupBusy} onClick={props.onExportBackup} className="button-secondary justify-center">{props.backupBusy ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />} {tr(props.language, 'Eksportuj JSON', 'Export JSON')}</button><label className={`button-secondary justify-center ${props.backupBusy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}><Upload size={16} /> {tr(props.language, 'Importuj z Plików', 'Import from Files')}<input disabled={props.backupBusy} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImportBackup(file); event.target.value = ''; }} /></label></div>{props.backupMessage && <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm leading-5 text-emerald-800"><Check className="mt-0.5 shrink-0" size={16} /><span>{props.backupMessage}</span></div>}<p className="mt-3 text-xs text-slate-400">{props.backupAt ? `${tr(props.language, 'Ostatnia kopia lokalna', 'Last local backup')} ${new Date(props.backupAt).toLocaleString(props.language)}` : tr(props.language, 'Nie zapisano jeszcze kopii lokalnej.', 'No local backup has been saved yet.')}</p></section>}
      {!props.expertUnlocked ? <section className="card"><SectionTitle title={tr(props.language, 'Zmiana ustawień BMS', 'Change BMS settings')} icon={LockKeyhole} /><p className="mt-3 text-sm leading-6 text-slate-600">{tr(props.language, 'Wpisz sześciocyfrowy kod ustawień zapisany w BMS. Kod fabryczny to zwykle 123456. Nie jest to hasło połączenia Bluetooth.', 'Enter the six digit settings code stored in the BMS. The factory code is usually 123456. This is not the Bluetooth connection password.')}</p><form className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={(event) => { event.preventDefault(); props.onUnlock(); }}><input type="password" inputMode="numeric" enterKeyHint="done" autoComplete="off" pattern="[0-9]*" maxLength={6} value={props.expertCode} onInput={(event) => props.onCode(event.currentTarget.value)} placeholder="••••••" aria-label={tr(props.language, 'Kod ustawień BMS', 'BMS settings code')} className="input min-w-0 w-full text-center tracking-[0.3em]" /><button type="submit" disabled={props.expertCode.length !== 6 || !props.deviceInfo?.settingsPassword} style={{ width: 'auto', minWidth: '112px' }} className="button-primary px-4">{tr(props.language, 'Odblokuj', 'Unlock')}</button></form>{!props.deviceInfo?.settingsPassword && <p className="mt-3 text-xs leading-5 text-slate-500">{tr(props.language, 'Kod nie został jeszcze odczytany z BMS. Dotknij odświeżania danych.', 'The code has not been read from the BMS yet. Refresh the data.')}</p>}{props.unlockMessage && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{props.unlockMessage}</p>}</section> : <>
        <section className="card">
          <SectionTitle title={tr(props.language, 'Sterowanie BMS', 'BMS controls')} icon={Zap} />
          <p className="mt-2 text-xs leading-5 text-slate-500">{tr(props.language, 'Przełączniki sterują bezpośrednio wyjściami ładowania i rozładowania. Każdą zmianę zatwierdź przyciskiem zapisu.', 'These switches directly control the charging and discharging outputs. Confirm each change with the save button.')}</p>
          <div className="mt-4 divide-y divide-slate-100">{CONTROL_SETTINGS.map((definition) => <SettingRow key={definition.key} definition={definition} value={props.draft[definition.key]} disabled={props.writing || props.demoMode} language={props.language} onChange={(value) => props.onDraft(definition.key, value)} onSave={() => props.onRequestWrite(definition)} />)}</div>
        </section>
        <section className="card">
          <SectionTitle title={tr(props.language, 'Ładowanie w niskiej temperaturze', 'Low temperature charging')} icon={Thermometer} />
          <p className="mt-2 text-xs leading-5 text-slate-500">{tr(props.language, 'Dla akumulatora LiFePO4 aplikacja nie pozwala ustawić ładowania poniżej 0°C. Próg ochrony i temperaturę powrotu zapisuje razem.', 'For a LiFePO4 battery, the app does not allow charging below 0°C. It saves the protection and recovery temperatures together.')}</p>
          <div className="mt-4"><Notice tone="info" text={tr(props.language, 'Ładowanie zostanie zatrzymane po osiągnięciu progu ochrony i wznowione dopiero po osiągnięciu wyższej temperatury powrotu.', 'Charging will stop at the protection threshold and resume only after reaching the higher recovery temperature.')} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><MiniValue label={tr(props.language, 'Próg ochrony', 'Protection threshold')} value={`${String(props.draft.chargeUnderTemperature)} °C`} /><MiniValue label={tr(props.language, 'Powrót ładowania', 'Charging recovery')} value={`${String(props.draft.chargeUnderTemperatureRecovery)} °C`} /></div>
          <div className="mt-4 divide-y divide-slate-100">{LOW_TEMPERATURE_SETTINGS.map((definition) => <SettingRow key={definition.key} definition={definition} value={props.draft[definition.key]} disabled={props.writing || props.demoMode} language={props.language} onChange={(value) => props.onDraft(definition.key, value)} onSave={() => undefined} showSave={false} />)}</div>
          <button type="button" disabled={props.writing || props.demoMode || Boolean(props.validation)} onClick={props.onLowTemperatureChange} className="button-primary mt-3">{props.writing ? <RefreshCw className="animate-spin" size={17} /> : <Save size={17} />} {tr(props.language, 'Zapisz ochronę temperatury', 'Save temperature protection')}</button>
          {props.lowTemperatureMessage && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{props.lowTemperatureMessage}</p>}
        </section>
        <section className="card">
          <SectionTitle title={tr(props.language, 'Pozostałe parametry ochrony', 'Other protection parameters')} icon={SlidersHorizontal} />
          <p className="mt-2 text-xs leading-5 text-slate-500">{tr(props.language, 'Każda zmiana jest wysyłana osobno i sprawdzana po ponownym odczycie z BMS.', 'Each change is sent separately and verified by reading it back from the BMS.')}</p>
          {props.validation && <div className="mt-3"><Notice tone="warning" text={props.validation} /></div>}
          <div className="mt-4 divide-y divide-slate-100">{OTHER_SETTINGS.map((definition) => <SettingRow key={definition.key} definition={definition} value={props.draft[definition.key]} disabled={props.writing || props.demoMode} language={props.language} onChange={(value) => props.onDraft(definition.key, value)} onSave={() => props.onRequestWrite(definition)} />)}</div>
          {props.writeMessage && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{props.writeMessage}</p>}
        </section>
      </>}
    </>}
    <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-900"><strong>{tr(props.language, 'Wskazówka', 'Tip')}</strong><p>{tr(props.language, 'Zamknij oficjalną aplikację JK przed połączeniem. Jeden moduł BMS zwykle obsługuje tylko jedno aktywne połączenie Bluetooth.', 'Close the official JK app before connecting. A BMS module usually supports only one active Bluetooth connection.')}</p></section>
    <section className="card">
      <SectionTitle title={tr(props.language, 'Reklamy i prywatność', 'Advertising and privacy')} icon={ShieldCheck} />
      <p className="mt-3 text-sm leading-6 text-slate-500">{tr(props.language, 'Aplikacja korzysta z Google AdMob do wyświetlania banerów. Dane BMS i historia akumulatora nie są przekazywane do usługi reklamowej.', 'The app uses Google AdMob to display banner ads. BMS data and battery history are not sent to the advertising service.')}</p>
      <div className="mt-4 space-y-2">
        <button type="button" disabled={!props.adPrivacyAvailable} onClick={props.onAdPrivacy} className="grid min-h-12 w-full grid-cols-[20px_minmax(0,1fr)_20px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-45"><ShieldCheck size={16} /><span className="text-center">{tr(props.language, 'Zarządzaj prywatnością reklam', 'Manage advertising privacy')}</span><span /></button>
        <a href="mailto:mlynarski.mateusz@gmail.com?subject=BMS%20Monitor%20ad%20report" className="grid min-h-12 w-full grid-cols-[20px_minmax(0,1fr)_20px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"><ExternalLink size={16} /><span className="text-center">{tr(props.language, 'Zgłoś nieodpowiednią reklamę', 'Report an inappropriate ad')}</span><span /></a>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{props.adState === 'initializing' ? tr(props.language, 'Sprawdzanie ustawień prywatności reklam.', 'Checking advertising privacy settings.') : props.adState === 'limited' ? tr(props.language, 'Reklamy nie są obecnie dostępne z powodu ustawień zgody.', 'Ads are currently unavailable because of consent settings.') : props.adState === 'error' || props.adBannerState === 'failed' ? `${tr(props.language, 'Nie udało się wczytać reklamy', 'The ad could not be loaded')}${props.adError ? `: ${props.adError}` : '.'}` : props.adTestMode ? tr(props.language, 'Tryb reklam testowych jest aktywny. Baner pojawia się na Pulpicie i Historii.', 'Test ads are active. The banner appears on Dashboard and History.') : tr(props.language, 'Konfiguracja reklam jest gotowa. Baner jest celowo ukryty w Ustawieniach i pojawia się tylko na Pulpicie oraz Historii. Nowe jednostki reklamowe mogą zacząć wyświetlać reklamy z opóźnieniem.', 'Advertising is ready. The banner is intentionally hidden in Settings and appears only on Dashboard and History. New ad units may start serving with a delay.')}</p>
    </section>
    <section className="card"><SectionTitle title={tr(props.language, 'Informacje prawne', 'Legal information')} icon={FileText} /><div className="mt-3 divide-y divide-slate-100"><a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="flex w-full items-center justify-between py-3 text-left text-sm font-medium"><span>{tr(props.language, 'Polityka prywatności', 'Privacy Policy')}</span><ExternalLink size={17} className="text-slate-400" /></a><a href={TERMS_URL} target="_blank" rel="noreferrer" className="flex w-full items-center justify-between py-3 text-left text-sm font-medium"><span>{tr(props.language, 'Warunki użytkowania', 'Terms of Use')}</span><ExternalLink size={17} className="text-slate-400" /></a></div></section>
    <p className="pb-2 text-center text-xs text-slate-400">BMS Monitor: LiFePO4  •  {tr(props.language, 'wersja', 'version')} {APP_VERSION}</p>
  </div>;
}

function SettingRow({ definition, value, disabled, language, onChange, onSave, showSave = true }: { definition: JkSettingDefinition; value: number | boolean | undefined; disabled: boolean; language: Language; onChange: (value: number | boolean) => void; onSave: () => void; showSave?: boolean }) {
  const label = settingLabel(definition, language);
  if (definition.kind === 'switch') return <div className="flex items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className={`text-xs ${value ? 'text-emerald-700' : 'text-slate-500'}`}>{value ? tr(language, 'Włączone', 'Enabled') : tr(language, 'Wyłączone', 'Disabled')}</p>{definition.dangerous && <p className="text-xs text-rose-600">{tr(language, 'Ustawienie krytyczne', 'Critical setting')}</p>}</div><button type="button" role="switch" aria-checked={Boolean(value)} disabled={disabled} onClick={() => onChange(!value)} aria-label={`${label}: ${value ? tr(language, 'włączone', 'enabled') : tr(language, 'wyłączone', 'disabled')}`} className={`relative h-8 w-14 shrink-0 rounded-full transition ${value ? 'bg-teal-700' : 'bg-slate-300'}`}><span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${value ? 'left-7' : 'left-1'}`} /></button><button disabled={disabled} onClick={onSave} aria-label={tr(language, 'Zapisz ustawienie', 'Save setting')} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 disabled:opacity-40"><Save size={16} /></button></div>;
  return <div className="py-4"><div className="mb-2 flex items-center justify-between gap-2"><label className="text-sm font-medium">{label}</label>{definition.dangerous && <span className="text-[10px] font-semibold uppercase text-rose-600">{tr(language, 'Krytyczne', 'Critical')}</span>}</div><div className="flex items-center gap-2"><input disabled={disabled} type="number" inputMode="decimal" min={definition.min} max={definition.max} step={definition.step} value={typeof value === 'number' ? value : ''} onChange={(event) => onChange(Number(event.target.value))} className="input min-w-0 flex-1" /><span className="w-8 text-sm text-slate-500">{definition.unit}</span>{showSave && <button disabled={disabled} onClick={onSave} aria-label={tr(language, 'Zapisz ustawienie', 'Save setting')} className="grid h-11 w-11 place-items-center rounded-xl bg-teal-700 text-white disabled:opacity-40"><Save size={17} /></button>}</div><p className="mt-1 text-[11px] text-slate-400">{tr(language, 'Zakres', 'Range')} {definition.min} {tr(language, 'do', 'to')} {definition.max} {definition.unit}</p></div>;
}

function LowTemperatureConfirmSheet({ change, currentProtection, currentRecovery, writing, language, onCancel, onConfirm }: { change: LowTemperatureChange; currentProtection: number; currentRecovery: number; writing: boolean; language: Language; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 backdrop-blur-sm"><div className="safe-bottom mx-auto w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl"><div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200" /><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Thermometer size={21} /></div><div><h3 className="font-semibold">{tr(language, 'Potwierdź ochronę temperatury', 'Confirm temperature protection')}</h3><p className="mt-1 text-sm text-slate-500">{tr(language, 'Bezpieczne ładowanie akumulatora LiFePO4', 'Safe LiFePO4 battery charging')}</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><MiniValue label={tr(language, 'Próg ochrony', 'Protection threshold')} value={`${currentProtection} → ${change.protection} °C`} /><MiniValue label={tr(language, 'Powrót ładowania', 'Charging recovery')} value={`${currentRecovery} → ${change.recovery} °C`} /></div><div className="mt-4"><Notice tone="info" text={tr(language, `BMS zatrzyma ładowanie przy ${change.protection}°C i wznowi je po wzroście temperatury do ${change.recovery}°C.`, `The BMS will stop charging at ${change.protection}°C and resume when the temperature reaches ${change.recovery}°C.`)} /></div><p className="mt-4 text-xs leading-5 text-slate-500">{tr(language, 'Aplikacja zapisze oba progi w bezpiecznej kolejności i potwierdzi wartości przez ponowny odczyt.', 'The app will save both thresholds in a safe order and confirm the values by reading them back.')}</p><div className="mt-5 grid grid-cols-2 gap-3"><button disabled={writing} onClick={onCancel} className="button-secondary justify-center">{tr(language, 'Anuluj', 'Cancel')}</button><button disabled={writing} onClick={onConfirm} className="button-primary">{writing ? <RefreshCw className="animate-spin" size={17} /> : <Check size={17} />} {tr(language, 'Potwierdź', 'Confirm')}</button></div></div></div>;
}

function ConfirmSheet({ definition, oldValue, newValue, validation, writing, language, onCancel, onConfirm }: { definition: JkSettingDefinition; oldValue: number | boolean | undefined; newValue: number | boolean | undefined; validation: string; writing: boolean; language: Language; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 backdrop-blur-sm"><div className="safe-bottom mx-auto w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl"><div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200" /><div className="flex items-start gap-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${definition.dangerous ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700'}`}><AlertTriangle size={21} /></div><div><h3 className="font-semibold">{tr(language, 'Potwierdź zmianę', 'Confirm change')}</h3><p className="mt-1 text-sm text-slate-500">{settingLabel(definition, language)}</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><MiniValue label={tr(language, 'Obecnie', 'Current')} value={`${String(oldValue)} ${definition.unit}`} /><MiniValue label={tr(language, 'Po zmianie', 'New value')} value={`${String(newValue)} ${definition.unit}`} /></div>{validation && <div className="mt-4"><Notice tone="danger" text={validation} /></div>}<p className="mt-4 text-xs leading-5 text-slate-500">{tr(language, 'Podczas zapisu nie wyłączaj BMS ani Bluetooth. Aplikacja sprawdzi wartość po ponownym odczycie.', 'Do not turn off the BMS or Bluetooth while saving. The app will verify the value by reading it back.')}</p><div className="mt-5 grid grid-cols-2 gap-3"><button disabled={writing} onClick={onCancel} className="button-secondary justify-center">{tr(language, 'Anuluj', 'Cancel')}</button><button disabled={writing || Boolean(validation)} onClick={onConfirm} className="button-primary">{writing ? <RefreshCw className="animate-spin" size={17} /> : <Check size={17} />} {tr(language, 'Potwierdź', 'Confirm')}</button></div></div></div>;
}

function niceChartStep(range: number, targetIntervals = 4) {
  const roughStep = Math.max(range / targetIntervals, Number.EPSILON);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

function chartStepPrecision(step: number) {
  const decimalPart = step.toFixed(6).replace(/0+$/, '').split('.')[1];
  return decimalPart?.length ?? 0;
}

function chartScale(kind: ChartKind, values: number[]) {
  if (kind === 'soc') return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], precision: 0 };

  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const observedSpan = observedMax - observedMin;
  let desiredMin: number;
  let desiredMax: number;

  if (kind === 'current') {
    if (observedMin === 0 && observedMax === 0) {
      desiredMin = -1;
      desiredMax = 1;
    } else if (observedMax <= 0) {
      desiredMin = observedMin - Math.max(observedSpan * 0.12, 0.5);
      desiredMax = 0;
    } else if (observedMin >= 0) {
      desiredMin = 0;
      desiredMax = observedMax + Math.max(observedSpan * 0.12, 0.5);
    } else {
      const padding = Math.max(observedSpan * 0.1, 0.5);
      desiredMin = observedMin - padding;
      desiredMax = observedMax + padding;
    }
  } else {
    const minimumPadding = kind === 'voltage' ? 0.05 : 1;
    const padding = Math.max(observedSpan * 0.15, minimumPadding);
    desiredMin = observedMin - padding;
    desiredMax = observedMax + padding;
  }

  const step = niceChartStep(desiredMax - desiredMin);
  const min = Math.floor((desiredMin + Number.EPSILON) / step) * step;
  const max = Math.ceil((desiredMax - Number.EPSILON) / step) * step;
  const precision = kind === 'voltage' ? Math.max(2, chartStepPrecision(step)) : chartStepPrecision(step);
  const ticks: number[] = [];
  for (let value = min, index = 0; value <= max + step / 2 && index < 8; value += step, index += 1) {
    ticks.push(Number(value.toFixed(6)));
  }
  return { min, max, ticks, precision };
}

function chartTimeLabel(time: number, totalSpan: number, language: Language) {
  const locale = language === 'pl' ? 'pl-PL' : 'en-GB';
  const options: Intl.DateTimeFormatOptions = totalSpan >= 24 * 60 * 60 * 1000
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    : totalSpan < 10 * 60 * 1000
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
      : { hour: '2-digit', minute: '2-digit', hour12: false };
  return new Intl.DateTimeFormat(locale, options).format(new Date(time));
}

function ChartCard({ label, unit, color, kind, points, language }: { label: string; unit: string; color: string; kind: ChartKind; points: ChartPoint[]; language: Language }) {
  const rawId = useId();
  const gradientId = `chart-gradient-${rawId.replace(/:/g, '')}`;
  const clipId = `chart-clip-${rawId.replace(/:/g, '')}`;
  const values = points.map((point) => point.value);
  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const scale = chartScale(kind, values);
  const width = 360;
  const height = 172;
  const plotLeft = 43;
  const plotRight = 8;
  const plotTop = 8;
  const plotBottom = 143;
  const plotWidth = width - plotLeft - plotRight;
  const plotHeight = plotBottom - plotTop;
  const scaleSpan = Math.max(scale.max - scale.min, Number.EPSILON);
  const xForIndex = (index: number) => plotLeft + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yForValue = (value: number) => plotTop + ((scale.max - Math.min(scale.max, Math.max(scale.min, value))) / scaleSpan) * plotHeight;
  const linePoints = points.map((point, index) => `${xForIndex(index)},${yForValue(point.value)}`).join(' ');
  const timeIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
  const totalTimeSpan = Math.max(0, points[points.length - 1].time - points[0].time);
  const currentPrecision = kind === 'soc' ? 0 : kind === 'voltage' || kind === 'current' ? 2 : 1;
  const observedPrecision = kind === 'soc' ? 0 : kind === 'voltage' ? 2 : 1;

  return <section className="card">
    <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{values[values.length - 1]?.toFixed(currentPrecision)} {unit}</p></div><p className="text-right text-xs text-slate-400">{tr(language, 'Zakres', 'Range')}<br />{observedMin.toFixed(observedPrecision)} {tr(language, 'do', 'to')} {observedMax.toFixed(observedPrecision)} {unit}</p></div>
    <svg className="mt-4 h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${values[values.length - 1]?.toFixed(currentPrecision)} ${unit}`}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient><clipPath id={clipId}><rect x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight} rx="2" /></clipPath></defs>
      {scale.ticks.map((tick) => { const y = yForValue(tick); return <g key={tick}><line x1={plotLeft} y1={y} x2={width - plotRight} y2={y} stroke="#e2e8f0" strokeWidth="1" /><text x={plotLeft - 7} y={y} fill="#94a3b8" fontSize="9" textAnchor="end" dominantBaseline="middle">{tick.toFixed(scale.precision)}</text></g>; })}
      {timeIndexes.map((index, tickIndex) => { const x = xForIndex(index); const anchor = tickIndex === 0 ? 'start' : tickIndex === timeIndexes.length - 1 ? 'end' : 'middle'; return <g key={`${points[index].time}-${index}`}><line x1={x} y1={plotTop} x2={x} y2={plotBottom} stroke="#f1f5f9" strokeWidth="1" /><text x={x} y={height - 7} fill="#94a3b8" fontSize="9" textAnchor={anchor}>{chartTimeLabel(points[index].time, totalTimeSpan, language)}</text></g>; })}
      <g clipPath={`url(#${clipId})`}><polygon points={`${plotLeft},${plotBottom} ${linePoints} ${width - plotRight},${plotBottom}`} fill={`url(#${gradientId})`} /><polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></g>
      <circle cx={xForIndex(points.length - 1)} cy={yForValue(values[values.length - 1])} r="3" fill="#fff" stroke={color} strokeWidth="2" />
    </svg>
  </section>;
}

function TabButton({ id, label, icon: Icon, active, onSelect }: { id: Tab; label: string; icon: LucideIcon; active: boolean; onSelect: (tab: Tab) => void }) { return <button onClick={() => onSelect(id)} className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition ${active ? 'text-teal-700' : 'text-slate-400'}`}><Icon size={20} strokeWidth={active ? 2.5 : 2} /><span>{label}</span>{active && <span className="absolute top-0 h-0.5 w-7 rounded-full bg-teal-700" />}</button>; }
function SectionTitle({ title, icon: Icon }: { title: string; icon: LucideIcon }) { return <div className="flex items-center gap-2"><Icon size={19} className="text-teal-700" /><h2 className="font-semibold">{title}</h2></div>; }
function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) { return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_6px_24px_rgba(15,23,42,0.04)]"><Icon size={17} className="text-teal-700" /><p className="mt-3 truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
function MiniValue({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
function StatePill({ label, active, detail }: { label: string; active: boolean; detail?: string }) { return <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="min-w-0 flex-1 truncate">{label}</span>{detail && <strong className="text-xs">{detail}</strong>}</div>; }
function Diagnostic({ label, ok, value }: { label: string; ok: boolean; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="text-xs text-slate-500">{label}</span></div><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-3"><span className="text-slate-500">{label}</span><strong className="max-w-[60%] truncate text-right">{value || 'Brak danych'}</strong></div>; }
function Notice({ tone, text }: { tone: 'info' | 'warning' | 'danger'; text: string }) { const style = tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'; return <div className={`flex items-start gap-2 rounded-2xl border p-3 text-sm leading-5 ${style}`}><AlertTriangle className="mt-0.5 shrink-0" size={17} /><span>{text}</span></div>; }
function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: LucideIcon; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="card py-12 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon size={26} /></div><h2 className="mt-4 text-lg font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{text}</p>{action && onAction && <button onClick={onAction} className="button-primary mx-auto mt-5 w-auto px-5">{action}</button>}</div>; }
function SkeletonCard({ height }: { height: string }) { return <div className={`${height} animate-pulse rounded-3xl border border-slate-200 bg-white`} />; }

export default App;
