
import logging
from uuid import uuid4
from threading import Lock

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Import our optimized LangGraph agent
from langgraph_mem0_agent_v2 import (
    graph,
    save_preference,
    search_preferences,
)
from report_generator import generate_research_report
from report_schema import ReportRequest, ResearchReport
from comparison_generator import generate_company_comparison
from comparison_schema import (
    CompanyComparisonRequest,
    CompanyComparisonResponse,
)

# STEP 1: Initialize FastAPI

app = FastAPI(
    title="Stock Research Agent API",
    description="LangGraph + Mem0 Fundamental Research Agent",
    version="0.2.0",
)

# Serialize local graph execution while using
# our shared SQLite connection.
graph_lock = Lock()
logger = logging.getLogger(__name__)


# STEP 2: Define request and response models

class ChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=2000
    )
    conversation_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        pattern=r"^[a-zA-Z0-9_-]+$"
    )


class ChatResponse(BaseModel):
    conversation_id: str
    response: str


# STEP 3: Health endpoint

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "agent": "langgraph_mem0_v2"
    }


# STEP 4: Chat endpoint

@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):

    conversation_id = (
        request.conversation_id or str(uuid4())
    )

    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    # Explicitly save long-term preferences
    if message.lower().startswith("remember:"):

        preference = message.split(":", 1)[1].strip()

        if not preference:
            raise HTTPException(
                status_code=400,
                detail="Please provide a preference"
            )

        try:
            save_preference(preference)
        except Exception as error:
            print("Mem0 save error:", error)
            raise HTTPException(
                status_code=503,
                detail="Memory service unavailable"
            ) from error

        return ChatResponse(
            conversation_id=conversation_id,
            response=(
                "Memory save submitted. "
                "It may take time to become searchable."
            )
        )

    # Retrieve saved preferences
    if message.lower() == "memories":

        try:
            memories = search_preferences(
                "Stock research preferences, "
                "financial metrics, and report style"
            )
        except Exception as error:
            print("Mem0 search error:", error)
            raise HTTPException(
                status_code=503,
                detail="Memory service unavailable"
            ) from error

        return ChatResponse(
            conversation_id=conversation_id,
            response=(
                "\n".join(memories)
                if memories else "No memories found."
            )
        )

    # STEP 5: Invoke the LangGraph agent

    config = {
        "configurable": {
            "thread_id": conversation_id
        },
        "recursion_limit": 12
    }

    try:
        with graph_lock:
            result = graph.invoke(
                {
                    "messages": [
                        ("user", message)
                    ]
                },
                config=config
            )

        final_message = result["messages"][-1]

        return ChatResponse(
            conversation_id=conversation_id,
            response=str(final_message.content)
        )

    except Exception as error:
        print("Agent execution error:", error)

        raise HTTPException(
            status_code=500,
            detail="Agent execution failed"
        ) from error


@app.post("/api/report", response_model=ResearchReport)
def create_report(request: ReportRequest) -> ResearchReport:
    """Generate a structured fundamental report for a stock ticker."""
    try:
        return generate_research_report(request.ticker)
    except Exception as error:
        logger.exception(
            "Research report generation failed for ticker %s",
            request.ticker.upper(),
        )
        raise HTTPException(
            status_code=502,
            detail="Research report generation failed.",
        ) from error


@app.post(
    "/api/compare",
    response_model=CompanyComparisonResponse,
)
def compare_companies(
    request: CompanyComparisonRequest,
) -> CompanyComparisonResponse:
    """Return sourced metrics and a structured qualitative comparison."""
    try:
        return generate_company_comparison(
            request.ticker_a,
            request.ticker_b,
        )
    except Exception as error:
        logger.exception(
            "Company comparison failed for %s and %s",
            request.ticker_a,
            request.ticker_b,
        )
        raise HTTPException(
            status_code=502,
            detail="Company comparison generation failed.",
        ) from error
