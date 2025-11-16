import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import io from 'socket.io-client';
import QRCode from 'react-native-qrcode-svg';

// SERVER_URL Configuration
// For development: Use your computer's local IP (e.g., 'http://192.168.1.100:3001')
// For production: Use your production server URL (e.g., 'https://yourdomain.com')
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001';

export default function App() {
  const [mode, setMode] = useState('menu'); // 'menu', 'scan', 'generate', 'connected'
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [incomingFile, setIncomingFile] = useState(null);
  const [fileProgress, setFileProgress] = useState(0);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const fileChunksRef = useRef([]);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(SERVER_URL, {
      transports: ['websocket'],
    });
    setSocket(newSocket);

    newSocket.on('connection-established', (data) => {
      console.log('Connection established:', data);
      setConnected(true);
      setMode('connected');
      Alert.alert('Success', 'Connection established! You can now share files.');
    });

    newSocket.on('session-created', (data) => {
      setSessionId(data.sessionId);
      setQrCode(data.qrCode);
    });

    newSocket.on('file-incoming', (data) => {
      console.log('File incoming:', data);
      setIncomingFile(data);
      fileChunksRef.current = [];
      setFileProgress(0);
    });

    newSocket.on('file-chunk', (data) => {
      const { chunk, fileName, isLast, fileType } = data;
      fileChunksRef.current.push(new Uint8Array(chunk));
      
      setFileProgress(prev => Math.min(prev + 10, 90));
      
      if (isLast) {
        // Combine chunks
        const totalLength = fileChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        fileChunksRef.current.forEach(chunk => {
          combined.set(chunk, offset);
          offset += chunk.length;
        });

        // Convert to base64 and save file
        let binaryString = '';
        const chunkSize = 8192;
        for (let i = 0; i < combined.length; i += chunkSize) {
          const chunk = combined.slice(i, i + chunkSize);
          binaryString += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binaryString);
        const fileUri = FileSystem.documentDirectory + fileName;
        
        FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        }).then(() => {
          Alert.alert('Success', `File "${fileName}" received and saved!`);
          setReceivedFiles(prev => [...prev, { name: fileName, receivedAt: new Date() }]);
          setIncomingFile(null);
          setFileProgress(0);
          fileChunksRef.current = [];
          
          newSocket.emit('file-received', { sessionId, fileName });
        }).catch(err => {
          console.error('Error saving file:', err);
          Alert.alert('Error', 'Failed to save file');
        });
      }
    });

    newSocket.on('file-sent', (data) => {
      Alert.alert('Success', `File "${data.fileName}" sent successfully!`);
    });

    newSocket.on('peer-disconnected', () => {
      setConnected(false);
      Alert.alert('Disconnected', 'Peer disconnected');
      setMode('menu');
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const handleScanQR = async () => {
    if (!permission) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to scan QR codes');
        return;
      }
    } else if (!permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to scan QR codes');
        return;
      }
    }
    setScanned(false);
    setMode('scan');
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const qrData = JSON.parse(data);
      if (qrData.type === 'connect' && qrData.sessionId) {
        connectToSession(qrData.sessionId);
      } else {
        Alert.alert('Invalid QR Code', 'This QR code is not a valid connection code');
        setMode('menu');
      }
    } catch (error) {
      Alert.alert('Error', 'Invalid QR code format');
      setMode('menu');
    }
  };

  const connectToSession = (targetSessionId) => {
    if (!socket) return;

    socket.emit('join-session', {
      sessionId: targetSessionId,
      type: 'mobile',
    });

    setSessionId(targetSessionId);
    Alert.alert('Connecting', 'Attempting to connect...');
  };

  const handleGenerateQR = async () => {
    if (!socket) return;

    socket.emit('create-session', {
      type: 'mobile',
      serverUrl: SERVER_URL,
    });

    setMode('generate');
  };

  const handleSelectFile = async () => {
    if (!connected || !socket || !sessionId) {
      Alert.alert('Not Connected', 'Please connect to a peer first');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.type === 'success') {
        sendFile(result);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const sendFile = async (fileResult) => {
    if (!socket || !sessionId) return;

    try {
      const fileInfo = await FileSystem.getInfoAsync(fileResult.uri);
      const fileContent = await FileSystem.readAsStringAsync(fileResult.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Send file metadata
      socket.emit('file-meta', {
        sessionId,
        fileName: fileResult.name,
        fileSize: fileInfo.size,
        fileType: fileResult.mimeType || 'application/octet-stream',
      });

      // Send file in chunks
      const chunkSize = 64 * 1024; // 64KB
      let offset = 0;

      const sendChunk = () => {
        const chunk = bytes.slice(offset, offset + chunkSize);
        const isLast = offset + chunkSize >= bytes.length;

        socket.emit('file-chunk', {
          sessionId,
          chunk: Array.from(chunk),
          fileName: fileResult.name,
          isLast,
        });

        offset += chunkSize;

        if (!isLast) {
          setTimeout(sendChunk, 10);
        }
      };

      sendChunk();
    } catch (error) {
      console.error('Error sending file:', error);
      Alert.alert('Error', 'Failed to send file');
    }
  };

  const renderMenu = () => (
    <View style={styles.container}>
      <Text style={styles.title}>QR Share</Text>
      <Text style={styles.subtitle}>File Sharing via QR Codes</Text>

      <TouchableOpacity 
        style={styles.button} 
        onPress={handleScanQR}
      >
        <Text style={styles.buttonText}>Scan QR Code</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.button} 
        onPress={handleGenerateQR}
      >
        <Text style={styles.buttonText}>Generate QR Code</Text>
      </TouchableOpacity>
    </View>
  );

  const renderScanner = () => {
    if (!permission || !permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorText}>Camera permission is required</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={async () => {
              const result = await requestPermission();
              if (!result.granted) {
                Alert.alert('Permission Denied', 'Camera permission is required to scan QR codes');
              }
            }}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#6c757d', marginTop: 10 }]}
            onPress={() => setMode('menu')}
          >
            <Text style={styles.buttonText}>Back to Menu</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerFrame} />
          <Text style={styles.scannerText}>Point camera at QR code</Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setMode('menu')}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderQRGenerator = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Your QR Code</Text>
      <Text style={styles.subtitle}>Let others scan this to connect</Text>

      {sessionId ? (
        <View style={styles.qrContainer}>
          <QRCode
            value={JSON.stringify({
              type: 'connect',
              sessionId: sessionId,
              serverUrl: SERVER_URL,
            })}
            size={250}
          />
        </View>
      ) : (
        <ActivityIndicator size="large" color="#667eea" />
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={() => setMode('menu')}
      >
        <Text style={styles.buttonText}>Back to Menu</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderConnected = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.statusContainer}>
        <View style={[styles.statusIndicator, styles.connected]}>
          <Text style={styles.statusText}>✓ Connected</Text>
        </View>
      </View>

      <Text style={styles.title}>File Sharing</Text>

      <TouchableOpacity style={styles.button} onPress={handleSelectFile}>
        <Text style={styles.buttonText}>Select File to Send</Text>
      </TouchableOpacity>

      {incomingFile && (
        <View style={styles.incomingFile}>
          <Text style={styles.incomingFileTitle}>Receiving:</Text>
          <Text style={styles.incomingFileName}>{incomingFile.fileName}</Text>
          {fileProgress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${fileProgress}%` }]} />
            </View>
          )}
        </View>
      )}

      {receivedFiles.length > 0 && (
        <View style={styles.receivedFiles}>
          <Text style={styles.receivedFilesTitle}>Received Files:</Text>
          {receivedFiles.map((file, index) => (
            <View key={index} style={styles.receivedFileItem}>
              <Text style={styles.receivedFileName}>{file.name}</Text>
              <Text style={styles.receivedFileTime}>
                {file.receivedAt.toLocaleTimeString()}
              </Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={() => {
          setMode('menu');
          setConnected(false);
        }}
      >
        <Text style={styles.buttonText}>Disconnect</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      {mode === 'menu' && renderMenu()}
      {mode === 'scan' && renderScanner()}
      {mode === 'generate' && renderQRGenerator()}
      {mode === 'connected' && renderConnected()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    maxWidth: 300,
    marginVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
  },
  qrContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scannerContainer: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 10,
  },
  scannerText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 40,
    padding: 15,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    marginBottom: 20,
    textAlign: 'center',
  },
  statusContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusIndicator: {
    padding: 12,
    borderRadius: 20,
    minWidth: 150,
    alignItems: 'center',
  },
  connected: {
    backgroundColor: '#4caf50',
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  incomingFile: {
    width: '100%',
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  incomingFileTitle: {
    fontSize: 14,
    color: '#1976d2',
    fontWeight: '600',
    marginBottom: 5,
  },
  incomingFileName: {
    fontSize: 16,
    color: '#1976d2',
    marginBottom: 10,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#667eea',
    borderRadius: 4,
  },
  receivedFiles: {
    width: '100%',
    backgroundColor: '#e8f5e9',
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  receivedFilesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2e7d32',
    marginBottom: 10,
  },
  receivedFileItem: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
    marginVertical: 5,
  },
  receivedFileName: {
    fontSize: 14,
    color: '#2e7d32',
    fontWeight: '600',
  },
  receivedFileTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
});
