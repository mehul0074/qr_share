# QR Share Server

Node.js/Express server with Socket.IO for real-time file sharing.

## Installation

```bash
npm install
cd client
npm install
cd ..
```

## Running

Start the server:
```bash
npm start
```

Start the React client (in a separate terminal):
```bash
cd client
npm start
```

## Configuration

- Default server port: `3001`
- Default client port: `3000`
- Upload directory: `./uploads`

## API Endpoints

- `GET /api/generate-session` - Generate a new session and QR code
- `GET /api/session/:sessionId` - Get session information
- `GET /api/files/:filename` - Download uploaded files

## Socket.IO Events

### Client to Server:
- `join-session` - Join a session room
- `create-session` - Create a new session
- `file-meta` - Send file metadata
- `file-chunk` - Send file chunk
- `file-received` - Confirm file received

### Server to Client:
- `session-joined` - Confirmation of joining session
- `session-created` - Session created with QR code
- `connection-established` - Peer connection established
- `file-incoming` - Incoming file notification
- `file-chunk` - Receive file chunk
- `file-sent` - File sent confirmation
- `peer-disconnected` - Peer disconnected

