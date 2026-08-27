import { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.mlynarski.bmsmonitor',
  appName: 'BMS Monitor',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.None
    },
    BluetoothLe: {
      displayStrings: {
        scanning: "Scanning for BMS devices...",
        cancel: "Cancel",
        availableDevices: "Available devices",
        noDeviceFound: "No devices found"
      }
    }
  }
};

export default config;
