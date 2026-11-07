#!/usr/bin/env python3
"""Keep JavaRouters' InferHub channels and prices in step with the InferHub catalog.

JavaRouters is built on New API (https://github.com/QuantumNous/new-api, AGPLv3).
This tool runs outside the gateway and only talks to its admin API.

Each run:
  1. Reads the public InferHub catalog (https://api.inferhub.dev/v1/models).
  2. For every channel listed in the config, adds catalog aliases that match the
     channel's family pattern and have an official price, and removes models that
     left the catalog or lost their official price.
  3. Prices every sold model as a tiered expression:
         p, c = markup x official price, cr = cache_read_ratio x input price.
     Cache writes stay in p, which is how InferHub bills them.

Safety rules:
  * A price is never set below the highest InferHub ask x (1 + min_margin); a
    price that would be lower is raised and reported.
  * Removals are skipped for a channel when they exceed the mass-removal limit,
    when the catalog shrank sharply since the last run, or when they would
    empty the channel.
  * Prices edited by hand in the dashboard are overwritten on the next run.
    Put lasting exceptions in the config: "overrides" (per-model markup or
    expression) and "exclude" (models never to add).

Usage:
  JR_BASE_URL=https://example.com JR_ADMIN_TOKEN=... \\
      python3 inferhub_sync.py --config config.json [--dry-run]

The admin token needs the channel:read, channel:write, option:read and
option:write scopes. --dry-run only reads and prints the planned changes.
"""

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "javarouters-inferhub-sync/1.0"
DEFAULT_CATALOG_URL = "https://api.inferhub.dev/v1/models"
PRICE_DECIMALS = 6


def normalize(model_id):
    """Map 'ant/claude-opus-4-8' and 'claude-opus-4.8' to the same key."""
    return model_id.split("/")[-1].lower().replace(".", "-")


def build_price_table(catalog):
    """Highest official price and highest ask per normalized model name.

    Taking the maximum across upstreams keeps the margin whichever seller an
    alias is routed to.
    """
    table = {}
    for item in catalog:
        model_id = item.get("id", "")
        pricing = item.get("pricing")
        if not pricing or "/" not in model_id or model_id.startswith("free/"):
            continue
        official_in = float(pricing.get("official_in") or 0)
        official_out = float(pricing.get("official_out") or 0)
        if official_in <= 0 and official_out <= 0:
            continue
        asks_in = [float(a) for a in pricing.get("asks_in") or []]
        asks_out = [float(a) for a in pricing.get("asks_out") or []]
        # Without listed asks the catalog's cap (half the official price) is the
        # worst case InferHub allows.
        max_ask_in = max(asks_in) if asks_in else official_in * 0.5
        max_ask_out = max(asks_out) if asks_out else official_out * 0.5
        key = normalize(model_id.split("/", 1)[1])
        entry = table.setdefault(key, {"official_in": 0.0, "official_out": 0.0, "max_ask_in": 0.0, "max_ask_out": 0.0})
        entry["official_in"] = max(entry["official_in"], official_in)
        entry["official_out"] = max(entry["official_out"], official_out)
        entry["max_ask_in"] = max(entry["max_ask_in"], max_ask_in)
        entry["max_ask_out"] = max(entry["max_ask_out"], max_ask_out)
    return table


def is_sellable_alias(model_id):
    return "/" not in model_id and not model_id.startswith("kiro-") and "image" not in model_id


def desired_models(catalog, price_table, pattern, exclude):
    """Catalog aliases of one family that have an official price."""
    regex = re.compile(pattern)
    result = []
    for item in catalog:
        model_id = item.get("id", "")
        if not is_sellable_alias(model_id) or model_id in exclude or not regex.search(model_id):
            continue
        if normalize(model_id) in price_table:
            result.append(model_id)
    return sorted(set(result))


def round_price(value):
    return round(value, PRICE_DECIMALS)


def ceil_price(value):
    factor = 10 ** PRICE_DECIMALS
    return math.ceil(value * factor - 1e-9) / factor


def format_price(value):
    text = f"{value:.{PRICE_DECIMALS}f}".rstrip("0").rstrip(".")
    return text or "0"


