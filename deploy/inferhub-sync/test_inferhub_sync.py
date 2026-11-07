import unittest

import inferhub_sync as sync


def paid(model_id, official_in, official_out, asks_in, asks_out):
    return {"id": model_id, "pricing": {"official_in": official_in, "official_out": official_out, "asks_in": asks_in, "asks_out": asks_out}}


CATALOG = [
    paid("ant/claude-opus-4-8", 5, 25, [0.5, 2.5], [2.5, 12.5]),
    paid("kiro/claude-opus-4.8", 5, 25, [1.0], [5.0]),
    paid("cc/claude-sonnet-4-6", 3, 15, [1.5], [7.5]),
    paid("ali/deepseek-v4-pro-0813", 0.66, 1.98, [0.33], [0.99]),
    {"id": "claude-opus-4.8"},
    {"id": "claude-sonnet-4.6"},
    {"id": "claude-opus-4.1"},
    {"id": "kiro-opus-4.8"},
    {"id": "gpt-image-2"},
    {"id": "free/x/claude-opus-4-8", "pricing": {"official_in": 0, "official_out": 0}},
]


class FakeClient:
    def __init__(self, channels, configured=None):
        self.channels = channels
        self.configured = configured or {}
        self.calls = []

    def request(self, method, path, body=None):
        self.calls.append((method, path, body))
        if method == "GET" and path.startswith("/api/channel/"):
            return 200, {"success": True, "data": {"items": self.channels}}
        if method == "GET" and path.startswith("/api/option/model_pricing"):
            entries = [{"model_name": m, "version": "v-" + m, "configured": c} for m, c in self.configured.items()]
            return 200, {"success": True, "data": {"entries": entries, "empty_version": "empty"}}
        return 200, {"success": True, "data": {}}

    def writes(self):
        return [(method, path) for method, path, _ in self.calls if method != "GET"]


CONFIG = {"channels": [{"id": 1, "family": "claude", "pattern": "^claude-"}]}


class PricingTest(unittest.TestCase):
    def test_normalize(self):
        for raw, want in [("ant/claude-opus-4-8", "claude-opus-4-8"), ("claude-opus-4.8", "claude-opus-4-8"), ("cmc/moonshotai/Kimi-K3", "kimi-k3")]:
            self.assertEqual(sync.normalize(raw), want)

    def test_price_table_takes_highest_official_and_ask(self):
        table = sync.build_price_table(CATALOG)
        self.assertEqual(table["claude-opus-4-8"], {"official_in": 5, "official_out": 25, "max_ask_in": 2.5, "max_ask_out": 12.5})
        self.assertNotIn("claude-opus-4-1", table)

    def test_compute_price(self):
        cases = [
            # entry, markup, expected (in, out, cr), warnings expected
            ({"official_in": 5, "official_out": 25, "max_ask_in": 2.5, "max_ask_out": 12.5}, 0.7, (3.5, 17.5, 0.35), 0),
            ({"official_in": 0.66, "official_out": 1.98, "max_ask_in": 0.33, "max_ask_out": 0.99}, 0.7, (0.462, 1.386, 0.0462), 0),
            # Asks above the markup: every component is raised to ask x 1.2.
            ({"official_in": 1, "official_out": 5, "max_ask_in": 0.9, "max_ask_out": 4.5}, 0.7, (1.08, 5.4, 0.108), 2),
        ]
        for entry, markup, want, warn_count in cases:
            sell_in, sell_out, sell_cr, warnings = sync.compute_price(entry, markup, 0.1, 0.2)
            self.assertEqual((sell_in, sell_out, sell_cr), want)
            self.assertEqual(len(warnings), warn_count)
            self.assertGreaterEqual(sell_in, entry["max_ask_in"])
            self.assertGreaterEqual(sell_out, entry["max_ask_out"])

    def test_build_expr(self):
        self.assertEqual(sync.build_expr(3.5, 17.5, 0.35), 'tier("standard", p * 3.5 + c * 17.5 + cr * 0.35)')

    def test_desired_models_filters_aliases(self):
        table = sync.build_price_table(CATALOG)
        self.assertEqual(sync.desired_models(CATALOG, table, "^claude-", {"claude-sonnet-4.6"}), ["claude-opus-4.8"])

    def test_removal_guards(self):
        cases = [(10, 0, True), (10, 2, True), (10, 3, False), (20, 4, True), (20, 5, False), (2, 2, False), (3, 1, True)]
        for current, removals, want in cases:
            self.assertEqual(sync.removal_allowed(current, removals, 0.2), want, (current, removals))
        self.assertTrue(sync.catalog_shrank(100, 79, 0.2))
        self.assertFalse(sync.catalog_shrank(100, 80, 0.2))
        self.assertFalse(sync.catalog_shrank(0, 10, 0.2))


class RunTest(unittest.TestCase):
    def test_adds_prices_before_routing_and_removes_unpriced(self):
        client = FakeClient([{"id": 1, "type": 14, "name": "InferHub - Claude", "models": "claude-sonnet-4.6,claude-gone"}])
        state = sync.run(CONFIG, client, CATALOG, {}, dry_run=False)
        self.assertEqual(client.writes(), [("PATCH", "/api/option/model_pricing"), ("PUT", "/api/channel/")])
        patch = next(body for method, _, body in client.calls if method == "PATCH")
        self.assertEqual({c["model_name"] for c in patch["changes"]}, {"claude-sonnet-4.6", "claude-opus-4.8"})
        put = next(body for method, _, body in client.calls if method == "PUT")
        self.assertEqual(put, {"id": 1, "type": 14, "models": "claude-sonnet-4.6,claude-opus-4.8"})
        self.assertEqual(state["sold_models"], 2)

    def test_unchanged_prices_are_not_rewritten(self):
        expr = 'tier("standard", p * 3.5 + c * 17.5 + cr * 0.35)'
        configured = {"claude-opus-4.8": {"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr}}
        client = FakeClient([{"id": 1, "type": 14, "name": "C", "models": "claude-opus-4.8"}], configured)
        sync.run({**CONFIG, "exclude": ["claude-sonnet-4.6"]}, client, CATALOG, {}, dry_run=False)
        self.assertEqual(client.writes(), [])

    def test_catalog_shrink_holds_back_removals(self):
        client = FakeClient([{"id": 1, "type": 14, "name": "C", "models": "claude-opus-4.8,claude-gone"}])
        sync.run({**CONFIG, "exclude": ["claude-sonnet-4.6"]}, client, CATALOG, {"priced_models": 100}, dry_run=False)
        self.assertNotIn(("PUT", "/api/channel/"), client.writes())

    def test_mass_removal_holds_back_but_still_adds(self):
        current = ",".join(["claude-opus-4.8"] + [f"claude-gone-{i}" for i in range(4)])
        client = FakeClient([{"id": 1, "type": 14, "name": "C", "models": current}])
        sync.run(CONFIG, client, CATALOG, {}, dry_run=False)
        put = next(body for method, _, body in client.calls if method == "PUT")
        self.assertEqual(put["models"], current + ",claude-sonnet-4.6")

    def test_dry_run_only_reads(self):
        client = FakeClient([{"id": 1, "type": 14, "name": "C", "models": "claude-gone"}])
        sync.run(CONFIG, client, CATALOG, {}, dry_run=True)
        self.assertEqual(client.writes(), [])


if __name__ == "__main__":
    unittest.main()
