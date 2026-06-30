import os
import sys
import unittest

# Ensure the backend directory is in the import path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agents.orchestrator import (
    route_after_report,
    route_after_validation,
    route_after_judge
)

class TestOrchestratorRouting(unittest.TestCase):
    def test_route_after_report(self):
        # 1. High confidence path
        state_high = {"confidence": 0.85, "retry_count": 0}
        self.assertEqual(route_after_report(state_high), "proceed")

        # 2. Medium confidence path (proceed flagged)
        state_med = {"confidence": 0.70, "retry_count": 0}
        self.assertEqual(route_after_report(state_med), "proceed_flagged")

        # 3. Low confidence path (clarification needed)
        state_low = {"confidence": 0.50, "retry_count": 0}
        self.assertEqual(route_after_report(state_low), "needs_clarification")

        # 4. Max retries exceeded path
        state_retry = {"confidence": 0.40, "retry_count": 3}
        self.assertEqual(route_after_report(state_retry), "proceed_flagged")

        # 5. Fallback triage
        state_fallback = {"fallback_triage": True}
        self.assertEqual(route_after_report(state_fallback), "fallback_triage")

    def test_route_after_validation(self):
        self.assertEqual(route_after_validation({"validation_result": "VALID"}), "VALID")
        self.assertEqual(route_after_validation({"validation_result": "DUPLICATE"}), "DUPLICATE")
        self.assertEqual(route_after_validation({"validation_result": "SPAM"}), "INVALID")
        self.assertEqual(route_after_validation({"validation_result": "INVALID"}), "INVALID")

    def test_route_after_judge(self):
        self.assertEqual(route_after_judge({"judge_action": "PROCEED"}), "PROCEED")
        self.assertEqual(route_after_judge({"judge_action": "HITL"}), "HITL")
        self.assertEqual(route_after_judge({"judge_action": "REQUEST_CLARIFICATION"}), "retry")
        self.assertEqual(route_after_judge({"judge_action": "ESCALATE"}), "escalate")
        self.assertEqual(route_after_judge({"judge_action": "REJECT"}), "escalate")

if __name__ == "__main__":
    unittest.main()
