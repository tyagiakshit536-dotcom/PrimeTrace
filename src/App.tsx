import { DetectiveBoardPreset } from "./board";
import type { GhostSignature } from "./ghost";

interface AppProps {
  ghostSignature: GhostSignature | null;
}

export default function App({ ghostSignature }: AppProps) {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <DetectiveBoardPreset
        ghostSignature={ghostSignature}
        style={{ width: "100%", height: "100%" }}
      />
    </main>
  );
}
