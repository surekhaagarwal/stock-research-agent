from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CompanyComparisonRequest(BaseModel):
    ticker_a: str = Field(
        min_length=1,
        max_length=10,
        pattern=r"^[A-Za-z][A-Za-z0-9.-]{0,9}$",
    )
    ticker_b: str = Field(
        min_length=1,
        max_length=10,
        pattern=r"^[A-Za-z][A-Za-z0-9.-]{0,9}$",
    )

    @field_validator("ticker_a", "ticker_b")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def require_distinct_tickers(self):
        if self.ticker_a == self.ticker_b:
            raise ValueError("Choose two different ticker symbols.")
        return self


class ComparisonCompanySnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str
    company_name: str | None = None
    sector: str | None = None
    financial_currency: str | None = None
    financial_data_retrieved_at_utc: datetime
    market_cap: int | float | None = None
    trailing_pe: float | None = None
    revenue_growth: float | None = None
    profit_margin: float | None = None
    annual_revenue: dict[str, float] = Field(default_factory=dict)


class CompanyComparisonNarrative(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_a_strengths: list[str] = Field(
        description="Data-supported potential strengths of company A."
    )
    company_a_risks: list[str] = Field(
        description="Data limitations or risks for company A."
    )
    company_b_strengths: list[str] = Field(
        description="Data-supported potential strengths of company B."
    )
    company_b_risks: list[str] = Field(
        description="Data limitations or risks for company B."
    )
    comparative_assessment: str = Field(
        description=(
            "A concise, balanced comparison based only on the supplied data; "
            "do not recommend buying or selling either company."
        )
    )


class CompanyComparisonResponse(BaseModel):
    ticker_a: str
    ticker_b: str
    company_a: ComparisonCompanySnapshot
    company_b: ComparisonCompanySnapshot
    common_annual_revenue_periods: list[str]
    reporting_period_note: str
    company_a_strengths: list[str]
    company_a_risks: list[str]
    company_b_strengths: list[str]
    company_b_risks: list[str]
    comparative_assessment: str
    generated_at_utc: datetime
    source: str = "Yahoo Finance via yfinance"
    disclaimer: str = (
        "For informational purposes only; not investment advice. "
        "Verify financial information with primary sources."
    )
