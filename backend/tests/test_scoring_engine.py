import os
import sys
import unittest
from datetime import datetime, timezone

# Ensure the backend directory is in the import path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.scoring_engine import (
    compute_urgency_weight,
    kmeans_cluster_issues,
    CREDIBILITY_DELTAS
)

class TestScoringEngine(unittest.TestCase):
    def test_compute_urgency_weight_ranges(self):
        # 1. Base case: mid severity (3), no upvotes/verifications, default trust (0.5)
        weight_mid = compute_urgency_weight(
            severity=3,
            upvotes=0,
            verified_count=0,
            user_trust_score=0.5
        )
        self.assertTrue(0.0 <= weight_mid <= 1.0)

        # 2. High severity (5) + high trust (1.0) should be greater than low severity (1) + low trust (0.2)
        weight_high = compute_urgency_weight(
            severity=5,
            upvotes=10,
            verified_count=5,
            user_trust_score=1.0
        )
        weight_low = compute_urgency_weight(
            severity=1,
            upvotes=0,
            verified_count=0,
            user_trust_score=0.2
        )
        self.assertGreater(weight_high, weight_low)

    def test_recency_delta_calculation(self):
        # Fresh issue vs older issue
        now_ts = datetime.now(timezone.utc).timestamp()
        
        weight_fresh = compute_urgency_weight(
            severity=3,
            created_at=now_ts
        )
        # 10 days ago (240 hours ago)
        weight_old = compute_urgency_weight(
            severity=3,
            created_at=now_ts - (10 * 24 * 3600)
        )
        self.assertGreater(weight_fresh, weight_old)

    def test_kmeans_clustering(self):
        # Mock coordinates around two distinct hotspots
        issues = [
            # Hotspot A (pwd potholes)
            {"id": "1", "lat": 12.9716, "lng": 77.5946, "severity": 5, "category": "pothole"},
            {"id": "2", "lat": 12.9718, "lng": 77.5948, "severity": 4, "category": "pothole"},
            {"id": "3", "lat": 12.9715, "lng": 77.5945, "severity": 4, "category": "pothole"},
            # Hotspot B (bwssb water leaks)
            {"id": "4", "lat": 12.9082, "lng": 77.6424, "severity": 2, "category": "water_leak"},
            {"id": "5", "lat": 12.9084, "lng": 77.6426, "severity": 3, "category": "water_leak"},
            {"id": "6", "lat": 12.9081, "lng": 77.6423, "severity": 2, "category": "water_leak"},
        ]

        clusters = kmeans_cluster_issues(issues, k=2)
        
        self.assertEqual(len(clusters), 2)
        
        # Verify cluster summary structure
        for cluster in clusters:
            self.assertIn("cluster_id", cluster)
            self.assertIn("centroid", cluster)
            self.assertIn("issue_count", cluster)
            self.assertIn("max_severity", cluster)
            self.assertIn("priority_zone", cluster)
            self.assertIn("top_category", cluster)
            self.assertEqual(cluster["issue_count"], 3)

    def test_credibility_deltas_exist(self):
        self.assertEqual(CREDIBILITY_DELTAS["VALID"], 0.05)
        self.assertEqual(CREDIBILITY_DELTAS["SPAM"], -0.20)
        self.assertEqual(CREDIBILITY_DELTAS["RESOLVED"], 0.10)

if __name__ == "__main__":
    unittest.main()
