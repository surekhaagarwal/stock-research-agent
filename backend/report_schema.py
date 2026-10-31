from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ReportRequest(BaseModel):
    ticker: str = Field(
        min_length=1,
        max_length=10,
        pattern=r"^[A-Za-z][A-Za-z0-9.-]{0,9}$",
    )


class FinancialSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str
    company_name: str | None = None
    sector: str | None = None
    financial_currency: str | None = None
    market_cap: int | float | None = None
    trailing_pe: float | None = None
    revenue_growth: float | None = None
    profit_margin: float | None = None
    return_on_equity: float | None = None
    annual_revenue: dict[str, float] = Field(default_factory=dict)


class ResearchReportContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_overview: str = Field(
        description="A concise overview grounded only in supplied company data."
    )
    growth_and_profitability: str = Field(
        description="Interpret supplied growth and profitability metrics."
    )
    valuation_considerations: str = Field(
        description="Discuss the supplied valuation data and its limitations."
    )
    potential_strengths: list[str] = Field(
        description="Evidence-based potential strengths; do not invent facts."
    )
    risks_and_missing_information: list[str] = Field(
        description="Risks, limitations, and important unavailable information."
    )
    overall_assessment: str = Field(
        description="A balanced summary without a buy or sell recommendation."
    )


class ResearchReport(BaseModel):
    ticker: str
    company_name: str | None = None
    sector: str | None = None
    generated_at_utc: datetime
    financial_data_retrieved_at_utc: datetime
    source: Literal["Yahoo Finance via yfinance"] = "Yahoo Finance via yfinance"
    financial_snapshot: FinancialSnapshot
    company_overview: str
    growth_and_profitability: str
    valuation_considerations: str
    potential_strengths: list[str]
    risks_and_missing_information: list[str]
    overall_assessment: str
    disclaimer: str = (
        "For informational purposes only; not investment advice. "
        "Verify financial information with primary sources."
    )
