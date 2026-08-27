import type { BleCharacteristic, BleClientInterface, BleService } from '@capacitor-community/bluetooth-le';

export const JK_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const RESPONSE_HEADER = [0x55, 0xaa, 0xeb, 0x90] as const;
const FRAME_SIZE = 300;
const MAX_BUFFER_SIZE = 900;

export type JkProtocol = 'JK02 24S' | 'JK02 32S';

export interface JkGattPath {
  service: string;
  notify: string;
  write: string;
  writeWithoutResponse: boolean;
}

export interface JkBatteryData {
  voltage: number;
  current: number;
  power: number;
  soc: number;
  temperatures: number[];
  mosTemperature: number;
  charging: boolean;
  discharging: boolean;
  balancing: boolean;
  balanceCurrent: number;
  chargeMosEnabled: boolean;
  dischargeMosEnabled: boolean;
  precharging: boolean;
  heating: boolean;
  remainingCapacity: number;
  capacity: number;
  cycles: number;
  cycleCapacity: number;
  soh: number;
  runtimeSeconds: number;
  cells: number[];
  cellResistances: number[];
  minCellVoltage: number;
  maxCellVoltage: number;
  averageCellVoltage: number;
  minVoltageCell: number;
  maxVoltageCell: number;
  deltaCellVoltage: number;
  errorMask: number;
  errors: string[];
  protocol: JkProtocol;
  rawData: string;
}

export interface JkDeviceInfo {
  model: string;
  hardwareVersion: string;
  softwareVersion: string;
  uptimeSeconds: number;
  powerOnCount: number;
  deviceName: string;
  bluetoothPassword: string;
  settingsPassword: string;
  manufacturingDate: string;
  serialNumber: string;
}

export interface JkSettings {
  smartSleepVoltage: number;
  cellUvp: number;
  cellUvpr: number;
  cellOvp: number;
  cellOvpr: number;
  balanceTriggerDelta: number;
  soc100Voltage: number;
  soc0Voltage: number;
  requestedChargeVoltage: number;
  requestedFloatVoltage: number;
  powerOffVoltage: number;
  maxChargeCurrent: number;
  maxDischargeCurrent: number;
  maxBalanceCurrent: number;
  chargeOverTemperature: number;
  chargeOverTemperatureRecovery: number;
  dischargeOverTemperature: number;
  dischargeOverTemperatureRecovery: number;
  chargeUnderTemperature: number;
  chargeUnderTemperatureRecovery: number;
  mosOverTemperature: number;
  mosOverTemperatureRecovery: number;
  cellCount: number;
  chargingEnabled: boolean;
  dischargingEnabled: boolean;
  balancerEnabled: boolean;
  capacity: number;
  balancingStartVoltage: number;
  shortCircuitDelay: number;
}

export type JkParsedFrame =
  | { type: 'status'; value: JkBatteryData }
  | { type: 'settings'; value: JkSettings }
  | { type: 'device'; value: JkDeviceInfo }
  | { type: 'log'; rawData: string };

export type JkSettingKey =
  | 'cellUvp' | 'cellUvpr' | 'cellOvp' | 'cellOvpr'
  | 'balanceTriggerDelta' | 'balancingStartVoltage'
  | 'maxChargeCurrent' | 'maxDischargeCurrent' | 'maxBalanceCurrent'
  | 'chargeOverTemperature' | 'chargeOverTemperatureRecovery'
  | 'chargeUnderTemperature' | 'chargeUnderTemperatureRecovery'
  | 'capacity' | 'chargingEnabled' | 'dischargingEnabled' | 'balancerEnabled';

export interface JkSettingDefinition {
  key: JkSettingKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  factor: number;
  length: 4;
  register24: number;
  register32: number;
  dangerous?: boolean;
  kind?: 'switch';
}

