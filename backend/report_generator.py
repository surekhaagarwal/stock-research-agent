import json
import re
from datetime import datetime, timezone
from typing import Any

from main import client, get_company_fundamentals, get_historical_revenue
from report_schema import (
    FinancialSnapshot,
    ResearchReport,
    ResearchReportContent,
)

REPORT_INSTRUCTIONS = """
You are a careful fundamental equity research assistant.

Use only the supplied financial data. Never invent figures, company facts,
or reporting periods. A retrieval timestamp is not a financial reporting
date. Growth, margin, and return-on-equity values are fractions. Treat null
or absent values as unknown. Distinguish reported data from interpretation,
explain metric limitations, and identify missing information. Do not make
buy or sell recommendations. Return a concise, balanced research report.
"""


def _finite_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    return value


def _build_snapshot(
    ticker: str,
    fundamentals: dict[str, Any],
    revenue_data: dict[str, Any],
) -> FinancialSnapshot:
    annual_revenue = revenue_data.get("annual_revenue")
    if not isinstance(annual_revenue, dict):
        annual_revenue = {}

    clean_revenue = {
        str(period): number
        for period, value in annual_revenue.items()
        if (number := _finite_number(value)) is not None
    }

    return FinancialSnapshot(
        ticker=ticker,
        company_name=fundamentals.get("company_name"),
        sector=fundamentals.get("sector"),
        financial_currency=revenue_data.get("currency"),
        market_cap=_finite_number(fundamentals.get("market_cap")),
        trailing_pe=_finite_number(fundamentals.get("trailing_pe")),
        revenue_growth=_finite_number(fundamentals.get("revenue_growth")),
        profit_margin=_finite_number(fundamentals.get("profit_margin")),
        return_on_equity=_finite_number(
            fundamentals.get("return_on_equity")
        ),
        annual_revenue=clean_revenue,
    )


def generate_research_report(ticker: str) -> ResearchReport:
    """Fetch available company data and generate a schema-validated report."""
    normalized_ticker = ticker.strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9.-]{0,9}", normalized_ticker):
        raise ValueError("Ticker must be 1-10 letters, digits, dots, or hyphens.")

    fundamentals = get_company_fundamentals(normalized_ticker)
    revenue_data = get_historical_revenue(normalized_ticker)
    retrieved_at = datetime.now(timezone.utc)
    snapshot = _build_snapshot(
        normalized_ticker,
        fundamentals,
        revenue_data,
    )

    response = client.responses.parse(
        model="gpt-5.5",
        instructions=REPORT_INSTRUCTIONS,
        input=(
            "Create a fundamental research report from the following "
            "retrieved data. If historical revenue retrieval contains an "
            "error or missing values, state that it is unavailable.\n\n"
            + json.dumps(
                {
                    "retrieved_at_utc": retrieved_at.isoformat(),
                    "source": "Yahoo Finance via yfinance",
                    "financial_snapshot": snapshot.model_dump(mode="json"),
                    "historical_revenue_error": revenue_data.get("error"),
                },
                indent=2,
                allow_nan=False,
                default=str,
            )
        ),
        text_format=ResearchReportContent,
    )

    content = response.output_parsed
    if content is None:
        raise RuntimeError("The model did not return a structured report.")

    return ResearchReport(
        ticker=normalized_ticker,
        company_name=snapshot.company_name,
        sector=snapshot.sector,
        generated_at_utc=datetime.now(timezone.utc),
        financial_data_retrieved_at_utc=retrieved_at,
        financial_snapshot=snapshot,
        **content.model_dump(),
    )
