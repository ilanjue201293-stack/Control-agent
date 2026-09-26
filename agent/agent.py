import asyncio
import base64
import io
import json
import os
import socket
import time
from typing import Any

import mss
from PIL import Image
import pyautogui
import pyperclip
import websockets
from websockets.server import ServerConnection

PROTOCOL = 1
VERSION = "1.0.0"
HOST = "0.0.0.0"
PORT = int(os.getenv("CONTROL_AGENT_PORT", "8765"))
TOKEN = os.getenv("CONTROL_AGENT_TOKEN", "change-me")

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0

def make_frame(quality: int = 78):
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        image = Image.frombytes("RGB", shot.size, shot.rgb)
    max_width = 1280
    if image.width > max_width:
        ratio = max_width / image.width
        image = image.resize((max_width, round(image.height * ratio)), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=max(30, min(85, quality)), optimize=True)
    return "image/jpeg", base64.b64encode(output.getvalue()).decode("ascii"), image.width, image.height

async def send_frame(ws: ServerConnection, quality: int = 78):
    mime, data, width, height = make_frame(quality)
    await ws.send(json.dumps({
        "type": "screen_frame", "mime": mime, "data": data,
        "width": width, "height": height, "timestamp": int(time.time() * 1000)
    }))

async def stream_screen(ws: ServerConnection, quality: int, max_fps: int):
    interval = 1 / max(1, min(30, max_fps))
    print(f"[screen] stream started: quality={quality}, fps={max_fps}")
    try:
        while True:
            started = time.perf_counter()
            mime, data, width, height = await asyncio.to_thread(make_frame, quality)
            await ws.send(json.dumps({
                "type": "screen_frame", "mime": mime, "data": data,
                "width": width, "height": height, "timestamp": int(time.time() * 1000)
            }))
            await asyncio.sleep(max(0, interval - (time.perf_counter() - started)))
    except asyncio.CancelledError:
        print("[screen] stream cancelled")
        raise
    except Exception as exc:
        print(f"[screen] stream stopped: {type(exc).__name__}: {exc}")

async def send_state(ws: ServerConnection):
    width, height = pyautogui.size()
    pos = pyautogui.position()
    await ws.send(json.dumps({
        "type": "agent_state", "connected": True, "locked": False,
        "width": width, "height": height,
        "cursor": {"x": pos.x / max(width, 1), "y": pos.y / max(height, 1)}
    }))

def press_key(message: dict[str, Any], down: bool):
    key = str(message.get("key", "")).strip()
    if not key:
        return
    mapping = {"ctrl": "ctrl", "alt": "alt", "shift": "shift", "meta": "win"}
    modifiers = [mapping[m] for m in message.get("modifiers", []) if m in mapping]
    if down:
        for modifier in modifiers:
            pyautogui.keyDown(modifier)
        pyautogui.keyDown(key)
    else:
        pyautogui.keyUp(key)
        for modifier in reversed(modifiers):
            pyautogui.keyUp(modifier)

def system_action(action: str):
    if action == "lock":
        import ctypes
        ctypes.windll.user32.LockWorkStation()
    elif action == "volume_up":
        pyautogui.press("volumeup")
    elif action == "volume_down":
        pyautogui.press("volumedown")
    elif action == "volume_mute":
        pyautogui.press("volumemute")

async def handle_message(ws: ServerConnection, message: dict[str, Any], tasks: dict[str, Any]):
    kind = message.get("type")
    if kind == "screen_request":
        if tasks.get("screen"):
            tasks["screen"].cancel()
        tasks["screen"] = asyncio.create_task(stream_screen(
            ws, int(message.get("quality", 68)), int(message.get("maxFps", 15))
        ))
    elif kind == "pointer":
        width, height = pyautogui.size()
        x = max(0.0, min(1.0, float(message.get("x", 0.5))))
        y = max(0.0, min(1.0, float(message.get("y", 0.5))))
        pyautogui.moveTo(round(x * (width - 1)), round(y * (height - 1)), _pause=False)
        if message.get("action") == "button":
            button = message.get("button", "left")
            if button in {"left", "middle", "right"}:
                if message.get("state") == "down":
                    pyautogui.mouseDown(button=button)
                else:
                    pyautogui.mouseUp(button=button)
    elif kind == "wheel":
        pyautogui.hscroll(int(float(message.get("dx", 0)) / 100))
        pyautogui.scroll(int(-float(message.get("dy", 0)) / 100))
    elif kind == "key":
        press_key(message, message.get("action") == "down")
    elif kind == "type_text":
        text = str(message.get("text", ""))
        pyperclip.copy(text)
        pyautogui.hotkey("ctrl", "v")
    elif kind == "clipboard_get":
        await ws.send(json.dumps({"type": "clipboard", "text": pyperclip.paste()}))
    elif kind == "clipboard_set":
        pyperclip.copy(str(message.get("text", "")))
    elif kind == "system":
        action = str(message.get("action", ""))
        if action == "screenshot":
            await send_frame(ws, 85)
        else:
            system_action(action)

async def client_handler(ws: ServerConnection):
    tasks = {"screen": None}
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
        hello = json.loads(raw)
        if hello.get("type") != "hello" or hello.get("protocol") != PROTOCOL:
            await ws.close(code=1008, reason="Invalid hello")
            return
        if TOKEN and hello.get("token") != TOKEN:
            await ws.close(code=1008, reason="Invalid token")
            return
        await ws.send(json.dumps({
            "type": "hello", "protocol": PROTOCOL,
            "agent": {
                "name": "Control Agent Windows", "version": VERSION,
                "os": "Windows", "hostname": socket.gethostname()
            }
        }))
        await send_state(ws)
        tasks["screen"] = asyncio.create_task(stream_screen(ws, 50, 10))
        async for raw in ws:
            try:
                await handle_message(ws, json.loads(raw), tasks)
            except Exception as exc:
                await ws.send(json.dumps({"type": "error", "code": "agent_error", "message": str(exc)}))
    except websockets.ConnectionClosed:
        pass
    finally:
        if tasks["screen"]:
            tasks["screen"].cancel()

async def main():
    print("Control Agent Windows")
    print(f"Listening on ws://0.0.0.0:{PORT}")
    print(f"Token: {TOKEN}")
    print("Use start-public.bat for a secure public WSS tunnel.")
    async with websockets.serve(client_handler, HOST, PORT, max_size=20 * 1024 * 1024):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
