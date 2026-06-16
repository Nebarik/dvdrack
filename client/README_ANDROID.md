# DVDRack Android App

Your DVDRack client is now set up as an Android app using Capacitor!

## What Changed

1. **Server Configuration Screen** (`/config`): 
   - Shows on first launch to collect server URL
   - Accessible anytime via "Server" button in nav
   - Server URL stored in localStorage

2. **Mobile-Ready API Layer**:
   - All API calls now use configurable server URL
   - Falls back to env var for web deployment
   - Test connection before saving server URL

3. **Capacitor Integration**:
   - Android project configured in `client/android/`
   - Build with `npm run build:android`
   - Generates native APK

## Quick Start

```bash
# Build and open in Android Studio
cd client
npm run build:android
```

Then in Android Studio: **Build → Build APK**

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

## Full Instructions

See [ANDROID_BUILD.md](./ANDROID_BUILD.md) for complete setup, build, and troubleshooting guide.

## Usage Flow

1. Install APK on Android device
2. Open app → Server configuration screen appears
3. Enter your server URL (e.g., `http://192.168.1.100:3001`)
4. Tap "Connect" to verify
5. Start scanning movies!

The app remembers your server URL, so you only configure once.
