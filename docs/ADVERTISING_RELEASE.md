# Advertising release checklist

## Implemented placement

The app uses one adaptive banner at the bottom of the native screen.

The banner is shown only on Dashboard and History. It is hidden on Cells, Settings and while a BMS settings confirmation sheet is open. The web interface reserves the height reported by the native banner so the tab bar is not covered.

No interstitial, rewarded, native or app open ads are used.

## AdMob identifiers

iOS app ID: `ca-app-pub-5307701268996147~9969186445`

iOS banner ID: `ca-app-pub-5307701268996147/4215508334`

iOS adaptive banner test ID: `ca-app-pub-3940256099942544/2435281174`

Android app ID: `ca-app-pub-5307701268996147~1258172507`

Android banner ID: `ca-app-pub-5307701268996147/2219900388`

The iOS app ID is stored in `ios/App/App/Info.plist`. The Android app ID is stored in `android/app/src/main/res/values/strings.xml`. Banner IDs are selected at runtime in `src/useAdMob.ts`.

## Consent and privacy

The app initializes Google Mobile Ads and requests fresh UMP consent information at launch. If a consent form is required and available, it is shown before an ad request. Ads are requested only when UMP reports that ads can be requested.

Settings includes an Advertising and privacy section. The privacy options button is enabled when UMP requires an entry point. Users can also report an inappropriate ad to the developer.

The app requests ATT authorization on iOS before its first ad request and waits for the system response. The purpose string is localized in English and Polish. A denied or restricted response does not block BMS features. The App Privacy answers must declare tracking and the data types included in the final archive privacy report.

Before release in AdMob Privacy and messaging:

1. Create and publish a European regulations message for both apps.
2. Include both consent and legitimate interest choices as required by the selected Google message configuration.
3. Enable consent revocation so the UMP privacy options entry point works where required.
4. Configure a US state regulations message if the app is distributed in applicable states.
5. Verify that both store applications are connected to the correct AdMob app IDs.
6. Set an appropriate maximum ad content rating and block unsuitable sensitive categories.
7. Create and publish the iOS IDFA explainer message if it is used as the pre prompt shown before the Apple ATT dialog.

## iOS requirements

`GADApplicationIdentifier` and the current Google `SKAdNetworkItems` list are present in `Info.plist`. The Google Mobile Ads SDK and User Messaging Platform are installed through CocoaPods and include their own privacy manifests.

Before App Store submission:

1. Generate an Xcode privacy report from the final archive.
2. Complete App Privacy answers using the final SDK privacy report and the current Google data disclosure guide.
3. Declare third party advertising and the data types listed in `APP_STORE_RELEASE.md`.
4. Confirm that the age rating is compatible with the configured AdMob content rating.
5. Confirm that the app provides a way to report inappropriate advertising.

## Android requirements

The AdMob application ID metadata is present in `AndroidManifest.xml`. Internet permission is already declared. Bluetooth permissions remain limited to BMS communication.

Before Google Play submission, complete Data safety using the current Google Mobile Ads disclosure guidance. At minimum review these categories:

1. Approximate location inferred from IP address.
2. Device or other identifiers.
3. App interactions and advertising data.
4. Crash logs, diagnostics and performance information.

Declare that the advertising SDK may collect and share these categories for advertising, analytics, fraud prevention, security and compliance as applicable. Confirm encryption in transit and use the Google privacy policy for provider retention and deletion details.

## Testing

Run `npm run build:ios:test-ads` before syncing a dedicated iOS advertising test build. This uses Google's adaptive banner demo unit only on iOS. The default `npm run build` command keeps the supplied production identifiers for App Store archives, and Android continues to use its production identifier.

Verify on physical iOS and Android devices:

1. Consent form behavior for an EEA test device.
2. Consent denial does not block Bluetooth or BMS functions.
3. Privacy choices can be reopened from Settings when required.
4. Banner placement on Dashboard and History in portrait mode.
5. Banner removal on Cells and Settings.
6. Banner removal while confirmation sheets are shown.
7. Rotation and safe area behavior on supported Android devices.
8. Offline startup and ad loading failure without an app crash.
9. Bluetooth scan, connection, notifications and settings writes while ads are enabled.

Never click production ads while testing. Use test mode or register test devices in AdMob.
