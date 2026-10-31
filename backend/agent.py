
import json
from openai import OpenAI
from dotenv import load_dotenv

# Import our two financial data functions from main.py
from main import (
    get_company_fundamentals,
    get_historical_revenue
)

# --------------------------------------------------
# STEP 1: Initialize OpenAI client
# --------------------------------------------------

load_dotenv()
client = OpenAI()

# --------------------------------------------------
# STEP 2: Define tools available to the LLM
# --------------------------------------------------

tools = [
    {
        "type": "function",
        "name": "get_company_fundamentals",
        "description": (
            "Retrieve a company's financial metrics including "
            "revenue growth, profit margin, return on equity, "
            "market capitalization, and P/E ratio. "
            "Use for questions about current fundamentals."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "ticker": {
                    "type": "string",
                    "description": "Stock ticker symbol, e.g. MSFT"
                }
            },
            "required": ["ticker"],
            "additionalProperties": False
        },
        "strict": True
    },
    {
        "type": "function",
        "name": "get_historical_revenue",
        "description": (
            "Retrieve annual historical revenue figures from "
            "company income statements. Use for questions "
            "about revenue trends, multi-year growth, or "
            "historical revenue comparisons."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "ticker": {
                    "type": "string",
                    "description": "Stock ticker symbol, e.g. MSFT"
                }
            },
            "required": ["ticker"],
            "additionalProperties": False
        },
        "strict": True
    }
]

# --------------------------------------------------
# STEP 3: Map tool names to Python functions
# --------------------------------------------------

tool_functions = {
    "get_company_fundamentals": get_company_fundamentals,
    "get_historical_revenue": get_historical_revenue
}

# --------------------------------------------------
# STEP 4: Define agent instructions
# --------------------------------------------------

instructions = """
You are a fundamental stock research assistant.

Your responsibilities:
- Answer questions about company fundamentals.
- Use the appropriate financial data tools.
- For historical revenue questions, retrieve annual revenue.
- For profitability and valuation questions, retrieve fundamentals.
- If a question needs both, use both tools.
- Never invent financial figures.
- Clearly distinguish facts from interpretations.
- Explain when financial information is missing.
- Do not make buy or sell recommendations.
- Be concise but informative.
"""

# --------------------------------------------------
# STEP 5: Get the user's question
# --------------------------------------------------

question = input("Ask a financial question: ").strip()

if not question:
    raise ValueError("Please enter a question.")

print("\n--- SENDING QUESTION TO LLM ---")

# --------------------------------------------------
# STEP 6: Let the LLM choose tools
# --------------------------------------------------

response = client.responses.create(
    model="gpt-5.5",
    instructions=instructions,
    input=question,
    tools=tools,
    tool_choice="auto",
    parallel_tool_calls=False
)

# --------------------------------------------------
# STEP 7: Execute tool calls
# --------------------------------------------------

tool_outputs = []

for item in response.output:

    # IMPORTANT: Only function_call objects have call_id
    if item.type != "function_call":
        continue

    print("\n--- TOOL REQUESTED ---")
    print("Function:", item.name)
    print("Arguments:", item.arguments)

    if item.name not in tool_functions:
        raise ValueError(f"Unknown tool requested: {item.name}")

    args = json.loads(item.arguments)
    ticker = args["ticker"].strip().upper()

    if not (
        1 <= len(ticker) <= 10
        and ticker.replace(".", "").replace("-", "").isalnum()
    ):
        raise ValueError("Invalid ticker")

    print("\n--- EXECUTING TOOL ---")
    print("Selected tool:", item.name)

    try:
        result = tool_functions[item.name](ticker)
    except Exception as error:
        result = {"error": str(error)}

    print("\n--- TOOL RESULT ---")
    print(json.dumps(result, indent=2, default=str))

    # Send result back using the matching call_id
    tool_outputs.append({
        "type": "function_call_output",
        "call_id": item.call_id,
        "output": json.dumps(result, default=str)
    })

# --------------------------------------------------
# STEP 8: Generate final response
# --------------------------------------------------

if tool_outputs:

    print("\n--- SENDING TOOL RESULTS TO LLM ---")

    final_response = client.responses.create(
        model="gpt-5.5",
        instructions=instructions,
        previous_response_id=response.id,
        input=tool_outputs,
        tools=tools,
        tool_choice="none"
    )

    print("\n--- FINAL ANSWER ---")
    print(final_response.output_text)

else:
    print("\n--- NO TOOL REQUESTED ---")
    print(response.output_text)

