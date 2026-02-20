/**
 * ONNX Runtime Provider — Native Platform (iOS/Android)
 * Stub for now. When onnxruntime-react-native is installed, this will provide
 * the native ONNX Runtime implementation.
 */

export async function getOrt(): Promise<any> {
  throw new Error(
    'ONNX Runtime is not yet available on native platforms. ' +
    'GLiNER PII detection requires the web platform for now.'
  );
}
