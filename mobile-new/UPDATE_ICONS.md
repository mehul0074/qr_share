# Quick Icon Update Guide

## Current Issue
The app is using old icons from the previous app. Here's how to fix it:

## Quick Solution (5 minutes)

### Step 1: Generate New Icons Online
Visit: https://www.appicon.co/ or https://icon.kitchen/

1. Upload a simple QR code icon or create one with text "QR"
2. Download the generated icon set
3. Extract and copy these files to `mobile-new/assets/`:
   - `icon.png` (1024x1024)
   - `adaptive-icon.png` (1024x1024) 
   - `splash-icon.png` (1284x2778 or similar)
   - `favicon.png` (48x48 or 96x96)

### Step 2: Use Simple Text-Based Icons
If you want something quick:

1. Create a simple square image (1024x1024) with:
   - Background: #667eea (purple)
   - White text: "QR" or a QR code symbol
   - Save as `icon.png` and `adaptive-icon.png`

2. For splash screen:
   - Create a larger image (1284x2778) with:
   - Background: #667eea
   - White text: "QR Share" centered
   - Save as `splash-icon.png`

### Step 3: Clear Cache and Restart
```bash
cd mobile-new
npm start -- --clear
```

## Alternative: Use Default Expo Icons
If you want to skip custom icons for now, you can temporarily remove the image references from `app.json` and use solid colors only.

## Recommended Icon Design
- **Colors**: Purple (#667eea) background, white foreground
- **Symbol**: QR code square pattern or "QR" text
- **Style**: Simple, modern, recognizable

After updating, the app will show the new QR Share branding instead of the old app's icons.