export const JK_SETTING_DEFINITIONS: JkSettingDefinition[] = [
  { key: 'cellUvp', label: 'Ochrona niskiego napięcia ogniwa', unit: 'V', min: 2, max: 3.2, step: 0.01, factor: 1000, length: 4, register24: 0x02, register32: 0x02 },
  { key: 'cellUvpr', label: 'Powrót po niskim napięciu', unit: 'V', min: 2.1, max: 3.4, step: 0.01, factor: 1000, length: 4, register24: 0x03, register32: 0x03 },
  { key: 'cellOvp', label: 'Ochrona wysokiego napięcia ogniwa', unit: 'V', min: 3.4, max: 4.25, step: 0.01, factor: 1000, length: 4, register24: 0x04, register32: 0x04 },
  { key: 'cellOvpr', label: 'Powrót po wysokim napięciu', unit: 'V', min: 3.2, max: 4.2, step: 0.01, factor: 1000, length: 4, register24: 0x05, register32: 0x05 },
  { key: 'balanceTriggerDelta', label: 'Różnica uruchamiająca balans', unit: 'V', min: 0.002, max: 0.2, step: 0.001, factor: 1000, length: 4, register24: 0x06, register32: 0x06 },
  { key: 'balancingStartVoltage', label: 'Napięcie startu balansowania', unit: 'V', min: 2.8, max: 4.2, step: 0.01, factor: 1000, length: 4, register24: 0x26, register32: 0x22 },
  { key: 'maxChargeCurrent', label: 'Maksymalny prąd ładowania', unit: 'A', min: 1, max: 300, step: 1, factor: 1000, length: 4, register24: 0x0c, register32: 0x0c, dangerous: true },
  { key: 'maxDischargeCurrent', label: 'Maksymalny prąd rozładowania', unit: 'A', min: 1, max: 500, step: 1, factor: 1000, length: 4, register24: 0x0f, register32: 0x0f, dangerous: true },
  { key: 'maxBalanceCurrent', label: 'Maksymalny prąd balansowania', unit: 'A', min: 0.1, max: 10, step: 0.1, factor: 1000, length: 4, register24: 0x13, register32: 0x13 },
  { key: 'chargeOverTemperature', label: 'Maksymalna temperatura ładowania', unit: '°C', min: 30, max: 80, step: 1, factor: 10, length: 4, register24: 0x14, register32: 0x14 },
  { key: 'chargeOverTemperatureRecovery', label: 'Powrót po wysokiej temperaturze ładowania', unit: '°C', min: 20, max: 75, step: 1, factor: 10, length: 4, register24: 0x15, register32: 0x15 },
  { key: 'chargeUnderTemperature', label: 'Minimalna temperatura ładowania', unit: '°C', min: 0, max: 14, step: 1, factor: 10, length: 4, register24: 0x18, register32: 0x18 },
  { key: 'chargeUnderTemperatureRecovery', label: 'Powrót po niskiej temperaturze ładowania', unit: '°C', min: 1, max: 15, step: 1, factor: 10, length: 4, register24: 0x19, register32: 0x19 },
  { key: 'capacity', label: 'Pojemność znamionowa', unit: 'Ah', min: 1, max: 2000, step: 1, factor: 1000, length: 4, register24: 0x20, register32: 0x20, dangerous: true },
  { key: 'chargingEnabled', label: 'Ładowanie', unit: '', min: 0, max: 1, step: 1, factor: 1, length: 4, register24: 0x1d, register32: 0x1d, dangerous: true, kind: 'switch' },
  { key: 'dischargingEnabled', label: 'Rozładowanie', unit: '', min: 0, max: 1, step: 1, factor: 1, length: 4, register24: 0x1e, register32: 0x1e, dangerous: true, kind: 'switch' },
  { key: 'balancerEnabled', label: 'Balansowanie', unit: '', min: 0, max: 1, step: 1, factor: 1, length: 4, register24: 0x1f, register32: 0x1f, kind: 'switch' },
];

