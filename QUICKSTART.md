# Quick Start Guide

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- For mobile: Expo Go app on your phone (iOS/Android)

## Step 1: Start the Server

```bash
cd server
npm install
npm start
```

The server will start on `http://localhost:3001`

## Step 2: Start the Web Client

Open a new terminal:

```bash
cd server/client
npm install
npm start
```

The web app will open at `http://localhost:3000`

## Step 3: Set Up Mobile App

### Install Dependencies

```bash
cd mobile
npm install
```

### Configure Server URL

**IMPORTANT**: Before running on a physical device, update the `SERVER_URL` in `mobile/App.js`:

1. Find your computer's local IP address:
   - Windows: Run `ipconfig` and look for IPv4 Address
   - Mac/Linux: Run `ifconfig` or `ip addr`

2. Update `App.js`:
   ```javascript
   const SERVER_URL = 'http://YOUR_IP_ADDRESS:3001';
   // Example: const SERVER_URL = 'http://192.168.1.100:3001';
   ```

### Start Mobile App

```bash
npm start
```

Scan the QR code with Expo Go app on your phone.

## Step 4: Connect and Share

### From Web to Mobile:

1. Open the web app in your browser
2. A QR code will be displayed automatically
3. Open the mobile app and tap "Scan QR Code"
4. Scan the QR code from the web browser
5. Once connected, you can share files!

### From Mobile to Mobile:

1. On Device A: Open mobile app → Tap "Generate QR Code"
2. On Device B: Open mobile app → Tap "Scan QR Code" → Scan Device A's QR code
3. Once connected, both devices can share files!

### Sharing Files:

- **Web**: Drag and drop files or click "Select Files"
- **Mobile**: Tap "Select File to Send" and choose from your device

## Troubleshooting

### "Connection failed" or "Cannot connect"

- Ensure both devices are on the same Wi-Fi network
- Check that the server is running
- Verify SERVER_URL in mobile app matches your computer's IP
- Check firewall settings

### QR Code not scanning

- Ensure good lighting
- Hold phone steady
- Try generating a new QR code
- Check camera permissions

### Files not transferring

- Check network connection
- Try with smaller files first
- Ensure both devices remain connected
- Check browser console or mobile logs for errors

## Testing on Same Computer

If testing web and mobile on the same computer:
- Use `localhost:3001` for SERVER_URL
- Run mobile app in Expo web mode: `npm run web`

