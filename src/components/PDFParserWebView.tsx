import React, { useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface PDFParserWebViewProps {
  onTextExtracted: (text: string) => void;
  onError: (error: string) => void;
  pdfBase64: string | null;
  onFinishedProcessing: () => void;
}

export default function PDFParserWebView({
  onTextExtracted,
  onError,
  pdfBase64,
  onFinishedProcessing,
}: PDFParserWebViewProps) {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (pdfBase64 && webViewRef.current) {
      // Send the base64 PDF data to the webview
      const jsCode = `
        if (window.parsePdf) {
          window.parsePdf("${pdfBase64}");
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'PDF.js not loaded yet' }));
        }
      `;
      webViewRef.current.injectJavaScript(jsCode);
    }
  }, [pdfBase64]);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>PDF Parser</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
      <script>
        // Set worker src
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Helper to convert base64 to Uint8Array
        function base64ToUint8Array(base64) {
          const raw = window.atob(base64);
          const rawLength = raw.length;
          const array = new Uint8Array(new ArrayBuffer(rawLength));
          for (let i = 0; i < rawLength; i++) {
            array[i] = raw.charCodeAt(i);
          }
          return array;
        }

        // Global parsing function
        window.parsePdf = async function(base64Data) {
          try {
            const pdfData = base64ToUint8Array(base64Data);
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            const pdf = await loadingTask.promise;
            
            let fullText = '';
            
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map(item => item.str)
                .join(' ');
              fullText += pageText + '\\n';
            }

            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'success',
              text: fullText
            }));
          } catch (err) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: err.message || 'Unknown error parsing PDF'
            }));
          }
        };

        // Notify app that we are ready
        window.onload = function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        };
      </script>
    </head>
    <body>
      <h3>PDF parsing worker...</h3>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'ready') {
              console.log('PDF WebView Parser Ready');
            } else if (data.type === 'success') {
              onTextExtracted(data.text);
              onFinishedProcessing();
            } else if (data.type === 'error') {
              onError(data.message);
              onFinishedProcessing();
            }
          } catch (e) {
            console.error('Failed to parse WebView message:', e);
            onError('Failed to communicate with WebView parser');
            onFinishedProcessing();
          }
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  },
});
