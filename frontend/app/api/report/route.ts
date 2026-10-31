import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 1_024;
const REQUEST_TIMEOUT_MS = 120_000;

type ReportRequest = {
  ticker: string;
};

function isReportRequest(value: unknown): value is ReportRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).ticker === "string" &&
    /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(
      (value as Record<string, string>).ticker,
    )
  );
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isReportResponse(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const report = value as Record<string, unknown>;
  const snapshot = report.financial_snapshot;
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return false;
  }

  const metrics = snapshot as Record<string, unknown>;
  return (
    typeof report.ticker === "string" &&
    typeof report.generated_at_utc === "string" &&
    typeof report.financial_data_retrieved_at_utc === "string" &&
    typeof report.source === "string" &&
    typeof report.company_overview === "string" &&
    typeof report.growth_and_profitability === "string" &&
    typeof report.valuation_considerations === "string" &&
    Array.isArray(report.potential_strengths) &&
    report.potential_strengths.every((item) => typeof item === "string") &&
    Array.isArray(report.risks_and_missing_information) &&
    report.risks_and_missing_information.every(
      (item) => typeof item === "string",
    ) &&
    typeof report.overall_assessment === "string" &&
    typeof report.disclaimer === "string" &&
    typeof metrics.ticker === "string" &&
    (metrics.company_name === null || typeof metrics.company_name === "string") &&
    (metrics.sector === null || typeof metrics.sector === "string") &&
    (metrics.financial_currency === null ||
      typeof metrics.financial_currency === "string") &&
    isNumberOrNull(metrics.market_cap) &&
    isNumberOrNull(metrics.trailing_pe) &&
    isNumberOrNull(metrics.revenue_growth) &&
    isNumberOrNull(metrics.profit_margin) &&
    isNumberOrNull(metrics.return_on_equity) &&
    typeof metrics.annual_revenue === "object" &&
    metrics.annual_revenue !== null &&
    !Array.isArray(metrics.annual_revenue)
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

function getLocalReportUrl(): URL {
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

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/report`;
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

  if (!isReportRequest(body)) {
    return NextResponse.json(
      { error: "Provide a valid ticker symbol." },
      { status: 400 },
    );
  }

  let endpoint: URL;
  try {
    endpoint = getLocalReportUrl();
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
      body: JSON.stringify({ ticker: body.ticker.trim().toUpperCase() }),
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
          ? "Report generation took too long. Please try again."
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
        : "Unable to generate a research report.";

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

  if (!isReportResponse(result)) {
    return NextResponse.json(
      { error: "The stock agent returned an invalid report." },
      { status: 502 },
    );
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
