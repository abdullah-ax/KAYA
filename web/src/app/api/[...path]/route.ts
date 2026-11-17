/* Server-side proxy to the FastAPI backend. The browser only talks to this
   origin. Only X-Model-Key and the JSON content type go upstream. The key is
   never logged and never echoed back. */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: Request, { params }: Ctx): Promise<Response> {
  const { path } = await params;
  const base = (process.env.API_URL || "http://localhost:8000").replace(/\/+$/, "");
  const search = new URL(req.url).search;
  const url = `${base}/${path.map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers();
  const key = req.headers.get("x-model-key");
  if (key) headers.set("x-model-key", key);
  const hasBody = req.method === "POST";
  if (hasBody) headers.set("content-type", "application/json");

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
    const out = new Headers();
    out.set("content-type", upstream.headers.get("content-type") ?? "application/json");
    return new Response(upstream.status === 204 ? null : await upstream.text(), { status: upstream.status, headers: out });
  } catch {
    // No error details: they could carry request data.
    return Response.json({ detail: "Can't reach the API. Check that it is running, then try again." }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
