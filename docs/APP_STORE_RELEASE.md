# App Store release checklist

## App identity

App name: BMS Monitor: LiFePO4

Bundle ID: com.mlynarski.bmsmonitor

Primary category: Utilities

Version: 1.1.1

Build: 3

Minimum iOS version: 16.0

Supported devices: iPhone

## Store URLs

Privacy Policy: https://mlynarskimateusz.pl/BMS/Privacy.html

Terms of Use: https://mlynarskimateusz.pl/BMS/Terms.html

Support URL: https://mlynarskimateusz.pl/

## Suggested metadata

Subtitle: LiFePO4 Battery Monitor

Promotional text: Monitor compatible JK BMS batteries over Bluetooth, inspect every cell and review essential protection settings.

Keywords: bms,lifepo4,battery,jk bms,bluetooth,cell voltage,solar,camper,rv,energy

Description:

BMS Monitor: LiFePO4 is an independent monitoring tool for compatible JK BMS battery systems.

Connect locally over Bluetooth to view battery state of charge, voltage, current, power, temperatures, cell voltages, balancing activity, alarms and runtime estimates. Review recent measurements directly on your device and create a local settings backup.

Advanced users can inspect and change selected BMS protection settings after unlocking the editor with the settings code read from the connected BMS. The factory code is usually 123456. Users can change the six digit settings code, and every settings or code write is verified by reading the value back from the BMS.

The app does not require an account or a cloud service for BMS features. Battery history, language preferences and local settings backups stay in the app storage on your device unless you explicitly export a backup file. Banner advertising is supplied by Google AdMob and is independent from battery communication.

Compatibility depends on the exact JK BMS model, firmware and JK02 protocol variant. This app is independent and is not affiliated with or endorsed by JK or JiKong.

## App Privacy answers

Do not select Data Not Collected. Google Mobile Ads SDK and User Messaging Platform are included in the app.

Use the current Google Mobile Ads data disclosure page and the privacy report generated from the archived app as the final source of truth. The installed SDK privacy manifests currently declare:

1. Device ID, linked to the user, used for third party advertising, developer advertising and analytics, and used for tracking.
2. Coarse location, linked to the user, used for third party advertising, developer advertising and analytics.
3. Advertising data and product interaction, linked to the user, used for advertising and analytics.
4. Performance data and other diagnostic data, not linked to the user, used for advertising and analytics.
5. Crash data, not linked to the user, used for analytics.

Battery readings, BMS settings, Bluetooth identifiers, local history and exported settings backups are not sent to AdMob by application code.

Tracking: Yes. Device ID is declared by the Google Mobile Ads SDK as used for tracking.

Third party advertising: Yes.

Analytics: Yes, limited to the data processed by the Google advertising SDK.

The app requests App Tracking Transparency authorization on iOS before the first ad request. `NSUserTrackingUsageDescription` is localized in English and Polish. When permission is denied or restricted, the advertising identifier remains unavailable and the Google SDK must respect the platform status and applicable UMP consent choices.

## Export compliance

The app does not implement non exempt encryption. `ITSAppUsesNonExemptEncryption` is set to `false`.

## App Review notes

BMS Monitor: LiFePO4 communicates locally with compatible JK BMS hardware over Bluetooth Low Energy. It has no account and no network backend for BMS data. Dashboard and History may display an adaptive banner supplied by Google AdMob after the applicable consent process. Advertising failures do not block BMS features.

Reviewers can test the complete read only interface without hardware:

1. Open Settings.
2. Tap Try demo mode.
3. Use Dashboard, Cells, History and Settings to inspect simulated data.
4. In demo mode all settings controls are intentionally disabled and no Bluetooth commands are sent.

For hardware testing, close any other JK BMS app first because a BMS module usually accepts only one active Bluetooth connection. Wake the BMS, open Settings, tap Find BMS and select the device. Enter the settings code stored in the BMS. Its factory value is usually 123456, and it is independent from the Bluetooth connection password.

## Screenshots

Prepare screenshots from a recent large iPhone simulator or device. Recommended screens:

1. Dashboard with state of charge and energy flow.
2. Cell voltage overview.
3. Local history charts.
4. Connection and device information.
5. Read only demo settings screen.

Do not show personal Bluetooth device identifiers or real serial numbers in store screenshots. Demo mode is suitable for screenshots.

## Final manual checks

1. Test scan, connect, disconnect, reconnect and refresh on a physical iPhone.
2. Test a background and foreground cycle while connected.
3. Verify positive current while charging and negative current under load using a known meter.
4. Test settings writes on the exact supported JK model using safe values.
5. Confirm charging is blocked at 0°C and resumes at 5°C after saving the low temperature protection values.
6. Confirm that the ATT prompt appears once on a fresh iPhone installation and that denying permission does not block BMS features.
7. Archive a Release build with the intended signing team and upload it to TestFlight.
8. Complete an external TestFlight session before App Review submission.
9. Publish the required European regulations message in AdMob Privacy and messaging before testing consent in the EEA.
10. Configure any applicable US state regulations message and verify the in app advertising privacy entry point.
11. Confirm the App Store privacy answers against the privacy report generated from the final archive.
12. Test that the banner never covers the tab bar, settings editor, confirmation sheets or safety messages.
13. Test iOS ads with `npm run build:ios:test-ads` or register the device as a test device in AdMob. Never click live ads during development.
