const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// API routes will be defined below - they must come before static file serving

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

// Store active connections
const connections = new Map(); // sessionId -> { socketId, type: 'web'|'mobile', connectedTo: sessionId }
const sessions = new Map(); // sessionId -> session data
const fileMetadata = new Map(); // sessionId -> { fileName, fileType }

// Generate unique session ID and QR code
app.get('/api/generate-session', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const qrData = JSON.stringify({
      type: 'connect',
      sessionId: sessionId,
      serverUrl: req.protocol + '://' + req.get('host')
    });
    
    const qrCode = await QRCode.toDataURL(qrData);
    
    sessions.set(sessionId, {
      id: sessionId,
      createdAt: Date.now(),
      qrCode: qrCode
    });
    
    res.json({ sessionId, qrCode });
  } catch (error) {
    console.error('Error generating session:', error);
    res.status(500).json({ error: 'Failed to generate session' });
  }
});

// Get session info
app.get('/api/session/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.get(sessionId);
  
  if (session) {
    res.json(session);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Serve uploaded files
app.get('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-session', (data) => {
    const { sessionId, type } = data;
    console.log(`Client ${socket.id} joining session ${sessionId} as ${type}`);
    
    socket.join(sessionId);
    connections.set(socket.id, {
      sessionId,
      type: type || 'web',
      socketId: socket.id,
      connectedTo: null
    });
    
    socket.emit('session-joined', { sessionId });
    
    // Check if there's another client in this session
    const room = io.sockets.adapter.rooms.get(sessionId);
    if (room && room.size > 1) {
      // Notify both clients that connection is established
      io.to(sessionId).emit('connection-established', {
        sessionId,
        message: 'Connection established! You can now share files.'
      });
      
      // Update connection status
      const socketIds = Array.from(room);
      if (socketIds.length === 2) {
        const conn1 = connections.get(socketIds[0]);
        const conn2 = connections.get(socketIds[1]);
        if (conn1) conn1.connectedTo = conn2?.sessionId;
        if (conn2) conn2.connectedTo = conn1?.sessionId;
      }
    }
  });

  socket.on('create-session', async (data) => {
    const { type } = data;
    const sessionId = uuidv4();
    
    socket.join(sessionId);
    connections.set(socket.id, {
      sessionId,
      type: type || 'mobile',
      socketId: socket.id,
      connectedTo: null
    });
    
    // Get server URL from request or use provided one
    // Try to get from socket handshake, fallback to provided or default
    const getServerUrl = () => {
      if (data.serverUrl) return data.serverUrl;
      const handshake = socket.handshake;
      if (handshake.headers.origin) {
        return handshake.headers.origin;
      }
      if (handshake.headers.host) {
        const protocol = handshake.secure ? 'https' : 'http';
        return `${protocol}://${handshake.headers.host}`;
      }
      // Fallback: use the server's actual URL if available
      return `http://localhost:${process.env.PORT || 3001}`;
    };
    const serverUrl = getServerUrl();
    
    const qrData = JSON.stringify({
      type: 'connect',
      sessionId: sessionId,
      serverUrl: serverUrl
    });
    
    try {
      const qrCode = await QRCode.toDataURL(qrData);
      sessions.set(sessionId, {
        id: sessionId,
        createdAt: Date.now(),
        qrCode: qrCode
      });
      
      socket.emit('session-created', { sessionId, qrCode });
    } catch (error) {
      console.error('Error creating QR code:', error);
      socket.emit('error', { message: 'Failed to create QR code' });
    }
  });

  socket.on('file-meta', (data) => {
    const { sessionId, fileName, fileSize, fileType } = data;
    console.log(`File metadata received: ${fileName} (${fileSize} bytes)`);
    
    // Store file metadata for this session
    fileMetadata.set(sessionId, { fileName, fileType });
    
    // Broadcast to other clients in the session
    socket.to(sessionId).emit('file-incoming', {
      fileName,
      fileSize,
      fileType,
      from: connections.get(socket.id)?.type || 'unknown'
    });
  });

  socket.on('file-chunk', (data) => {
    const { sessionId, chunk, fileName, isLast } = data;
    
    // Get file metadata for this session
    const metadata = fileMetadata.get(sessionId);
    const fileType = metadata?.fileType || 'application/octet-stream';
    
    // Forward chunk to other client in session
    socket.to(sessionId).emit('file-chunk', {
      chunk,
      fileName,
      isLast,
      fileType
    });
    
    // Clean up metadata if this is the last chunk
    if (isLast) {
      fileMetadata.delete(sessionId);
    }
  });

  socket.on('file-received', (data) => {
    const { sessionId, fileName } = data;
    socket.to(sessionId).emit('file-sent', { fileName });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const connection = connections.get(socket.id);
    if (connection) {
      const { sessionId } = connection;
      socket.to(sessionId).emit('peer-disconnected');
      connections.delete(socket.id);
    }
  });
});

// Serve static files from React app in production (after API routes)
const clientBuildPath = path.join(__dirname, 'client', 'build');
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientBuildPath)) {
  // Serve static files from React build
  app.use(express.static(clientBuildPath));
  
  // Catch-all handler: send back React's index.html file for any non-API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  // In development, serve public folder
  app.use(express.static('public'));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`Serving React app from: ${clientBuildPath}`);
  }
});

