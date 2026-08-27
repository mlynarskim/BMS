import { describe, expect, it } from 'vitest';
import {
  JK_SETTING_DEFINITIONS,
  JkFrameAssembler,
  buildJkCommand,
  buildJkTextCommand,
  buildSettingWrite,
  isValidJkFrame,
  parseJkFrame,
} from './jkBms';

const writeUint16 = (frame: Uint8Array, offset: number, value: number) => {
  frame[offset] = value & 0xff;
  frame[offset + 1] = (value >>> 8) & 0xff;
};

const writeUint32 = (frame: Uint8Array, offset: number, value: number) => {
  const encoded = value >>> 0;
  frame[offset] = encoded & 0xff;
  frame[offset + 1] = (encoded >>> 8) & 0xff;
  frame[offset + 2] = (encoded >>> 16) & 0xff;
  frame[offset + 3] = (encoded >>> 24) & 0xff;
};

const finalize = (frame: Uint8Array) => {
  frame[299] = frame.subarray(0, 299).reduce((sum, byte) => (sum + byte) & 0xff, 0);
  return frame;
};

const makeFrame = (type: number) => {
  const frame = new Uint8Array(300);
  frame.set([0x55, 0xaa, 0xeb, 0x90, type]);
  return frame;
};

describe('JK commands', () => {
  it('builds a checksummed read command', () => {
    const view = buildJkCommand(0x96);
    const frame = new Uint8Array(view.buffer);
    expect(frame).toHaveLength(20);
    expect(Array.from(frame.slice(0, 6))).toEqual([0xaa, 0x55, 0x90, 0xeb, 0x96, 0]);
    expect(frame[19]).toBe(frame.slice(0, 19).reduce((sum, byte) => (sum + byte) & 0xff, 0));
  });

  it('allows safe low temperature protection and rejects negative charging thresholds', () => {
    const protection = JK_SETTING_DEFINITIONS.find((item) => item.key === 'chargeUnderTemperature');
    const recovery = JK_SETTING_DEFINITIONS.find((item) => item.key === 'chargeUnderTemperatureRecovery');
    expect(protection).toBeDefined();
    expect(recovery).toBeDefined();
    expect(buildSettingWrite(protection!, 0, 'JK02 24S')).toEqual({ register: 0x18, value: 0, length: 4 });
    expect(buildSettingWrite(recovery!, 5, 'JK02 24S')).toEqual({ register: 0x19, value: 50, length: 4 });
    expect(() => buildSettingWrite(protection!, -1, 'JK02 24S')).toThrow();
  });

  it('encodes a settings password as ASCII', () => {
    const view = buildJkTextCommand(0x70, '654321');
    const frame = new Uint8Array(view.buffer);
    expect(Array.from(frame.slice(0, 6))).toEqual([0xaa, 0x55, 0x90, 0xeb, 0x70, 6]);
    expect(new TextDecoder().decode(frame.slice(6, 12))).toBe('654321');
    expect(frame[19]).toBe(frame.slice(0, 19).reduce((sum, byte) => (sum + byte) & 0xff, 0));
  });
});

describe('JK frame assembly and parsing', () => {
  it('assembles a frame split across Bluetooth notifications', () => {
    const frame = finalize(makeFrame(0x05));
    const assembler = new JkFrameAssembler();
    expect(assembler.push(Uint8Array.from([1, 2, 3, ...frame.slice(0, 117)]))).toEqual([]);
    const frames = assembler.push(frame.slice(117));
    expect(frames).toHaveLength(1);
    expect(isValidJkFrame(frames[0])).toBe(true);
  });

  it('parses a realistic 4S status frame', () => {
    const frame = makeFrame(0x02);
    [3321, 3324, 3323, 3322].forEach((value, index) => writeUint16(frame, 6 + index * 2, value));
    [118, 121, 116, 119].forEach((value, index) => writeUint16(frame, 64 + index * 2, value));
    writeUint32(frame, 54, 0b1111);
    writeUint32(frame, 118, 13290);
    writeUint32(frame, 126, -8400);
    writeUint16(frame, 130, 246);
    writeUint16(frame, 132, 251);
    writeUint16(frame, 134, 262);
    writeUint16(frame, 138, 420);
    frame[140] = 1;
    frame[141] = 78;
    writeUint32(frame, 142, 218400);
    writeUint32(frame, 146, 280000);
    writeUint32(frame, 150, 47);
    writeUint32(frame, 154, 12140000);
    frame[158] = 99;
    writeUint32(frame, 162, 864000);
    frame[166] = 1;
    frame[167] = 1;
    const parsed = parseJkFrame(finalize(frame));
    expect(parsed.type).toBe('status');
    if (parsed.type !== 'status') return;
    expect(parsed.value.protocol).toBe('JK02 24S');
    expect(parsed.value.cells).toHaveLength(4);
    [3.321, 3.324, 3.323, 3.322].forEach((value, index) => expect(parsed.value.cells[index]).toBeCloseTo(value));
    expect(parsed.value.voltage).toBeCloseTo(13.29);
    expect(parsed.value.current).toBeCloseTo(-8.4);
    expect(parsed.value.soc).toBe(78);
    expect(parsed.value.discharging).toBe(true);
  });

  it('parses settings used by the editor', () => {
    const frame = makeFrame(0x01);
    writeUint32(frame, 10, 2600);
    writeUint32(frame, 14, 2900);
    writeUint32(frame, 18, 3600);
    writeUint32(frame, 22, 3500);
    writeUint32(frame, 26, 10);
    writeUint32(frame, 50, 100000);
    writeUint32(frame, 62, 150000);
    writeUint32(frame, 78, 2000);
    writeUint32(frame, 98, 0);
    writeUint32(frame, 102, 50);
    writeUint32(frame, 114, 4);
    frame[118] = 1;
    frame[122] = 1;
    frame[126] = 1;
    writeUint32(frame, 130, 280000);
    writeUint32(frame, 138, 3400);
    const parsed = parseJkFrame(finalize(frame));
    expect(parsed.type).toBe('settings');
    if (parsed.type !== 'settings') return;
    expect(parsed.value.cellCount).toBe(4);
    expect(parsed.value.capacity).toBe(280);
    expect(parsed.value.chargeUnderTemperature).toBe(0);
    expect(parsed.value.chargeUnderTemperatureRecovery).toBe(5);
    expect(parsed.value.chargingEnabled).toBe(true);
  });

  it('reads the settings password from device information', () => {
    const frame = makeFrame(0x03);
    frame.set(new TextEncoder().encode('JK-B2A8S20P'), 6);
    frame.set(new TextEncoder().encode('1234'), 62);
    frame.set(new TextEncoder().encode('123456'), 118);
    const parsed = parseJkFrame(finalize(frame));
    expect(parsed.type).toBe('device');
    if (parsed.type !== 'device') return;
    expect(parsed.value.bluetoothPassword).toBe('1234');
    expect(parsed.value.settingsPassword).toBe('123456');
  });
});
