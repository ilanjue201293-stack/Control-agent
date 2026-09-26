"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  isAgentMessage,
  toWebSocketUrl,
  type AgentToWebMessage,
  type ConnectionPhase,
  type Modifier,
  type MouseButton,
  type WebToAgentMessage,
} from "@/lib/protocol";

const VERSION = "1.0.0";

const QUICK_KEYS = [
  { label: "Esc", key: "Escape", code: "Escape" },
  { label: "Tab", key: "Tab", code: "Tab" },
  { label: "Enter", key: "Enter", code: "Enter" },
  { label: "Backspace", key: "Backspace", code: "Backspace" },
  { label: "↑", key: "ArrowUp", code: "ArrowUp" },
  { label: "↓", key: "ArrowDown", code: "ArrowDown" },
  { label: "←", key: "ArrowLeft", code: "ArrowLeft" },
  { label: "→", key: "ArrowRight", code: "ArrowRight" },
];

const SHORTCUTS: Array<{
  label: string;
  key: string;
  code?: string;
  modifiers?: Modifier[];
}> = [
  { label: "Ctrl + C", key: "c", code: "KeyC", modifiers: ["ctrl"] },
  { label: "Ctrl + V", key: "v", code: "KeyV", modifiers: ["ctrl"] },
  { label: "Ctrl + Z", key: "z", code: "KeyZ", modifiers: ["ctrl"] },
  { label: "Alt + Tab", key: "Tab", code: "Tab", modifiers: ["alt"] },
  { label: "Win + D", key: "d", code: "KeyD", modifiers: ["meta"] },
];

function phaseLabel(phase: ConnectionPhase) {
  if (phase === "connecting") return "Connexion…";
  if (phase === "connected") return "Connecté";
  if (phase === "error") return "Erreur";
  if (phase === "closed") return "Fermé";
  return "Prêt";
}

function phaseClass(phase: ConnectionPhase) {
  if (phase === "connected") return "status status-live";
  if (phase === "connecting") return "status status-pending";
  if (phase === "error") return "status status-error";
  return "status";
}

