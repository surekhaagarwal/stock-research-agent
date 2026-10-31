import json
import math
import re
from datetime import datetime, timezone
from typing import Any

from main import client, get_company_fundamentals, get_historical_revenue
from comparison_schema import (
    ComparisonCompanySnapshot,
    CompanyComparisonNarrative,
    CompanyComparisonResponse,
)

COMPARISON_INSTRUCTIONS = """
You are a careful fundamental equity research assistant.

Use only the supplied financial snapshots. Do not invent company facts,
figures, reporting periods, causes, or business characteristics. Do not
repeat or calculate numerical financial metrics; the application supplies
those directly from its financial data source. Treat missing values as
unknown. Reporting periods and currencies may differ, so do not imply
period-aligned or currency-aligned comparisons unless the provided data
supports them. Distinguish facts from interpretation. Do not give buy or
sell recommendations. Return concise, balanced strengths, risks, and a
comparative assessment.
"""


def _finite_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    return value


def _snapshot(
    ticker: str,
    fundamentals: dict[str, Any],
    revenue: dict[str, Any],
    retrieved_at: datetime,
) -> ComparisonCompanySnapshot:
    annual_revenue = revenue.get("annual_revenue")
    if not isinstance(annual_revenue, dict):
        annual_revenue = {}

    return ComparisonCompanySnapshot(
        ticker=ticker,
        company_name=fundamentals.get("company_name"),
        sector=fundamentals.get("sector"),
        financial_currency=revenue.get("currency"),
        financial_data_retrieved_at_utc=retrieved_at,
        market_cap=_finite_number(fundamentals.get("market_cap")),
        trailing_pe=_finite_number(fundamentals.get("trailing_pe")),
        revenue_growth=_finite_number(fundamentals.get("revenue_growth")),
        profit_margin=_finite_number(fundamentals.get("profit_margin")),
        annual_revenue={
            str(period): number
            for period, value in annual_revenue.items()
            if (number := _finite_number(value)) is not None
        },
    )


def _reporting_period_note(
    company_a: ComparisonCompanySnapshot,
    company_b: ComparisonCompanySnapshot,
    common_periods: list[str],
) -> str:
    periods_a = sorted(company_a.annual_revenue)
    periods_b = sorted(company_b.annual_revenue)
    if common_periods:
        note = (
            "Annual revenue data shares these reported period-end dates: "
            f"{', '.join(common_periods)}. Other reported periods may differ."
        )
    else:
        note = (
            "No matching annual revenue period-end dates were available; "
            "historical revenue figures are not period-aligned."
        )

    if (
        company_a.financial_currency
        and company_b.financial_currency
        and company_a.financial_currency != company_b.financial_currency
    ):
        note += (
            " Financial currencies differ "
            f"({company_a.financial_currency} vs "
            f"{company_b.financial_currency}); revenue and market "
            "capitalization amounts should not be compared directly."
        )

    if periods_a or periods_b:
        note += (
            f" Available periods: {company_a.ticker} "
            f"[{', '.join(periods_a) if periods_a else 'none'}]; "
            f"{company_b.ticker} "
            f"[{', '.join(periods_b) if periods_b else 'none'}]."
        )
    else:
        note += " Annual revenue data is unavailable for both companies."
    return note


def generate_company_comparison(
    ticker_a: str,
    ticker_b: str,
) -> CompanyComparisonResponse:
    """Fetch both companies' financials and generate a structured comparison."""
    normalized_a = ticker_a.strip().upper()
    normalized_b = ticker_b.strip().upper()
    ticker_pattern = r"[A-Z][A-Z0-9.-]{0,9}"

    if not re.fullmatch(ticker_pattern, normalized_a):
        raise ValueError("Ticker A must be 1-10 letters, digits, dots, or hyphens.")
    if not re.fullmatch(ticker_pattern, normalized_b):
        raise ValueError("Ticker B must be 1-10 letters, digits, dots, or hyphens.")
    if normalized_a == normalized_b:
        raise ValueError("Choose two different ticker symbols.")

    fundamentals_a = get_company_fundamentals(normalized_a)
    revenue_a = get_historical_revenue(normalized_a)
    retrieved_a = datetime.now(timezone.utc)
    fundamentals_b = get_company_fundamentals(normalized_b)
    revenue_b = get_historical_revenue(normalized_b)
    retrieved_b = datetime.now(timezone.utc)

    company_a = _snapshot(
        normalized_a,
        fundamentals_a,
        revenue_a,
        retrieved_a,
    )
    company_b = _snapshot(
        normalized_b,
        fundamentals_b,
        revenue_b,
        retrieved_b,
    )
    common_periods = sorted(
        set(company_a.annual_revenue) & set(company_b.annual_revenue)
    )
    reporting_period_note = _reporting_period_note(
        company_a,
        company_b,
        common_periods,
    )

    response = client.responses.parse(
        model="gpt-5.5",
        instructions=COMPARISON_INSTRUCTIONS,
        input=(
            "Compare these companies qualitatively using only the supplied "
            "facts. The numeric metrics in the snapshots are authoritative "
            "and will be displayed directly by the application. Explicitly "
            "account for missing data, reporting periods, and currencies.\n\n"
            + json.dumps(
                {
                    "company_a": company_a.model_dump(mode="json"),
                    "company_b": company_b.model_dump(mode="json"),
                    "common_annual_revenue_periods": common_periods,
                    "reporting_period_note": reporting_period_note,
                },
                indent=2,
                allow_nan=False,
            )
        ),
        text_format=CompanyComparisonNarrative,
    )

    narrative = response.output_parsed
    if narrative is None:
        raise RuntimeError("The model did not return a structured comparison.")

    return CompanyComparisonResponse(
        ticker_a=normalized_a,
        ticker_b=normalized_b,
        company_a=company_a,
        company_b=company_b,
        common_annual_revenue_periods=common_periods,
        reporting_period_note=reporting_period_note,
        generated_at_utc=datetime.now(timezone.utc),
        **narrative.model_dump(),
    )
