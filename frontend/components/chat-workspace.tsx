"use client";

import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bookmark,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock3,
  FileSearch,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  conversationId?: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

type View = "research" | "watchlist" | "memory";

type ChatResult = {
  conversation_id: string;
  response: string;
};

const WATCHLIST_STORAGE_KEY = "stock-research-agent-watchlist";
const NON_TICKER_ACRONYMS = new Set([
  "AI",
  "API",
  "CEO",
  "CFO",
  "DCF",
  "EBIT",
  "EBITDA",
  "EPS",
  "ETF",
  "FCF",
  "GAAP",
  "GDP",
  "IRR",
  "LLM",
  "PE",
  "ROA",
  "ROE",
  "ROIC",
  "SEC",
  "USD",
  "WACC",
]);

function extractTickerSymbols(text: string): string[] {
  const matches = text.matchAll(
    /(?:\$([A-Z][A-Z0-9.-]{0,5})|\b([A-Z][A-Z0-9.-]{1,5})\b)/g,
  );
  const symbols = new Set<string>();

  for (const match of matches) {
    const symbol = match[1] ?? match[2];
    if (symbol && !NON_TICKER_ACRONYMS.has(symbol)) {
      symbols.add(symbol);
    }
  }

  return [...symbols];
}

const starterCoverage = [
  { symbol: "NVDA", company: "NVIDIA Corporation", sector: "Semiconductors" },
  { symbol: "MSFT", company: "Microsoft Corporation", sector: "Software" },
  { symbol: "AAPL", company: "Apple Inc.", sector: "Consumer technology" },
  { symbol: "AMZN", company: "Amazon.com, Inc.", sector: "E-commerce" },
  { symbol: "JPM", company: "JPMorgan Chase & Co.", sector: "Financials" },
  { symbol: "LLY", company: "Eli Lilly and Company", sector: "Healthcare" },
];

function isChatResult(value: unknown): value is ChatResult {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).conversation_id === "string" &&
    typeof (value as Record<string, unknown>).response === "string"
  );
}