const uuidMatches = (uuid: string, shortUuid: string): boolean => {
  const normalized = uuid.toLowerCase().replace(/-/g, '');
  return normalized === shortUuid || normalized.startsWith(`0000${shortUuid}`);
};
const isWritable = (item: BleCharacteristic): boolean => item.properties.write || item.properties.writeWithoutResponse;
const isNotifiable = (item: BleCharacteristic): boolean => item.properties.notify || item.properties.indicate;

export function selectJkGattPath(services: BleService[]): JkGattPath {
  const preferred = services.find((service) => uuidMatches(service.uuid, 'ffe0'));
  const ordered = preferred ? [preferred, ...services.filter((service) => service !== preferred)] : services;
  for (const service of ordered) {
    const items = service.characteristics ?? [];
    const ffe1 = items.find((item) => uuidMatches(item.uuid, 'ffe1'));
    const notify = (ffe1 && isNotifiable(ffe1) ? ffe1 : undefined) ?? items.find(isNotifiable);
    const write = (ffe1 && isWritable(ffe1) ? ffe1 : undefined) ?? items.find((item) => uuidMatches(item.uuid, 'ffe2') && isWritable(item)) ?? items.find(isWritable);
    if (notify && write) return { service: service.uuid, notify: notify.uuid, write: write.uuid, writeWithoutResponse: write.properties.writeWithoutResponse };
  }
  throw new Error('BMS nie udostępnia kanału danych. Zamknij oficjalną aplikację JK i spróbuj ponownie.');
}

export function buildJkCommand(register: number, value = 0, length = 0): DataView {
  const frame = new Uint8Array(20);
  frame.set([0xaa, 0x55, 0x90, 0xeb, register & 0xff, length & 0xff], 0);
  const encoded = Math.round(value) >>> 0;
  frame[6] = encoded & 0xff;
  frame[7] = (encoded >>> 8) & 0xff;
  frame[8] = (encoded >>> 16) & 0xff;
  frame[9] = (encoded >>> 24) & 0xff;
  frame[19] = checksum(frame.subarray(0, 19));
  return new DataView(frame.buffer);
}

export function buildJkTextCommand(register: number, value: string): DataView {
  const encoded = new TextEncoder().encode(value);
  if (!encoded.length || encoded.length > 10 || Array.from(encoded).some((byte) => byte > 0x7f)) {
    throw new Error('Tekst polecenia JK musi zawierać od 1 do 10 znaków ASCII.');
  }
  const frame = new Uint8Array(20);
  frame.set([0xaa, 0x55, 0x90, 0xeb, register & 0xff, encoded.length & 0xff], 0);
  frame.set(encoded, 6);
  frame[19] = checksum(frame.subarray(0, 19));
  return new DataView(frame.buffer);
}

export async function writeJkCommand(client: BleClientInterface, deviceId: string, path: JkGattPath, register = 0x96, value = 0, length = 0): Promise<void> {
  const frame = buildJkCommand(register, value, length);
  if (path.writeWithoutResponse) await client.writeWithoutResponse(deviceId, path.service, path.write, frame);
  else await client.write(deviceId, path.service, path.write, frame);
}

export async function writeJkTextCommand(client: BleClientInterface, deviceId: string, path: JkGattPath, register: number, value: string): Promise<void> {
  const frame = buildJkTextCommand(register, value);
  if (path.writeWithoutResponse) await client.writeWithoutResponse(deviceId, path.service, path.write, frame);
  else await client.write(deviceId, path.service, path.write, frame);
}

export function buildSettingWrite(definition: JkSettingDefinition, value: number | boolean, protocol: JkProtocol): { register: number; value: number; length: number } {
  const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  if (!Number.isFinite(numeric) || numeric < definition.min || numeric > definition.max) throw new Error(`Wartość musi mieścić się w zakresie ${definition.min} do ${definition.max} ${definition.unit}.`);
  return { register: protocol === 'JK02 32S' ? definition.register32 : definition.register24, value: Math.round(numeric * definition.factor), length: definition.length };
}

