
import yfinance as yf
import json
from datetime import datetime, timezone
from openai import OpenAI
import config  # Load backend/.env before initializing the client.

client = OpenAI()


def get_company_fundamentals(ticker: str) -> dict:
    """Retrieve basic financial information for a company."""

    stock = yf.Ticker(ticker)
    info = stock.info

    return {
        "ticker": ticker.upper(),
        "company_name": info.get("longName"),
        "sector": info.get("sector"),
        "market_cap": info.get("marketCap"),
        "trailing_pe": info.get("trailingPE"),
        "revenue_growth": info.get("revenueGrowth"),
        "profit_margin": info.get("profitMargins"),
        "return_on_equity": info.get("returnOnEquity"),
    }


def get_historical_revenue(ticker: str) -> dict:
    """Retrieve annual revenue from financial statements."""

    stock = yf.Ticker(ticker)
    income_stmt = stock.income_stmt

    if income_stmt.empty:
        return {
            "ticker": ticker,
            "error": "No annual income statements available"
        }

    if "Total Revenue" not in income_stmt.index:
        return {
            "ticker": ticker,
            "error": "Total Revenue not found"
        }

    revenue = income_stmt.loc["Total Revenue"]

    return {
        "ticker": ticker.upper(),
        "currency": stock.info.get("financialCurrency"),
        "annual_revenue": {
            date.strftime("%Y-%m-%d"): float(value)
            for date, value in revenue.items()
            if value == value  # Skip missing values
        }
    }



def generate_research_report(fundamentals: dict) -> str:
    """Generate a fundamental research report using an LLM."""

    system_prompt = """
    You are a careful fundamental equity research assistant.

    Rules:
    - Use only the financial data provided.
    - Never invent numbers or company-specific facts.
    - Clearly distinguish facts from interpretations.
    - Explain what the metrics suggest and their limitations.
    - Identify missing data needed for deeper analysis.
    - Do not make buy or sell recommendations.
    - Format your answer as a concise research report.

    Include these sections:
    1. Company Overview
    2. Growth and Profitability
    3. Valuation Considerations
    4. Potential Strengths
    5. Risks and Missing Information
    6. Overall Assessment
    """

    data = {
        "retrieved_at_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "source": "Yahoo Finance via yfinance",
        "metrics": fundamentals,
    }

    response = client.responses.create(
        model="gpt-5.5",
        instructions=system_prompt,
        input=(
            "Analyze the following financial data. "
            "The retrieval timestamp is not necessarily "
            "the financial reporting date. "
            "Values for growth, margins and ROE are fractions. "
            "Treat missing values as unknown.\n\n"
            + json.dumps(data, indent=2)
        ),
    )

    return response.output_text



if __name__ == "__main__":
    ticker = input("Enter a stock ticker: ").strip().upper()

    print(f"\nRetrieving financial data for {ticker}...")
    fundamentals = get_company_fundamentals(ticker)

    print("\nGenerating research report...\n")
    report = generate_research_report(fundamentals)

    print(report)
