import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mlynarski.bmsmonitor',
  appName: 'BMS Monitor',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "Skanowanie urządzeń BMS...",
        cancel: "Anuluj",
        availableDevices: "Dostępne urządzenia",
        noDeviceFound: "Nie znaleziono urządzeń"
      }
    }
  }
};

export default config;