export class JkFrameAssembler {
  private buffer: number[] = [];
  reset(): void { this.buffer = []; }
  push(chunk: Uint8Array): Uint8Array[] {
    if (!chunk.length) return [];
    this.buffer.push(...chunk);
    if (this.buffer.length > MAX_BUFFER_SIZE) this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE);
    const frames: Uint8Array[] = [];
    while (this.buffer.length >= 4) {
      const start = findHeader(this.buffer);
      if (start < 0) { this.buffer = this.buffer.slice(-3); break; }
      if (start > 0) this.buffer.splice(0, start);
      if (this.buffer.length < FRAME_SIZE) break;
      const candidate = Uint8Array.from(this.buffer.slice(0, FRAME_SIZE));
      if (isValidJkFrame(candidate)) { frames.push(candidate); this.buffer.splice(0, FRAME_SIZE); }
      else this.buffer.shift();
    }
    return frames;
  }
}

export function isValidJkFrame(frame: Uint8Array): boolean {
  return frame.length >= FRAME_SIZE && RESPONSE_HEADER.every((byte, index) => frame[index] === byte) && checksum(frame.subarray(0, FRAME_SIZE - 1)) === frame[FRAME_SIZE - 1];
}

export function parseJkFrame(frame: Uint8Array, protocolHint?: JkProtocol): JkParsedFrame {
  if (!isValidJkFrame(frame)) throw new Error('Odebrana ramka JK ma nieprawidłową sumę kontrolną.');
  if (frame[4] === 0x02) return { type: 'status', value: parseJkStatusFrame(frame, protocolHint) };
  if (frame[4] === 0x01) return { type: 'settings', value: parseJkSettingsFrame(frame) };
  if (frame[4] === 0x03) return { type: 'device', value: parseJkDeviceInfoFrame(frame) };
  if (frame[4] === 0x05) return { type: 'log', rawData: toHex(frame) };
  throw new Error(`Nieobsługiwany typ ramki JK ${frame[4]} dla ${protocolHint ?? 'nierozpoznanego protokołu'}.`);
}

export function parseJkStatusFrame(frame: Uint8Array, protocolHint?: JkProtocol): JkBatteryData {
  const candidates = [parseStatusCandidate(frame, 24, 0, 'JK02 24S'), parseStatusCandidate(frame, 32, 32, 'JK02 32S')];
  const hinted = protocolHint ? candidates.find((candidate) => candidate.protocol === protocolHint) : undefined;
  const selected = hinted && hinted.score >= 10 ? hinted : candidates.sort((a, b) => b.score - a.score)[0];
  if (!selected || selected.score < 10) throw new Error('Nie udało się rozpoznać wersji protokołu JK.');
  const { score, ...data } = selected;
  void score;
  return data;
}

