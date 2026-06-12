"""Sanitize Band's harvested OpenAPI spec for codegen.

Band's spec names some component schemas with `/` and spaces
(e.g. "Agent API/Identity_getAgentMe_Response_200"), which breaks JSON-pointer
$ref resolution in openapi-typescript. This rewrites schema names to safe
identifiers and updates every $ref.

Usage: python scripts/sanitize_openapi.py
Reads  packages/band-types/openapi.json  (header-stripped copy of
band_research/api/openapi.json) and writes packages/band-types/openapi.sanitized.json.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "packages" / "band-types" / "openapi.json"
DST = ROOT / "packages" / "band-types" / "openapi.sanitized.json"

PREFIX = "#/components/schemas/"


def sanitize(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", name)


def main() -> None:
    spec = json.loads(SRC.read_text(encoding="utf-8"))
    schemas = spec["components"]["schemas"]
    rename = {old: sanitize(old) for old in schemas}
    if len(set(rename.values())) != len(rename):
        raise SystemExit("sanitized schema-name collision — adjust sanitize()")

    spec["components"]["schemas"] = {rename[k]: v for k, v in schemas.items()}

    def walk(node) -> None:
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith(PREFIX):
                old = ref[len(PREFIX):].replace("~1", "/").replace("~0", "~")
                if old in rename:
                    node["$ref"] = PREFIX + rename[old]
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(spec)
    DST.write_text(json.dumps(spec, indent=1), encoding="utf-8")
    changed = sum(1 for o, n in rename.items() if o != n)
    print(f"sanitized {changed} of {len(rename)} schema names -> {DST}")


if __name__ == "__main__":
    main()
