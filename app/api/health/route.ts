export async function GET() {
  return Response.json({
    ok: true,
    service: "control-agent-web",
    timestamp: new Date().toISOString(),
  });
}