function parseStatusCandidate(frame: Uint8Array, slots: 24 | 32, dataOffset: 0 | 32, protocol: JkProtocol): JkBatteryData & { score: number } {
  const cells: number[] = [];
  const cellResistances: number[] = [];
  for (let index = 0; index < slots; index += 1) {
    const voltage = readUint16LE(frame, 6 + index * 2) * 0.001;
    if (voltage >= 1.5 && voltage <= 5) {
      cells.push(voltage);
      cellResistances.push(readUint16LE(frame, 64 + dataOffset / 2 + index * 2) * 0.001);
    }
  }
  const voltage = readUint32LE(frame, 118 + dataOffset) * 0.001;
  const measuredCurrent = readInt32LE(frame, 126 + dataOffset) * 0.001;
  const current = Math.abs(measuredCurrent) < 0.05 ? 0 : measuredCurrent;
  const temperatures = [readInt16LE(frame, 130 + dataOffset) * 0.1, readInt16LE(frame, 132 + dataOffset) * 0.1].filter(isPlausibleTemperature);
  const mosTemperature = slots === 32 ? readInt16LE(frame, 144) * 0.1 : readInt16LE(frame, 134) * 0.1;
  const errorMask = slots === 32 ? readUint32LE(frame, 166) : readUint16LE(frame, 136);
  const balanceCurrent = readInt16LE(frame, 138 + dataOffset) * 0.001;
  const min = cells.length ? Math.min(...cells) : 0;
  const max = cells.length ? Math.max(...cells) : 0;
  const minIndex = cells.length ? cells.indexOf(min) + 1 : 0;
  const maxIndex = cells.length ? cells.indexOf(max) + 1 : 0;
  const average = cells.length ? cells.reduce((sum, item) => sum + item, 0) / cells.length : 0;
  const capacity = readUint32LE(frame, 146 + dataOffset) * 0.001;
  const soc = frame[141 + dataOffset] ?? 0;
  const enabledMaskOffset = slots === 32 ? 70 : 54;
  const enabledCells = countBits32(readUint32LE(frame, enabledMaskOffset));
  let score = cells.length >= 2 ? 4 : 0;
  if (voltage >= 5 && voltage <= 180) score += 2;
  if (Math.abs(cells.reduce((sum, item) => sum + item, 0) - voltage) <= Math.max(1, cells.length * 0.15)) score += 6;
  if (enabledCells === cells.length && enabledCells > 0) score += 4;
  if (soc <= 100) score += 1;
  if (capacity > 0 && capacity < 5000) score += 1;
  return {
    voltage, current, power: voltage * current, soc, temperatures,
    mosTemperature: isPlausibleTemperature(mosTemperature) ? mosTemperature : 0,
    charging: current > 0.05, discharging: current < -0.05,
    balancing: (frame[140 + dataOffset] ?? 0) !== 0,
    balanceCurrent, chargeMosEnabled: frame[166 + dataOffset] === 1,
    dischargeMosEnabled: frame[167 + dataOffset] === 1,
    precharging: frame[168 + dataOffset] === 1, heating: frame[183 + dataOffset] === 1,
    remainingCapacity: readUint32LE(frame, 142 + dataOffset) * 0.001,
    capacity, cycles: readUint32LE(frame, 150 + dataOffset),
    cycleCapacity: readUint32LE(frame, 154 + dataOffset) * 0.001,
    soh: frame[158 + dataOffset] ?? 0, runtimeSeconds: readUint32LE(frame, 162 + dataOffset),
    cells, cellResistances, minCellVoltage: min, maxCellVoltage: max,
    averageCellVoltage: average, minVoltageCell: minIndex, maxVoltageCell: maxIndex,
    deltaCellVoltage: max - min, errorMask, errors: decodeErrors(errorMask), protocol,
    rawData: toHex(frame), score,
  };
}

export function parseJkSettingsFrame(frame: Uint8Array): JkSettings {
  const value = (offset: number, factor = 1000) => readInt32LE(frame, offset) / factor;
  return {
    smartSleepVoltage: value(6), cellUvp: value(10), cellUvpr: value(14), cellOvp: value(18), cellOvpr: value(22),
    balanceTriggerDelta: value(26), soc100Voltage: value(30), soc0Voltage: value(34), requestedChargeVoltage: value(38), requestedFloatVoltage: value(42),
    powerOffVoltage: value(46), maxChargeCurrent: value(50), maxDischargeCurrent: value(62), maxBalanceCurrent: value(78),
    chargeOverTemperature: value(82, 10), chargeOverTemperatureRecovery: value(86, 10), dischargeOverTemperature: value(90, 10), dischargeOverTemperatureRecovery: value(94, 10),
    chargeUnderTemperature: value(98, 10), chargeUnderTemperatureRecovery: value(102, 10), mosOverTemperature: value(106, 10), mosOverTemperatureRecovery: value(110, 10),
    cellCount: readUint32LE(frame, 114), chargingEnabled: frame[118] === 1, dischargingEnabled: frame[122] === 1, balancerEnabled: frame[126] === 1,
    capacity: value(130), shortCircuitDelay: readUint32LE(frame, 134), balancingStartVoltage: value(138),
  };
}

