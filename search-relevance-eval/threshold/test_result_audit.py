"""Invented independent-audit formula checks; never load actual sources."""
import importlib.util
import math
from pathlib import Path
import unittest
S = importlib.util.spec_from_file_location('result_audit_tested', Path(__file__).with_name('result_audit.py'))
m = importlib.util.module_from_spec(S)
S.loader.exec_module(m)

class AuditFormulaTests(unittest.TestCase):
    def test_full_corpus_denominator_and_grade1_idcg(self):
        result = m.metric({'a':3, 'b':2, 't':1, 'z':0}, [{'id':'a','rank':3}])
        expected = (7 / math.log2(4)) / (7 + 3 / math.log2(3) + 1 / math.log2(4))
        self.assertEqual(.5, result['recall_at_10_ge_2'])
        self.assertAlmostEqual(expected, result['ndcg_at_10'])
        self.assertEqual(1, result['grade1_corpus_count'])
    def test_unreturned_U_nulls_all_points(self):
        result = m.metric({'a':3,'u':'U'}, [{'id':'a','rank':1}])
        for name in ('recall_at_10_ge_2','ndcg_at_10','success_at_5_ge_2'):
            self.assertIsNone(result[name])
    def test_report_arrays_stream_correct_scope(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            p=Path(directory)/'report.json'
            p.write_text(json.dumps({'per_query':[{'id':'new','nested':[1,2]}], 'legacy':{'per_query':[{'id':'old'}]}},indent=2,sort_keys=True))
            self.assertEqual([{'id':'new','nested':[1,2]}],list(m.report_array(p,'per_query')))
            self.assertEqual([{'id':'old'}],list(m.report_array(p,'per_query',4,'legacy')))
    def test_every_exact_target_not_best(self):
        q = dict(authoritative_target_ids=['a','b'],near_identifier_ids=['x'])
        r = m.exact(q,[{'id':'a','rank':1},{'id':'b','rank':2}], [{'id':'a','rank':1},{'id':'x','rank':2}])
        self.assertEqual(1,r['mrr_at_10'])
        self.assertIsNone(r['authoritative_target_ranks']['b'])
        self.assertEqual({'target_displacement','new_wrong_ID_ahead'}, {e['type'] for e in r['exact_events']})

if __name__ == '__main__': unittest.main()
