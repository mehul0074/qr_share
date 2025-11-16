import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import io from 'socket.io-client';
import QRCode from 'react-native-qrcode-svg';

// SERVER_URL Configuration
// For development: Use your computer's local IP (e.g., 'http://192.168.1.100:3001')
// For production: Use your production server URL (e.g., 'https://yourdomain.com')
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'https://qr-share-1.onrender.com';

export default function App() {
  const [mode, setMode] = useState('menu'); // 'menu', 'scan', 'generate', 'connected'
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [socket, setSocket] = useState(null);
  const [incomingFile, setIncomingFile] = useState(null);
  const [fileProgress, setFileProgress] = useState(0);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const fileChunksRef = useRef([]);
  const expectedFileSizeRef = useRef(0);
  const receivedFileSizeRef = useRef(0);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(SERVER_URL, {
      transports: ['websocket'],
    });
    setSocket(newSocket);

    newSocket.on('connection-established', (data) => {
      console.log('Connection established:', data);
      setConnected(true);
      setConnecting(false);
      setMode('connected');
    });

    newSocket.on('session-created', (data) => {
      setSessionId(data.sessionId);
      setQrCode(data.qrCode);
    });

    newSocket.on('file-incoming', (data) => {
      console.log('File incoming:', data);
      setIncomingFile(data);
      fileChunksRef.current = [];
      expectedFileSizeRef.current = data.fileSize || 0;
      receivedFileSizeRef.current = 0;
      setFileProgress(0);
      console.log('Ready to receive file:', data.fileName, 'Expected size:', data.fileSize);
    });

    newSocket.on('file-chunk', async (data) => {
      const { chunk, fileName, isLast, fileType } = data;
      console.log('File chunk received:', { fileName, isLast, chunkSize: chunk?.length });
      
      if (!chunk || !Array.isArray(chunk)) {
        console.error('Invalid chunk data:', chunk);
        return;
      }
      
      fileChunksRef.current.push(new Uint8Array(chunk));
      receivedFileSizeRef.current += chunk.length;
      
      // Update progress based on actual received size
      const currentChunks = fileChunksRef.current.length;
      let progress = 0;
      if (expectedFileSizeRef.current > 0) {
        progress = Math.min((receivedFileSizeRef.current / expectedFileSizeRef.current) * 100, 95);
      } else {
        // Fallback: estimate based on chunks
        progress = Math.min(currentChunks * 2, 95);
      }
      setFileProgress(progress);
      
      console.log(`Chunk ${currentChunks} received:`, {
        chunkSize: chunk.length,
        totalReceived: receivedFileSizeRef.current,
        expected: expectedFileSizeRef.current,
        progress: progress.toFixed(1) + '%',
        isLast
      });
      
      if (isLast) {
        console.log('Last chunk received, processing file...');
        console.log('Total received:', receivedFileSizeRef.current, 'Expected:', expectedFileSizeRef.current);
        
        // Verify we received all data
        if (expectedFileSizeRef.current > 0 && receivedFileSizeRef.current !== expectedFileSizeRef.current) {
          console.warn('Size mismatch! Received:', receivedFileSizeRef.current, 'Expected:', expectedFileSizeRef.current);
          // Continue anyway, might be due to rounding
        }
        
        setFileProgress(95);
        // Combine chunks
        const totalLength = fileChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
        console.log('Combining', fileChunksRef.current.length, 'chunks, total length:', totalLength);
        
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        fileChunksRef.current.forEach((chunk, index) => {
          combined.set(chunk, offset);
          offset += chunk.length;
        });
        
        console.log('Chunks combined successfully, size:', combined.length);
        setFileProgress(98);
        
        try {
          console.log('Converting to base64...');
          setFileProgress(99);
          
          // Get document directory - using legacy API
          const docDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
          console.log('Document directory:', docDir);
          
          if (!docDir) {
            throw new Error('Could not determine document directory');
          }
          
          const fileUri = docDir + fileName;
          console.log('File URI:', fileUri);
          
          // Convert Uint8Array to base64 efficiently
          // Process in chunks to avoid memory issues
          let binaryString = '';
          const processChunkSize = 16384; // 16KB chunks
          
          for (let i = 0; i < combined.length; i += processChunkSize) {
            const chunk = combined.slice(i, Math.min(i + processChunkSize, combined.length));
            const chunkArray = Array.from(chunk);
            // Build binary string chunk by chunk
            for (let j = 0; j < chunkArray.length; j++) {
              binaryString += String.fromCharCode(chunkArray[j]);
            }
          }
          
          console.log('Encoding to base64, binary length:', binaryString.length);
          const base64 = btoa(binaryString);
          console.log('Base64 length:', base64.length);
          
          // Use legacy API writeAsStringAsync
          console.log('Writing file using legacy API...');
          
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType?.Base64 || 'base64',
          });
          
          console.log('File saved successfully!');
          setFileProgress(100);
          Alert.alert('Success', `File "${fileName}" received and saved!`);
          setReceivedFiles(prev => [...prev, { 
            name: fileName, 
            receivedAt: new Date(),
            uri: fileUri,
            type: fileType || 'application/octet-stream'
          }]);
          setIncomingFile(null);
          setFileProgress(0);
          fileChunksRef.current = [];
          
          newSocket.emit('file-received', { sessionId, fileName });
        } catch (error) {
          console.error('Error processing file chunks:', error);
          console.error('Error stack:', error.stack);
          console.error('Error details:', {
            fileName,
            fileType,
            chunksCount: fileChunksRef.current.length,
            totalLength: fileChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0),
          });
          Alert.alert('Error', `Failed to process file: ${error.message}`);
          setFileProgress(0);
          setIncomingFile(null);
          fileChunksRef.current = [];
        }
      }
    });

    newSocket.on('file-sent', (data) => {
      Alert.alert('Success', `File "${data.fileName}" sent successfully!`);
    });

    newSocket.on('file-error', (data) => {
      console.error('File error:', data);
      Alert.alert('File Error', data.message || 'File transfer error occurred');
    });

    newSocket.on('peer-disconnected', () => {
      console.log('Peer disconnected event received');
      setConnected(false);
      setConnecting(false);
      setMode('menu');
      Alert.alert('Disconnected', 'Peer disconnected');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setConnected(false);
      setConnecting(false);
      setMode('menu');
      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        Alert.alert('Disconnected', 'Connection lost. Please reconnect.');
      } else {
        // Client disconnected or network error
        Alert.alert('Disconnected', 'Connection lost');
      }
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      // If we were in a session, rejoin it
      if (sessionId) {
        newSocket.emit('join-session', { sessionId, type: 'mobile' });
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnected(false);
      setConnecting(false);
      setMode('menu');
      Alert.alert('Connection Error', 'Failed to connect. Please try again.');
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
        setConnecting(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Invalid QR code format');
      setMode('menu');
      setConnecting(false);
    }
  };

  const connectToSession = (targetSessionId) => {
    if (!socket) return;

    socket.emit('join-session', {
      sessionId: targetSessionId,
      type: 'mobile',
    });

    setSessionId(targetSessionId);
    setConnecting(true);
    setMode('connected'); // Switch to connected view to show loader
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
      console.log('Opening document picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      console.log('Document picker result:', result);

      if (result.canceled) {
        console.log('User canceled file selection');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        // New API format (Expo SDK 50+)
        const file = result.assets[0];
        console.log('Selected file (new format):', file);
        
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
        const fileSize = file.size || 0;
        
        // Check file size
        if (fileSize > MAX_FILE_SIZE) {
          Alert.alert('File Too Large', `File "${file.name || 'file'}" is too large. Maximum file size is 5MB.`);
          return;
        }
        
        // Show confirmation dialog before sending
        const fileSizeKB = (fileSize / 1024).toFixed(2);
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        const sizeDisplay = fileSize > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;
        
        Alert.alert(
          'Send File',
          `Do you want to send "${file.name || 'file'}" (${sizeDisplay})?`,
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Send',
              onPress: async () => {
                await sendFile({
                  uri: file.uri,
                  name: file.name || 'file',
                  mimeType: file.mimeType || 'application/octet-stream',
                  size: file.size || 0,
                });
              }
            }
          ]
        );
      } else if (result.type === 'success') {
        // Old API format
        console.log('Selected file (old format):', result);
        
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
        const fileSize = result.size || 0;
        
        // Check file size
        if (fileSize > MAX_FILE_SIZE) {
          Alert.alert('File Too Large', `File "${result.name || 'file'}" is too large. Maximum file size is 5MB.`);
          return;
        }
        
        // Show confirmation dialog before sending
        const fileSizeKB = (fileSize / 1024).toFixed(2);
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        const sizeDisplay = fileSize > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;
        
        Alert.alert(
          'Send File',
          `Do you want to send "${result.name || 'file'}" (${sizeDisplay})?`,
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Send',
              onPress: async () => {
                await sendFile(result);
              }
            }
          ]
        );
      } else {
        console.error('Unexpected result format:', result);
        Alert.alert('Error', 'Unexpected file picker result format');
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', `Failed to pick file: ${error.message}`);
    }
  };

  const handleOpenFile = async (file) => {
    if (!file.uri) {
      Alert.alert('Error', 'File URI not available');
      return;
    }

    try {
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(file.uri);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'File not found');
        return;
      }

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        // Use expo-sharing to open the file
        await Sharing.shareAsync(file.uri, {
          mimeType: file.type,
          dialogTitle: `Open ${file.name}`,
        });
      } else {
        // Fallback: try to open with Linking
        const canOpen = await Linking.canOpenURL(file.uri);
        if (canOpen) {
          await Linking.openURL(file.uri);
        } else {
          Alert.alert('Info', `File saved at: ${file.uri}`);
        }
      }
    } catch (error) {
      console.error('Error opening file:', error);
      Alert.alert('Error', `Failed to open file: ${error.message}`);
    }
  };

  const sendFile = async (fileResult) => {
    if (!socket || !sessionId) {
      console.error('Cannot send file: socket or sessionId missing');
      Alert.alert('Error', 'Not connected to a session');
      return;
    }

    try {
      console.log('Starting to send file:', fileResult);
      
      // Validate file result
      if (!fileResult.uri) {
        throw new Error('File URI is missing');
      }

      console.log('Checking file info for URI:', fileResult.uri);
      const fileInfo = await FileSystem.getInfoAsync(fileResult.uri);
      
      if (!fileInfo.exists) {
        throw new Error('File does not exist at the specified URI');
      }

      console.log('File info:', fileInfo);
      console.log('File size:', fileInfo.size);

      const encoding = (FileSystem.EncodingType && FileSystem.EncodingType.Base64) || 'base64';
      console.log('Reading file with encoding:', encoding);
      
      const fileContent = await FileSystem.readAsStringAsync(fileResult.uri, {
        encoding: encoding,
      });

      console.log('File read successfully, content length:', fileContent.length);

      // Convert base64 to Uint8Array
      console.log('Converting base64 to Uint8Array...');
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log('Converted to bytes, length:', bytes.length);

      const fileName = fileResult.name || 'file';
      const fileType = fileResult.mimeType || 'application/octet-stream';
      const fileSize = fileInfo.size || bytes.length;

      // Send file metadata
      console.log('Sending file metadata:', { fileName, fileSize, fileType });
      socket.emit('file-meta', {
        sessionId,
        fileName: fileName,
        fileSize: fileSize,
        fileType: fileType,
      });

      // Send file in chunks with delay to prevent overwhelming receiver
      const chunkSize = 64 * 1024; // 64KB
      let offset = 0;
      let chunkNumber = 0;

      const sendChunk = () => {
        const chunk = bytes.slice(offset, offset + chunkSize);
        const isLast = offset + chunkSize >= bytes.length;
        chunkNumber++;

        console.log(`Sending chunk ${chunkNumber}, offset: ${offset}, isLast: ${isLast}`);

        try {
          socket.emit('file-chunk', {
            sessionId,
            chunk: Array.from(chunk),
            fileName: fileName,
            isLast,
          });

          offset += chunkSize;

          if (!isLast) {
            // Add delay between chunks to prevent overwhelming receiver (especially for large files)
            // Increase delay for larger files to prevent disconnection
            const delay = fileSize > 2 * 1024 * 1024 ? 50 : 20; // 50ms for files > 2MB, 20ms for smaller
            setTimeout(sendChunk, delay);
          } else {
            console.log('All chunks sent successfully');
            Alert.alert('Success', `File "${fileName}" sent successfully!`);
          }
        } catch (error) {
          console.error('Error sending chunk:', error);
          Alert.alert('Error', `Failed to send file chunk: ${error.message}`);
        }
      };

      sendChunk();
    } catch (error) {
      console.error('Error sending file:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        fileResult: fileResult,
      });
      Alert.alert('Error', `Failed to send file: ${error.message}`);
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
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      {connecting && !connected ? (
        <View style={styles.connectingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.connectingText}>Connecting to peer...</Text>
          <Text style={styles.connectingSubtext}>Please wait</Text>
        </View>
      ) : (
        <>
          <View style={styles.statusContainer}>
            <View style={[styles.statusIndicator, connected ? styles.connected : styles.disconnected]}>
              <Text style={styles.statusText}>
                {connected ? '✓ Connected' : '○ Disconnected'}
              </Text>
            </View>
          </View>
          
          {!connected && !connecting && (
            <View style={styles.disconnectedMessage}>
              <Text style={styles.disconnectedText}>
                Connection lost. Please go back to menu and reconnect.
              </Text>
            </View>
          )}
        </>
      )}

      {connected && (
        <>
          <Text style={styles.title}>File Sharing</Text>

          <TouchableOpacity style={styles.button} onPress={handleSelectFile}>
            <Text style={styles.buttonText}>Select File to Send</Text>
          </TouchableOpacity>
        </>
      )}

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
          {[...receivedFiles].sort((a, b) => b.receivedAt - a.receivedAt).map((file, index) => (
            <View key={index} style={styles.receivedFileItem}>
              <TouchableOpacity
                style={styles.receivedFileInfo}
                onPress={() => handleOpenFile(file)}
                activeOpacity={0.7}
              >
                <Text style={styles.receivedFileName}>{file.name}</Text>
                <Text style={styles.receivedFileTime}>
                  {file.receivedAt.toLocaleTimeString()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.openFileButton}
                onPress={() => handleOpenFile(file)}
                activeOpacity={0.8}
              >
                <Text style={styles.openFileButtonText}>Open</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={() => {
          setMode('menu');
          setConnected(false);
          setConnecting(false);
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
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="auto" />
        {mode === 'menu' && renderMenu()}
        {mode === 'scan' && renderScanner()}
        {mode === 'generate' && renderQRGenerator()}
        {mode === 'connected' && renderConnected()}
      </SafeAreaView>
    </SafeAreaProvider>
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
  scrollView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  disconnected: {
    backgroundColor: '#ff9800',
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disconnectedMessage: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 8,
    marginVertical: 15,
    borderWidth: 1,
    borderColor: '#ffc107',
    width: '100%',
  },
  disconnectedText: {
    color: '#856404',
    fontSize: 14,
    textAlign: 'center',
  },
  connectingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  connectingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    textAlign: 'center',
  },
  connectingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  receivedFileInfo: {
    flex: 1,
    marginRight: 10,
  },
  openFileButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  openFileButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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

