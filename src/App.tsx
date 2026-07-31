import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BleClient, type BleService, type ScanResult } from '@capacitor-community/bluetooth-le';
import {
  Activity, AlertTriangle, BatteryMedium, Bluetooth, ChartNoAxesCombined,
  Check, ChevronRight, CircleGauge, CircleHelp, Download, Gauge, History,
  LayoutDashboard, LockKeyhole, Radio, RefreshCw, Save, Search, Settings,
  ShieldCheck, SlidersHorizontal, Thermometer, Unplug, Zap, type LucideIcon,
} from 'lucide-react';
import {
  JK_SETTING_DEFINITIONS, JkFrameAssembler, buildSettingWrite, parseJkFrame,
  selectJkGattPath, writeJkCommand, type JkBatteryData, type JkDeviceInfo,
  type JkGattPath, type JkSettingDefinition, type JkSettingKey, type JkSettings,
} from './jkBms';

interface FoundDevice { name: string; deviceId: string; rssi: number }
interface HistoryPoint { time: number; soc: number; voltage: number; current: number; temperature: number }
type Tab = 'dashboard' | 'cells' | 'history' | 'settings';
type ConnectionState = 'initializing' | 'ready' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'error';

const HISTORY_KEY = 'jk_bms_history_v2';
const BACKUP_KEY = 'jk_bms_settings_backup_v1';
const HISTORY_LIMIT = 720;
const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isJkName = (name: string) => /JK|JIKONG|BMS/i.test(name);
const bytes = (value: DataView) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
const format = (value: number | undefined, digits: number, unit: string) => value === undefined || !Number.isFinite(value) ? 'Brak danych' : `${value.toFixed(digits)} ${unit}`;
const duration = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days} d ${hours} h` : `${hours} h`;
};
const loadHistory = (): HistoryPoint[] => {
  try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); return Array.isArray(value) ? value.slice(-HISTORY_LIMIT) : []; }
  catch { return []; }
};

function App() {
  const [tab, setTab] = useState<Tab>('settings');
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
  const [writeMessage, setWriteMessage] = useState('');
  const [writing, setWriting] = useState(false);
  const [backupAt, setBackupAt] = useState<number | null>(() => {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY) ?? 'null')?.savedAt ?? null; } catch { return null; }
  });

  const mounted = useRef(true);
  const connected = useRef(false);
  const activeDevice = useRef<FoundDevice | null>(null);
  const pathRef = useRef<JkGattPath | null>(null);
  const assembler = useRef(new JkFrameAssembler());
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHistoryAt = useRef(0);
  const batteryRef = useRef<JkBatteryData | null>(null);
  const draftRef = useRef<Partial<Record<JkSettingKey, number | boolean>>>({});
  const pendingWriteRef = useRef<JkSettingDefinition | null>(null);
  const writingRef = useRef(false);

  useEffect(() => { batteryRef.current = battery; }, [battery]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { pendingWriteRef.current = pendingWrite; }, [pendingWrite]);
  useEffect(() => { writingRef.current = writing; }, [writing]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* Pamięć może być niedostępna. */ } }, [history]);

  const clearTimers = useCallback(() => {
    if (scanTimer.current) clearTimeout(scanTimer.current);
    if (pollTimer.current) clearInterval(pollTimer.current);
    scanTimer.current = null;
    pollTimer.current = null;
  }, []);

  const resetConnection = useCallback((message = '') => {
    clearTimers(); connected.current = false; activeDevice.current = null; pathRef.current = null; assembler.current.reset();
    if (!mounted.current) return;
    setNotificationsActive(false); setDevice(null); setConnectionState(message ? 'error' : 'disconnected'); setError(message);
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
          setBattery(parsed.value); setLastDataAt(Date.now()); addHistoryPoint(parsed.value);
        } else if (parsed.type === 'device') setDeviceInfo(parsed.value);
        else if (parsed.type === 'settings') {
          setBmsSettings(parsed.value);
          setDraft((current) => Object.keys(current).length ? current : Object.fromEntries(JK_SETTING_DEFINITIONS.map((definition) => [definition.key, parsed.value[definition.key]])));
          const activeWrite = pendingWriteRef.current;
          if (writingRef.current && activeWrite) {
            const received = parsed.value[activeWrite.key];
            const expected = draftRef.current[activeWrite.key];
            if (received === expected || (typeof received === 'number' && typeof expected === 'number' && Math.abs(received - expected) < activeWrite.step / 2 + 0.0001)) {
              writingRef.current = false; pendingWriteRef.current = null;
              setWriteMessage('Zmiana została potwierdzona przez BMS.'); setWriting(false); setPendingWrite(null);
            }
          }
        }
        setError('');
      } catch (parseError) {
        setError(`Nie udało się odczytać danych JK: ${toErrorMessage(parseError)}`);
      }
    }
  }, [addHistoryPoint]);

  const initializeBluetooth = useCallback(async () => {
    setConnectionState('initializing'); setError('');
    if (!Capacitor.isNativePlatform()) {
      setConnectionState('error'); setError('Połączenie z BMS jest dostępne w aplikacji na telefonie.'); return;
    }
    try {
      await BleClient.initialize(Capacitor.getPlatform() === 'android' ? { androidNeverForLocation: true } : undefined);
      const enabled = await BleClient.isEnabled();
      if (!mounted.current) return;
      setBluetoothReady(true); setBluetoothEnabled(enabled); setConnectionState(enabled ? 'ready' : 'error');
      if (!enabled) setError('Bluetooth jest wyłączony. Włącz go w ustawieniach telefonu.');
      await BleClient.startEnabledNotifications((state) => {
        if (!mounted.current) return;
        setBluetoothEnabled(state);
        if (!state) resetConnection('Bluetooth został wyłączony.');
        else if (!connected.current) { setConnectionState('ready'); setError(''); }
      });
    } catch (initError) {
      setBluetoothReady(false); setBluetoothEnabled(false); setConnectionState('error'); setError(`Nie udało się uruchomić Bluetooth: ${toErrorMessage(initError)}`);
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
      if (Capacitor.getPlatform() === 'android') { try { await BleClient.requestEnable(); } catch { setError('Nie udało się włączyć Bluetooth.'); return; } }
      else { setError('Włącz Bluetooth w ustawieniach iPhone.'); return; }
    }
    const found = new Map<string, FoundDevice>(); setConnectionState('scanning');
    try {
      await BleClient.requestLEScan({ allowDuplicates: false }, (result: ScanResult) => {
        if (!mounted.current || !result.device.deviceId) return;
        const item = { name: result.device.name || result.localName || 'Urządzenie bez nazwy', deviceId: result.device.deviceId, rssi: result.rssi ?? -100 };
        found.set(item.deviceId, item);
        setDevices(Array.from(found.values()).sort((a, b) => Number(isJkName(b.name)) - Number(isJkName(a.name)) || b.rssi - a.rssi));
      });
      scanTimer.current = setTimeout(() => void stopScan().then(() => { if (!found.size) setError('Nie znaleziono urządzeń. Zamknij aplikację JK, obudź BMS i spróbuj ponownie.'); }), 12000);
    } catch (scanError) { setConnectionState('error'); setError(`Błąd wyszukiwania: ${toErrorMessage(scanError)}`); }
  }, [bluetoothEnabled, bluetoothReady, connectionState, initializeBluetooth, stopScan]);

  const connect = useCallback(async (selected: FoundDevice) => {
    if (connected.current || connectionState === 'connecting') return;
    setConnectionState('connecting'); setError(''); assembler.current.reset();
    try {
      await stopScan();
      await BleClient.connect(selected.deviceId, () => resetConnection('Połączenie z BMS zostało przerwane.'), { timeout: 15000 });
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
      pollTimer.current = setInterval(() => void writeJkCommand(BleClient, selected.deviceId, path, 0x96).catch((pollError) => setError(`Błąd odświeżania: ${toErrorMessage(pollError)}`)), 5000);
    } catch (connectError) {
      try { await BleClient.disconnect(selected.deviceId); } catch { /* Połączenie mogło nie zostać ustanowione. */ }
      resetConnection(`Nie udało się połączyć z BMS: ${toErrorMessage(connectError)}`);
    }
  }, [connectionState, handleNotification, resetConnection, stopScan]);

  const disconnect = useCallback(async () => {
    const current = activeDevice.current; const path = pathRef.current; clearTimers();
    try { if (current && path) await BleClient.stopNotifications(current.deviceId, path.service, path.notify); } catch { /* Stan zostanie wyczyszczony lokalnie. */ }
    try { if (current) await BleClient.disconnect(current.deviceId); } catch { /* Stan zostanie wyczyszczony lokalnie. */ }
    resetConnection(); setBattery(null); setBmsSettings(null); setDeviceInfo(null); setLastDataAt(null); setExpertUnlocked(false); setDraft({});
  }, [clearTimers, resetConnection]);

  const requestRefresh = useCallback(async () => {
    const current = activeDevice.current; const path = pathRef.current;
    if (!current || !path) return;
    try { await writeJkCommand(BleClient, current.deviceId, path, 0x97); await new Promise((resolve) => setTimeout(resolve, 200)); await writeJkCommand(BleClient, current.deviceId, path, 0x96); }
    catch (refreshError) { setError(`Nie udało się odświeżyć danych: ${toErrorMessage(refreshError)}`); }
  }, []);

  const settingsValidation = useMemo(() => {
    const number = (key: JkSettingKey) => Number(draft[key]);
    if (number('cellUvpr') <= number('cellUvp')) return 'Napięcie powrotu po rozładowaniu musi być wyższe od progu ochrony.';
    if (number('cellOvpr') >= number('cellOvp')) return 'Napięcie powrotu po przeładowaniu musi być niższe od progu ochrony.';
    if (number('chargeUnderTemperatureRecovery') <= number('chargeUnderTemperature')) return 'Temperatura powrotu ładowania musi być wyższa od progu minimalnego.';
    if (number('chargeOverTemperatureRecovery') >= number('chargeOverTemperature')) return 'Temperatura powrotu ładowania musi być niższa od progu maksymalnego.';
    return '';
  }, [draft]);

  const confirmWrite = useCallback(async () => {
    if (!pendingWrite || !battery || !bmsSettings) return;
    const current = activeDevice.current; const path = pathRef.current; const newValue = draft[pendingWrite.key];
    if (!current || !path || newValue === undefined) return;
    try {
      writingRef.current = true; setWriting(true); setWriteMessage('Zapisywanie i oczekiwanie na potwierdzenie BMS');
      const command = buildSettingWrite(pendingWrite, newValue, battery.protocol);
      await writeJkCommand(BleClient, current.deviceId, path, command.register, command.value, command.length);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await writeJkCommand(BleClient, current.deviceId, path, 0x96);
      setTimeout(() => { if (mounted.current && writingRef.current) { writingRef.current = false; setWriting(false); setWriteMessage('BMS nie potwierdził jeszcze zmiany. Odśwież ustawienia i sprawdź wartość.'); } }, 6000);
    } catch (writeError) { writingRef.current = false; setWriting(false); setWriteMessage(`Zapis nie powiódł się: ${toErrorMessage(writeError)}`); }
  }, [battery, bmsSettings, draft, pendingWrite]);

  const createBackup = useCallback(() => {
    if (!bmsSettings || !battery) return;
    const savedAt = Date.now(); const backup = { savedAt, protocol: battery.protocol, device: deviceInfo?.model || device?.name, settings: bmsSettings };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup)); setBackupAt(savedAt);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `jk-bms-backup-${new Date(savedAt).toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }, [battery, bmsSettings, device, deviceInfo]);

  const freshness = lastDataAt ? now - lastDataAt : Number.POSITIVE_INFINITY;
  const freshLabel = freshness < 10000 ? 'Dane aktualne' : lastDataAt ? 'Dane nieaktualne' : 'Oczekiwanie na dane';
  const stateLabel = connectionState === 'connected' ? 'Połączono' : connectionState === 'connecting' ? 'Łączenie' : connectionState === 'scanning' ? 'Wyszukiwanie' : connectionState === 'initializing' ? 'Uruchamianie' : connectionState === 'error' ? 'Wymaga uwagi' : 'Nie połączono';

  return (
    <div className="app-shell bg-[#f4f6f8] text-slate-950">
      <header className="safe-top shrink-0 border-b border-slate-200/80 bg-white/95 px-4 pb-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">JK BMS</p>
            <h1 className="truncate text-lg font-semibold">{deviceInfo?.deviceName || device?.name || 'Monitor baterii'}</h1>
          </div>
          <button onClick={() => connected.current ? void requestRefresh() : setTab('settings')} className="flex h-10 min-w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm" aria-label="Odśwież lub połącz">
            {connectionState === 'connecting' || connectionState === 'scanning' ? <RefreshCw className="animate-spin" size={18} /> : connected.current ? <RefreshCw size={18} /> : <Bluetooth size={19} />}
          </button>
        </div>
        <div className="mx-auto mt-2 flex h-6 max-w-3xl items-center gap-2 text-xs text-slate-500">
          <span className={`h-2 w-2 shrink-0 rounded-full ${connected.current ? 'bg-emerald-500' : connectionState === 'error' ? 'bg-amber-500' : 'bg-slate-300'}`} />
          <span className="w-24 shrink-0 font-medium text-slate-700">{stateLabel}</span>
          <span className="truncate">{connected.current ? `${freshLabel}  •  ${device?.rssi ?? 0} dBm` : 'Wybierz urządzenie w ustawieniach'}</span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl px-4 py-4 pb-8">
          {error && <Notice tone="warning" text={error} />}
          {tab === 'dashboard' && <Dashboard battery={battery} connected={connected.current} onConnect={() => setTab('settings')} freshness={freshness} />}
          {tab === 'cells' && <CellsView battery={battery} />}
          {tab === 'history' && <HistoryView history={history} onClear={() => setHistory([])} />}
          {tab === 'settings' && (
            <SettingsView
              bluetoothReady={bluetoothReady} bluetoothEnabled={bluetoothEnabled} connectionState={connectionState}
              notificationsActive={notificationsActive} devices={devices} device={device} battery={battery}
              deviceInfo={deviceInfo} bmsSettings={bmsSettings} draft={draft} expertCode={expertCode}
              expertUnlocked={expertUnlocked} backupAt={backupAt} validation={settingsValidation}
              writeMessage={writeMessage} writing={writing}
              onScan={() => void scan()} onConnect={(item) => void connect(item)} onDisconnect={() => void disconnect()}
              onRefresh={() => void requestRefresh()} onCode={setExpertCode}
              onUnlock={() => { if (expertCode === '123456') { setExpertUnlocked(true); setWriteMessage('Tryb zmian został odblokowany.'); } else setWriteMessage('Nieprawidłowy kod ustawień.'); }}
              onDraft={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
              onRequestWrite={setPendingWrite} onBackup={createBackup}
            />
          )}
        </div>
      </main>

      <nav className="safe-bottom shrink-0 border-t border-slate-200 bg-white/95 px-2 pt-1 backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          <TabButton id="dashboard" label="Pulpit" icon={LayoutDashboard} active={tab === 'dashboard'} onSelect={setTab} />
          <TabButton id="cells" label="Ogniwa" icon={BatteryMedium} active={tab === 'cells'} onSelect={setTab} />
          <TabButton id="history" label="Historia" icon={History} active={tab === 'history'} onSelect={setTab} />
          <TabButton id="settings" label="Ustawienia" icon={Settings} active={tab === 'settings'} onSelect={setTab} />
        </div>
      </nav>

      {pendingWrite && (
        <ConfirmSheet definition={pendingWrite} oldValue={bmsSettings?.[pendingWrite.key]} newValue={draft[pendingWrite.key]} validation={settingsValidation} writing={writing}
          onCancel={() => { if (!writing) setPendingWrite(null); }} onConfirm={() => void confirmWrite()} />
      )}
    </div>
  );
}

