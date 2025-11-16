# Configuration Guide - Server URLs

This guide explains how to configure server URLs for all components of the QR Share application.

## Overview

The application has three main components:
1. **Server** (Node.js/Express) - Backend API and WebSocket server
2. **Web Client** (React) - Frontend web application
3. **Mobile App** (React Native/Expo) - Mobile application

## 1. Server Configuration

**File:** `server/server.js`

The server automatically detects the correct URL:
- Uses `req.protocol + '://' + req.get('host')` for dynamic URL detection
- Works in both development and production
- No manual configuration needed

## 2. Web Client (React) Configuration

**File:** `server/client/src/App.js`

**Development Mode:**
- Uses `http://localhost:3001` by default
- Can be overridden with `REACT_APP_SERVER_URL` environment variable

**Production Mode:**
- Automatically uses `window.location.origin` (same server)
- No configuration needed - works with any domain

**To override in development:**
```bash
# Create .env file in server/client/
REACT_APP_SERVER_URL=http://your-server:3001
```

## 3. Mobile App Configuration

**File:** `mobile-new/App.js`

**Default:** `http://localhost:3001`

**For Development (Physical Device):**
1. Find your computer's local IP address:
   - Windows: Run `ipconfig` and look for IPv4 Address
   - Mac/Linux: Run `ifconfig` or `ip addr`

2. Update the SERVER_URL in `mobile-new/App.js`:
   ```javascript
   const SERVER_URL = 'http://192.168.1.100:3001'; // Your computer's IP
   ```

**For Production:**
Update to your production server URL:
```javascript
const SERVER_URL = 'https://yourdomain.com';
```

**Using Environment Variable (Recommended):**
1. Create `.env` file in `mobile-new/`:
   ```
   EXPO_PUBLIC_SERVER_URL=http://192.168.1.100:3001
   ```

2. The app will automatically use this value

## Quick Reference

### Development Setup

**Web Client:**
- Runs on: `http://localhost:3000` (dev server)
- Connects to: `http://localhost:3001` (backend)

**Mobile App:**
- Update `SERVER_URL` to your computer's IP address
- Example: `http://192.168.1.100:3001`

**Server:**
- Runs on: `http://localhost:3001`
- Automatically detects its own URL

### Production Setup

**Web Client:**
- Built and served from: `http://yourdomain.com:3001`
- Automatically uses same origin (no config needed)

**Mobile App:**
- Update `SERVER_URL` to: `https://yourdomain.com` or `http://yourdomain.com:3001`

**Server:**
- Runs on: `http://yourdomain.com:3001` (or your configured port)
- Automatically detects its own URL

## Environment Variables

### Web Client (.env in server/client/)
```
REACT_APP_SERVER_URL=http://localhost:3001
```

### Mobile App (.env in mobile-new/)
```
EXPO_PUBLIC_SERVER_URL=http://192.168.1.100:3001
```

### Server
No environment variables needed - uses request headers automatically

## Testing Checklist

- [ ] Server starts and shows correct port
- [ ] Web client connects to server (check browser console)
- [ ] Mobile app connects to server (check Expo logs)
- [ ] QR codes generated contain correct server URL
- [ ] File sharing works between web and mobile
- [ ] File sharing works between mobile devices

## Troubleshooting

**Mobile app can't connect:**
- Verify SERVER_URL matches your server's actual address
- Check firewall settings
- Ensure both devices are on same network (for local development)

**Web client can't connect:**
- Check browser console for errors
- Verify server is running
- Check CORS settings (should allow all origins in dev)

**QR codes have wrong URL:**
- Server automatically detects URL from request
- For mobile-generated QR codes, ensure SERVER_URL is set correctly