export default function ControlApp() {
  const socketRef = useRef<WebSocket | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0.5, y: 0.5 });
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNextTimeRef = useRef(0);
  const audioEnabledRef = useRef(true);

  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [agentName, setAgentName] = useState("PC");
  const [agentOs, setAgentOs] = useState("Windows");
  const [agentOnline, setAgentOnline] = useState(false);
  const [locked, setLocked] = useState(false);
  const [screenFrame, setScreenFrame] = useState<Extract<AgentToWebMessage, { type: "screen_frame" }> | null>(null);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState("");
  const [textToType, setTextToType] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const demoImage = useMemo(() => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">' +
      '<rect width="1600" height="900" fill="#12151b"/>' +
      '<rect x="0" y="0" width="1600" height="74" fill="#20252e"/>' +
      '<circle cx="38" cy="37" r="13" fill="#f2f4f8"/>' +
      '<rect x="80" y="23" width="280" height="28" rx="14" fill="#0d0f13"/>' +
      '<rect x="48" y="110" width="1504" height="696" rx="18" fill="#171b22"/>' +
      '<rect x="96" y="160" width="900" height="46" rx="12" fill="#242a35"/>' +
      '<rect x="96" y="236" width="660" height="20" rx="10" fill="#303744"/>' +
      '<rect x="96" y="278" width="560" height="20" rx="10" fill="#2a303b"/>' +
      '<rect x="96" y="320" width="800" height="260" rx="18" fill="#0e1116"/>' +
      '<rect x="960" y="160" width="450" height="210" rx="18" fill="#202632"/>' +
      '<rect x="960" y="396" width="450" height="184" rx="18" fill="#202632"/>' +
      '<text x="96" y="700" fill="#8f98a8" font-family="Arial" font-size="42">Aperçu du PC</text>' +
      '<text x="96" y="755" fill="#5f6878" font-family="Arial" font-size="24">Le vrai écran arrivera depuis l’agent Windows.</text>' +
      '</svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }, []);

  useEffect(() => {
    const savedEndpoint = window.localStorage.getItem("control-agent:endpoint");
    setEndpoint(process.env.NEXT_PUBLIC_AGENT_WS_URL || savedEndpoint || "");
  }, []);

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  const send = useCallback((message: WebToAgentMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
    if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();
    return audioContextRef.current;
  }, []);

  const requestScreen = useCallback(() => {
    send({ type: "screen_request", quality: 58, maxFps: 12 });
  }, [send]);


  const connect = useCallback(() => {
    const url = toWebSocketUrl(endpoint);
    setError("");

    if (!url) {
      setError("Ajoute l’URL WebSocket de l’agent Windows.");
      setPhase("error");
      return;
    }

    socketRef.current?.close();
    setPhase("connecting");
    setAgentOnline(false);
    ensureAudioContext();

    try {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setPhase("connected");
        send({
          type: "hello",
          protocol: 1,
          token,
          client: {
            name: "control-agent-web",
            version: VERSION,
            userAgent: navigator.userAgent,
          },
        });
        window.localStorage.setItem("control-agent:endpoint", endpoint);
      });

      socket.addEventListener("message", async (event) => {
        if (typeof event.data !== "string") {
          if (!audioEnabledRef.current) return;
          try {
            const buffer = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
            const bytes = new Uint8Array(buffer);
            if (bytes.length < 10 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "AUD1") return;
            const view = new DataView(buffer);
            const sampleRate = view.getUint32(4, true);
            const channels = view.getUint8(8);
            const pcmOffset = 10;
            const sampleCount = Math.floor((bytes.length - pcmOffset) / 2);
            if (!sampleRate || channels < 1 || channels > 2 || sampleCount <= 0) return;
            const context = ensureAudioContext();
            if (!context || context.state !== "running") return;
            const frames = Math.floor(sampleCount / channels);
            const audioBuffer = context.createBuffer(channels, frames, sampleRate);
            const pcm = new DataView(buffer, pcmOffset);
            for (let channel = 0; channel < channels; channel += 1) {
              const channelData = audioBuffer.getChannelData(channel);
              for (let i = 0; i < frames; i += 1) {
                const offset = (i * channels + channel) * 2;
                channelData[i] = pcm.getInt16(offset, true) / 32768;
              }
            }
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(context.destination);
            const now = context.currentTime;
            audioNextTimeRef.current = Math.max(audioNextTimeRef.current, now + 0.03);
            source.start(audioNextTimeRef.current);
            audioNextTimeRef.current += audioBuffer.duration;
          } catch {
            // Audio malformé/autoplay : ne pas afficher d'erreur rouge.
          }
          return;
        }

        try {
          const data: unknown = JSON.parse(String(event.data));
          if (!isAgentMessage(data)) return;

          if (data.type === "hello") {
            setAgentName(data.agent.hostname || data.agent.name);
            setAgentOs(data.agent.os);
            setAgentOnline(true);
          }
          if (data.type === "screen_frame") {
            setScreenFrame(data);
            setScreenSize({ width: data.width, height: data.height });
          }
          if (data.type === "agent_state") {
            setAgentOnline(data.connected);
            setLocked(Boolean(data.locked));
            if (data.width && data.height) setScreenSize({ width: data.width, height: data.height });
          }
          if (data.type === "error") {
            setError(data.message);
            setPhase("error");
          }
          if (data.type === "clipboard") setTextToType(data.text);
        } catch {
          setError("Message reçu de l’agent impossible à lire.");
        }
      });

      socket.addEventListener("error", () => {
        setPhase("error");
        setAgentOnline(false);
        setError("Impossible de joindre l’agent. Vérifie l’URL, le HTTPS/WSS et le token.");
      });

      socket.addEventListener("close", () => {
        setPhase((current) => current === "error" ? "error" : "closed");
        setAgentOnline(false);
      });
    } catch {
      setPhase("error");
      setError("URL WebSocket invalide.");
    }
  }, [endpoint, ensureAudioContext, requestScreen, send, token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedEndpoint = params.get("endpoint") || params.get("agent");
    const sharedToken = params.get("token");
    if (sharedEndpoint) setEndpoint(sharedEndpoint);
    if (sharedToken) setToken(sharedToken);
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setAgentOnline(false);
    setPhase("closed");
  }, []);

  const normalizedPoint = useCallback((event: { clientX: number; clientY: number }) => {
    const element = screenRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    lastPointerRef.current = point;
    return point;
  }, []);

  const pointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !agentOnline || demoMode) return;
    const point = normalizedPoint(event);
    if (point) send({ type: "pointer", action: "move", ...point });
  }, [agentOnline, demoMode, normalizedPoint, send]);

  const pointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!agentOnline || demoMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = normalizedPoint(event);
    if (!point) return;
    draggingRef.current = true;
    send({ type: "pointer", action: "move", ...point });
    send({ type: "pointer", action: "button", ...point, button: "left", state: "down" });
  }, [agentOnline, demoMode, normalizedPoint, send]);

  const pointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || demoMode) return;
    const point = normalizedPoint(event);
    draggingRef.current = false;
    if (point) send({ type: "pointer", action: "button", ...point, button: "left", state: "up" });
  }, [demoMode, normalizedPoint, send]);

  const wheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!agentOnline || demoMode) return;
    event.preventDefault();
    send({ type: "wheel", dx: event.deltaX, dy: event.deltaY });
  }, [agentOnline, demoMode, send]);

  const sendKey = useCallback((key: string, code?: string, modifiers: Modifier[] = []) => {
    if (!agentOnline || demoMode) return;
    send({ type: "key", action: "down", key, code, modifiers });
    window.setTimeout(() => {
      send({ type: "key", action: "up", key, code, modifiers });
    }, 35);
  }, [agentOnline, demoMode, send]);

  const handleTypeKey = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!agentOnline || demoMode) return;
    if (event.key === "Enter") {
      event.preventDefault();
      send({ type: "type_text", text: event.currentTarget.value });
      setTextToType("");
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      sendKey(event.key, event.code);
    }
  }, [agentOnline, demoMode, send, sendKey]);

  const sendTypedText = useCallback(() => {
    if (!textToType || demoMode || !agentOnline) return;
    send({ type: "type_text", text: textToType });
    setTextToType("");
  }, [agentOnline, demoMode, send, textToType]);

  const command = useCallback((action: "lock" | "volume_up" | "volume_down" | "volume_mute" | "screenshot") => {
    if (!agentOnline || demoMode) return;
    send({ type: "system", action });
  }, [agentOnline, demoMode, send]);

  const currentImage = demoMode
    ? demoImage
    : screenFrame
      ? "data:" + screenFrame.mime + ";base64," + screenFrame.data
      : "";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">⌁</div>
          <div>
            <div className="brand-title">Control Agent</div>
            <div className="brand-subtitle">Télécommande PC depuis Safari</div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className={"demo-pill " + (demoMode ? "active" : "")} onClick={() => setDemoMode((value) => !value)} type="button">
            {demoMode ? "Démo activée" : "Mode démo"}
          </button>
          <button className="icon-button" onClick={() => setShowSettings((value) => !value)} aria-label="Ouvrir les réglages" type="button">
            ⚙
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="settings-panel">
          <div className="settings-title">Connexion à l’agent Windows</div>
          <div className="settings-grid">
            <label>
              <span>WebSocket URL</span>
              <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="wss://pc.example.com/ws" spellCheck={false} />
            </label>
            <label>
              <span>Token</span>
              <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Token secret" type="password" autoComplete="off" />
            </label>
          </div>
          <div className="settings-help">
            Le token reste uniquement en mémoire dans cette page. Pour une page Vercel en HTTPS, utilise un endpoint <strong>WSS</strong> sécurisé.
          </div>
        </section>
      )}

      <section className="connection-row">
        <div className={phaseClass(phase)}>
          <span className="status-dot" />
          {phaseLabel(phase)}
        </div>
        <div className="agent-summary">
          <span className="agent-name">{agentName}</span>
          <span className="muted">{agentOs}</span>
          {screenSize.width > 0 && <span className="muted">{screenSize.width}×{screenSize.height}</span>}
        </div>
        <div className="connection-actions">
          {phase === "connected" ? (
            <button className="secondary-button" onClick={disconnect} type="button">Déconnecter</button>
          ) : (
            <button className="primary-button" onClick={connect} type="button">Connecter</button>
          )}
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} type="button" aria-label="Fermer">×</button>
        </div>
      )}

      <section className="workspace">
        <div className="screen-card">
          <div className="screen-card-head">
            <div>
              <div className="eyebrow">ÉCRAN À DISTANCE</div>
              <div className="screen-title">
                {demoMode ? "Aperçu de l’interface" : screenFrame ? "Écran du PC" : "En attente de l’agent"}
              </div>
            </div>
            <div className="screen-tools">
              <span className="live-badge">● LIVE</span>
              <button className="tiny-button" onClick={requestScreen} disabled={!agentOnline || demoMode} type="button">Actualiser</button>
              <button className="tiny-button" onClick={() => command("screenshot")} disabled={!agentOnline || demoMode} type="button">Capture</button>
            </div>
          </div>

          <div className="screen-frame-shell">
            <div
              ref={screenRef}
              className="screen-frame"
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerUp}
              onWheel={wheel}
              style={{ touchAction: "none" }}
            >
              {currentImage ? (
                <img className="remote-image" src={currentImage} alt="Écran du PC distant" draggable={false} />
              ) : (
                <div className="screen-placeholder">
                  <div className="placeholder-icon">▣</div>
                  <div className="placeholder-title">Aucun écran reçu</div>
                  <div className="placeholder-copy">Connecte l’agent Windows, puis il enverra les frames ici.</div>
                </div>
              )}
              {locked && <div className="locked-overlay">PC verrouillé</div>}
            </div>
          </div>

          <div className="screen-hint">
            <span>● Écran en direct</span><span>Glisser = souris</span>
            <span>Tap = clic gauche</span>
            <span>Molette = scroll</span>
          </div>
        </div>

        <aside className="control-panel">
          <div className="panel-card">
            <div className="eyebrow">SOURIS</div>
            <div className="mouse-grid">
              <button className="mouse-button primary-mouse" type="button" onClick={() => { if (agentOnline && !demoMode) { const p = lastPointerRef.current; send({ type: "pointer", action: "button", ...p, button: "left", state: "down" }); setTimeout(() => send({ type: "pointer", action: "button", ...p, button: "left", state: "up" }), 35); } }}>Clic gauche</button>
              <button className="mouse-button" type="button" onClick={() => { if (agentOnline && !demoMode) { const p = lastPointerRef.current; send({ type: "pointer", action: "button", ...p, button: "right", state: "down" }); setTimeout(() => send({ type: "pointer", action: "button", ...p, button: "right", state: "up" }), 35); } }}>Clic droit</button>
              <button className="mouse-button" type="button" onClick={() => { if (agentOnline && !demoMode) send({ type: "wheel", dx: 0, dy: -600 }); }}>Molette ↑</button>
              <button className="mouse-button" type="button" onClick={() => { if (agentOnline && !demoMode) send({ type: "wheel", dx: 0, dy: 600 }); }}>Molette ↓</button>
            </div>
          </div>

          <div className="panel-card">
            <div className="eyebrow">CLAVIER RAPIDE</div>
            <div className="key-grid">
              {QUICK_KEYS.map((item) => (
                <button className="key-button" key={item.label} type="button" onClick={() => sendKey(item.key, item.code)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="shortcut-list">
              {SHORTCUTS.map((item) => (
                <button className="shortcut" key={item.label} type="button" onClick={() => sendKey(item.key, item.code, item.modifiers)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-card">
            <div className="eyebrow">ÉCRIRE</div>
            <div className="type-row">
              <input
                value={textToType}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setTextToType(event.target.value)}
                onKeyDown={handleTypeKey}
                placeholder="Texte à envoyer…"
                inputMode="text"
                autoCapitalize="sentences"
              />
              <button className="send-button" onClick={sendTypedText} disabled={!textToType || !agentOnline || demoMode} type="button">Envoyer</button>
            </div>
          </div>

          <div className="panel-card">
            <div className="eyebrow">SYSTÈME</div>
            <div className="system-grid">
              <button className="system-button" type="button" onClick={() => command("volume_down")} disabled={!agentOnline || demoMode}>Vol −</button>
              <button className="system-button" type="button" onClick={() => command("volume_up")} disabled={!agentOnline || demoMode}>Vol +</button>
              <button className="system-button" type="button" onClick={() => command("volume_mute")} disabled={!agentOnline || demoMode}>Muet</button>
              <button className={"system-button " + (audioEnabled ? "" : "danger")} type="button" onClick={() => {
                const next = !audioEnabled;
                audioEnabledRef.current = next;
                setAudioEnabled(next);
                if (next) {\n                  const context = ensureAudioContext();\n                  if (context) {\n                    void context.resume();\n                    audioNextTimeRef.current = 0;\n                  }\n                }
              }} disabled={!agentOnline || demoMode}>
                🔊 {audioEnabled ? "Son ON" : "Son OFF"}
              </button>
              <button className="system-button danger" type="button" onClick={() => command("lock")} disabled={!agentOnline || demoMode}>Verrouiller</button>
            </div>
          </div>
        </aside>
      </section>

      <footer className="footer">
        <span>Control Agent v{VERSION}</span>
        <span>{demoMode ? "Mode démo local" : "Transport WebSocket sécurisé"}</span>
      </footer>
    </main>
  );
}