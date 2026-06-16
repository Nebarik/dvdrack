# Building the Android APK

## Prerequisites

1. **Install Android Studio**: Download from https://developer.android.com/studio
2. **Install Java JDK 17**: Required for Android builds
3. **Set up Android SDK**: Android Studio will prompt you during setup

## Build Steps

### 1. Build and Open in Android Studio

```bash
cd client
npm run build:android
```

This will:
- Build the Vite project
- Sync assets to Android
- Open the project in Android Studio

### 2. Generate APK in Android Studio

1. In Android Studio, wait for Gradle sync to complete
2. Go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. Once complete, click **locate** in the notification to find the APK
4. APK location: `client/android/app/build/outputs/apk/debug/app-debug.apk`

### 3. Install APK on Device

**Via USB (with ADB):**
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Via File Transfer:**
- Copy `app-debug.apk` to your phone
- Open the file and install (may need to enable "Install from Unknown Sources")

## First Launch Configuration

When you first open the app:
1. You'll see a server configuration screen
2. Enter your DVDRack server URL:
   - **HTTPS recommended**: `https://movies-api.example.com`
   - **Local HTTP**: `http://192.168.0.26:3001` (your computer's local IP)
   - **Note**: `localhost` won't work - use your computer's actual IP address
3. Tap **Connect** to test the connection
4. Once connected, you can access all features

To change the server later, tap the **Server** button in the navigation bar.

### Troubleshooting Connection Issues

**"Cannot reach server" on local HTTP:**
- Ensure `network_security_config.xml` has `cleartextTrafficPermitted="true"`
- Use your computer's local IP, not `localhost` or `127.0.0.1`
- Check firewall allows connections on port 3001
- Verify both devices are on the same WiFi network

**Images not loading:**
- Server URL must be configured correctly
- Check Docker logs: `docker compose logs -f dvdrack-server`
- Images are served from `/images` endpoint on the server

## Development Notes

### Making Changes

After modifying React code:
```bash
npm run build
npx cap sync android
```

Then rebuild in Android Studio or use:
```bash
cd android
./gradlew assembleDebug
```

### Mobile-Specific Features

**Status Bar:**
- Configured to be translucent black with dark icons
- Uses `@capacitor/status-bar` plugin
- Overlays the web view for edge-to-edge display

**Permissions:**
- Camera access for barcode scanning
- Internet access for API calls

**Safe Areas:**
- Content respects device notches and gesture bars
- Nav bar includes bottom safe area padding

### Capacitor Config

Configuration is in `capacitor.config.json`:
- `cleartext: true` allows HTTP connections (needed for local development)
- `usesCleartextTraffic: true` in AndroidManifest.xml enables HTTP on Android 9+
- For production, use HTTPS servers

### Server URL Storage

The app stores the server URL in localStorage, so users only need to configure it once. The configuration persists across app restarts.

## Building a Release APK

For production/release builds:

1. Generate signing key (one-time):
```bash
keytool -genkey -v -keystore dvdrack.keystore -alias dvdrack -keyalg RSA -keysize 2048 -validity 10000
```

2. In Android Studio:
   - **Build → Generate Signed Bundle / APK**
   - Select **APK**
   - Choose your keystore file
   - Enter keystore password and alias

3. Release APK will be in `android/app/build/outputs/apk/release/`

## Troubleshooting

**"Android SDK not found":**
- Open Android Studio
- Go to **Settings/Preferences → Appearance & Behavior → System Settings → Android SDK**
- Note the SDK location and ensure it's set in your environment

**"Gradle build failed":**
- Make sure Java JDK 17 is installed
- Check Android Studio is up to date
- Try **File → Invalidate Caches / Restart** in Android Studio

**"Cannot connect to server":**
- Ensure server URL includes protocol (`http://` or `https://`)
- For local servers, use your computer's local IP (not `localhost`)
- Check firewall allows connections on the server port
