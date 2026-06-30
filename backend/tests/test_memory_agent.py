import os
import sys
import unittest

# Ensure the backend directory is in the import path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agents.memory_agent import build_location_key

class TestMemoryAgent(unittest.TestCase):
    def test_build_location_key_precision(self):
        # Precise coordinate rounded to 3 decimal places
        lat, lng = 12.971598, 77.594567
        key_3 = build_location_key(lat, lng, precision=3)
        self.assertEqual(key_3, "loc_12.972_77.595")

        # Rounded to 2 decimal places
        key_2 = build_location_key(lat, lng, precision=2)
        self.assertEqual(key_2, "loc_12.97_77.59")

        # Rounded negative coordinates
        key_neg = build_location_key(-33.8688, 151.2093, precision=3)
        self.assertEqual(key_neg, "loc_-33.869_151.209")

if __name__ == "__main__":
    unittest.main()
