import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import QRCode from 'qrcode.react';
import './App.css';

// Use relative URL in production (same server), absolute URL in development
const SERVER_URL = process.env.NODE_ENV === 'production' 
  ? window.location.origin 
  : (process.env.REACT_APP_SERVER_URL || 'http://localhost:3001');

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [incomingFile, setIncomingFile] = useState(null);
  const [fileProgress, setFileProgress] = useState(0);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const fileChunksRef = useRef([]);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connection-established', (data) => {
      console.log('Connection established:', data);
      setConnected(true);
    });

    newSocket.on('file-incoming', (data) => {
      console.log('File incoming:', data);
      setIncomingFile(data);
      fileChunksRef.current = [];
      setFileProgress(0);
    });

    newSocket.on('file-chunk', (data) => {
      const { chunk, fileName, isLast, fileType } = data;
      
      // Process chunks asynchronously to prevent blocking
      setTimeout(() => {
        try {
          fileChunksRef.current.push(new Uint8Array(chunk));
          
          // Calculate progress (rough estimate)
          setFileProgress(prev => Math.min(prev + 10, 90));
          
          if (isLast) {
            // Process last chunk asynchronously to prevent blocking
            setTimeout(() => {
              try {
                // Combine chunks and create download
                const totalLength = fileChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
                const combined = new Uint8Array(totalLength);
                let offset = 0;
                fileChunksRef.current.forEach(chunk => {
                  combined.set(chunk, offset);
                  offset += chunk.length;
                });
                
                const blob = new Blob([combined], { type: fileType || 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                setReceivedFiles(prev => [...prev, { name: fileName, receivedAt: new Date() }]);
                setIncomingFile(null);
                setFileProgress(0);
                fileChunksRef.current = [];
                
                // Notify sender
                newSocket.emit('file-received', { sessionId, fileName });
              } catch (error) {
                console.error('Error processing file chunks:', error);
                alert(`Error processing file "${fileName}": ${error.message}`);
                setIncomingFile(null);
                setFileProgress(0);
                fileChunksRef.current = [];
              }
            }, 0);
          }
        } catch (error) {
          console.error('Error handling file chunk:', error);
        }
      }, 0);
    });

    newSocket.on('file-sent', (data) => {
      console.log('File sent successfully:', data);
      alert(`File "${data.fileName}" sent successfully!`);
    });

    newSocket.on('file-error', (data) => {
      console.error('File error:', data);
      alert(data.message || 'File transfer error occurred');
    });

    newSocket.on('peer-disconnected', () => {
      setConnected(false);
      alert('Peer disconnected');
    });

    // Generate session on mount
    const initSession = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/api/generate-session`);
        const data = await response.json();
        setSessionId(data.sessionId);
        setQrCode(data.qrCode);
        
        newSocket.emit('join-session', { sessionId: data.sessionId, type: 'web' });
      } catch (error) {
        console.error('Error generating session:', error);
      }
    };

    initSession();

    return () => {
      newSocket.close();
    };
  }, []);

  const generateSession = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/generate-session`);
      const data = await response.json();
      setSessionId(data.sessionId);
      setQrCode(data.qrCode);
      
      if (socket) {
        socket.emit('join-session', { sessionId: data.sessionId, type: 'web' });
      }
    } catch (error) {
      console.error('Error generating session:', error);
    }
  };

  const handleFileSelect = (files) => {
    if (!connected || !socket || !sessionId) {
      alert('Not connected to a peer yet!');
      return;
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

    Array.from(files).forEach(file => {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" is too large. Maximum file size is 5MB.`);
        return;
      }

      // Show confirmation dialog before sending
      const fileSizeKB = (file.size / 1024).toFixed(2);
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const sizeDisplay = file.size > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;
      
      const send = window.confirm(
        `Do you want to send "${file.name}" (${sizeDisplay})?`
      );
      
      if (send) {
        console.log('User confirmed sending file:', file.name);
        sendFile(file);
      } else {
        console.log('User canceled sending file:', file.name);
      }
    });
  };

  const sendFile = (file) => {
    if (!socket || !sessionId) return;

    const reader = new FileReader();
    const chunkSize = 64 * 1024; // 64KB chunks

    // Send file metadata first
    socket.emit('file-meta', {
      sessionId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    reader.onload = (e) => {
      const buffer = e.target.result;
      let offset = 0;

      const sendChunk = () => {
        const chunk = buffer.slice(offset, offset + chunkSize);
        const isLast = offset + chunkSize >= buffer.byteLength;

        socket.emit('file-chunk', {
          sessionId,
          chunk: Array.from(new Uint8Array(chunk)),
          fileName: file.name,
          isLast
        });

        offset += chunkSize;

        if (!isLast) {
          setTimeout(sendChunk, 10); // Small delay to avoid overwhelming
        }
      };

      sendChunk();
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    handleFileSelect(files);
  };

  return (
    <div className="App">
      <div className="container">
        <h1>QR Share - File Sharing</h1>
        
        <div className="status-section">
          <div className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '✓ Connected' : '○ Waiting for connection...'}
          </div>
        </div>

        {!connected && (
          <div className="qr-section">
            <h2>Scan this QR code to connect</h2>
            {qrCode ? (
              <div className="qr-container">
                <img src={qrCode} alt="QR Code" style={{ maxWidth: '300px', height: '300px' }} />
              </div>
            ) : (
              <div className="loading">Generating QR code...</div>
            )}
            <button onClick={generateSession} className="btn btn-secondary">
              Generate New QR Code
            </button>
          </div>
        )}

        {connected && (
          <div className="file-sharing-section">
            <h2>Share Files</h2>
            
            <div
              className={`drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <p>Drag and drop files here, or</p>
              <button 
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                Select Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
            </div>

            {incomingFile && (
              <div className="incoming-file">
                <h3>Receiving file:</h3>
                <p>{incomingFile.fileName} ({incomingFile.fileSize} bytes)</p>
                {fileProgress > 0 && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${fileProgress}%` }}></div>
                  </div>
                )}
              </div>
            )}

            {receivedFiles.length > 0 && (
              <div className="received-files">
                <h3>Received Files:</h3>
                <ul>
                  {[...receivedFiles].sort((a, b) => b.receivedAt - a.receivedAt).map((file, index) => (
                    <li key={index}>
                      {file.name} - {file.receivedAt.toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