export function parseJkDeviceInfoFrame(frame: Uint8Array): JkDeviceInfo {
  return {
    model: readAscii(frame, 6, 16), hardwareVersion: readAscii(frame, 22, 8), softwareVersion: readAscii(frame, 30, 8),
    uptimeSeconds: readUint32LE(frame, 38), powerOnCount: readUint32LE(frame, 42), deviceName: readAscii(frame, 46, 16),
    bluetoothPassword: readAscii(frame, 62, 16), manufacturingDate: formatManufacturingDate(readAscii(frame, 78, 6)),
    serialNumber: readAscii(frame, 86, 11), settingsPassword: readAscii(frame, 118, 16),
  };
}

function decodeErrors(mask: number): string[] {
  const labels = [
    'Nieprawidłowa rezystancja przewodu', 'Przegrzanie MOS', 'Liczba ogniw różna od ustawionej', '',
    'Akumulator w pełni naładowany', 'Wysokie napięcie pakietu', 'Przeciążenie ładowania', 'Zwarcie podczas ładowania',
    'Wysoka temperatura ładowania', 'Niska temperatura ładowania', 'Błąd komunikacji sterownika', 'Niskie napięcie ogniwa',
    'Niskie napięcie pakietu', 'Przeciążenie rozładowania', 'Zwarcie podczas rozładowania', 'Wysoka temperatura rozładowania',
    'Błąd MOS ładowania', 'Błąd MOS rozładowania', 'Brak połączenia GPS', 'Wymagana zmiana hasła',
    'Nie udało się włączyć rozładowania', 'Wysoka temperatura akumulatora', 'Błąd czujnika temperatury', 'Błąd modułu PCL',
    'Nie udało się zwolnić ochrony zwarciowej', 'Drugi stopień przeciążenia rozładowania', 'Trzeci stopień przeciążenia rozładowania', 'Niska temperatura rozładowania',
    'Zdalna blokada GPS', '', '', '',
  ];
  return labels.filter((label, index) => Boolean(label) && ((mask >>> index) & 1) === 1);
}

function checksum(bytes: Uint8Array): number { let sum = 0; for (const byte of bytes) sum = (sum + byte) & 0xff; return sum; }
function findHeader(bytes: number[]): number { for (let index = 0; index <= bytes.length - 4; index += 1) if (RESPONSE_HEADER.every((byte, offset) => bytes[index + offset] === byte)) return index; return -1; }
function readUint16LE(bytes: Uint8Array, offset: number): number { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8); }
function readInt16LE(bytes: Uint8Array, offset: number): number { const value = readUint16LE(bytes, offset); return value & 0x8000 ? value - 0x10000 : value; }
function readUint32LE(bytes: Uint8Array, offset: number): number { return ((bytes[offset] ?? 0) + (bytes[offset + 1] ?? 0) * 0x100 + (bytes[offset + 2] ?? 0) * 0x10000 + (bytes[offset + 3] ?? 0) * 0x1000000) >>> 0; }
function readInt32LE(bytes: Uint8Array, offset: number): number { const value = readUint32LE(bytes, offset); return value > 0x7fffffff ? value - 0x100000000 : value; }
function countBits32(value: number): number { let rest = value >>> 0; let count = 0; while (rest) { count += rest & 1; rest >>>= 1; } return count; }
function isPlausibleTemperature(value: number): boolean { return Number.isFinite(value) && value >= -50 && value <= 150; }
function readAscii(bytes: Uint8Array, offset: number, length: number): string { return new TextDecoder().decode(bytes.slice(offset, offset + length)).replace(/\0/g, '').trim(); }
function formatManufacturingDate(raw: string): string { return /^\d{6}$/.test(raw) ? `20${raw.slice(0, 2)}.${raw.slice(2, 4)}.${raw.slice(4, 6)}` : raw; }
function toHex(bytes: Uint8Array): string { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ').toUpperCase(); }
