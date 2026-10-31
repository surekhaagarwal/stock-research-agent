"""Regression checks for paths, API contracts, and persistent graph state."""

import importlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import config


class BackendPathTests(unittest.TestCase):
    def test_default_database_is_anchored_to_backend(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                config.get_database_path(),
                config.BACKEND_DIR / "stock_research_memory.db",
            )

    def test_relative_and_absolute_database_overrides(self):
        with patch.dict(os.environ, {"STOCK_AGENT_DB_PATH": "data/chat.db"}):
            self.assertEqual(
                config.get_database_path(), config.BACKEND_DIR / "data/chat.db"
            )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "chat.db"
            with patch.dict(os.environ, {"STOCK_AGENT_DB_PATH": str(path)}):
                self.assertEqual(config.get_database_path(), path)

    def test_configuration_can_be_loaded_from_another_working_directory(self):
        script = (
            "import sys; "
            f"sys.path.insert(0, {str(config.BACKEND_DIR)!r}); "
            "import config; print(config.get_database_path())"
        )
        with tempfile.TemporaryDirectory() as directory:
            environment = dict(os.environ)
            environment["STOCK_AGENT_DB_PATH"] = "cwd-check.db"
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=directory,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )
        self.assertEqual(result.stdout.strip(), str(config.BACKEND_DIR / "cwd-check.db"))


class MigratedApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Real graph/checkpointer, isolated database, mocked model and cloud memory.
        from contextlib import ExitStack
        from fastapi.testclient import TestClient
        from langchain_core.messages import AIMessage

        cls.stack = ExitStack()
        cls.addClassCleanup(cls.stack.close)
        directory = cls.stack.enter_context(tempfile.TemporaryDirectory())
        cls.database = Path(directory) / "test.db"
        cls.stack.enter_context(patch.dict(os.environ, {
            "OPENAI_API_KEY": "test-only-placeholder",
            "MEM0_API_KEY": "test-only-placeholder",
            "STOCK_AGENT_DB_PATH": str(cls.database),
        }))
        memory_class = cls.stack.enter_context(patch("mem0.MemoryClient"))
        cls.memory = memory_class.return_value
        cls.memory.search.return_value = {"results": [{"memory": "Prefer margins"}]}
        model_class = cls.stack.enter_context(patch("langchain_openai.ChatOpenAI"))
        cls.model = model_class.return_value.bind_tools.return_value
        cls.model.invoke.side_effect = lambda messages: AIMessage(content="Mock research")
        cls.stack.enter_context(patch("openai.OpenAI"))
        cls.api = importlib.import_module("api")
        cls.agent = importlib.import_module("langgraph_mem0_agent_v2")
        cls.stack.callback(cls.agent.connection.close)
        cls.client = cls.stack.enter_context(TestClient(cls.api.app))

    def setUp(self):
        self.memory.reset_mock()
        self.model.reset_mock()

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_chat_persists_history_in_the_isolated_database(self):
        first = self.client.post("/api/chat", json={"message": "Research MSFT"})
        self.assertEqual(first.status_code, 200)
        thread = first.json()["conversation_id"]
        second = self.client.post("/api/chat", json={
            "message": "What about margins?", "conversation_id": thread,
        })
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["conversation_id"], thread)
        state = self.agent.graph.get_state({"configurable": {"thread_id": thread}})
        self.assertEqual(len(state.values["messages"]), 4)
        self.assertEqual(self.memory.search.call_count, 2)
        other = self.client.post("/api/chat", json={"message": "Research AAPL"})
        other_thread = other.json()["conversation_id"]
        self.assertNotEqual(other_thread, thread)
        other_state = self.agent.graph.get_state({"configurable": {"thread_id": other_thread}})
        self.assertEqual(len(other_state.values["messages"]), 2)
        self.assertTrue(self.database.exists())

    def test_explicit_memory_commands_bypass_model(self):
        response = self.client.post("/api/chat", json={"message": "remember: Prefer margins"})
        self.assertEqual(response.status_code, 200)
        self.memory.add.assert_called_once()
        response = self.client.post("/api/chat", json={"message": "memories"})
        self.assertEqual(response.json()["response"], "Prefer margins")
        self.model.invoke.assert_not_called()

    def test_invalid_requests_are_rejected(self):
        self.assertEqual(self.client.post("/api/chat", json={"message": "  "}).status_code, 400)
        self.assertEqual(self.client.post("/api/report", json={"ticker": "../bad"}).status_code, 422)
        self.assertEqual(self.client.post("/api/compare", json={
            "ticker_a": "MSFT", "ticker_b": "msft",
        }).status_code, 422)

    def test_report_and_comparison_routes_delegate_to_generators(self):
        from datetime import datetime, timezone
        from report_schema import FinancialSnapshot, ResearchReport
        from comparison_schema import ComparisonCompanySnapshot, CompanyComparisonResponse

        now = datetime.now(timezone.utc)
        report = ResearchReport(
            ticker="MSFT", generated_at_utc=now,
            financial_data_retrieved_at_utc=now,
            financial_snapshot=FinancialSnapshot(ticker="MSFT"),
            company_overview="Overview", growth_and_profitability="Unknown",
            valuation_considerations="Unknown", potential_strengths=[],
            risks_and_missing_information=["Missing data"], overall_assessment="Limited data",
        )
        with patch.object(self.api, "generate_research_report", return_value=report) as generate:
            response = self.client.post("/api/report", json={"ticker": "MSFT"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["ticker"], "MSFT")
            generate.assert_called_once_with("MSFT")

        comparison = CompanyComparisonResponse(
            ticker_a="MSFT", ticker_b="AAPL",
            company_a=ComparisonCompanySnapshot(ticker="MSFT", financial_data_retrieved_at_utc=now),
            company_b=ComparisonCompanySnapshot(ticker="AAPL", financial_data_retrieved_at_utc=now),
            common_annual_revenue_periods=[], reporting_period_note="Unavailable",
            company_a_strengths=[], company_a_risks=[], company_b_strengths=[],
            company_b_risks=[], comparative_assessment="Limited data", generated_at_utc=now,
        )
        with patch.object(self.api, "generate_company_comparison", return_value=comparison) as generate:
            response = self.client.post("/api/compare", json={"ticker_a": "msft", "ticker_b": "aapl"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["ticker_b"], "AAPL")
            generate.assert_called_once_with("MSFT", "AAPL")


if __name__ == "__main__":
    unittest.main()
