# Android App Improvements

## Recent Changes

### 1. Auto-Focus Disabled on Scan Page
- **Issue**: Keyboard automatically popped up when opening scan page
- **Fix**: Removed `inputRef.current?.focus()` from useEffect
- **Benefit**: Cleaner UX, users can choose when to type

### 2. Camera Permissions Added
- **Added to AndroidManifest.xml**:
  - `android.permission.CAMERA`
  - Camera hardware feature declarations (not required)
- **Benefit**: Barcode scanner camera now works on mobile

### 3. Status Bar & Navigation Bar Styling
- **Status Bar (Top)**:
  - Translucent black background (`rgba(0, 0, 0, 0.85)`)
  - Dark style (white icons)
  - Overlays web view for edge-to-edge display
  - Uses `@capacitor/status-bar` plugin

- **Navigation Bar (Bottom)**:
  - Changed from `rgba(18,18,18,0.96)` to `rgba(0, 0, 0, 0.85)`
  - Semi-transparent black matches status bar
  - Includes safe area padding for gesture bars

- **Safe Area Support**:
  - `viewport-fit=cover` in meta tag
  - CSS `env(safe-area-inset-top/bottom)` for proper padding
  - Content doesn't get hidden by notches or gesture areas

### 4. Proper API & Image URL Handling
- All API calls go through `client/src/api/movies.js`
- All images use `getImageUrl()` helper
- Server URL configurable via localStorage
- Works with both local and remote servers

## Testing Checklist

- [ ] Scan page doesn't auto-focus keyboard
- [ ] Camera permission requested when using barcode scanner
- [ ] Status bar is black and semi-transparent
- [ ] Nav bar is black and semi-transparent
- [ ] Content doesn't hide behind notch or gesture bar
- [ ] Images load correctly
- [ ] Movie details load correctly
- [ ] Can connect to HTTPS server URL