function Dashboard({ battery, connected, onConnect, freshness }: { battery: JkBatteryData | null; connected: boolean; onConnect: () => void; freshness: number }) {
  if (!connected) return <EmptyState icon={Bluetooth} title="Połącz z BMS" text="Wyszukaj moduł Bluetooth akumulatora, aby zobaczyć bieżące parametry." action="Przejdź do połączenia" onAction={onConnect} />;
  if (!battery) return <div className="space-y-4"><SkeletonCard height="h-48" /><div className="grid grid-cols-3 gap-2"><SkeletonCard height="h-24" /><SkeletonCard height="h-24" /><SkeletonCard height="h-24" /></div><Notice tone="info" text="Połączono. BMS przygotowuje pierwszą pełną ramkę danych." /></div>;
  const soc = Math.max(0, Math.min(100, battery.soc));
  return <div className="space-y-4">
    {freshness >= 10000 && <Notice tone="warning" text="Połączenie jest aktywne, ale dane nie zostały ostatnio odświeżone." />}
    {battery.errors.length > 0 ? <Notice tone="danger" text={`Alarm BMS: ${battery.errors.join(', ')}`} /> : <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><ShieldCheck size={18} /> Brak aktywnych alarmów</div>}
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-500">Stan naładowania</p><p className="mt-1 text-5xl font-semibold tracking-tight">{soc.toFixed(0)}<span className="text-2xl text-slate-400">%</span></p></div><div className="relative grid h-24 w-24 place-items-center rounded-full" style={{ background: `conic-gradient(#0f766e ${soc * 3.6}deg, #e2e8f0 0deg)` }}><div className="grid h-16 w-16 place-items-center rounded-full bg-white"><BatteryMedium className="text-teal-700" size={28} /></div></div></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-700 transition-[width] duration-500" style={{ width: `${soc}%` }} /></div>
      <div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">Pozostało</span><strong>{battery.remainingCapacity.toFixed(1)} z {battery.capacity.toFixed(1)} Ah</strong></div>
    </section>
    <div className="grid grid-cols-3 gap-2">
      <Metric icon={Gauge} label="Napięcie" value={format(battery.voltage, 2, 'V')} />
      <Metric icon={Activity} label="Prąd" value={format(battery.current, 2, 'A')} />
      <Metric icon={Zap} label="Moc" value={format(battery.power, 0, 'W')} />
    </div>
    <section className="card">
      <SectionTitle title="Temperatury" icon={Thermometer} />
      <div className="mt-4 grid grid-cols-3 gap-2"><MiniValue label="Czujnik 1" value={format(battery.temperatures[0], 1, '°C')} /><MiniValue label="Czujnik 2" value={format(battery.temperatures[1], 1, '°C')} /><MiniValue label="MOS" value={format(battery.mosTemperature, 1, '°C')} /></div>
    </section>
    <section className="card">
      <SectionTitle title="Praca BMS" icon={CircleGauge} />
      <div className="mt-4 grid grid-cols-2 gap-3"><StatePill label="Ładowanie" active={battery.charging} /><StatePill label="Rozładowanie" active={battery.discharging} /><StatePill label="Balansowanie" active={battery.balancing} detail={`${Math.abs(battery.balanceCurrent).toFixed(2)} A`} /><StatePill label="Podgrzewanie" active={battery.heating} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4"><MiniValue label="Kondycja" value={`${battery.soh}%`} /><MiniValue label="Cykle" value={`${battery.cycles}`} /><MiniValue label="Czas pracy" value={duration(battery.runtimeSeconds)} /></div>
    </section>
  </div>;
}

