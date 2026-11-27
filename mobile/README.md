# Nearest You Mobile (Flutter — Android & iOS)

Separate mobile application folder built with Flutter for **Customers**, **Delivery/Ride Requesters**, **Parcel Receivers**, **Delivery Partners**, **Service Providers & Business Owners**, and **Individual Job Seekers**.

Admin features and platform commission configuration are **excluded** from the mobile application.

## Features Implemented
- **Discover**: Instant listing and recommendation display before exact GPS lock, automatic re-ordering once GPS resolves, OpenStreetMap (`flutter_map`) view with live provider markers, AI Camera/Gallery Image Search, side-by-side Compare (up to 3), and Job Seeker self-advertising (photos, PDF CV, YouTube intro link).
- **Cart & Commercial Policies**: Persistent top AppBar Cart button + floating bottom Cart bar, `0–X km` provider-covered delivery radius calculation, **Seller vs. Buyer Tax** handling (`SELLER` = 0 ETB extra VAT; `BUYER` = platform VAT added), and instant Chapa/Payo checkout.
- **Deliveries & Rides**: OpenStreetMap search & tap-to-pin pickup/destination, OSRM road distance & fare breakdown, live tracking with **Parcel Receiver Payment Details**, Partner dispatch queue with Dual-OTP pickup/delivery verification, and escrow dispute freezing.
- **Activity & Real-Time Engagement**: Orders, Bookings (including quote approval), Deliveries, Job Applications, Favorites, WebSocket live chat, **automatic voice message recording & playback**, and interactive Service Contracts.
- **Business & Provider Portal**: Fayda KYC + biometric selfie + document uploads, Peer QR voucher generation & **Camera QR Scanner** vouching, Business registration, Chapa/Payo payout setup, Listing publisher with mandatory Seller vs. Buyer tax confirmation, incoming order ETA acceptance, and provider settlement receipts.

## Local Development & Builds
The Android (`mobile/android`) and iOS (`mobile/ios`) project configurations are included directly in this repository.

```bash
cd mobile
flutter pub get
flutter analyze --no-fatal-infos
flutter test

# Run locally on connected device or emulator (defaults to https://nearest-you-backend.onrender.com)
flutter run --dart-define=API_BASE_URL=https://nearest-you-backend.onrender.com

# Build Android APK (release)
flutter build apk --release --dart-define=API_BASE_URL=https://nearest-you-backend.onrender.com --dart-define=APP_BASE_URL=https://nearest-you.vercel.app

# Build iOS app (macOS with Xcode & CocoaPods required)
cd ios && pod install && cd ..
flutter build ios --release --no-codesign --dart-define=API_BASE_URL=https://nearest-you-backend.onrender.com --dart-define=APP_BASE_URL=https://nearest-you.vercel.app
```
You can also update the Backend Server URL anytime inside the app under **Sign In -> Server URL** or **Account -> Server Connection**.

If `android/gradlew` is missing on a fresh clone, run `flutter build apk --release` (Flutter generates local Gradle tooling) or copy the Gradle wrapper once via `flutter create --platforms=android .` without overwriting custom configs.

## GitHub Release Automation (Android & iOS)
Workflow: `.github/workflows/mobile-release.yml`

Releases are built and attached automatically (`nearest-you-android.apk`, `nearest-you-android.aab`, `nearest-you-ios-unsigned.ipa` or signed `nearest-you-ios.ipa`, and `SHA256SUMS.txt`) when:
1. Changes in `mobile/` or `.github/workflows/mobile-release.yml` are pushed to `main` / `master`.
2. A tag matching `mobile-v*` or `v*` is pushed:
   ```bash
   git tag mobile-v1.0.0
   git push origin mobile-v1.0.0
   ```
3. You manually run **Actions -> Nearest You Mobile Release (Android & iOS) -> Run workflow** in GitHub.

### Optional Repository Variables & Secrets
- **Repository Variable**:
  - `API_BASE_URL`: Production Spring Boot backend URL (defaults to `https://nearest-you-backend.onrender.com`).
- **Android Play Store Signing Secrets** (optional; falls back to fallback release signing if omitted):
  - `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- **iOS App Store / AdHoc Signing Secrets** (optional; produces `nearest-you-ios-unsigned.ipa` if omitted):
  - `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_EXPORT_OPTIONS_PLIST`
