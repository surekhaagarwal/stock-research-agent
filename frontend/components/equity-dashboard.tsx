"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  LoaderCircle,
  MessageCircle,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FinancialSnapshot = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  financial_currency: string | null;
  market_cap: number | null;
  trailing_pe: number | null;
  revenue_growth: number | null;
  profit_margin: number | null;
  return_on_equity: number | null;
  annual_revenue: Record<string, number>;
};

type ResearchReport = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  generated_at_utc: string;
  financial_data_retrieved_at_utc: string;
  source: string;
  financial_snapshot: FinancialSnapshot;
  company_overview: string;
  growth_and_profitability: string;
  valuation_considerations: string;
  potential_strengths: string[];
  risks_and_missing_information: string[];
  overall_assessment: string;
  disclaimer: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatResponse = {
  conversation_id: string;
  response: string;
};

type ComparisonCompany = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  financial_currency: string | null;
  financial_data_retrieved_at_utc: string;
  market_cap: number | null;
  trailing_pe: number | null;
  revenue_growth: number | null;
  profit_margin: number | null;
  annual_revenue: Record<string, number>;
};

type CompanyComparison = {
  ticker_a: string;
  ticker_b: string;
  company_a: ComparisonCompany;
  company_b: ComparisonCompany;
  common_annual_revenue_periods: string[];
  reporting_period_note: string;
  company_a_strengths: string[];
  company_a_risks: string[];
  company_b_strengths: string[];
  company_b_risks: string[];
  comparative_assessment: string;
  generated_at_utc: string;
  source: string;
  disclaimer: string;
};

type ComparisonTickers = {
  ticker_a: string;
  ticker_b: string;
};

type ComparisonRequest = {
  pairs: ComparisonTickers[];
  truncated: boolean;
};

type RecentResearch = {
  id: string;
  title: string;
  tickers: string[];
  kind: "Research" | "Comparison" | "Conversation";
  updatedAt: number;
};

