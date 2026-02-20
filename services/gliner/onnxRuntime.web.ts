/**
 * ONNX Runtime Provider — Web Platform
 * Loads onnxruntime-web from CDN to avoid Metro bundling issues
 * (Metro can't handle the dynamic import() in onnxruntime-web's WASM loader).
 */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js';

let _ort: any = null;
let _loading: Promise<any> | null = null;

/**
 * Get the ONNX Runtime module. Loads from CDN on first call.
 */
export async function getOrt(): Promise<any> {
  if (_ort) return _ort;

  // Prevent multiple concurrent loads
  if (_loading) return _loading;

  _loading = (async () => {
    await new Promise<void>((resolve, reject) => {
      // Check if already loaded (e.g., by a previous script tag)
      if ((globalThis as any).ort) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = CDN_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load ONNX Runtime from CDN'));
      document.head.appendChild(script);
    });

    _ort = (globalThis as any).ort;
    if (!_ort) throw new Error('ONNX Runtime not available after script load');

    // Configure WASM paths to use CDN
    _ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';

    console.log('[ONNX] Runtime loaded from CDN');
    return _ort;
  })();

  return _loading;
}
