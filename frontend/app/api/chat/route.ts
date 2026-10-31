import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 16_384;
const MAX_MESSAGE_LENGTH = 2_000;
const REQUEST_TIMEOUT_MS = 60_000;

type ChatRequest = {
  message: string;
  conversation_id?: string;
};

type ChatResponse = {
  conversation_id: string;
  response: string;
};

function getLocalApiUrl(): URL {
  const configuredUrl =
    process.env.STOCK_AGENT_API_URL ?? "http://127.0.0.1:8000";
  const url = new URL(configuredUrl);

  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "STOCK_AGENT_API_URL must be an HTTP loopback URL without credentials or query parameters.",
    );
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/chat`;
  return url;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    throw new Error("Request body is too large.");
  }

  if (!request.body) {
    throw new Error("A JSON request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("Request body is too large.");
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(body));
}

function isChatRequest(body: unknown): body is ChatRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return false;
  }

  const value = body as Record<string, unknown>;
  return (
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    value.message.length <= MAX_MESSAGE_LENGTH &&
    (value.conversation_id === undefined ||
      (typeof value.conversation_id === "string" &&
        value.conversation_id.length > 0 &&
        value.conversation_id.length <= 100 &&
        /^[a-zA-Z0-9_-]+$/.test(value.conversation_id)))
  );
}

function isChatResponse(body: unknown): body is ChatResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).conversation_id === "string" &&
    typeof (body as Record<string, unknown>).response === "string"
  );
}

export async function POST(request: Request) {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const tooLarge =
      error instanceof Error && error.message === "Request body is too large.";
    return NextResponse.json(
      { error: tooLarge ? error.message : "Invalid JSON request body." },
      { status: tooLarge ? 413 : 400 },
    );
  }

  if (!isChatRequest(body)) {
    return NextResponse.json(
      { error: "Provide a message and a valid optional conversation_id." },
      { status: 400 },
    );
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = getLocalApiUrl();
  } catch {
    return NextResponse.json(
      { error: "The local stock agent API URL is misconfigured." },
      { status: 500 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: body.message.trim(),
        ...(body.conversation_id
          ? { conversation_id: body.conversation_id }
          : {}),
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      {
        error: timedOut
          ? "The stock agent took too long to respond. Please try again."
          : "The local stock agent API is unavailable.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "The stock agent could not complete the request." },
      {
        status:
          upstream.status >= 400 && upstream.status < 600
            ? upstream.status
            : 502,
      },
    );
  }

  let result: unknown;
  try {
    result = await upstream.json();
  } catch {
    return NextResponse.json(
      { error: "The stock agent returned an invalid response." },
      { status: 502 },
    );
  }

  if (!isChatResponse(result)) {
    return NextResponse.json(
      { error: "The stock agent returned an invalid response." },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      conversation_id: result.conversation_id,
      response: result.response,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
