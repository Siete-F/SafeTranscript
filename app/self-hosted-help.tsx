
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { colors } from '@/styles/commonStyles';

export default function SelfHostedHelpScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Self-Hosted Transcription',
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* ── Section: What is self-hosted transcription? ── */}
        <View style={styles.section}>
          <Text style={styles.heading}>What is self-hosted transcription?</Text>
          <Text style={styles.body}>
            Instead of sending audio to an external cloud API, you can run a transcription server on your own PC or home/company network. The app connects to that server over your local Wi-Fi or VPN — your audio never leaves your network.
          </Text>
          <Text style={styles.body}>
            Any server that exposes an OpenAI-compatible <Text style={styles.code}>/v1/audio/transcriptions</Text> endpoint works, including vllm running Voxtral and faster-whisper-server running Whisper.
          </Text>
        </View>

        {/* ── Section: Requirements ── */}
        <View style={styles.section}>
          <Text style={styles.heading}>Requirements</Text>
          <View style={styles.bulletList}>
            <BulletItem>A PC or server (Windows, macOS, or Linux) on the same network as your phone.</BulletItem>
            <BulletItem>Docker Desktop (or Docker Engine on Linux) installed.</BulletItem>
            <BulletItem>For Voxtral: a GPU with at least 8 GB VRAM, or a CPU-only setup with a quantized model (~4–8 GB RAM).</BulletItem>
            <BulletItem>For Whisper (faster-whisper-server): any modern CPU works; a GPU speeds it up significantly.</BulletItem>
          </View>
        </View>

        {/* ── Section: Option A — vllm + Voxtral ── */}
        <View style={styles.section}>
          <View style={styles.optionHeader}>
            <View style={[styles.optionBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.optionBadgeText}>A</Text>
            </View>
            <Text style={styles.heading2}>vllm with Voxtral (recommended)</Text>
          </View>
          <Text style={styles.body}>
            vllm is a high-performance LLM/speech inference engine. It can serve Mistral's open-weights Voxtral model and expose a fully compatible <Text style={styles.code}>/v1/audio/transcriptions</Text> endpoint.
          </Text>

          <Text style={styles.subHeading}>1. Pull the image</Text>
          <CodeBlock>{`docker pull vllm/vllm-openai:latest`}</CodeBlock>

          <Text style={styles.subHeading}>2. Start the server</Text>
          <CodeBlock>{`docker run --gpus all -p 8000:8000 \\
  vllm/vllm-openai:latest \\
  --model mistralai/Voxtral-Mini-3B-2507 \\
  --dtype float16`}</CodeBlock>

          <Text style={styles.note}>
            For CPU-only machines, replace <Text style={styles.code}>--gpus all</Text> with <Text style={styles.code}>--device cpu</Text> and add <Text style={styles.code}>--dtype float32</Text>. Inference will be slower but functional.
          </Text>

          <Text style={styles.subHeading}>Model weights</Text>
          <Text style={styles.body}>
            Weights are downloaded automatically from HuggingFace on first start. You need a HuggingFace account and must accept the Voxtral model licence at{'\n'}
            <Text style={styles.link}>https://huggingface.co/mistralai/Voxtral-Mini-3B-2507</Text>
          </Text>
          <Text style={styles.body}>
            Pass your HuggingFace token to the container via the <Text style={styles.code}>HF_TOKEN</Text> environment variable:
          </Text>
          <CodeBlock>{`docker run --gpus all -p 8000:8000 \\
  -e HF_TOKEN=hf_your_token_here \\
  vllm/vllm-openai:latest \\
  --model mistralai/Voxtral-Mini-3B-2507`}</CodeBlock>
        </View>

        {/* ── Section: Option B — faster-whisper-server ── */}
        <View style={styles.section}>
          <View style={styles.optionHeader}>
            <View style={[styles.optionBadge, { backgroundColor: colors.secondary }]}>
              <Text style={styles.optionBadgeText}>B</Text>
            </View>
            <Text style={styles.heading2}>faster-whisper-server</Text>
          </View>
          <Text style={styles.body}>
            faster-whisper-server is a lightweight server built on top of faster-whisper. It runs any Whisper model size and is compatible with the OpenAI audio transcription API.
          </Text>

          <Text style={styles.subHeading}>1. Pull the image</Text>
          <CodeBlock>{`docker pull fedirz/faster-whisper-server:latest-cpu`}</CodeBlock>

          <Text style={styles.note}>
            For NVIDIA GPU acceleration use the <Text style={styles.code}>latest-cuda</Text> tag and add <Text style={styles.code}>--gpus all</Text>.
          </Text>

          <Text style={styles.subHeading}>2. Start the server</Text>
          <CodeBlock>{`docker run -p 8000:8000 \\
  fedirz/faster-whisper-server:latest-cpu`}</CodeBlock>

          <Text style={styles.body}>
            The server downloads the selected Whisper model automatically. By default it uses <Text style={styles.code}>Systran/faster-whisper-small</Text>. Set a different model via the <Text style={styles.code}>--model</Text> flag or the <Text style={styles.code}>WHISPER__MODEL</Text> environment variable.
          </Text>
        </View>

        {/* ── Section: Connecting the app ── */}
        <View style={styles.section}>
          <Text style={styles.heading}>Connecting the app</Text>
          <View style={styles.stepList}>
            <StepItem number="1">Find your PC's local IP address (e.g. <Text style={styles.code}>192.168.1.100</Text>). On Windows: run <Text style={styles.code}>ipconfig</Text>. On macOS/Linux: run <Text style={styles.code}>ifconfig</Text> or check System Preferences → Network.</StepItem>
            <StepItem number="2">Make sure the server container is running and the firewall allows inbound connections on port <Text style={styles.code}>8000</Text>.</StepItem>
            <StepItem number="3">In the app, go to <Text style={styles.bold}>Settings → Self-Hosted Transcription</Text>.</StepItem>
            <StepItem number="4">Enter the endpoint URL: <Text style={styles.code}>http://192.168.1.100:8000</Text> (replace with your PC's IP).</StepItem>
            <StepItem number="5">If your server requires authentication, enter the bearer token. Otherwise leave it empty.</StepItem>
            <StepItem number="6">Tap <Text style={styles.bold}>Test</Text> to verify the connection, then tap <Text style={styles.bold}>Save</Text>.</StepItem>
          </View>
        </View>

        {/* ── Section: Troubleshooting ── */}
        <View style={[styles.section, styles.lastSection]}>
          <Text style={styles.heading}>Troubleshooting</Text>
          <View style={styles.bulletList}>
            <BulletItem><Text style={styles.bold}>Connection refused</Text> — Make sure the Docker container is running (<Text style={styles.code}>docker ps</Text>) and that port 8000 is mapped.</BulletItem>
            <BulletItem><Text style={styles.bold}>Timeout / unreachable</Text> — Both the phone and the server must be on the same Wi-Fi network (or connected via VPN). Corporate networks sometimes block device-to-device traffic.</BulletItem>
            <BulletItem><Text style={styles.bold}>HTTP vs HTTPS</Text> — Use <Text style={styles.code}>http://</Text> for local network endpoints. HTTPS requires a TLS certificate on the server.</BulletItem>
            <BulletItem><Text style={styles.bold}>401 Unauthorized</Text> — The server expects a bearer token. Add it in the app's Settings.</BulletItem>
            <BulletItem><Text style={styles.bold}>Out of memory</Text> — Reduce the model size (e.g. use <Text style={styles.code}>Systran/faster-whisper-tiny</Text>) or enable CPU inference.</BulletItem>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletItem}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function StepItem({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <View style={styles.stepItem}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{children}</Text>
    </View>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <View style={styles.codeBlock}>
      <Text style={styles.codeBlockText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },

  section: {
    marginBottom: 28,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  lastSection: { marginBottom: 0 },

  heading: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 10 },
  heading2: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  subHeading: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 6 },
  body: { fontSize: 14, color: colors.text, lineHeight: 21, marginBottom: 8 },
  note: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, fontStyle: 'italic', marginBottom: 8 },
  bold: { fontWeight: '700' },
  link: { color: colors.primary, textDecorationLine: 'underline' as const },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: colors.text, backgroundColor: `${colors.border}60` },

  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  optionBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionBadgeText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  codeBlock: {
    backgroundColor: '#1E1E2E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  codeBlockText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#CDD6F4',
    lineHeight: 18,
  },

  bulletList: { gap: 8 },
  bulletItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletDot: { fontSize: 16, color: colors.textSecondary, lineHeight: 21, marginTop: 0 },
  bulletText: { fontSize: 14, color: colors.text, lineHeight: 21, flex: 1 },

  stepList: { gap: 12 },
  stepItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumberText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  stepText: { fontSize: 14, color: colors.text, lineHeight: 21, flex: 1 },
});
