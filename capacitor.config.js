const config = {
    appId: 'com.bmsreader.app',
    appName: 'BMS Reader',
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
