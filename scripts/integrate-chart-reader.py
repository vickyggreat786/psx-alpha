#!/usr/bin/env python3
"""Integrate ChartReaderPanel into psx-alpha-view.tsx:
1. Replace the old inline "Chart Reader" block with <ChartReaderPanel symbol={symbol} />
2. Remove the now-unused readerCandles/chartReader memo
3. Remove unused detectPatternEvents / computeSrLevels imports (verify no other usage)
4. Add the ChartReaderPanel import
"""
import re, sys

PATH = "/home/z/my-project/src/components/psx-alpha-view.tsx"
src = open(PATH, encoding="utf-8").read()
orig_len = len(src)

# ---- 1. Replace the old inline Chart Reader block ----
start_marker = "{/* Chart Reader — patterns + structure + key levels */}"
start = src.find(start_marker)
if start == -1:
    sys.exit("FAIL: old reader block marker not found")
end_marker = "            </CardContent>"
end = src.find(end_marker, start)
if end == -1:
    sys.exit("FAIL: CardContent close after reader block not found")
# The reader wrapper div's closing "</div>" sits right before </CardContent>.
replacement = (
    "              {/* Chart Reader — pro auto read + patterns + key levels */}\n"
    "              <ChartReaderPanel symbol={symbol} />\n\n"
)
src = src[:start] + replacement + src[end:]

# ---- 2. Remove readerCandles + chartReader memo (now unused) ----
memo_pat = re.compile(
    r"  // Chart Reader — pattern events \+ support/resistance computed client-side\n"
    r"  // from the same real candle history the chart shows\.\n"
    r"  const readerCandles =[\s\S]*?  \}, \[readerCandles\]\);\n\n",
)
src, n_memo = memo_pat.subn("", src)
if n_memo != 1:
    sys.exit(f"FAIL: chartReader memo pattern matched {n_memo} times (expected 1)")

# ---- 3. Remove unused imports (only if no remaining usage) ----
for mod, line in [
    ('from "@/lib/patterns"', 'import { detectPatternEvents } from "@/lib/patterns";\n'),
    ('from "@/lib/indicators"', 'import { computeSrLevels } from "@/lib/indicators";\n'),
]:
    body = src.replace(line, "")
    ident = "detectPatternEvents" if "patterns" in mod else "computeSrLevels"
    if ident not in body.replace('import { ' + ident + ' }', ""):
        # no other usage → remove import line
        if line in src:
            src = src.replace(line, "")
            print(f"removed import: {ident}")
    else:
        print(f"kept import {ident}: still used elsewhere")

# ---- 4. Add ChartReaderPanel import ----
anchor = 'import { ProfessionalChart } from "@/components/professional-chart";\n'
if 'import { ChartReaderPanel } from "@/components/chart-reader";' not in src:
    src = src.replace(
        anchor,
        anchor + 'import { ChartReaderPanel } from "@/components/chart-reader";\n',
    )

open(PATH, "w", encoding="utf-8").write(src)
print(f"OK: {orig_len} → {len(src)} chars")