def compute_price(entry, markup, cache_read_ratio, min_margin):
    """Sell prices for one model and any margin warnings.

    Each component must stay at or above InferHub's highest ask plus the
    minimum margin; cache reads are billed by InferHub at cache_read_ratio of
    the seller's input rate.
    """
    warnings = []
    sell_in = round_price(entry["official_in"] * markup)
    sell_out = round_price(entry["official_out"] * markup)
    floor_in = ceil_price(entry["max_ask_in"] * (1 + min_margin))
    floor_out = ceil_price(entry["max_ask_out"] * (1 + min_margin))
    if sell_in < floor_in:
        warnings.append(f"input {format_price(sell_in)} below ask floor, raised to {format_price(floor_in)}")
        sell_in = floor_in
    if sell_out < floor_out:
        warnings.append(f"output {format_price(sell_out)} below ask floor, raised to {format_price(floor_out)}")
        sell_out = floor_out
    sell_cr = round_price(sell_in * cache_read_ratio)
    floor_cr = ceil_price(entry["max_ask_in"] * cache_read_ratio * (1 + min_margin))
    if sell_cr < floor_cr:
        warnings.append(f"cache read {format_price(sell_cr)} below ask floor, raised to {format_price(floor_cr)}")
        sell_cr = floor_cr
    return sell_in, sell_out, sell_cr, warnings


def build_expr(sell_in, sell_out, sell_cr):
    return f'tier("standard", p * {format_price(sell_in)} + c * {format_price(sell_out)} + cr * {format_price(sell_cr)})'


def removal_allowed(current_count, removal_count, max_ratio):
    """Small channels may lose up to two models; larger ones up to max_ratio."""
    if removal_count == 0:
        return True
    if removal_count >= current_count:
        return False
    return removal_count <= max(2, math.ceil(current_count * max_ratio))


def catalog_shrank(previous_count, current_count, max_ratio):
    return previous_count > 0 and current_count < previous_count * (1 - max_ratio)


