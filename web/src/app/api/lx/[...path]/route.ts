// Server-side proxy to the LinuxONE API. Keeps API_KEY out of the browser and avoids CORS (the FastAPI
// service has none). Only the API's own endpoints are forwarded.

const ALLOWED = new Set(["health", "ward", "patient", "handover", "shift-summary", "predict", "news2", "metrics", "fatigue", "privacy", "benchmark"]);

async function forward(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const base = process.env.LINUXONE_API_URL;
    if (!base) {
        return Response.json({ detail: "LINUXONE_API_URL is not set on the server" }, { status: 503 });
    }

    const { path } = await params;
    if (!path?.length || !ALLOWED.has(path[0])) {
        return Response.json({ detail: "unknown endpoint" }, { status: 404 });
    }

    const search = new URL(request.url).search;
    const target = `${base.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}${search}`;
    // Granite takes ~15 s per note on 3 cores (up to 2 min for the 3B model).
    const timeout = path[0] === "handover" || path[0] === "shift-summary" ? 150_000 : 20_000;

    try {
        const res = await fetch(target, {
            method: request.method,
            headers: {
                "content-type": "application/json",
                "x-api-key": process.env.LINUXONE_API_KEY ?? "",
            },
            body: request.method === "POST" ? await request.text() : undefined,
            signal: AbortSignal.timeout(timeout),
            cache: "no-store",
        });
        return new Response(res.body, {
            status: res.status,
            headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
        });
    } catch (e) {
        const timedOut = (e as Error).name === "TimeoutError";
        return Response.json(
            { detail: timedOut ? "The LinuxONE API timed out" : "The LinuxONE API is unreachable" },
            { status: timedOut ? 504 : 502 },
        );
    }
}

export { forward as GET, forward as POST };
