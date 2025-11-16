# QR Share - File Sharing via QR Codes

A cross-platform file sharing application that allows users to share files between web browsers and mobile devices using QR codes for connection establishment.

## Features

- **QR Code Connection**: Generate or scan QR codes to establish peer-to-peer connections
- **Cross-Platform**: Works between web browsers and mobile devices (iOS/Android)
- **Real-time File Sharing**: Share files instantly after connection is established
- **Drag & Drop Support**: Web interface supports drag-and-drop file uploads
- **Mobile File Picker**: Mobile app supports selecting files from device storage

## Project Structure

```
QRshare/
├── server/          # Node.js/Express backend + React frontend
│   ├── server.js    # Express server with Socket.IO
│   └── client/      # React web application
└── mobile/          # React Native/Expo mobile application
    └── App.js       # Main mobile app component
```

## Setup Instructions

### Server Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Install client dependencies:
```bash
cd client
npm install
cd ..
```

4. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3001` by default.

5. In a new terminal, start the React client:
```bash
cd server/client
npm start
```

The web app will open at `http://localhost:3000`.

### Mobile App Setup

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies (if not already installed):
```bash
npm install
```

3. Update the `SERVER_URL` in `App.js`:
   - For physical device testing, replace `localhost` with your computer's IP address
   - Example: `const SERVER_URL = 'http://192.168.1.100:3001';`

4. Start the Expo development server:
```bash
npm start
```

5. Scan the QR code with:
   - **iOS**: Camera app or Expo Go app
   - **Android**: Expo Go app

## Usage

### Web Application

1. Open the web application in your browser
2. A QR code will be automatically generated
3. Scan the QR code with the mobile app to connect
4. Once connected, you can:
   - Drag and drop files into the drop zone
   - Click "Select Files" to choose files
   - Receive files from connected devices

### Mobile Application

1. Open the mobile app
2. Choose one of the following options:
   - **Scan QR Code**: Scan a QR code from the web app or another mobile device
   - **Generate QR Code**: Create your own QR code for others to scan
3. Once connected:
   - Tap "Select File to Send" to choose and send files
   - Receive files automatically when sent by the peer

## How It Works

1. **Connection Establishment**:
   - One device generates a unique session ID and displays it as a QR code
   - Another device scans the QR code to get the session ID
   - Both devices join the same Socket.IO room using the session ID

2. **File Sharing**:
   - Files are split into chunks (64KB each)
   - Chunks are sent sequentially through WebSocket
   - Receiver combines chunks and saves/downloads the file

## Technical Stack

### Server
- **Backend**: Node.js, Express.js
- **WebSocket**: Socket.IO
- **QR Generation**: qrcode
- **File Upload**: Multer

### Web Client
- **Framework**: React
- **WebSocket Client**: socket.io-client
- **QR Display**: qrcode.react

### Mobile App
- **Framework**: React Native with Expo
- **QR Scanner**: expo-barcode-scanner
- **QR Generator**: react-native-qrcode-svg
- **File Picker**: expo-document-picker
- **File System**: expo-file-system

## Important Notes

- For mobile testing on physical devices, ensure your mobile device and computer are on the same network
- Update the `SERVER_URL` in the mobile app to use your computer's local IP address instead of `localhost`
- Camera permissions are required for QR code scanning on mobile devices
- Large files may take time to transfer depending on network speed

## Troubleshooting

1. **Connection Issues**:
   - Ensure both devices are on the same network
   - Check that the server is running
   - Verify the SERVER_URL in mobile app matches your server address

2. **QR Code Not Scanning**:
   - Ensure camera permissions are granted
   - Check that the QR code is clearly visible
   - Try generating a new QR code

3. **File Transfer Fails**:
   - Check network connection
   - Ensure both devices remain connected
   - Try with smaller files first

## License

ISC

