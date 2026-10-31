import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 1_024;
const REQUEST_TIMEOUT_MS = 120_000;

type ComparisonRequest = {
  ticker_a: string;
  ticker_b: string;
};

function isComparisonRequest(value: unknown): value is ComparisonRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.ticker_a === "string" &&
    typeof body.ticker_b === "string" &&
    /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(body.ticker_a) &&
    /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(body.ticker_b) &&
    body.ticker_a.toUpperCase() !== body.ticker_b.toUpperCase()
  );
}

function isCompanySnapshot(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const snapshot = value as Record<string, unknown>;
  const nullableNumbers = [
    "market_cap",
    "trailing_pe",
    "revenue_growth",
    "profit_margin",
  ];

  return (
    typeof snapshot.ticker === "string" &&
    typeof snapshot.financial_data_retrieved_at_utc === "string" &&
    (snapshot.company_name === null ||
      typeof snapshot.company_name === "string") &&
    (snapshot.sector === null || typeof snapshot.sector === "string") &&
    (snapshot.financial_currency === null ||
      typeof snapshot.financial_currency === "string") &&
    nullableNumbers.every(
      (field) =>
        snapshot[field] === null ||
        (typeof snapshot[field] === "number" &&
          Number.isFinite(snapshot[field])),
    ) &&
    typeof snapshot.annual_revenue === "object" &&
    snapshot.annual_revenue !== null &&
    !Array.isArray(snapshot.annual_revenue)
  );
}

function isComparisonResponse(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const comparison = value as Record<string, unknown>;
  return (
    typeof comparison.ticker_a === "string" &&
    typeof comparison.ticker_b === "string" &&
    isCompanySnapshot(comparison.company_a) &&
    isCompanySnapshot(comparison.company_b) &&
    Array.isArray(comparison.common_annual_revenue_periods) &&
    comparison.common_annual_revenue_periods.every(
      (period) => typeof period === "string",
    ) &&
    typeof comparison.reporting_period_note === "string" &&
    Array.isArray(comparison.company_a_strengths) &&
    comparison.company_a_strengths.every((item) => typeof item === "string") &&
    Array.isArray(comparison.company_a_risks) &&
    comparison.company_a_risks.every((item) => typeof item === "string") &&
    Array.isArray(comparison.company_b_strengths) &&
    comparison.company_b_strengths.every((item) => typeof item === "string") &&
    Array.isArray(comparison.company_b_risks) &&
    comparison.company_b_risks.every((item) => typeof item === "string") &&
    typeof comparison.comparative_assessment === "string" &&
    typeof comparison.generated_at_utc === "string" &&
    typeof comparison.source === "string" &&
    typeof comparison.disclaimer === "string"
  );
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

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function getLocalComparisonUrl(): URL {
  const url = new URL(
    process.env.STOCK_AGENT_API_URL ?? "http://127.0.0.1:8000",
  );
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("The stock agent URL must be an HTTP loopback URL.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/compare`;
  return url;
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
  if (!isComparisonRequest(body)) {
    return NextResponse.json(
      { error: "Provide two different valid ticker symbols." },
      { status: 400 },
    );
  }

  let endpoint: URL;
  try {
    endpoint = getLocalComparisonUrl();
  } catch {
    return NextResponse.json(
      { error: "The local stock agent API URL is misconfigured." },
      { status: 500 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticker_a: body.ticker_a.trim().toUpperCase(),
        ticker_b: body.ticker_b.trim().toUpperCase(),
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
          ? "Company comparison took too long. Please try again."
          : "The local stock agent API is unavailable.",
      },
      { status: timedOut ? 504 : 502 },
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

  if (!upstream.ok) {
    const errorMessage =
      typeof result === "object" &&
      result !== null &&
      typeof (result as Record<string, unknown>).detail === "string"
        ? (result as Record<string, string>).detail
        : "Unable to compare companies.";
    return NextResponse.json(
      { error: errorMessage },
      {
        status:
          upstream.status >= 400 && upstream.status < 600
            ? upstream.status
            : 502,
      },
    );
  }

  if (!isComparisonResponse(result)) {
    return NextResponse.json(
      { error: "The stock agent returned an invalid comparison." },
      { status: 502 },
    );
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
