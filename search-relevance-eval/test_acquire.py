"""Offline acquisition contracts: synthetic metadata, mocked HTTP, temporary files only."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock
import urllib.parse

spec = importlib.util.spec_from_file_location("objective_acquire", Path(__file__).with_name("acquire.py"))
acquire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acquire)


class AcquireTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        # An unconfigured transport call must fail locally, never reach curl.
        self.network = mock.patch.object(acquire.subprocess, "run", side_effect=AssertionError("unexpected network"))
        self.run = self.network.start()
        self.addCleanup(self.network.stop)
        self.sleep_patch = mock.patch.object(acquire.time, "sleep")
        self.sleep = self.sleep_patch.start()
        self.addCleanup(self.sleep_patch.stop)
        self.client = acquire.AnonymousGET(self.root / "cache")
        self.params = {"query": '"synthetic metadata"', "limit": 10, "publishingState": "published"}

    def cache(self, body=b'{"ok":true}', url=None):
        url = url or acquire.BASE + "/v0/search/datasets?" + urllib.parse.urlencode(sorted(self.params.items()))
        sha = acquire.digest(body)
        object_path = self.client.root / "objects" / (sha + ".body")
        receipt_path = self.client.root / "requests" / (acquire.digest(url.encode()) + ".json")
        acquire.immutable(object_path, body)
        acquire.immutable(receipt_path, acquire.encode({"url": url, "sha256": sha}))
        return object_path, receipt_path

    @staticmethod
    def records(count=100):
        return {str(i): {"id": str(i), "aspects": {"dcat-dataset-strings": {"publisher": "p" + str(i % 5)}}}
                for i in range(count)}

    def test_sampling_is_order_independent_seeded_and_half_stratified(self):
        records = self.records()
        selected, strata = acquire.select(records, 50, "seed")
        reversed_selected, reversed_strata = acquire.select(dict(reversed(list(records.items()))), 50, "seed")
        self.assertEqual((selected, strata), (reversed_selected, reversed_strata))
        self.assertEqual(len(set(selected)), 50)
        self.assertEqual(sum(s["stratified_quota"] for s in strata.values()), 25)
        self.assertEqual({s["stratified_quota"] for s in strata.values()}, {5})
        self.assertEqual(sum(s["selected_total"] for s in strata.values()), 50)
        self.assertNotEqual(selected, acquire.select(records, 50, "other seed")[0])
        self.run.assert_not_called()

    def test_sampling_handles_empty_small_and_odd_sizes_without_duplicates(self):
        self.assertEqual(acquire.select({}, 10, "seed"), ([], {}))
        for count, size in ((1, 1), (2, 1), (3, 10), (7, 5)):
            with self.subTest(count=count, size=size):
                selected, strata = acquire.select(self.records(count), size, "seed")
                self.assertEqual(len(selected), min(count, size))
                self.assertEqual(len(selected), len(set(selected)))
                self.assertEqual(sum(s["stratified_quota"] for s in strata.values()), min(count, size // 2))
                self.assertEqual(sum(s["selected_total"] for s in strata.values()), len(selected))

    def test_publisher_normalization_accepts_names_identifiers_and_missing(self):
        for value, expected in ((None, "<missing>"), ("  Example  ", "Example"),
                                ({"name": "Named", "identifier": "id"}, "Named"),
                                ({"identifier": "id"}, "id"), ({}, "<missing>")):
            with self.subTest(value=value):
                self.assertEqual(acquire.publisher({"aspects": {"dcat-dataset-strings": {"publisher": value}}}), expected)

    def test_endpoint_query_state_aspect_and_limit_allowlists_reject_before_io(self):
        cases = [("/v0/admin", {}), ("/v0/search/status/ready", {}),
                 ("https://other.invalid/v0/search/datasets", self.params),
                 ("/v0/search/datasets", {**self.params, "Authorization": "secret"}),
                 ("/v0/search/datasets", {**self.params, "publishingState": "draft"}),
                 ("/v0/search/datasets", {"query": "x"}),
                 ("/v0/registry/records", {"aspect": "private"}),
                 ("/v0/registry/records", {"aspect": "dcat-dataset-strings", "limit": 1001})]
        cases += [("/v0/search/datasets", {**self.params, "limit": limit}) for limit in (0, -1, 11)]
        for path, params in cases:
            with self.subTest(path=path, params=params), self.assertRaises(ValueError):
                self.client.get(path, params)
        self.run.assert_not_called()
        self.assertEqual(self.client.requests, 0)

    def test_rate_guards_reject_nan_infinity_and_excessive_frequency(self):
        for interval in (0, -.5, .499, float("nan"), float("inf"), -float("inf")):
            with self.subTest(interval=interval), self.assertRaises(ValueError):
                acquire.AnonymousGET(self.root / "invalid", interval=interval)
        for interval in (.5, .75, 1):
            self.assertEqual(acquire.AnonymousGET(self.root / "valid", interval=interval).interval, interval)
        self.run.assert_not_called()

    def test_curl_is_anonymous_verified_https_get_without_redirects(self):
        self.run.side_effect = None
        self.run.return_value = SimpleNamespace(returncode=0, stdout=b'{"ok":true}\n200', stderr=b"")
        # Patch only this module's environment object; never change process profiles.
        fake_env = {"PATH": "/synthetic/bin", "MGD_API_KEY": "secret", "MGD_API_KEY_ID": "secret-id",
                    "HOME": "/private/home", "HTTPS_PROXY": "https://credential.invalid", "CURL_HOME": "/private/curl"}
        with mock.patch.object(acquire.os, "environ", fake_env):
            data, receipt = self.client.get("/v0/search/datasets", self.params)
        self.assertEqual(data, {"ok": True})
        args, kwargs = self.run.call_args
        cmd = args[0]
        self.assertEqual(cmd[:2], ["curl", "--disable"])
        self.assertEqual(cmd[cmd.index("--request") + 1], "GET")
        self.assertEqual(cmd[cmd.index("--proto") + 1], "=https")
        self.assertEqual(cmd[cmd.index("--max-redirs") + 1], "0")
        self.assertEqual(kwargs["env"], {"PATH": "/synthetic/bin", "LC_ALL": "C"})
        for forbidden in ("--insecure", "-k", "--location", "-L", "--netrc", "--user", "--cookie", "--data"):
            self.assertNotIn(forbidden, cmd)
        self.assertFalse(any("secret" in part or "Authorization" in part for part in cmd))
        self.assertEqual(receipt["method"], "GET")
        self.assertEqual(receipt["sha256"], acquire.digest(b'{"ok":true}'))

    def test_retry_after_is_honored_and_attempts_are_audited(self):
        replies = [(429, b'{"retry":true}', "Retry-After: 7\r\n"), (503, b'{}', ""), (200, b'{"ok":true}', "")]
        def respond(cmd, **kwargs):
            status, body, headers = replies.pop(0)
            Path(cmd[cmd.index("--dump-header") + 1]).write_text(headers)
            return SimpleNamespace(returncode=0, stdout=body + b"\n" + str(status).encode(), stderr=b"")
        self.run.side_effect = respond
        with mock.patch.object(self.client, "throttle") as throttle:
            data, receipt = self.client.get("/v0/search/datasets", self.params)
        self.assertEqual(data, {"ok": True})
        self.assertEqual(throttle.call_count, 3)
        self.assertEqual(self.client.requests, 3)
        self.assertEqual(receipt["attempt"], 3)
        self.assertEqual(self.sleep.call_args_list, [mock.call(7.0), mock.call(2)])
        events = [json.loads(line) for line in (self.client.root / "http-attempts.jsonl").read_text().splitlines()]
        self.assertEqual([e["status"] for e in events], [429, 503, 200])
        self.assertEqual({e["method"] for e in events}, {"GET"})

    def test_cache_hit_verifies_hash_without_network(self):
        self.cache()
        data, _ = self.client.get("/v0/search/datasets", dict(reversed(list(self.params.items()))))
        self.assertEqual(data, {"ok": True})
        self.assertEqual(self.client.cache_hits, 1)
        self.assertEqual(self.client.requests, 0)
        self.run.assert_not_called()

    def test_corrupt_cached_body_fails_closed(self):
        body_path, _ = self.cache()
        body_path.chmod(0o644)  # Simulate external corruption of this temporary fixture.
        body_path.write_bytes(b'{"tampered":true}')
        with self.assertRaisesRegex(ValueError, "Corrupt request cache"):
            self.client.get("/v0/search/datasets", self.params)
        self.run.assert_not_called()
        self.assertEqual(self.client.cache_hits, 0)

    def test_immutable_is_idempotent_but_rejects_overwrite(self):
        path = self.root / "immutable.json"
        original = acquire.immutable(path, b'{"fixed":true}')
        self.assertEqual(acquire.immutable(path, b'{"fixed":true}'), original)
        with self.assertRaisesRegex(ValueError, "Immutable file mismatch"):
            acquire.immutable(path, b'{"fixed":false}')
        self.assertEqual(path.read_bytes(), b'{"fixed":true}')
        self.assertEqual(path.stat().st_mode & 0o222, 0)
        self.assertEqual(original["sha256"], acquire.digest(path.read_bytes()))

    def test_blind_projection_preserves_metadata_without_retrieval_signals(self):
        dataset = {"identifier": "synthetic-ds", "title": "Title", "description": "  untrimmed  ",
                   "publisher": {"name": "Publisher"}, "temporal": None, "spatial": {}, "keywords": [],
                   "score": 99, "rank": 1, "quality": .9, "hasQuality": True, "queryContext": "hidden", "queryContextVector": None,
                   "distributions": [{"identifier": "synthetic-dist", "title": "Resource", "format": "CSV",
                                      "accessURL": "https://example.invalid/resource", "license": None, "score": 7,
                                      "quality": 1, "queryContext": "hidden", "queryContextVector": [1]}]}
        original = copy.deepcopy(dataset)
        projected = acquire.metadata_projection(dataset)
        self.assertEqual(projected, {"identifier": "synthetic-ds", "title": "Title", "description": "  untrimmed  ",
                                    "publisher": {"name": "Publisher"}, "temporal": None, "spatial": {}, "keywords": [],
                                    "distributions": [{"identifier": "synthetic-dist", "title": "Resource", "format": "CSV",
                                                       "accessURL": "https://example.invalid/resource", "license": None}]})
        self.assertEqual(dataset, original)

    def test_throttle_shares_clock_between_caches_without_real_sleep(self):
        other = acquire.AnonymousGET(self.root / "other-cache", interval=.75)
        with mock.patch.object(acquire.time, "time", return_value=1000.0):
            self.client.throttle()
        self.sleep.reset_mock()
        with mock.patch.object(acquire.time, "time", return_value=1000.1):
            other.throttle()
        self.assertAlmostEqual(self.sleep.call_args.args[0], .65)
        lock = self.root / ".request-start.lock"
        for invalid in ("nan", "inf", "2000"):
            lock.write_text(invalid)
            with self.subTest(clock=invalid), mock.patch.object(acquire.time, "time", return_value=1000), self.assertRaises(ValueError):
                self.client.throttle()
        self.run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