function CellsView({ battery }: { battery: JkBatteryData | null }) {
  if (!battery) return <EmptyState icon={BatteryMedium} title="Brak danych ogniw" text="Połącz z BMS i poczekaj na pierwszą pełną ramkę danych." />;
  const range = Math.max(0.01, battery.maxCellVoltage - battery.minCellVoltage);
  return <div className="space-y-4">
    <section className="card"><SectionTitle title={`${battery.cells.length} aktywne ogniwa`} icon={BatteryMedium} /><div className="mt-4 grid grid-cols-3 gap-2"><MiniValue label="Minimum" value={`${battery.minCellVoltage.toFixed(3)} V`} /><MiniValue label="Średnia" value={`${battery.averageCellVoltage.toFixed(3)} V`} /><MiniValue label="Maksimum" value={`${battery.maxCellVoltage.toFixed(3)} V`} /></div><div className={`mt-4 rounded-xl px-3 py-2 text-center text-sm font-semibold ${battery.deltaCellVoltage <= 0.015 ? 'bg-emerald-50 text-emerald-700' : battery.deltaCellVoltage <= 0.04 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>Różnica {(battery.deltaCellVoltage * 1000).toFixed(0)} mV</div></section>
    <section className="card space-y-3">
      {battery.cells.map((voltage, index) => {
        const isMin = index + 1 === battery.minVoltageCell; const isMax = index + 1 === battery.maxVoltageCell;
        const width = 24 + ((voltage - battery.minCellVoltage) / range) * 76;
        return <div key={index} className="grid grid-cols-[42px_1fr_70px] items-center gap-3"><span className="text-sm font-semibold text-slate-500">{index + 1}</span><div className="h-7 overflow-hidden rounded-lg bg-slate-100"><div className={`flex h-full items-center rounded-lg px-2 text-[10px] font-bold ${isMin ? 'bg-amber-300 text-amber-950' : isMax ? 'bg-teal-700 text-white' : 'bg-teal-100 text-teal-800'}`} style={{ width: `${width}%` }}>{isMin ? 'MIN' : isMax ? 'MAX' : ''}</div></div><div className="text-right"><strong className="text-sm">{voltage.toFixed(3)} V</strong><p className="text-[10px] text-slate-400">{battery.cellResistances[index]?.toFixed(3) ?? '0.000'} Ω</p></div></div>;
      })}
    </section>
  </div>;
}

function HistoryView({ history, onClear }: { history: HistoryPoint[]; onClear: () => void }) {
  const recent = history.slice(-180);
  if (!recent.length) return <EmptyState icon={History} title="Historia jest pusta" text="Po połączeniu aplikacja zapisuje lokalnie próbkę co dziesięć sekund." />;
  return <div className="space-y-4">
    <section className="card"><div className="flex items-center justify-between"><SectionTitle title="Historia lokalna" icon={ChartNoAxesCombined} /><button onClick={onClear} className="text-xs font-semibold text-rose-600">Wyczyść</button></div><p className="mt-2 text-xs text-slate-500">{new Date(recent[0].time).toLocaleString()}  •  {recent.length} próbek</p></section>
    <ChartCard label="Poziom energii" unit="%" color="#0f766e" values={recent.map((item) => item.soc)} />
    <ChartCard label="Napięcie" unit="V" color="#2563eb" values={recent.map((item) => item.voltage)} />
    <ChartCard label="Prąd" unit="A" color="#ea580c" values={recent.map((item) => item.current)} />
    <ChartCard label="Temperatura" unit="°C" color="#dc2626" values={recent.map((item) => item.temperature)} />
  </div>;
}

function SettingsView(props: {
  bluetoothReady: boolean; bluetoothEnabled: boolean; connectionState: ConnectionState; notificationsActive: boolean;
  devices: FoundDevice[]; device: FoundDevice | null; battery: JkBatteryData | null; deviceInfo: JkDeviceInfo | null;
  bmsSettings: JkSettings | null; draft: Partial<Record<JkSettingKey, number | boolean>>; expertCode: string;
  expertUnlocked: boolean; backupAt: number | null; validation: string; writeMessage: string; writing: boolean;
  onScan: () => void; onConnect: (device: FoundDevice) => void; onDisconnect: () => void; onRefresh: () => void;
  onCode: (value: string) => void; onUnlock: () => void; onDraft: (key: JkSettingKey, value: number | boolean) => void;
  onRequestWrite: (definition: JkSettingDefinition) => void; onBackup: () => void;
}) {
  const isConnected = props.connectionState === 'connected';
  return <div className="space-y-4">
    <section className="card"><SectionTitle title="Połączenie" icon={Bluetooth} />
      <div className="mt-4 grid grid-cols-2 gap-2"><Diagnostic label="Bluetooth" ok={props.bluetoothReady && props.bluetoothEnabled} value={props.bluetoothEnabled ? 'Włączony' : 'Wyłączony'} /><Diagnostic label="Dane" ok={props.notificationsActive} value={props.notificationsActive ? 'Aktywne' : 'Nieaktywne'} /></div>
      {isConnected ? <div className="mt-4 rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{props.device?.name}</p><p className="text-xs text-slate-500">Sygnał {props.device?.rssi} dBm</p></div><button onClick={props.onDisconnect} className="button-secondary text-rose-600"><Unplug size={16} /> Rozłącz</button></div><button onClick={props.onRefresh} className="button-primary mt-3"><RefreshCw size={17} /> Odśwież dane i ustawienia</button></div> : <button onClick={props.onScan} disabled={props.connectionState === 'scanning' || props.connectionState === 'connecting'} className="button-primary mt-4"><Search size={18} />{props.connectionState === 'scanning' ? 'Wyszukiwanie urządzeń' : 'Wyszukaj BMS'}</button>}
    </section>
    {props.devices.length > 0 && <section className="card"><SectionTitle title="Znalezione urządzenia" icon={Radio} /><div className="mt-3 space-y-2">{props.devices.map((item) => <button key={item.deviceId} onClick={() => props.onConnect(item)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left"><div className={`grid h-10 w-10 place-items-center rounded-xl ${isJkName(item.name) ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}><Bluetooth size={19} /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.name}</p><p className="truncate text-xs text-slate-400">{item.deviceId}</p></div><span className="text-xs text-slate-500">{item.rssi} dBm</span><ChevronRight size={18} /></button>)}</div></section>}
    {props.deviceInfo && <section className="card"><SectionTitle title="Informacje o urządzeniu" icon={CircleHelp} /><div className="mt-4 divide-y divide-slate-100 text-sm"><InfoRow label="Model" value={props.deviceInfo.model} /><InfoRow label="Sprzęt" value={props.deviceInfo.hardwareVersion} /><InfoRow label="Oprogramowanie" value={props.deviceInfo.softwareVersion} /><InfoRow label="Numer seryjny" value={props.deviceInfo.serialNumber} /><InfoRow label="Data produkcji" value={props.deviceInfo.manufacturingDate || 'Brak danych'} /><InfoRow label="Uruchomienia" value={`${props.deviceInfo.powerOnCount}`} /></div></section>}
    {isConnected && !props.bmsSettings && <Notice tone="info" text="Oczekiwanie na pełną ramkę ustawień. Użyj przycisku odświeżania, jeżeli dane nie pojawią się po kilku sekundach." />}
    {props.bmsSettings && <>
      <section className="card"><div className="flex items-center justify-between"><SectionTitle title="Kopia ustawień" icon={Save} /><button onClick={props.onBackup} className="button-secondary"><Download size={16} /> Zapisz</button></div><p className="mt-3 text-sm text-slate-500">{props.backupAt ? `Ostatnia kopia ${new Date(props.backupAt).toLocaleString()}` : 'Przed pierwszą zmianą zapisz kopię bieżących parametrów.'}</p></section>
      {!props.expertUnlocked ? <section className="card"><SectionTitle title="Zmiana ustawień BMS" icon={LockKeyhole} /><p className="mt-3 text-sm leading-6 text-slate-600">Zmiana parametrów wpływa bezpośrednio na ochronę akumulatora. Podaj kod ustawień JK, aby odblokować edycję.</p><div className="mt-4 flex gap-2"><input type="password" inputMode="numeric" maxLength={6} value={props.expertCode} onChange={(event) => props.onCode(event.target.value)} placeholder="Kod ustawień" className="input flex-1" /><button onClick={props.onUnlock} className="button-primary w-auto px-5">Odblokuj</button></div>{props.writeMessage && <p className="mt-3 text-sm text-amber-700">{props.writeMessage}</p>}</section> : <section className="card"><SectionTitle title="Parametry ochrony" icon={SlidersHorizontal} /><p className="mt-2 text-xs leading-5 text-slate-500">Każda zmiana jest wysyłana osobno i sprawdzana po ponownym odczycie z BMS.</p>{props.validation && <div className="mt-3"><Notice tone="warning" text={props.validation} /></div>}<div className="mt-4 divide-y divide-slate-100">{JK_SETTING_DEFINITIONS.map((definition) => <SettingRow key={definition.key} definition={definition} value={props.draft[definition.key]} disabled={props.writing} onChange={(value) => props.onDraft(definition.key, value)} onSave={() => props.onRequestWrite(definition)} />)}</div>{props.writeMessage && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{props.writeMessage}</p>}</section>}
    </>}
    <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-900"><strong>Wskazówka</strong><p>Zamknij oficjalną aplikację JK przed połączeniem. Jeden moduł BMS zwykle obsługuje tylko jedno aktywne połączenie Bluetooth.</p></section>
  </div>;
}

