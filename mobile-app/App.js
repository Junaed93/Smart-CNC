import React, { useState, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Image, 
  ScrollView, 
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';

// Auto-detect the development server IP
let defaultIp = '10.0.2.2:5000';
if (Constants.expoConfig?.hostUri) {
  const host = Constants.expoConfig.hostUri.split(':')[0];
  defaultIp = `${host}:5000`;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState('');
  const [svgContent, setSvgContent] = useState(null);
  const [gcodeContent, setGcodeContent] = useState(null);
  
  // The IP is auto-detected from Expo, but we keep it in state so the user can edit it if needed.
  const [serverIp, setServerIp] = useState(defaultIp);
  
  const scrollViewRef = useRef(null);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setFile(result.assets[0]);
      setLogs('');
      setSvgContent(null);
      setGcodeContent(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setIsProcessing(true);
    setLogs('Initializing Smart CNC Process...\n');

    let formData = new FormData();
    // React Native FormData requires specific object structure for files
    const filename = file.uri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image`;

    formData.append('file', {
      uri: file.uri,
      name: filename,
      type: type,
    });
    formData.append('mode', mode.toString());

    try {
      setLogs(prev => prev + `Uploading ${filename}...\n`);
      
      const serverUrl = `http://${serverIp}/api/process`;
      const response = await fetch(serverUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();
      
      if (data.logs) {
        setLogs(prev => prev + '\n--- Processing Logs ---\n' + data.logs);
      }

      if (response.ok && data.success) {
        setLogs(prev => prev + '\n✅ ' + data.message);
        
        if (data.svg_url) {
          try {
            // Replace localhost with the server IP for the fetched URLs
            const svgUrl = data.svg_url.replace('localhost:5000', serverIp);
            const svgResponse = await fetch(svgUrl);
            let svgText = await svgResponse.text();
            svgText = svgText.replace(/<svg:([a-zA-Z0-9-]+)/g, '<$1');
            svgText = svgText.replace(/<\/svg:([a-zA-Z0-9-]+)/g, '</$1');
            setSvgContent(svgText);
          } catch (e) {
            console.error("Could not load SVG preview", e);
          }
        }
        
        if (data.gcode_url) {
          try {
            const gcodeUrl = data.gcode_url.replace('localhost:5000', serverIp);
            const gcodeResponse = await fetch(gcodeUrl);
            const gcodeText = await gcodeResponse.text();
            const previewLines = gcodeText.split('\n').slice(0, 8).join('\n');
            setGcodeContent(previewLines);
          } catch (e) {
            console.error("Could not load GCode preview", e);
          }
        }
      } else {
        setLogs(prev => prev + '\n❌ Error: ' + (data.error || 'Unknown error occurred.'));
      }
    } catch (err) {
      setLogs(prev => prev + `\n❌ Network Error: Could not connect to ${serverIp}\nMake sure server.py is running and you entered your computer's local IP address.`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const renderSvgPreview = () => {
    if (!svgContent) return null;
    
    // Wrap SVG in HTML with animated stroke styles similar to the web version
    const htmlContent = `
      <html>
        <head>
          <style>
            body { 
              background-color: #0f172a; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              margin: 0; 
              height: 100vh;
            }
            svg {
              width: 100%;
              height: 100%;
              max-width: 100vw;
              max-height: 100vh;
            }
            path, line, polyline, polygon, rect, circle, ellipse {
              stroke: #0ea5e9 !important;
              stroke-width: 1.5 !important;
              fill: none !important;
              stroke-dasharray: 1000;
              stroke-dashoffset: 1000;
              animation: draw 3s ease-out forwards;
            }
            @keyframes draw {
              to {
                stroke-dashoffset: 0;
              }
            }
          </style>
        </head>
        <body>
          ${svgContent}
        </body>
      </html>
    `;

    return (
      <View style={styles.webviewContainer}>
        <WebView
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={styles.webview}
          scrollEnabled={false}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView style={styles.scrollContainer} ref={scrollViewRef}>
          
          <View style={styles.header}>
            <Text style={styles.title}>Smart CNC Plotter</Text>
            <Text style={styles.subtitle}>Mobile Controller</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.serverConfig}>
              <Text style={styles.label}>Server IP Address:</Text>
              <TextInput
                style={styles.input}
                value={serverIp}
                onChangeText={setServerIp}
                placeholder="e.g. 192.168.1.5:5000"
                placeholderTextColor="#64748b"
              />
            </View>

            <TouchableOpacity style={styles.uploadZone} onPress={pickImage}>
              {file ? (
                <View style={styles.previewContainer}>
                  <Image source={{ uri: file.uri }} style={styles.previewImage} resizeMode="contain" />
                  <View style={styles.changeImageBtn}>
                    <Text style={styles.changeImageText}>Change Image</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.uploadEmpty}>
                  <Text style={styles.uploadIcon}>📸</Text>
                  <Text style={styles.uploadText}>Tap to select an image</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Processing Mode</Text>
            <View style={styles.modeContainer}>
              <TouchableOpacity 
                style={[styles.modeCard, mode === 1 && styles.modeCardActive]} 
                onPress={() => setMode(1)}
              >
                <Text style={styles.modeIcon}>〰️</Text>
                <Text style={styles.modeTitle}>Outline</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modeCard, mode === 2 && styles.modeCardActive]} 
                onPress={() => setMode(2)}
              >
                <Text style={styles.modeIcon}>▒</Text>
                <Text style={styles.modeTitle}>Shading</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.actionBtn, (!file || isProcessing) && styles.actionBtnDisabled]} 
              onPress={handleProcess}
              disabled={!file || isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.actionBtnText}>Generate G-Code ▶</Text>
              )}
            </TouchableOpacity>
          </View>

          {(logs || isProcessing) && (
            <View style={styles.terminalContainer}>
              <View style={styles.terminalHeader}>
                <View style={styles.terminalDots}>
                  <View style={[styles.dot, {backgroundColor: '#ef4444'}]} />
                  <View style={[styles.dot, {backgroundColor: '#eab308'}]} />
                  <View style={[styles.dot, {backgroundColor: '#22c55e'}]} />
                </View>
                <Text style={styles.terminalTitle}>server.py Output</Text>
              </View>
              <View style={styles.terminalBody}>
                <Text style={styles.terminalText}>{logs}</Text>
              </View>
            </View>
          )}

          {(svgContent || gcodeContent || isProcessing) && (
            <View style={styles.terminalContainer}>
              <View style={styles.terminalHeader}>
                <View style={styles.terminalDots}>
                  <View style={[styles.dot, {backgroundColor: '#ef4444'}]} />
                  <View style={[styles.dot, {backgroundColor: '#eab308'}]} />
                  <View style={[styles.dot, {backgroundColor: '#22c55e'}]} />
                </View>
                <Text style={styles.terminalTitle}>G-Code Preview</Text>
              </View>
              <View style={[styles.terminalBody, {padding: 0}]}>
                {isProcessing ? (
                  <View style={styles.loadingPreview}>
                    <ActivityIndicator color="#0ea5e9" size="large" />
                    <Text style={styles.loadingText}>Generating Preview...</Text>
                  </View>
                ) : (
                  <>
                    {svgContent && renderSvgPreview()}
                    {gcodeContent && (
                      <View style={styles.gcodeSnippet}>
                        <Text style={styles.gcodeComment}>// First few lines of generated G-Code</Text>
                        <Text style={styles.gcodeText}>{gcodeContent}</Text>
                        <Text style={styles.gcodeText}>...</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          )}
          
          <View style={{height: 40}} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // Very dark blue/black background
  },
  scrollContainer: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginVertical: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 4,
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  serverConfig: {
    marginBottom: 20,
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#f8fafc',
    padding: 12,
    fontSize: 16,
  },
  uploadZone: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 2,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 12,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  uploadEmpty: {
    alignItems: 'center',
  },
  uploadIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  uploadText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  previewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  changeImageBtn: {
    position: 'absolute',
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  changeImageText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 12,
  },
  modeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modeCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modeCardActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  modeIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  modeTitle: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  },
  actionBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: {
    backgroundColor: '#1e3a8a',
    opacity: 0.7,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  terminalContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  terminalDots: {
    flexDirection: 'row',
    marginRight: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  terminalTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  terminalBody: {
    padding: 16,
    minHeight: 100,
  },
  terminalText: {
    color: '#e2e8f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
  },
  loadingPreview: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
  },
  webviewContainer: {
    height: 250,
    width: '100%',
    backgroundColor: '#0f172a',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gcodeSnippet: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    backgroundColor: '#020617',
  },
  gcodeComment: {
    color: '#64748b',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    marginBottom: 8,
  },
  gcodeText: {
    color: '#22c55e',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  }
});