const RECOGNIZED_COMPANIES = [
  { ticker: "MSFT", aliases: ["Microsoft"] },
  { ticker: "AMZN", aliases: ["Amazon"] },
  { ticker: "AAPL", aliases: ["Apple"] },
  { ticker: "NVDA", aliases: ["Nvidia", "NVIDIA"] },
  { ticker: "LLY", aliases: ["Eli Lilly", "Lilly"] },
  { ticker: "PFE", aliases: ["Pfizer"] },
  { ticker: "NVO", aliases: ["Novo Nordisk", "Novo"] },
  { ticker: "MRK", aliases: ["Merck"] },
  { ticker: "JNJ", aliases: ["Johnson & Johnson", "J&J"] },
  { ticker: "ABBV", aliases: ["AbbVie"] },
  { ticker: "AZN", aliases: ["AstraZeneca", "Astra Zeneca"] },
  { ticker: "BMY", aliases: ["Bristol Myers Squibb", "Bristol-Myers Squibb"] },
  { ticker: "AMGN", aliases: ["Amgen"] },
  { ticker: "GILD", aliases: ["Gilead", "Gilead Sciences"] },
  { ticker: "SNY", aliases: ["Sanofi"] },
  { ticker: "MRNA", aliases: ["Moderna"] },
  { ticker: "REGN", aliases: ["Regeneron"] },
  { ticker: "VRTX", aliases: ["Vertex Pharmaceuticals", "Vertex"] },
  { ticker: "GSK", aliases: ["GSK", "GlaxoSmithKline"] },
  { ticker: "RHHBY", aliases: ["Roche"] },
  { ticker: "BAYRY", aliases: ["Bayer"] },
  { ticker: "NVS", aliases: ["Novartis"] },
  { ticker: "TAK", aliases: ["Takeda", "Takeda Pharmaceutical"] },
  { ticker: "TEVA", aliases: ["Teva"] },
  { ticker: "BIIB", aliases: ["Biogen"] },
  { ticker: "CSL", aliases: ["CSL"] },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function companyPattern(aliases: string[]): RegExp {
  const alternatives = aliases
    .map(escapeRegExp)
    .sort((left, right) => right.length - left.length)
    .join("|");
  return new RegExp(`\\b(?:${alternatives})\\b`, "gi");
}

function extractMentionedTickers(message: string): string[] {
  const namedTickers = RECOGNIZED_COMPANIES.flatMap(({ ticker, aliases }) => {
    const aliasesWithTicker = [...aliases, ticker];
    return [...message.matchAll(companyPattern(aliasesWithTicker))].map(
      () => ticker,
    );
  });
  const explicitTickers = [
    ...message.matchAll(/\$([A-Z][A-Z0-9.-]{0,9})\b/g),
  ]
    .map((match) => match[1])
    .filter((ticker): ticker is string => Boolean(ticker));

  return [
    ...new Set([
      ...namedTickers,
      ...explicitTickers,
      ...extractUppercaseTickers(message),
    ]),
  ];
}

function extractUppercaseTickers(text: string): string[] {
  const excludedWords = new Set([
    "ABOUT", "AND", "ARE", "BUT", "CAN", "CEO", "CFO", "COMPANY", "COMPARE",
    "DCF", "DOES", "EBIT", "EBITDA", "EPS", "ETF", "FCF", "FOR", "FROM",
    "GAAP", "GDP", "HOW", "INTO", "IRR", "IS", "ITS", "LIKE", "LLM", "LOOK",
    "MAKE", "MORE", "MOST", "NOT", "ONE", "OUT", "PE", "PLEASE", "ROA", "ROE",
    "ROIC", "SEC", "SHOULD", "THAN", "THE", "THEIR", "THESE", "THIS", "THOSE",
    "THROUGH", "TO", "TWO", "USD", "USING", "VERSUS", "WACC", "WHAT", "WHEN",
    "WHERE", "WHICH", "WHO", "WHY",
  ]);
  const knownTickers = new Set(RECOGNIZED_COMPANIES.map(({ ticker }) => ticker));
  return [...text.matchAll(/\b[A-Z]{2,5}\b/g)]
    .map((match) => match[0])
    .filter((ticker) => !excludedWords.has(ticker) && !knownTickers.has(ticker));
}

function isComparisonCompany(value: unknown): value is ComparisonCompany {
  if (!isRecord(value) || !isRecord(value.annual_revenue)) return false;
  const isNullableNumber = (field: unknown) =>
    field === null || (typeof field === "number" && Number.isFinite(field));

  return (
    typeof value.ticker === "string" &&
    typeof value.financial_data_retrieved_at_utc === "string" &&
    (value.company_name === null || typeof value.company_name === "string") &&
    (value.sector === null || typeof value.sector === "string") &&
    (value.financial_currency === null ||
      typeof value.financial_currency === "string") &&
    isNullableNumber(value.market_cap) &&
    isNullableNumber(value.trailing_pe) &&
    isNullableNumber(value.revenue_growth) &&
    isNullableNumber(value.profit_margin)
  );
}

function isCompanyComparison(value: unknown): value is CompanyComparison {
  return (
    isRecord(value) &&
    typeof value.ticker_a === "string" &&
    typeof value.ticker_b === "string" &&
    isComparisonCompany(value.company_a) &&
    isComparisonCompany(value.company_b) &&
    Array.isArray(value.common_annual_revenue_periods) &&
    value.common_annual_revenue_periods.every(
      (period) => typeof period === "string",
    ) &&
    typeof value.reporting_period_note === "string" &&
    Array.isArray(value.company_a_strengths) &&
    value.company_a_strengths.every((item) => typeof item === "string") &&
    Array.isArray(value.company_a_risks) &&
    value.company_a_risks.every((item) => typeof item === "string") &&
    Array.isArray(value.company_b_strengths) &&
    value.company_b_strengths.every((item) => typeof item === "string") &&
    Array.isArray(value.company_b_risks) &&
    value.company_b_risks.every((item) => typeof item === "string") &&
    typeof value.comparative_assessment === "string" &&
    typeof value.generated_at_utc === "string" &&
    typeof value.source === "string" &&
    typeof value.disclaimer === "string"
  );
}

function extractComparisonTickers(
  message: string,
  priorMessages: string[],
): ComparisonRequest | null {
  if (!/\b(compare|comparison|versus|vs\.?)\b/i.test(message)) return null;

  function getTickers(text: string): string[] {
    const namedCompanies = RECOGNIZED_COMPANIES.flatMap(({ ticker, aliases }) =>
      [
        ...text.matchAll(companyPattern([...aliases, ticker])),
      ].map((match) => ({
        ticker,
        index: match.index ?? 0,
      })),
    );
    const explicitTickers = extractUppercaseTickers(text)
      .map((ticker) => {
        const index = text.indexOf(ticker);
        return {
          ticker,
          index: index < 0 ? 0 : index,
        };
      })
      .filter(
        ({ ticker }) =>
          !RECOGNIZED_COMPANIES.some((company) => company.ticker === ticker),
      )
      .map(({ ticker, index }) => ({
        ticker,
        index,
      }));
    return [
      ...new Set(
        [...namedCompanies, ...explicitTickers]
          .sort((left, right) => left.index - right.index)
          .map(({ ticker }) => ticker),
      ),
    ];
  }

  const tickerCandidates = getTickers(message);
  if (tickerCandidates.length < 2) {
    for (const priorMessage of [...priorMessages].reverse()) {
      for (const ticker of getTickers(priorMessage)) {
        if (!tickerCandidates.includes(ticker)) {
          tickerCandidates.push(ticker);
        }
        if (tickerCandidates.length === 6) break;
      }
      if (tickerCandidates.length === 6) break;
    }
  }

  if (tickerCandidates.length < 2) {
    return null;
  }

  const truncated = tickerCandidates.length > 5;
  const selectedTickers = tickerCandidates.slice(0, 5);
  const pairs: ComparisonTickers[] = [];
  for (let first = 0; first < selectedTickers.length; first += 1) {
    for (let second = first + 1; second < selectedTickers.length; second += 1) {
      pairs.push({
        ticker_a: selectedTickers[first],
        ticker_b: selectedTickers[second],
      });
    }
  }
  return { pairs, truncated };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResearchReport(value: unknown): value is ResearchReport {
  if (!isRecord(value) || !isRecord(value.financial_snapshot)) return false;

  const snapshot = value.financial_snapshot;
  return (
    typeof value.ticker === "string" &&
    typeof value.generated_at_utc === "string" &&
    typeof value.financial_data_retrieved_at_utc === "string" &&
    typeof value.source === "string" &&
    typeof value.company_overview === "string" &&
    typeof value.growth_and_profitability === "string" &&
    typeof value.valuation_considerations === "string" &&
    Array.isArray(value.potential_strengths) &&
    value.potential_strengths.every((item) => typeof item === "string") &&
    Array.isArray(value.risks_and_missing_information) &&
    value.risks_and_missing_information.every(
      (item) => typeof item === "string",
    ) &&
    typeof value.overall_assessment === "string" &&
    typeof value.disclaimer === "string" &&
    typeof snapshot.ticker === "string" &&
    (snapshot.company_name === null ||
      typeof snapshot.company_name === "string") &&
    (snapshot.sector === null || typeof snapshot.sector === "string") &&
    (snapshot.financial_currency === null ||
      typeof snapshot.financial_currency === "string") &&
    (snapshot.market_cap === null || typeof snapshot.market_cap === "number") &&
    (snapshot.trailing_pe === null ||
      typeof snapshot.trailing_pe === "number") &&
    (snapshot.revenue_growth === null ||
      typeof snapshot.revenue_growth === "number") &&
    (snapshot.profit_margin === null ||
      typeof snapshot.profit_margin === "number") &&
    (snapshot.return_on_equity === null ||
      typeof snapshot.return_on_equity === "number") &&
    isRecord(snapshot.annual_revenue)
  );
}

function isChatResponse(value: unknown): value is ChatResponse {
  return (
    isRecord(value) &&
    typeof value.conversation_id === "string" &&
    typeof value.response === "string"
  );
}

function formatPercent(value: number | null): string {
  return value === null
    ? "Not available"
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
}

function formatMarketCap(
  value: number | null,
  currency: string | null,
): string {
  if (value === null) return "Not available";

  if (!currency) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
}

function formatMultiple(value: number | null): string {
  return value === null
    ? "Not available"
    : `${new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
      }).format(value)}×`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }
}

export function EquityDashboard() {
  const [tickerInput, setTickerInput] = useState("");
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [recentResearch, setRecentResearch] = useState<RecentResearch[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [comparisons, setComparisons] = useState<CompanyComparison[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  function rememberResearch(entry: RecentResearch) {
    setRecentResearch((previous) => [
      entry,
      ...previous.filter((item) => item.id !== entry.id),
    ].slice(0, 8));
  }

  function addToWatchlist(tickers: string[]) {
    if (tickers.length === 0) return;
    setWatchlist((previous) => [
      ...new Set([...tickers, ...previous]),
    ]);
  }

  async function loadReport(tickerValue: string) {
    const ticker = tickerValue.trim().toUpperCase();

    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
      setReportError("Enter a valid ticker symbol, such as MSFT.");
      return;
    }

    setReportLoading(true);
    setReportError(null);
    setReport(null);
    setChatMessages([]);
    setConversationId(null);
    setChatError(null);

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(
          isRecord(result) && typeof result.error === "string"
            ? result.error
            : "Unable to generate a research report.",
        );
      }

      if (!isResearchReport(result)) {
        throw new Error("The report response did not match the expected schema.");
      }

      setReport(result);
      addToWatchlist([result.ticker]);
      rememberResearch({
        id: `research:${result.ticker}`,
        title: `${result.company_name || result.ticker} research`,
        tickers: [result.ticker],
        kind: "Research",
        updatedAt: Date.now(),
      });
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : "Unable to generate a research report.",
      );
    } finally {
      setReportLoading(false);
    }
  }

  function searchTicker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setComparisons([]);
    setComparisonError(null);
    void loadReport(tickerInput);
  }

  async function loadComparisons(
    tickerPairs: ComparisonTickers[],
    truncated: boolean,
  ) {
    setComparisons([]);
    setComparisonError(null);
    setReport(null);
    setComparisonLoading(true);
    const tickers = [
      ...new Set(
        tickerPairs.flatMap(({ ticker_a, ticker_b }) => [ticker_a, ticker_b]),
      ),
    ];
    rememberResearch({
      id: `comparison:${[...tickers].sort().join(":")}`,
      title: tickers.join(" vs "),
      tickers,
      kind: "Comparison",
      updatedAt: Date.now(),
    });

    const successfulComparisons: CompanyComparison[] = [];
    const failures: string[] = [];

    try {
      for (const tickers of tickerPairs) {
        try {
          const response = await fetch("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tickers),
          });
          const result = await readJson(response);

          if (!response.ok) {
            throw new Error(
              isRecord(result) && typeof result.error === "string"
                ? result.error
                : `Unable to compare ${tickers.ticker_a} and ${tickers.ticker_b}.`,
            );
          }

          if (!isCompanyComparison(result)) {
            throw new Error(
              `The ${tickers.ticker_a} vs ${tickers.ticker_b} response did not match the expected format.`,
            );
          }
          successfulComparisons.push(result);
          setComparisons([...successfulComparisons]);
        } catch (error) {
          failures.push(
            `${tickers.ticker_a} vs ${tickers.ticker_b}: ${
              error instanceof Error ? error.message : "Comparison failed."
            }`,
          );
        }
      }

      addToWatchlist([
        ...new Set(
          tickerPairs.flatMap(({ ticker_a, ticker_b }) => [ticker_a, ticker_b]),
        ),
      ]);

      const messages = [];
      if (truncated) {
        messages.push(
          "Showing comparisons for the first five companies identified. Ask for fewer companies to include a different set.",
        );
      }
      if (failures.length > 0) {
        messages.push(
          successfulComparisons.length > 0
            ? `Some comparisons could not be completed: ${failures.join("; ")}`
            : failures.join("; "),
        );
      }
      if (messages.length > 0) setComparisonError(messages.join(" "));

    } finally {
      setComparisonLoading(false);
    }
  }

  async function sendChatMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const message = chatDraft.trim();
    if (!message || chatLoading) return;
    const pendingConversationId =
      conversationId ?? `pending-${crypto.randomUUID()}`;

    const comparisonRequested =
      /\b(compare|comparison|versus|vs\.?)\b/i.test(message);
    const comparisonPairs = extractComparisonTickers(
      message,
      chatMessages
        .filter((chatMessage) => chatMessage.role === "user")
        .map((chatMessage) => chatMessage.content),
    );
    addToWatchlist(extractMentionedTickers(message));
    if (comparisonPairs) {
      const tickerCandidates = [
        ...new Set(
          comparisonPairs.pairs.flatMap(({ ticker_a, ticker_b }) => [
            ticker_a,
            ticker_b,
          ]),
        ),
      ];
      addToWatchlist(tickerCandidates);
      void loadComparisons(comparisonPairs.pairs, comparisonPairs.truncated);
    } else if (comparisonRequested) {
      setComparisonError(
        "To compare companies, include at least two company names or ticker symbols in your Research assistant message. For example: “Compare Apple, Microsoft, and Nvidia.”",
      );
    }

    if (!comparisonRequested) {
      setChatMessages((previous) => [
        ...previous,
        { role: "user", content: message },
      ]);
      rememberResearch({
        id: `conversation:${pendingConversationId}`,
        title: message.length > 48 ? `${message.slice(0, 45)}...` : message,
        tickers: extractMentionedTickers(message),
        kind: "Conversation",
        updatedAt: Date.now(),
      });
    }
    setChatDraft("");
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...(conversationId ? { conversation_id: conversationId } : {}),
        }),
      });
      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(
          isRecord(result) && typeof result.error === "string"
            ? result.error
            : "Unable to send your message.",
        );
      }

      if (!isChatResponse(result)) {
        throw new Error("The chat response did not match the expected format.");
      }

      setConversationId(result.conversation_id);
      if (!comparisonRequested) {
        setChatMessages((previous) => [
          ...previous,
          { role: "assistant", content: result.response },
        ]);
        if (result.conversation_id !== pendingConversationId) {
          setRecentResearch((previous) =>
            previous.filter(
              (item) => item.id !== `conversation:${pendingConversationId}`,
            ),
          );
        }
        rememberResearch({
          id: `conversation:${result.conversation_id}`,
          title: message.length > 48 ? `${message.slice(0, 45)}...` : message,
          tickers: extractMentionedTickers(message),
          kind: "Conversation",
          updatedAt: Date.now(),
        });
        requestAnimationFrame(() =>
          chatEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        );
      }
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Unable to send your message.",
      );
    } finally {
      setChatLoading(false);
    }
  }

  function onChatKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendChatMessage();
    }
  }

  const snapshot = report?.financial_snapshot;
  const metricCards = [
    {
      label: "Revenue growth",
      value: formatPercent(snapshot?.revenue_growth ?? null),
      icon: TrendingUp,
      accent: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "Profit margin",
      value: formatPercent(snapshot?.profit_margin ?? null),
      icon: Activity,
      accent: "text-sky-700 bg-sky-50",
    },
    {
      label: "Trailing P/E",
      value: formatMultiple(snapshot?.trailing_pe ?? null),
      icon: BarChart3,
      accent: "text-violet-700 bg-violet-50",
    },
    {
      label: "Market cap",
      value: formatMarketCap(
        snapshot?.market_cap ?? null,
        snapshot?.financial_currency ?? null,
      ),
      icon: Building2,
      accent: "text-amber-700 bg-amber-50",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1680px]">
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-slate-200/80 bg-white lg:flex">
          <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-5">
            <div className="grid size-9 place-items-center rounded-xl bg-emerald-900 text-white">
              <TrendingUp className="size-[18px]" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                Equity Research AI
              </p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.13em] text-slate-400">
                Research workspace
              </p>
            </div>
          </div>

          <nav aria-label="Research navigation" className="space-y-1 px-3 pt-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Workspace
            </p>
            <div className="flex h-10 items-center gap-3 rounded-lg bg-emerald-50 px-3 text-[13px] font-semibold text-emerald-950">
              <LayoutDashboard className="size-[17px] text-emerald-800" />
              Company Research
            </div>
          </nav>

          <div className="mx-5 my-5 border-t border-slate-100" />

          <section aria-label="Watchlist" className="px-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Watchlist
              </h2>
              <span className="text-[10px] text-slate-400">{watchlist.length}</span>
            </div>
            <div className="mt-2 space-y-1">
              {watchlist.length > 0 ? (
                watchlist.map((ticker) => (
                  <button
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${
                      report?.ticker === ticker
                        ? "bg-slate-50 text-slate-900"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                    key={ticker}
                    onClick={() => {
                      setTickerInput(ticker);
                      void loadReport(ticker);
                    }}
                  >
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    {ticker}
                  </button>
                ))
              ) : (
                <p className="rounded-lg px-2.5 py-2 text-[11px] leading-5 text-slate-400">
                  Tickers you research will appear here.
                </p>
              )}
            </div>
          </section>

          <div className="mx-5 my-5 border-t border-slate-100" />

          <section
            aria-label="Recent conversations"
            className="min-h-0 flex-1 px-4"
          >
            <h2 className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Recent conversations
            </h2>
            <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
              {recentResearch.length > 0 ? (
                <div className="space-y-2">
                  {recentResearch.map((item) => (
                    <div
                      className="rounded-lg px-2 py-2 hover:bg-white"
                      key={item.id}
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <Clock3 className="size-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <p className="ml-[22px] mt-1 text-[9px] text-slate-400">
                        {item.kind} ·{" "}
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Clock3 className="size-3.5" />
                  Your recent research will appear here.
                </div>
              )}
            </div>
          </section>

          <div className="m-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <CheckCircle2 className="size-4 text-emerald-700" />
              Research responsibly
            </div>
            <p className="mt-2 text-[10px] leading-[1.55] text-slate-500">
              Verify important figures with primary sources. This tool is not
              investment advice.
            </p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4 sm:p-7">
            <div className="mx-auto max-w-[1440px]">
              <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                    Fundamental analysis
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-[30px]">
                    Company research
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-500">
                    Explore business fundamentals, financial performance, and
                    key considerations.
                  </p>
                </div>

                <form
                  className="flex w-full gap-2 sm:max-w-[400px]"
                  onSubmit={searchTicker}
                >
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      aria-label="Ticker symbol"
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="pl-9 uppercase"
                      maxLength={10}
                      onChange={(event) => setTickerInput(event.target.value)}
                      placeholder="Search ticker (e.g. MSFT)"
                      value={tickerInput}
                    />
                  </div>
                  <Button
                    className="h-10 px-4"
                    disabled={reportLoading || !tickerInput.trim()}
                    type="submit"
                  >
                    {reportLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                    <span className="hidden sm:inline">
                      {reportLoading ? "Researching" : "Research"}
                    </span>
                  </Button>
                </form>
              </div>

              {reportError && (
                <div
                  className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800"
                  role="alert"
                >
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  {reportError}
                </div>
              )}

              {comparisons.length === 0 && !comparisonLoading && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {metricCards.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <Card className="p-4 sm:p-5" key={metric.label}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-500">
                          {metric.label}
                        </p>
                        <span
                          className={`grid size-8 place-items-center rounded-lg ${metric.accent}`}
                        >
                          <Icon className="size-4" />
                        </span>
                      </div>
                      <p className="mt-4 text-[22px] font-semibold tracking-tight text-slate-900">
                        {reportLoading ? (
                          <span className="inline-block h-7 w-28 animate-pulse rounded-md bg-slate-100" />
                        ) : (
                          metric.value
                        )}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {report
                          ? `${report.ticker} · reported data`
                          : "Search a ticker to load"}
                      </p>
                    </Card>
                  );
                })}
                </div>
              )}

              {reportLoading && comparisons.length === 0 && (
                <Card className="mt-5">
                  <CardContent className="flex min-h-[210px] flex-col items-center justify-center text-center">
                    <div className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">
                      <LoaderCircle className="size-5 animate-spin" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-800">
                      Preparing company research
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Retrieving financial data and generating a structured report.
                    </p>
                  </CardContent>
                </Card>
              )}

              {comparisonLoading && (
                <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <Card>
                    <CardContent className="flex min-h-[280px] flex-col items-center justify-center text-center">
                      <div className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">
                        <LoaderCircle className="size-5 animate-spin" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-slate-800">
                        Comparing companies
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Retrieving financial snapshots and preparing a
                        structured comparison for each company pair.
                      </p>
                    </CardContent>
                  </Card>
                  <ChatPanel
                    conversationId={conversationId}
                    error={chatError ?? comparisonError}
                    input={chatDraft}
                    loading={chatLoading}
                    messages={chatMessages}
                    onInputChange={setChatDraft}
                    onKeyDown={onChatKeyDown}
                    onSubmit={sendChatMessage}
                    endRef={chatEndRef}
                    ticker="Company comparison"
                  />
                </div>
              )}

              {comparisonError && (
                <div
                  className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800"
                  role="alert"
                >
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  {comparisonError}
                </div>
              )}

              {comparisons.length > 0 && (
                <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0 space-y-4">
                    {comparisons.length > 1 ? (
                      <MultiCompanyComparisonView comparisons={comparisons} />
                    ) : (
                      comparisons.map((comparison) => (
                        <CompanyComparisonView
                          comparison={comparison}
                          key={`${comparison.ticker_a}:${comparison.ticker_b}`}
                        />
                      ))
                    )}
                  </div>
                  <ChatPanel
                    conversationId={conversationId}
                    error={chatError ?? comparisonError}
                    input={chatDraft}
                    loading={chatLoading}
                    messages={chatMessages}
                    onInputChange={setChatDraft}
                    onKeyDown={onChatKeyDown}
                    onSubmit={sendChatMessage}
                    endRef={chatEndRef}
                    ticker={comparisons
                      .map(({ ticker_a, ticker_b }) => `${ticker_a} vs ${ticker_b}`)
                      .join(", ")}
                  />
                </div>
              )}

              {!report &&
                comparisons.length === 0 &&
                !comparisonLoading &&
                !reportLoading &&
                !reportError &&
                !comparisonError && (
                <Card className="mt-5">
                  <CardContent className="flex min-h-[245px] flex-col items-center justify-center px-6 text-center">
                    <div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">
                      <Search className="size-5" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-slate-800">
                      Start with a ticker
                    </h3>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
                      Enter a publicly traded company symbol above to load its
                      available financial snapshot and research report.
                    </p>
                  </CardContent>
                </Card>
              )}

              {report && comparisons.length === 0 && !comparisonLoading && (
                <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0 space-y-4">
                    <Card>
                      <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-800">
                              Company overview
                            </p>
                            <CardTitle className="mt-2 text-lg">
                              {report.company_name || report.ticker}
                            </CardTitle>
                            <CardDescription>
                              {[report.ticker, report.sector]
                                .filter(Boolean)
                                .join(" · ")}
                            </CardDescription>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] text-slate-500">
                            {report.financial_snapshot.financial_currency
                              ? `${report.financial_snapshot.financial_currency} reporting currency`
                              : "Currency not provided"}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-slate-600">
                          {report.company_overview}
                        </p>
                      </CardContent>
                    </Card>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <ReportSection
                        description="Reported operating trends and interpretation."
                        icon={<TrendingUp className="size-4" />}
                        title="Growth & profitability"
                      >
                        {report.growth_and_profitability}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <CompactMetric
                            label="Return on equity"
                            value={formatPercent(
                              report.financial_snapshot.return_on_equity,
                            )}
                          />
                          <CompactMetric
                            label="Annual revenue periods"
                            value={String(
                              Object.keys(
                                report.financial_snapshot.annual_revenue,
                              ).length,
                            )}
                          />
                        </div>
                      </ReportSection>
                      <ReportSection
                        description="What the available valuation data can and cannot tell us."
                        icon={<BarChart3 className="size-4" />}
                        title="Valuation considerations"
                      >
                        {report.valuation_considerations}
                      </ReportSection>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <ListSection
                        icon={<ArrowUpRight className="size-4" />}
                        items={report.potential_strengths}
                        tone="emerald"
                        title="Potential strengths"
                      />
                      <ListSection
                        icon={<ArrowDownRight className="size-4" />}
                        items={report.risks_and_missing_information}
                        tone="amber"
                        title="Risks & missing information"
                      />
                    </div>

                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2 text-emerald-800">
                          <Sparkles className="size-4" />
                          <CardTitle>Overall assessment</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-slate-600">
                          {report.overall_assessment}
                        </p>
                      </CardContent>
                    </Card>

                    <div className="flex flex-col gap-1 border-t border-slate-200/70 px-1 pt-3 text-[10px] leading-5 text-slate-400 sm:flex-row sm:justify-between">
                      <span>
                        Source: {report.source} · Retrieved{" "}
                        {formatDate(report.financial_data_retrieved_at_utc)}
                      </span>
                      <span>{report.disclaimer}</span>
                    </div>
                  </div>

                  <ChatPanel
                    conversationId={conversationId}
                    error={chatError ?? comparisonError}
                    input={chatDraft}
                    loading={chatLoading}
                    messages={chatMessages}
                    onInputChange={setChatDraft}
                    onKeyDown={onChatKeyDown}
                    onSubmit={sendChatMessage}
                    endRef={chatEndRef}
                    ticker={report.ticker}
                  />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function CompanyComparisonView({
  comparison,
}: {
  comparison: CompanyComparison;
}) {
  const rows = [
    {
      label: "Revenue growth",
      value: (company: ComparisonCompany) =>
        formatPercent(company.revenue_growth),
    },
    {
      label: "Profit margin",
      value: (company: ComparisonCompany) =>
        formatPercent(company.profit_margin),
    },
    {
      label: "Trailing P/E",
      value: (company: ComparisonCompany) =>
        formatMultiple(company.trailing_pe),
    },
    {
      label: "Market capitalization",
      value: (company: ComparisonCompany) =>
        formatMarketCap(company.market_cap, company.financial_currency),
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-emerald-800">
            <ArrowLeftRight className="size-4" />
            <CardTitle>Company comparison</CardTitle>
          </div>
          <CardDescription>
            Financial metrics are sourced directly from the retrieved company
            data; no figures are inferred from the narrative.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {[comparison.company_a, comparison.company_b].map((company) => (
              <div
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5"
                key={company.ticker}
              >
                <p className="text-sm font-semibold text-slate-900">
                  {company.company_name || company.ticker}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {[company.ticker, company.sector].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">
                  Currency: {company.financial_currency || "Not provided"}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pr-3">Metric</th>
                  <th className="px-3 py-2.5">{comparison.ticker_a}</th>
                  <th className="px-3 py-2.5">{comparison.ticker_b}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    className="border-b border-slate-100 last:border-0"
                    key={row.label}
                  >
                    <th className="py-3 pr-3 text-xs font-medium text-slate-500">
                      {row.label}
                    </th>
                    <td className="px-3 py-3 text-xs font-semibold tabular-nums text-slate-800">
                      {row.value(comparison.company_a)}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold tabular-nums text-slate-800">
                      {row.value(comparison.company_b)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-2 text-[10px] text-slate-400 sm:grid-cols-2">
            {[comparison.company_a, comparison.company_b].map((company) => (
              <p key={`${company.ticker}-retrieval`}>
                {company.ticker} data retrieved{" "}
                {formatDate(company.financial_data_retrieved_at_utc)}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="size-4" />
            <CardTitle>Reporting period alignment</CardTitle>
          </div>
          <CardDescription>
            Annual revenue periods can differ by company; aligned comparisons
            are shown only where the period-end dates match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs leading-5 text-slate-600">
            {comparison.reporting_period_note}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[comparison.company_a, comparison.company_b].map((company) => {
              const periods = Object.keys(company.annual_revenue).sort();
              return (
                <div
                  className="rounded-lg bg-slate-50 px-3 py-2.5"
                  key={`${company.ticker}-periods`}
                >
                  <p className="text-[10px] font-semibold text-slate-600">
                    {company.ticker} annual revenue periods
                  </p>
                  <p className="mt-1 break-words text-[10px] leading-4 text-slate-400">
                    {periods.length > 0
                      ? periods.join(", ")
                      : "No annual revenue periods available"}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ListSection
          icon={<ArrowUpRight className="size-4" />}
          items={comparison.company_a_strengths}
          title={`${comparison.ticker_a} strengths`}
          tone="emerald"
        />
        <ListSection
          icon={<ArrowUpRight className="size-4" />}
          items={comparison.company_b_strengths}
          title={`${comparison.ticker_b} strengths`}
          tone="emerald"
        />
        <ListSection
          icon={<ArrowDownRight className="size-4" />}
          items={comparison.company_a_risks}
          title={`${comparison.ticker_a} risks`}
          tone="amber"
        />
        <ListSection
          icon={<ArrowDownRight className="size-4" />}
          items={comparison.company_b_risks}
          title={`${comparison.ticker_b} risks`}
          tone="amber"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-emerald-800">
            <Sparkles className="size-4" />
            <CardTitle>Comparative assessment</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-slate-600">
            {comparison.comparative_assessment}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-1 border-t border-slate-200/70 px-1 pt-3 text-[10px] leading-5 text-slate-400 sm:flex-row sm:justify-between">
        <span>
          Source: {comparison.source} · Comparison generated{" "}
          {formatDate(comparison.generated_at_utc)}
        </span>
        <span>{comparison.disclaimer}</span>
      </div>
    </div>
  );
}

function MultiCompanyComparisonView({
  comparisons,
}: {
  comparisons: CompanyComparison[];
}) {
  const companies = new Map<string, ComparisonCompany>();
  const strengths = new Map<string, Set<string>>();
  const risks = new Map<string, Set<string>>();

  function addItems(
    collection: Map<string, Set<string>>,
    ticker: string,
    items: string[],
  ) {
    const existing = collection.get(ticker) ?? new Set<string>();
    for (const item of items) existing.add(item);
    collection.set(ticker, existing);
  }

  for (const comparison of comparisons) {
    companies.set(comparison.company_a.ticker, comparison.company_a);
    companies.set(comparison.company_b.ticker, comparison.company_b);
    addItems(strengths, comparison.ticker_a, comparison.company_a_strengths);
    addItems(strengths, comparison.ticker_b, comparison.company_b_strengths);
    addItems(risks, comparison.ticker_a, comparison.company_a_risks);
    addItems(risks, comparison.ticker_b, comparison.company_b_risks);
  }

  const companyList = [...companies.values()];
  const rows = [
    {
      label: "Revenue growth",
      value: (company: ComparisonCompany) =>
        formatPercent(company.revenue_growth),
    },
    {
      label: "Profit margin",
      value: (company: ComparisonCompany) =>
        formatPercent(company.profit_margin),
    },
    {
      label: "Trailing P/E",
      value: (company: ComparisonCompany) =>
        formatMultiple(company.trailing_pe),
    },
    {
      label: "Market capitalization",
      value: (company: ComparisonCompany) =>
        formatMarketCap(company.market_cap, company.financial_currency),
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-emerald-800">
            <ArrowLeftRight className="size-4" />
            <CardTitle>Side-by-side company comparison</CardTitle>
          </div>
          <CardDescription>
            Metrics are shown together for every identified company. Numerical
            values come directly from retrieved financial data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-40 py-2.5 pr-3">Metric</th>
                  {companyList.map((company) => (
                    <th
                      className="min-w-36 px-3 py-2.5"
                      key={company.ticker}
                    >
                      <span className="block text-slate-700">
                        {company.ticker}
                      </span>
                      <span className="mt-1 block font-normal normal-case tracking-normal text-slate-400">
                        {company.company_name || company.ticker}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    className="border-b border-slate-100 last:border-0"
                    key={row.label}
                  >
                    <th className="py-3 pr-3 text-xs font-medium text-slate-500">
                      {row.label}
                    </th>
                    {companyList.map((company) => (
                      <td
                        className="px-3 py-3 text-xs font-semibold tabular-nums text-slate-800"
                        key={`${row.label}:${company.ticker}`}
                      >
                        {row.value(company)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-slate-400">
            Reporting periods and currencies may differ by company. Compare
            like-for-like periods and currencies where available.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {companyList.map((company) => (
          <Card key={`${company.ticker}:details`}>
            <CardHeader>
              <CardTitle>
                {company.company_name || company.ticker}{" "}
                <span className="font-normal text-slate-400">
                  ({company.ticker})
                </span>
              </CardTitle>
              <CardDescription>
                {company.sector || "Sector not provided"} ·{" "}
                {company.financial_currency || "Currency not provided"} ·
                data retrieved{" "}
                {formatDate(company.financial_data_retrieved_at_utc)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <ListSection
                icon={<ArrowUpRight className="size-4" />}
                items={[...(strengths.get(company.ticker) ?? [])]}
                title="Potential strengths"
                tone="emerald"
              />
              <ListSection
                icon={<ArrowDownRight className="size-4" />}
                items={[...(risks.get(company.ticker) ?? [])]}
                title="Risks"
                tone="amber"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-emerald-800">
            <Sparkles className="size-4" />
            <CardTitle>Comparative assessments</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {comparisons.map((comparison) => (
            <div
              className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5"
              key={`${comparison.ticker_a}:${comparison.ticker_b}:assessment`}
            >
              <p className="text-xs font-semibold text-slate-700">
                {comparison.ticker_a} vs {comparison.ticker_b}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                {comparison.comparative_assessment}
              </p>
              <p className="mt-2 text-[10px] leading-4 text-slate-400">
                {comparison.reporting_period_note}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportSection({
  children,
  description,
  icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-slate-500">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="whitespace-pre-wrap text-[12px] leading-[1.75] text-slate-600">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function ListSection({
  icon,
  items,
  title,
  tone,
}: {
  icon: React.ReactNode;
  items: string[];
  title: string;
  tone: "amber" | "emerald";
}) {
  const isPositive = tone === "emerald";
  return (
    <Card>
      <CardHeader>
        <div
          className={`flex items-center gap-2 ${
            isPositive ? "text-emerald-800" : "text-amber-800"
          }`}
        >
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="space-y-2.5">
            {items.map((item, index) => (
              <li
                className="flex gap-2.5 text-xs leading-[1.7] text-slate-600"
                key={`${title}-${index}`}
              >
                <span
                  className={`mt-[7px] size-1.5 shrink-0 rounded-full ${
                    isPositive ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">No items provided in this report.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ChatPanel({
  conversationId,
  endRef,
  error,
  input,
  loading,
  messages,
  onInputChange,
  onKeyDown,
  onSubmit,
  ticker,
}: {
  conversationId: string | null;
  endRef: React.RefObject<HTMLDivElement | null>;
  error: string | null;
  input: string;
  loading: boolean;
  messages: ChatMessage[];
  onInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement> | undefined) => void;
  ticker: string;
}) {
  return (
    <Card className="flex min-h-[480px] flex-col overflow-hidden 2xl:sticky 2xl:top-5 2xl:h-[calc(100vh-124px)] 2xl:min-h-[560px]">
      <div className="border-b border-slate-100 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
            <MessageCircle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">
              Research assistant
            </h2>
            <p className="mt-0.5 truncate text-[10px] text-slate-400">
              Ask follow-ups about {ticker}
            </p>
          </div>
          <span
            className="size-2 rounded-full bg-emerald-500"
            title={conversationId ? "Conversation active" : "Ready"}
          />
        </div>
      </div>

      <div
        aria-live="polite"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-3 py-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full min-h-[250px] flex-col items-center justify-center px-4 text-center">
            <div className="grid size-10 place-items-center rounded-xl bg-white text-emerald-800 shadow-sm">
              <MessageCircle className="size-[18px]" />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-700">
              Ask a follow-up question
            </p>
            <p className="mt-1 max-w-[230px] text-[10px] leading-5 text-slate-400">
              Your conversation ID is kept for follow-ups in this session.
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            key={`${message.role}-${index}`}
          >
            <p
              className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2.5 text-xs leading-[1.7] ${
                message.role === "user"
                  ? "rounded-br-md bg-emerald-900 text-white"
                  : "rounded-bl-md border border-slate-200/80 bg-white text-slate-700"
              }`}
            >
              {message.content}
            </p>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-3 py-2.5 text-[11px] text-slate-500">
              <LoaderCircle className="size-3.5 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
        {error && (
          <p
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-800"
            role="alert"
          >
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form className="border-t border-slate-100 bg-white p-3" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="research-chat-input">
          Message the research assistant
        </label>
        <textarea
          className="max-h-28 min-h-16 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-900/[0.05]"
          id="research-chat-input"
          maxLength={2_000}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a stock research question…"
          value={input}
        />
        <p className="mt-1.5 text-[9px] leading-4 text-slate-400">
          Compare multiple companies here—for example: “Compare Apple, Microsoft, and Nvidia.”
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[9px] text-slate-400">
            Enter to send · Shift + Enter for a new line
          </span>
          <Button
            aria-label="Send message"
            className="size-8 rounded-lg"
            disabled={!input.trim() || loading}
            size="icon"
            type="submit"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
