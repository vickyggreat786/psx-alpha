#!/usr/bin/env python3
"""Extract symbol names from the raw PSX PHP HTML using the same regex as the app."""
import re, json

html = open("/tmp/psx-summary.html").read()
text = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", html)
text = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", text)
text = re.sub(r"<!--[\s\S]*?-->", " ", text)
text = re.sub(r"<[^>]+>", " ", text)
text = text.replace("&nbsp;", " ").replace("&amp;", "&")
text = re.sub(r"\s+", " ", text).strip()

NUM = r"\d+(?:,\d{3})*(?:\.\d+)?|\d+\.\d+"
SECTOR_RE = re.compile(r"([A-Z][A-Z\s&]+?)\s+SCRIP\s+LDCP\s+OPEN\s+HIGH\s+LOW\s+CURRENT\s+CHANGE\s+VOLUME")
SCRIP_RE = re.compile(
    r"([A-Z][A-Z0-9 .&'\-]{2,60}?)\s+(" + NUM + r")\s+(" + NUM + r")\s+(" + NUM +
    r")\s+(" + NUM + r")\s+(" + NUM + r")\s+(-?[\d.]+)\s+(\d[\d,]+)"
)

HEADER_WORDS = ["HIGH", "LOW", "CURRENT", "CHANGE", "VOLUME", "LDCP", "OPEN", "SCRIP", "MARKET", "SUMMARY", "BOARD"]

def looks_header(name):
    if re.match(r"^(?:APPAREL|AUTOMOBILE|SCRIP|LDCP|OPEN|HIGH|LOW|CURRENT|CHANGE|VOLUME|MARKET|SUMMARY|BOARD|GEM|MAIN)$", name, re.I):
        return True
    for w in HEADER_WORDS:
        if re.search(r"\b" + w + r"\b", name):
            return True
    if len(name) > 35:
        return True
    if len(name.split()) > 5:
        return True
    return False

ms_idx = text.find("MARKET SUMMARY")
body = text[ms_idx:] if ms_idx >= 0 else ""

headers = [(m.group(1).strip(), m.start(), m.end()) for m in SECTOR_RE.finditer(body)]
seen = set()
symbols = []
for i, (name, start, end) in enumerate(headers):
    if name == "END MUTUAL FUND":
        continue
    chunk_start = end
    chunk_end = headers[i+1][1] if i+1 < len(headers) else len(body)
    chunk = body[chunk_start:chunk_end]
    for m in SCRIP_RE.finditer(chunk):
        sym = m.group(1).strip()
        if looks_header(sym):
            continue
        key = sym + "|" + name
        if key in seen:
            continue
        seen.add(key)
        symbols.append({"symbol": sym, "sector": name})

print("TOTAL UNIQUE PSX SYMBOLS:", len(symbols))
json.dump(symbols, open("/tmp/psx-symbols.json", "w"), indent=1)
print("First 40:")
for s in symbols[:40]:
    print(" ", s["symbol"], "|", s["sector"])
