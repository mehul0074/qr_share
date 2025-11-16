# Assets Update Instructions

The current icon and splash images are from the old app. To update them for QR Share:

## Option 1: Use Online Icon Generators

1. **App Icon (icon.png)**:
   - Size: 1024x1024 pixels
   - Create an icon with QR code symbol or "QR" text
   - Use colors: #667eea (purple) or #764ba2
   - Save as: `assets/icon.png`

2. **Adaptive Icon (adaptive-icon.png)**:
   - Size: 1024x1024 pixels
   - Same design as icon.png
   - Save as: `assets/adaptive-icon.png`

3. **Splash Screen (splash-icon.png)**:
   - Size: 1284x2778 pixels (or any large size)
   - Can be a simple logo or "QR Share" text
   - Transparent background recommended
   - Save as: `assets/splash-icon.png`

4. **Favicon (favicon.png)**:
   - Size: 48x48 or 96x96 pixels
   - Simple QR code icon
   - Save as: `assets/favicon.png`

## Option 2: Quick Fix - Use Solid Colors

If you want a quick solution without custom images:

1. Update `app.json` to remove image references
2. Use solid color backgrounds only

## Recommended Tools

- **Figma** - Free design tool
- **Canva** - Easy icon creation
- **Icon Generator** - https://www.appicon.co/
- **Expo Icon Generator** - Built-in tool

## Current Configuration

- Icon: `./assets/icon.png`
- Splash: `./assets/splash-icon.png` (background: #667eea)
- Adaptive Icon: `./assets/adaptive-icon.png` (background: #667eea)
- Favicon: `./assets/favicon.png`

After updating images, restart the Expo server:
```bash
npm start -- --clear
```