class AdminClient:
    def __init__(self, base_url, token, timeout=60):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def request(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("User-Agent", USER_AGENT)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.status, json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as err:
            payload = err.read()
            try:
                return err.code, json.loads(payload or b"{}")
            except ValueError:
                return err.code, {"success": False, "message": payload.decode(errors="replace")}


def fetch_catalog(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read()).get("data")
    if not isinstance(data, list) or not data:
        raise RuntimeError("InferHub catalog is empty or malformed")
    return data


def pricing_versions(client, models):
    query = "&".join("model=" + urllib.parse.quote(m) for m in models)
    status, body = client.request("GET", f"/api/option/model_pricing?{query}")
    if status != 200 or not body.get("success"):
        raise RuntimeError(f"reading model pricing failed: {status} {body.get('message')}")
    data = body["data"]
    versions = {e["model_name"]: e for e in data.get("entries", [])}
    return versions, data.get("empty_version", "")


def apply_prices(client, targets, dry_run):
    """Write only the expressions that differ from what is stored."""
    for attempt in range(2):
        versions, empty_version = pricing_versions(client, sorted(targets))
        changes = []
        for model, expr in sorted(targets.items()):
            entry = versions.get(model)
            configured = (entry or {}).get("configured") or {}
            if configured.get("billing_setting.billing_mode") == "tiered_expr" and configured.get("billing_setting.billing_expr") == expr:
                continue
            changes.append({
                "model_name": model,
                "expected_version": entry["version"] if entry else empty_version,
                "pricing": {"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr},
            })
        if not changes:
            print("prices: no changes")
            return
        for change in changes:
            print(f"price  {change['model_name']}: {change['pricing']['billing_setting.billing_expr']}")
        if dry_run:
            return
        status, body = client.request("PATCH", "/api/option/model_pricing", {"changes": changes})
        if status == 409 and attempt == 0:
            print("prices: version conflict, retrying once")
            continue
        if status != 200 or not body.get("success"):
            raise RuntimeError(f"updating prices failed: {status} {body.get('message')}")
        print(f"prices: updated {len(changes)} model(s)")
        return
    raise RuntimeError("updating prices failed: repeated version conflict")


def load_state(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_state(path, state):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2)
    os.replace(tmp, path)


def run(config, client, catalog, state, dry_run):
    markup = float(config.get("markup", 0.7))
    cache_read_ratio = float(config.get("cache_read_ratio", 0.1))
    min_margin = float(config.get("min_margin", 0.2))
    max_removal_ratio = float(config.get("max_removal_ratio", 0.2))
    exclude = set(config.get("exclude", []))
    overrides = config.get("overrides", {})

    price_table = build_price_table(catalog)
    shrank = catalog_shrank(state.get("priced_models", 0), len(price_table), max_removal_ratio)
    if shrank:
        print(f"WARNING catalog shrank from {state.get('priced_models')} to {len(price_table)} priced models; removals skipped this run")

    status, body = client.request("GET", "/api/channel/?p=1&page_size=100")
    if status != 200 or not body.get("success"):
        raise RuntimeError(f"reading channels failed: {status} {body.get('message')}")
    channels = {c["id"]: c for c in body["data"]["items"]}

    channel_updates = []
    sold = set()
    for spec in config["channels"]:
        channel = channels.get(spec["id"])
        if channel is None:
            print(f"WARNING channel {spec['id']} ({spec['family']}) not found; skipped")
            continue
        current = [m for m in channel.get("models", "").split(",") if m]
        desired = desired_models(catalog, price_table, spec["pattern"], exclude)
        additions = [m for m in desired if m not in current]
        removals = [m for m in current if normalize(m) not in price_table and m not in overrides]
        if removals and (shrank or not removal_allowed(len(current), len(removals), max_removal_ratio)):
            print(f"WARNING {channel['name']}: {len(removals)} removal(s) held back: {', '.join(removals)}")
            removals = []
        keep = [m for m in current if m not in removals]
        new_models = keep + additions
        sold.update(new_models)
        for model in additions:
            print(f"add    {channel['name']}: {model}")
        for model in removals:
            print(f"remove {channel['name']}: {model}")
        if additions or removals:
            channel_updates.append((channel, new_models))

    targets = {}
    for model in sorted(sold):
        override = overrides.get(model, {})
        if "expr" in override:
            targets[model] = override["expr"]
            continue
        entry = price_table.get(normalize(model))
        if entry is None:
            print(f"WARNING {model}: no official price; existing price left unchanged")
            continue
        sell_in, sell_out, sell_cr, warnings = compute_price(entry, float(override.get("markup", markup)), cache_read_ratio, min_margin)
        for warning in warnings:
            print(f"WARNING {model}: {warning}")
        targets[model] = build_expr(sell_in, sell_out, sell_cr)

    # Price new models before routing traffic to them.
    apply_prices(client, targets, dry_run)

    for channel, new_models in channel_updates:
        if dry_run:
            continue
        status, body = client.request("PUT", "/api/channel/", {"id": channel["id"], "type": channel["type"], "models": ",".join(new_models)})
        if status != 200 or not body.get("success"):
            raise RuntimeError(f"updating channel {channel['name']} failed: {status} {body.get('message')}")
        print(f"channel {channel['name']}: now {len(new_models)} model(s)")
    if not channel_updates:
        print("channels: no changes")

    return {"priced_models": len(price_table), "sold_models": len(sold), "last_run": int(time.time())}


def main():
    parser = argparse.ArgumentParser(description="Sync JavaRouters InferHub channels and prices with the InferHub catalog.")
    parser.add_argument("--config", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json"))
    parser.add_argument("--state", default=None, help="state file (default: state.json next to the config)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    base_url = os.environ.get("JR_BASE_URL")
    token = os.environ.get("JR_ADMIN_TOKEN")
    if not base_url or not token:
        print("JR_BASE_URL and JR_ADMIN_TOKEN must be set", file=sys.stderr)
        return 2
    with open(args.config, encoding="utf-8") as fh:
        config = json.load(fh)
    state_path = args.state or os.path.join(os.path.dirname(os.path.abspath(args.config)), "state.json")

    try:
        catalog = fetch_catalog(os.environ.get("INFERHUB_CATALOG_URL", DEFAULT_CATALOG_URL))
        new_state = run(config, AdminClient(base_url, token), catalog, load_state(state_path), args.dry_run)
    except (OSError, RuntimeError, ValueError, KeyError) as err:
        print(f"ERROR {err}", file=sys.stderr)
        return 1
    if not args.dry_run:
        save_state(state_path, new_state)
    print(f"done: {new_state['sold_models']} model(s) sold, {new_state['priced_models']} priced in catalog{' (dry run)' if args.dry_run else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