function SettingRow({ definition, value, disabled, onChange, onSave }: { definition: JkSettingDefinition; value: number | boolean | undefined; disabled: boolean; onChange: (value: number | boolean) => void; onSave: () => void }) {
  if (definition.kind === 'switch') return <div className="flex items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{definition.label}</p>{definition.dangerous && <p className="text-xs text-rose-600">Ustawienie krytyczne</p>}</div><button disabled={disabled} onClick={() => onChange(!value)} className={`relative h-7 w-12 rounded-full transition ${value ? 'bg-teal-700' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${value ? 'left-6' : 'left-1'}`} /></button><button disabled={disabled} onClick={onSave} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-700"><Save size={16} /></button></div>;
  return <div className="py-4"><div className="mb-2 flex items-center justify-between gap-2"><label className="text-sm font-medium">{definition.label}</label>{definition.dangerous && <span className="text-[10px] font-semibold uppercase text-rose-600">Krytyczne</span>}</div><div className="flex items-center gap-2"><input disabled={disabled} type="number" inputMode="decimal" min={definition.min} max={definition.max} step={definition.step} value={typeof value === 'number' ? value : ''} onChange={(event) => onChange(Number(event.target.value))} className="input min-w-0 flex-1" /><span className="w-8 text-sm text-slate-500">{definition.unit}</span><button disabled={disabled} onClick={onSave} className="grid h-11 w-11 place-items-center rounded-xl bg-teal-700 text-white disabled:opacity-40"><Save size={17} /></button></div><p className="mt-1 text-[11px] text-slate-400">Zakres {definition.min} do {definition.max} {definition.unit}</p></div>;
}

