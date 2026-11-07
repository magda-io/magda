import importlib.util
from pathlib import Path
import unittest

SOURCE = Path(__file__).with_name("make_audit_packets.py")
spec = importlib.util.spec_from_file_location("threshold_audit_projection", SOURCE)
packets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packets)


class AuditProjectionTests(unittest.TestCase):
    def test_long_strings_are_lossless_and_each_chunk_is_visible(self):
        original = "α measured literal\n" * 130
        wrapped = packets.wrapped({"description": original, "title": "short"})
        chunks = wrapped["description"]["text_chunks"]
        self.assertEqual("".join(chunks), original)
        self.assertTrue(all(len(chunk) <= 550 for chunk in chunks))
        self.assertEqual(wrapped["title"], "short")

    def test_context_omission_requires_exact_production_projection(self):
        doc = {"title": "Actual title", "description": "Actual description"}
        self.assertEqual(packets.context(doc), "Title: Actual title\nDescription: Actual description\n")
        self.assertEqual(packets.context(dict(doc, format="CSV"), True),
                         "Title: Actual title\nFormat: CSV\nDescription: Actual description\n")
        self.assertEqual(packets.context({}), "Title: None\nDescription: None\n")


if __name__ == "__main__":
    unittest.main()
