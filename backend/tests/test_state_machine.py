import os
import sys
import unittest

# Ensure the backend directory is in the import path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.state_machine import IssueStatus, can_transition, transition, InvalidTransitionError

class TestStateMachine(unittest.TestCase):
    def test_valid_transitions(self):
        # DRAFT -> TRIAGE
        self.assertTrue(can_transition(IssueStatus.DRAFT, IssueStatus.TRIAGE))
        # TRIAGE -> IN_REVIEW
        self.assertTrue(can_transition(IssueStatus.TRIAGE, IssueStatus.IN_REVIEW))
        # IN_REVIEW -> VALIDATED
        self.assertTrue(can_transition(IssueStatus.IN_REVIEW, IssueStatus.VALIDATED))
        # VALIDATED -> ASSIGNED
        self.assertTrue(can_transition(IssueStatus.VALIDATED, IssueStatus.ASSIGNED))

    def test_invalid_transitions(self):
        # DRAFT -> RESOLVED (direct transition not allowed)
        self.assertFalse(can_transition(IssueStatus.DRAFT, IssueStatus.RESOLVED))
        # RESOLVED -> DRAFT (no going back to draft)
        self.assertFalse(can_transition(IssueStatus.RESOLVED, IssueStatus.DRAFT))
        # CLOSED -> any (CLOSED is terminal)
        self.assertFalse(can_transition(IssueStatus.CLOSED, IssueStatus.ASSIGNED))

    def test_transition_success(self):
        actor = "test_user"
        reason = "Pipeline initialized"
        result = transition(IssueStatus.DRAFT, IssueStatus.TRIAGE, actor, reason)

        self.assertEqual(result["status"], IssueStatus.TRIAGE.value)
        self.assertIn("updated_at", result)
        self.assertIn("last_transition", result)

        audit = result["_audit_entry"]
        self.assertEqual(audit["from_status"], IssueStatus.DRAFT.value)
        self.assertEqual(audit["to_status"], IssueStatus.TRIAGE.value)
        self.assertEqual(audit["actor"], actor)
        self.assertEqual(audit["reason"], reason)

    def test_transition_raises_error(self):
        with self.assertRaises(InvalidTransitionError):
            transition(IssueStatus.DRAFT, IssueStatus.RESOLVED, "test_user", "invalid path")

if __name__ == "__main__":
    unittest.main()
