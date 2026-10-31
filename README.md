# Agentic Stock Research Assistant

An AI-powered stock research application that helps users analyze company fundamentals, compare stocks, and ask financial questions through an interactive web interface.

Built as a hands-on Agentic AI project to explore **LLM tool calling, conditional branching, conversation memory, long-term memory, and structured outputs**.

## Key Features

- **AI Research Assistant:** Ask financial questions using natural language. The LangGraph agent selects appropriate financial tools to retrieve information.
- **Fundamental Analysis:** Research revenue growth, profitability, valuation, and historical revenue.
- **Structured Research Reports:** View company financial metrics, strengths, risks, and missing information in a readable dashboard.
- **Company Comparison:** Compare financial metrics and research insights across multiple companies.
- **Conversation Memory:** Maintain context across follow-up questions using LangGraph and SQLite.
- **Long-Term Memory:** Remember research preferences across conversations using Mem0 Cloud.
- **Interactive Web Dashboard:** Built with Next.js, Tailwind CSS, and shadcn/ui.

## Technology Stack

| Component | Technology |
|---|---|
| Agent Orchestration | LangGraph |
| Large Language Model | OpenAI |
| Financial Data | yfinance |
| Backend | Python, FastAPI |
| Frontend | Next.js, React, TypeScript |
| UI Styling | Tailwind CSS, shadcn/ui |
| Conversation Memory | SQLite |
| Long-Term Memory | Mem0 Cloud |

## Architecture

The Next.js frontend communicates with FastAPI through server-side API proxy routes.

FastAPI connects to the LangGraph research agent, which uses financial data tools and conditional tool calling to answer questions. SQLite maintains conversation history, while Mem0 Cloud stores reusable research preferences.

Structured report and comparison endpoints generate validated outputs for the dashboard.

flowchart TD
    UI["Next.js Frontend<br/>Chat | Reports | Comparisons"]
    API["FastAPI Backend<br/>API Routes and Validation"]

    AGENT["LangGraph Research Agent<br/>LLM Tool Calling and Branching"]
    REPORT["Structured Report Generator<br/>Pydantic"]
    COMPARE["Company Comparison Generator<br/>Pydantic"]

    FIN["Financial Data Tools<br/>yfinance"]
    SQLITE[("SQLite<br/>Conversation State")]
    MEM0[("Mem0 Cloud<br/>Long-Term Preferences")]
    LLM["OpenAI LLM"]

    UI --> API

    API -->|"Chat"| AGENT
    API -->|"Report"| REPORT
    API -->|"Compare"| COMPARE

    AGENT <-->|"Tool Calls"| FIN
    AGENT <-->|"Checkpoints"| SQLITE
    AGENT <-->|"Memory Search"| MEM0
    AGENT <-->|"Inference"| LLM

    REPORT --> FIN
    REPORT --> LLM

    COMPARE --> FIN
    COMPARE --> LLM

## Langgraph Agent Workflow

flowchart TD
    START([User Question])
    MEMORY["Retrieve Mem0 Preferences"]
    AGENT["LLM Agent Node"]
    DECISION{"Tool needed?"}
    TOOLS["Execute Financial Tool"]
    ENDNODE([Final Answer])

    START --> MEMORY
    MEMORY --> AGENT
    AGENT --> DECISION

    DECISION -->|Yes| TOOLS
    TOOLS --> AGENT

    DECISION -->|No| ENDNODE

## Project Structure

```text
stock-research-agent/
├── README.md
├── .gitignore
├── backend/                 # FastAPI, LangGraph, Mem0, financial data
│   ├── .env.example
│   ├── requirements.txt
│   ├── config.py
│   ├── api.py
│   ├── main.py
│   ├── langgraph_mem0_agent_v2.py
│   ├── report_generator.py
│   ├── report_schema.py
│   ├── comparison_generator.py
│   ├── comparison_schema.py
│   ├── agent.py             # Original standalone tool-calling demonstration
│   └── tests/
└── frontend/                # Next.js dashboard and API proxies
    ├── .env.example
    ├── package.json
    ├── package-lock.json
    ├── app/
    ├── components/
    ├── lib/
    └── ...                  # Next.js, TypeScript, PostCSS, shadcn configuration
```

## Getting Started

**Prerequisites:** Python 3.14, Node.js 20.9+, npm, OpenAI API key, and Mem0 Cloud API key.

### 1. Start the backend

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Add your `OPENAI_API_KEY` and `MEM0_API_KEY` to `backend/.env`.

Start FastAPI:

```bash
python -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

### 2. Start the frontend

Open another terminal at the repository root:

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

The frontend uses `STOCK_AGENT_API_URL=http://127.0.0.1:8000` to communicate with the backend.

Open **http://localhost:3000** to use the application.

## Example Questions

- What is Microsoft's profit margin?
- Analyze NVIDIA's fundamentals.
- Compare Microsoft and Apple.
- Show Apple's historical revenue growth.
- Analyze Microsoft using my usual research criteria.
- What about Apple? (Follow-up conversation)

## Agentic AI Concepts Demonstrated

**Tool Calling:** The LLM selects financial tools based on the user's research question.

**Conditional Branching:** LangGraph routes between the agent and tools until the agent can generate a response.

**State Management:** SQLite checkpoints preserve conversation context across interactions and restarts.

**Long-Term Memory:** Mem0 retrieves relevant user preferences across separate conversations.

**Structured Outputs:** Pydantic schemas support consistent financial reports and company comparisons.

## Current Limitations

- Financial data coverage and freshness depend on Yahoo Finance.
- Company name-to-ticker resolution is limited and not independently verified.
- Watchlists and frontend research history are currently session-only.
- The application is designed for local, single-user use without production authentication.
- The application is for educational research and does not provide investment recommendations or execute trades.

## Future Enhancements

- LangSmith tracing and agent evaluations
- Tavily-powered web research and source citations
- Technical and sentiment analysis agents
- Expanded financial data sources and research capabilities
- Persistent watchlists and improved research history

## Project Purpose

This project was developed to gain practical experience building an agentic AI application, integrating external tools, managing conversation and long-term memory, and presenting AI-generated research through a professional web interface.