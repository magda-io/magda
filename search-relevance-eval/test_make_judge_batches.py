import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("judge_batches", pathlib.Path(__file__).with_name("make_judge_batches.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PacketRenderingTests(unittest.TestCase):
    def test_long_text_is_lossless(self):
        text = "line\nα geography and date 2021 " * 100
        rendered = m.readable(text)
        self.assertEqual("".join(rendered["verbatim_chunks"]), text)
        self.assertTrue(all(len(v) <= 650 for v in rendered["verbatim_chunks"]))

    def test_semantic_requirements_preserved(self):
        source = {"hard_requirements": {"geography": "NSW", "time": "2010-2020", "format_access": ["CSV", "GIS"]}, "reject": ["prescribed burns"]}
        self.assertEqual(m.readable(source), source)

    def test_empty_evidence_omitted_but_zero_false_preserved(self):
        self.assertEqual(m.readable({"missing": None, "empty": "", "other": [], "blank": {}, "zero": 0, "false": False}), {"zero": 0, "false": False})


if __name__ == "__main__":
    unittest.main()
