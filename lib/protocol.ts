export type ConnectionPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "closed";

export type MouseButton = "left" | "middle" | "right";
export type Modifier = "ctrl" | "alt" | "shift" | "meta";

export type AgentToWebMessage =
  | {
      type: "hello";
      protocol: 1;
      agent: {
        name: string;
        version: string;
        os: string;
        hostname?: string;
      };
    }
  | {
      type: "screen_frame";
      mime: "image/jpeg" | "image/png" | "image/webp";
      data: string;
      width: number;
      height: number;
      timestamp: number;
    }
  | {
      type: "audio_chunk";
      sampleRate: number;
      channels: 1;
      data: string;
      timestamp: number;
    }
  | {
      type: "agent_state";
      connected: boolean;
      locked?: boolean;
      width?: number;
      height?: number;
      cursor?: { x: number; y: number };
    }
  | {
      type: "clipboard";
      text: string;
    }
  | {
      type: "error";
      code: string;
      message: string;
    };

export type WebToAgentMessage =
  | {
      type: "hello";
      protocol: 1;
      token: string;
      client: { name: "control-agent-web"; version: string; userAgent: string };
    }
  | { type: "screen_request"; quality?: number; maxFps?: number }
  | { type: "audio_request"; enabled: boolean; sampleRate?: number }
  | {
      type: "pointer";
      action: "move" | "button";
      x: number;
      y: number;
      button?: MouseButton;
      state?: "down" | "up";
    }
  | { type: "wheel"; dx: number; dy: number }
  | {
      type: "key";
      action: "down" | "up";
      key: string;
      code?: string;
      modifiers?: Modifier[];
    }
  | { type: "type_text"; text: string }
  | { type: "clipboard_get" }
  | { type: "clipboard_set"; text: string }
  | {
      type: "system";
      action: "lock" | "volume_up" | "volume_down" | "volume_mute" | "screenshot";
    };

export function isAgentMessage(value: unknown): value is AgentToWebMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export function toWebSocketUrl(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("ws://") || value.startsWith("wss://")) return value;
  if (value.startsWith("https://")) return "wss://" + value.slice("https://".length);
  if (value.startsWith("http://")) return "ws://" + value.slice("http://".length);
  return "wss://" + value;
}