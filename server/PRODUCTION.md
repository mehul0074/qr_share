# Production Deployment Guide

## Overview
In production, the React app is built and served directly from the Express server on a single port, eliminating the need for separate development servers.

## Building for Production

### Step 1: Build the React App
```bash
cd server
npm run build
```
This builds the React app and creates optimized production files in `server/client/build/`

### Step 2: Start Production Server
```bash
npm run start:prod
```

Or use the combined command:
```bash
npm run build:prod
```

## How It Works

1. **Development Mode** (`npm run dev`):
   - React app runs on `http://localhost:3000` (via `npm start` in client folder)
   - Express server runs on `http://localhost:3001`
   - They communicate via CORS

2. **Production Mode** (`NODE_ENV=production`):
   - React app is built into static files
   - Express server serves the built React app from `/client/build`
   - Everything runs on a single port (default: 3001)
   - API routes (`/api/*`) are handled by Express
   - All other routes serve the React app's `index.html`

## Configuration

### Environment Variables
- `NODE_ENV=production` - Enables production mode
- `PORT=3001` - Server port (default: 3001)

### React App Configuration
The React app automatically detects production mode and uses:
- Relative URLs (`window.location.origin`) instead of hardcoded `localhost:3001`
- This ensures it works regardless of the server URL

## File Structure
```
server/
├── server.js          # Express server
├── client/
│   ├── build/         # Production build (generated)
│   │   ├── index.html
│   │   ├── static/
│   │   └── ...
│   └── src/           # React source code
└── uploads/           # File uploads directory
```

## Deployment Checklist

1. ✅ Install dependencies:
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

2. ✅ Build React app:
   ```bash
   npm run build
   ```

3. ✅ Set environment and start server:
   
   **Windows (PowerShell):**
   ```powershell
   $env:NODE_ENV="production"; npm start
   ```
   
   **Windows (CMD):**
   ```cmd
   set NODE_ENV=production && npm start
   ```
   
   **Linux/Mac:**
   ```bash
   NODE_ENV=production npm start
   ```
   
   Or simply set it in your system environment variables permanently.

5. ✅ Verify:
   - Visit `http://your-server:3001` - should show React app
   - Visit `http://your-server:3001/api/generate-session` - should return JSON

## Troubleshooting

### React app not loading
- Check that `client/build` directory exists
- Verify `NODE_ENV=production` is set
- Check server logs for errors

### API routes not working
- Ensure API routes are defined before the catch-all route
- Check that routes start with `/api/`

### Socket.IO not connecting
- Verify the React app uses `window.location.origin` in production
- Check CORS settings in server.js
- Ensure WebSocket connections are allowed

## Production Optimizations

The React build includes:
- Minified JavaScript and CSS
- Optimized assets
- Code splitting
- Production-ready optimizations

## Notes

- The server automatically detects if `client/build` exists
- In development, it falls back to serving the `public` folder
- API routes always take precedence over static files
- The catch-all route ensures React Router works correctly

