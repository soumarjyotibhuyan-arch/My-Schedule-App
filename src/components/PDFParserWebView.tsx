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
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const textContent = await page.getTextContent();

              // Group text items by Y coordinate (rows) to preserve table structure
              const rows = {};
              for (const item of textContent.items) {
                if (!item.str || !item.str.trim()) continue;
                // Group items within 4px Y-threshold into the same row line
                const y = Math.round((item.transform ? item.transform[5] : 0) / 4) * 4;
                const x = item.transform ? item.transform[4] : 0;
                if (!rows[y]) rows[y] = [];
                rows[y].push({ x: x, str: item.str });
              }

              // Sort rows top-to-bottom (higher Y = higher up on PDF page)
              const sortedYKeys = Object.keys(rows).sort((a, b) => Number(b) - Number(a));
              
              for (const yKey of sortedYKeys) {
                // Sort cells in row left-to-right (lower X = further left)
                const rowItems = rows[yKey].sort((a, b) => a.x - b.x);
                const rowLine = rowItems.map(it => it.str).join(' , ');
                fullText += rowLine + '\\n';
              }
              fullText += '\\n';
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