export function ChatWorkspace() {
  const [view, setView] = useState<View>("research");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverageSearch, setCoverageSearch] = useState("");
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages, isLoading]);

  useEffect(() => {
    try {
      const savedSymbols = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (savedSymbols) {
        const parsed: unknown = JSON.parse(savedSymbols);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (symbol) =>
              typeof symbol === "string" && /^[A-Z][A-Z0-9.-]{0,5}$/.test(symbol),
          )
        ) {
          setWatchlistSymbols([...new Set(parsed)]);
        }
      }
    } catch (storageError) {
      console.warn("Unable to load the saved ticker watchlist.", storageError);
    } finally {
      setWatchlistLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!watchlistLoaded) return;

    try {
      window.localStorage.setItem(
        WATCHLIST_STORAGE_KEY,
        JSON.stringify(watchlistSymbols),
      );
    } catch (storageError) {
      console.warn("Unable to save the ticker watchlist.", storageError);
    }
  }, [watchlistLoaded, watchlistSymbols]);

  function addWatchlistSymbols(text: string) {
    const discoveredSymbols = extractTickerSymbols(text);
    if (discoveredSymbols.length === 0) return;

    setWatchlistSymbols((previous) => [
      ...previous,
      ...discoveredSymbols.filter((symbol) => !previous.includes(symbol)),
    ]);
  }

  function startNewResearch() {
    setActiveConversationId(null);
    setView("research");
    setError(null);
    setMessage("");
    setSidebarOpen(false);
  }

  function openConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    setView("research");
    setError(null);
    setSidebarOpen(false);
  }

  async function sendMessage(text: string) {
    const trimmedMessage = text.trim();
    if (!trimmedMessage || isLoading) return;
    addWatchlistSymbols(trimmedMessage);

    const selectedConversation = conversations.find(
      (conversation) => conversation.id === activeConversationId,
    );
    const localId = selectedConversation?.id ?? crypto.randomUUID();
    const now = Date.now();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedMessage,
    };
    const currentConversation: Conversation = selectedConversation
      ? {
          ...selectedConversation,
          updatedAt: now,
          messages: [...selectedConversation.messages, userMessage],
        }
      : {
          id: localId,
          title:
            trimmedMessage.length > 54
              ? `${trimmedMessage.slice(0, 51)}...`
              : trimmedMessage,
          updatedAt: now,
          messages: [userMessage],
        };

    setActiveConversationId(localId);
    setView("research");
    setConversations((previous) => [
      currentConversation,
      ...previous.filter((conversation) => conversation.id !== localId),
    ]);
    setMessage("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage,
          ...(selectedConversation?.conversationId
            ? { conversation_id: selectedConversation.conversationId }
            : {}),
        }),
      });
      let result: unknown;
      try {
        result = await response.json();
      } catch {
        throw new Error("The stock agent returned an invalid response.");
      }

      if (!response.ok) {
        const errorMessage =
          typeof result === "object" &&
          result !== null &&
          typeof (result as Record<string, unknown>).error === "string"
            ? (result as Record<string, string>).error
            : "The stock agent could not complete the request.";
        throw new Error(errorMessage);
      }

      if (!isChatResult(result)) {
        throw new Error("The stock agent returned an invalid response.");
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.response,
      };
      addWatchlistSymbols(result.response);
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === localId
            ? {
                ...conversation,
                conversationId: result.conversation_id,
                updatedAt: Date.now(),
                messages: [...conversation.messages, assistantMessage],
              }
            : conversation,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while contacting the stock agent.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(message);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(message);
    }
  }

  const filteredCoverage = starterCoverage.filter((company) =>
    `${company.symbol} ${company.company} ${company.sector}`
      .toLowerCase()
      .includes(coverageSearch.toLowerCase()),
  );

  return (
    <div className="flex min-h-screen bg-[#f7f8f6] text-slate-900">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[278px] flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-slate-100 px-5">
          <a
            className="flex items-center gap-3"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              startNewResearch();
            }}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-900 text-white shadow-sm">
              <TrendingUp className="size-[18px]" strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold tracking-tight text-slate-900">
                Stock Research Agent
              </span>
            </span>
          </a>
          <Button
            aria-label="Close navigation"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="px-4 pt-5">
          <Button
            className="w-full justify-start shadow-sm"
            onClick={startNewResearch}
          >
            <Plus className="size-4" />
            New research
          </Button>
        </div>

        <nav aria-label="Workspace" className="space-y-1 px-3 pt-6">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Workspace
          </p>
          <SidebarItem
            active={view === "research"}
            icon={<Sparkles className="size-[17px]" />}
            label="AI Research Assistant"
            onClick={() => {
              setView("research");
              setSidebarOpen(false);
            }}
          />
        </nav>

        <div className="mx-5 my-5 border-t border-slate-100" />

        <div className="flex min-h-0 flex-1 flex-col px-3">
          <div className="px-3 pb-3">
            <p className="pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Watchlist
            </p>
            {watchlistSymbols.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {watchlistSymbols.map((symbol) => (
                  <button
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
                    key={symbol}
                    onClick={() => {
                      setActiveConversationId(null);
                      setSidebarOpen(false);
                      void sendMessage(
                        `Give me a fundamental analysis of ${symbol}.`,
                      );
                    }}
                    title={`Research ${symbol}`}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mx-3 mb-4 border-t border-slate-100" />
          <div className="flex items-center justify-between px-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Recent research
            </p>
            <Clock3 className="size-3.5 text-slate-300" />
          </div>
          <div className="space-y-1 overflow-y-auto">
            {conversations.length > 0 ? (
              conversations.map((conversation) => (
                <button
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition ${
                    activeConversationId === conversation.id
                      ? "bg-emerald-50 font-medium text-emerald-950"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                  key={conversation.id}
                  onClick={() => openConversation(conversation.id)}
                >
                  <FileSearch className="size-4 shrink-0 text-slate-400" />
                  <span className="truncate">{conversation.title}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs leading-5 text-slate-400">
                Your recent research will appear here.
              </p>
            )}
          </div>
        </div>

        <div className="m-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-950">
            <span className="size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
            Private workspace
          </div>
          <p className="mt-2 text-[11px] leading-[1.55] text-emerald-900/65">
            Chat requests go through your local API. The agent may also contact
            its configured model and memory providers.
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
          <div className="grid size-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            R
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">
              Research workspace
            </p>
            <p className="text-[11px] text-slate-400">Local instance</p>
          </div>
          <ChevronDown className="size-4 text-slate-400" />
        </div>
      </aside>

      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              aria-label="Open navigation"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
              size="icon"
              variant="ghost"
            >
              <Menu className="size-[18px]" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight text-slate-900 sm:text-[15px]">
                  Equity Research AI
                </h1>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                Intelligent stock Research workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              aria-label="Start new research"
              className="size-9"
              onClick={startNewResearch}
              size="icon"
              variant="ghost"
            >
              <Plus className="size-[18px]" />
            </Button>
          </div>
        </header>

        {view === "research" && (
          <ResearchView
            conversation={activeConversation}
            error={error}
            isLoading={isLoading}
            message={message}
            messagesEndRef={messagesEndRef}
            onKeyDown={handleComposerKeyDown}
            onMessageChange={setMessage}
            onSubmit={handleSubmit}
          />
        )}
        {view === "watchlist" && (
          <CoverageView
            companies={filteredCoverage}
            onAnalyze={(prompt) => void sendMessage(prompt)}
            onSearch={setCoverageSearch}
            search={coverageSearch}
          />
        )}
        {view === "memory" && (
          <MemoryView onSearchMemories={() => void sendMessage("memories")} />
        )}
      </main>
    </div>
  );
}

function SidebarItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] transition ${
        active
          ? "bg-emerald-50 font-semibold text-emerald-950"
          : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
      onClick={onClick}
    >
      <span className={active ? "text-emerald-800" : "text-slate-400"}>
        {icon}
      </span>
      {label}
      {active && <span className="ml-auto size-1.5 rounded-full bg-emerald-600" />}
    </button>
  );
}

function ResearchView({
  conversation,
  error,
  isLoading,
  message,
  messagesEndRef,
  onKeyDown,
  onMessageChange,
  onSubmit,
}: {
  conversation: Conversation | undefined;
  error: string | null;
  isLoading: boolean;
  message: string;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMessageChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasMessages = (conversation?.messages.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="mx-auto min-h-full w-full max-w-[840px] px-5 sm:px-9" />
        ) : (
          <div className="mx-auto w-full max-w-[840px] px-5 pb-8 pt-8 sm:px-9 sm:pt-12">
            <div className="mb-8 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Research session
              <span className="text-slate-300">/</span>
              <span>{conversation?.title}</span>
            </div>
            <div className="space-y-8">
              {conversation?.messages.map((chatMessage) => (
                <article
                  className={`flex gap-3.5 sm:gap-4 ${
                    chatMessage.role === "user" ? "flex-row-reverse" : ""
                  }`}
                  key={chatMessage.id}
                >
                  <div
                    className={`grid size-8 shrink-0 place-items-center rounded-xl ${
                      chatMessage.role === "assistant"
                        ? "bg-emerald-900 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {chatMessage.role === "assistant" ? (
                      <Sparkles className="size-4" />
                    ) : (
                      <span className="text-xs font-semibold">R</span>
                    )}
                  </div>
                  <div
                    className={`min-w-0 max-w-[calc(100%-48px)] ${
                      chatMessage.role === "user" ? "text-right" : "flex-1"
                    }`}
                  >
                    <p className="mb-1.5 text-[11px] font-semibold text-slate-400">
                      {chatMessage.role === "assistant"
                        ? "NORTHSTAR RESEARCH"
                        : "YOU"}
                    </p>
                    <div
                      className={`inline-block rounded-2xl px-4 py-3 text-left text-[13px] leading-[1.75] sm:px-5 sm:py-4 sm:text-sm ${
                        chatMessage.role === "assistant"
                          ? "w-full border border-slate-200/80 bg-white text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.025)]"
                          : "bg-emerald-900 text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {chatMessage.content}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
              {isLoading && (
                <div className="flex gap-3.5 sm:gap-4">
                  <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-900 text-white">
                    <Sparkles className="size-4 animate-pulse" />
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-sm text-slate-500">
                    <span className="flex items-center gap-2">
                      <span className="flex gap-1">
                        <span className="size-1.5 animate-bounce rounded-full bg-emerald-600 [animation-delay:-0.2s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-emerald-600 [animation-delay:-0.1s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-emerald-600" />
                      </span>
                      Reviewing the question...
                    </span>
                  </div>
                </div>
              )}
              {error && (
                <div
                  className="ml-11 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-800"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200/70 bg-[#f7f8f6]/95 px-4 pb-4 pt-4 sm:px-7 sm:pb-6 sm:pt-5">
        <div className="mx-auto max-w-[840px]">
          <form
            className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_8px_30px_rgba(15,23,42,0.06)] focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-900/[0.04]"
            onSubmit={onSubmit}
          >
            <textarea
              aria-label="Ask the research agent"
              className="max-h-36 min-h-[48px] w-full resize-y bg-transparent px-3 pt-2.5 text-[13px] leading-5 text-slate-800 outline-none placeholder:text-slate-400 sm:text-sm"
              maxLength={2_000}
              onChange={(event) => onMessageChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about a company, financial metric, or investment thesis..."
              value={message}
            />
            <div className="flex items-center justify-between px-2 pb-1 pt-1">
              <p className="text-[10px] text-slate-400 sm:text-[11px]">
                Enter to send · Shift + Enter for a new line
              </p>
              <Button
                aria-label="Send message"
                className="size-9 rounded-xl"
                disabled={!message.trim() || isLoading}
                size="icon"
                type="submit"
              >
                {isLoading ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <ArrowUp className="size-[18px]" strokeWidth={2.3} />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function CoverageView({
  companies,
  onAnalyze,
  onSearch,
  search,
}: {
  companies: typeof starterCoverage;
  onAnalyze: (prompt: string) => void;
  onSearch: (value: string) => void;
  search: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[980px] px-5 py-9 sm:px-9 sm:py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
              <Bookmark className="size-3.5" />
              Research coverage
            </span>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Companies to explore
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              A starter list for your research. Choose a company to ask the
              agent for a fundamentals overview.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 sm:self-auto">
            <span className="size-1.5 rounded-full bg-slate-300" />
            No live market data connected
          </div>
        </div>

        <label className="mt-8 flex h-11 max-w-md items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-emerald-300">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search companies or sectors"
            value={search}
          />
        </label>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.025)]">
          <div className="grid grid-cols-[1fr_auto] border-b border-slate-100 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:grid-cols-[1.1fr_1.7fr_1fr_auto] sm:px-6">
            <span>Company</span>
            <span className="hidden sm:block">Name</span>
            <span className="hidden sm:block">Sector</span>
            <span className="sr-only">Action</span>
          </div>
          {companies.length ? (
            companies.map((company) => (
              <div
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:grid-cols-[1.1fr_1.7fr_1fr_auto] sm:px-6"
                key={company.symbol}
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-slate-50 text-[11px] font-semibold text-slate-700">
                    {company.symbol.slice(0, 1)}
                  </span>
                  <span className="text-sm font-semibold tracking-wide text-slate-900">
                    {company.symbol}
                  </span>
                </div>
                <span className="hidden text-[13px] text-slate-600 sm:block">
                  {company.company}
                </span>
                <span className="hidden text-xs text-slate-400 sm:block">
                  {company.sector}
                </span>
                <Button
                  className="h-8 px-3 text-xs"
                  onClick={() =>
                    onAnalyze(
                      `Give me a fundamental analysis of ${company.company} (${company.symbol}).`,
                    )
                  }
                  size="sm"
                  variant="secondary"
                >
                  Analyze
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            ))
          ) : (
            <p className="px-6 py-10 text-center text-sm text-slate-400">
              No companies match that search.
            </p>
          )}
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-400">
          This list is a set of research shortcuts, not a portfolio or live
          watchlist. No prices or performance data are shown.
        </p>
      </div>
    </div>
  );
}

function MemoryView({ onSearchMemories }: { onSearchMemories: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[820px] px-5 py-9 sm:px-9 sm:py-12">
        <span className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
          <BriefcaseBusiness className="size-3.5" />
          Personal research context
        </span>
        <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
          Research that remembers
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Your agent can use saved preferences to tailor future answers to the
          way you research.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_12px_rgba(15,23,42,0.025)] sm:p-7">
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <Sparkles className="size-5" />
          </div>
          <h3 className="mt-5 text-base font-semibold text-slate-900">
            What does your agent remember?
          </h3>
          <p className="mt-2 max-w-lg text-[13px] leading-6 text-slate-500">
            Ask your local agent to search the preferences saved to its memory.
            Results will appear in a research conversation.
          </p>
          <Button className="mt-5" onClick={onSearchMemories}>
            Search saved context
            <ArrowRight className="size-4" />
          </Button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-slate-50 text-slate-600">
              <Check className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Save a research preference
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                In chat, start a message with{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-emerald-900">
                  Remember:
                </code>{" "}
                followed by the preference you want to save.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 font-mono text-xs text-slate-600">
            Remember: I prefer free cash flow yield and conservative
            assumptions.
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3.5 text-xs leading-5 text-amber-900/80">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-700" />
          Saved preferences are handled by your existing local agent and memory
          service. Avoid saving sensitive personal or account information.
        </div>
      </div>
    </div>
  );
}