function ConfirmSheet({ definition, oldValue, newValue, validation, writing, onCancel, onConfirm }: { definition: JkSettingDefinition; oldValue: number | boolean | undefined; newValue: number | boolean | undefined; validation: string; writing: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 backdrop-blur-sm"><div className="safe-bottom mx-auto w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl"><div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200" /><div className="flex items-start gap-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${definition.dangerous ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700'}`}><AlertTriangle size={21} /></div><div><h3 className="font-semibold">Potwierdź zmianę</h3><p className="mt-1 text-sm text-slate-500">{definition.label}</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><MiniValue label="Obecnie" value={`${String(oldValue)} ${definition.unit}`} /><MiniValue label="Po zmianie" value={`${String(newValue)} ${definition.unit}`} /></div>{validation && <div className="mt-4"><Notice tone="danger" text={validation} /></div>}<p className="mt-4 text-xs leading-5 text-slate-500">Podczas zapisu nie wyłączaj BMS ani Bluetooth. Aplikacja sprawdzi wartość po ponownym odczycie.</p><div className="mt-5 grid grid-cols-2 gap-3"><button disabled={writing} onClick={onCancel} className="button-secondary justify-center">Anuluj</button><button disabled={writing || Boolean(validation)} onClick={onConfirm} className="button-primary">{writing ? <RefreshCw className="animate-spin" size={17} /> : <Check size={17} />} Potwierdź</button></div></div></div>;
}

function ChartCard({ label, unit, color, values }: { label: string; unit: string; color: string; values: number[] }) {
  const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(max - min, 0.001);
  const points = values.map((value, index) => `${values.length === 1 ? 50 : (index / (values.length - 1)) * 100},${48 - ((value - min) / span) * 42}`).join(' ');
  const gradientId = `chart${label.length}${unit.charCodeAt(0)}`;
  return <section className="card"><div className="flex items-end justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{values[values.length - 1]?.toFixed(unit === '%' ? 0 : 1)} {unit}</p></div><p className="text-xs text-slate-400">{min.toFixed(1)} do {max.toFixed(1)}</p></div><svg className="mt-4 h-28 w-full overflow-visible" viewBox="0 0 100 52" preserveAspectRatio="none"><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs><polygon points={`0,52 ${points} 100,52`} fill={`url(#${gradientId})`} /><polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg></section>;
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
