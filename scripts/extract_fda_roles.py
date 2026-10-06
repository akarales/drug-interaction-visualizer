# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Extract FDA CYP / transporter roles into crates/engine/data/fda_roles.csv.

Source (US government work, public domain): FDA, "For Healthcare
Professionals | FDA's Examples of Drugs that Interact with CYP Enzymes and
Transporter Systems", Table 1 — one row per drug with CYP strong / moderate /
weak inhibitor and inducer, (moderately) sensitive substrate, transporter
inhibitor and substrate columns.

Inputs: data/raw/fda_hcp_cyp_transporter.html (scripts/fetch_fda_tables.sh), data/ddi_dataset.json,
optional data/aliases.json. Output: one row per (drug, pathway, role), mapped
to dataset ids, plus a report on stderr. The output is reviewed by hand and
committed; the app never scrapes at runtime.

Run: uv run --no-project scripts/extract_fda_roles.py [--retrieved YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HCP = ROOT / "data/raw/fda_hcp_cyp_transporter.html"
OUT = ROOT / "crates/engine/data/fda_roles.csv"

# Table 1 column → (role, level)
COLUMNS = {
    "CYP Strg INH": ("inhibitor", "strong"),
    "CYP Mod INH": ("inhibitor", "moderate"),
    "CYP WK INH": ("inhibitor", "weak"),
    "CYP Strg IND": ("inducer", "strong"),
    "CYP Mod IND": ("inducer", "moderate"),
    "CYP WK IND": ("inducer", "weak"),
    "CYP SENS SUB": ("substrate", "sensitive"),
    "CYP Mod SENS SUB": ("substrate", "moderate-sensitive"),
    "TRNSP INH": ("inhibitor", "unspecified"),
    "TRNSP SUB": ("substrate", "unspecified"),
}
# FDA name → dataset id where name/alias matching cannot decide (reviewed).
OVERRIDES = {
    "rifampin": "rifampicin",  # USAN vs INN
    "r-venlafaxine": "venlafaxine",  # racemate; R is the CYP2D6-sensitive enantiomer
}
# Not single drugs in the pairwise dataset: foods/supplements, the less sensitive
# enantiomer (its racemate is mapped above), metabolites and fixed combinations
# (their components have their own rows).
SKIP = {"s-venlafaxine", "s-mephenytoin", "oseltamivir carboxylate", "oral contraceptives", "piperine", "grapefruit juice", "st. john's wort", "st. john’s wort", "tobacco (smoking)", "curcumin", "diosmin"}


class Tables(HTMLParser):
    """All <table>s as lists of rows of cell text; <sup> footnote markers dropped."""

    def __init__(self) -> None:
        super().__init__()
        self.tables: list[dict] = []
        self._table: dict | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._sup = 0

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._table = {"summary": dict(attrs).get("summary") or "", "rows": []}
            self.tables.append(self._table)
        elif tag == "tr" and self._table is not None:
            self._row = []
            self._table["rows"].append(self._row)
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []
        elif tag == "sup":
            self._sup += 1
        elif tag == "br" and self._cell is not None:
            self._cell.append("; ")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "table":
            self._table = None
        elif tag == "sup":
            self._sup -= 1

    def handle_data(self, data):
        if self._cell is not None and not self._sup:
            self._cell.append(data)


def tables(path: Path) -> list[dict]:
    parser = Tables()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser.tables


ROLE_WORDS = re.compile(
    r"\b(strong|moderately|moderate|weak|sensitive|inhibitors?|inducers?|substrates?|transporters?)\b", re.I
)
PATHWAY = re.compile(r"^(CYP)?\d[A-Z]\d*$|^(P-gp|BCRP|OATP1B[13]|OAT[13]|OCT[12]|MATE1|MATE2-K)$")


def pathways(cell: str) -> list[str]:
    """'3A; 2C9 moderate inhibitor' → ['CYP3A', 'CYP2C9']; '2D6 and 3A moderately sensitive substrate' →
    ['CYP2D6', 'CYP3A']; 'P-gp transporter inhibitor' → ['P-gp']. Unknown tokens abort (review needed)."""
    out = []
    for token in re.split(r"[;,]|\band\b", ROLE_WORDS.sub(" ", cell)):
        token = " ".join(token.split())
        if not token or token == "-":
            continue
        if not PATHWAY.match(token):
            raise SystemExit(f"unrecognised pathway {token!r} in cell {cell!r} — extend PATHWAY after review")
        out.append(f"CYP{token.removeprefix('CYP')}" if token[0].isdigit() or token.startswith("CYP") else token)
    return out


def dataset_index(dataset: Path, aliases: Path) -> dict[str, str]:
    """Lower-cased name / id / RxNorm ingredient or salt → dataset id."""
    data = json.loads(dataset.read_text(encoding="utf-8"))
    index: dict[str, str] = {}
    for d in data["drugs"]:
        index.setdefault(d["name"].lower(), d["id"])
        index.setdefault(d["id"].replace("-", " "), d["id"])
    if aliases.exists():
        for drug_id, entry in json.loads(aliases.read_text(encoding="utf-8")).items():
            for name in entry.get("ingredients", []) + entry.get("salts", []):
                index.setdefault(name.lower(), drug_id)
    return index


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--retrieved", default="2026-10-06", help="date the HTML snapshots were fetched")
    args = ap.parse_args()

    index = dataset_index(ROOT / "data/ddi_dataset.json", ROOT / "data/aliases.json")
    rows: list[dict] = []
    unmatched: list[str] = []

    def resolve(name: str) -> str | None:
        key = name.strip().lower()
        if key in SKIP:
            return None
        drug_id = OVERRIDES.get(key) or index.get(key)
        if drug_id is None:
            unmatched.append(name)
        return drug_id

    # primary: HCP Table 1
    table1 = next(t for t in tables(HCP) if t["summary"].startswith("Table 1"))
    header, *body = table1["rows"]
    for cells in body:
        record = dict(zip(header, cells))
        name = record.get("Drug or Other Substance", "")
        drug_id = resolve(name)
        if not drug_id:
            continue
        for column, (role, level) in COLUMNS.items():
            for pathway in pathways(record.get(column, "")):
                rows.append(dict(drug_id=drug_id, fda_name=name, pathway=pathway, role=role, level=level, source="fda-hcp-table1"))

    rows.sort(key=lambda r: (r["drug_id"], r["role"], r["pathway"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        fh.write(f"# FDA CYP/transporter roles, extracted {args.retrieved} by scripts/extract_fda_roles.py — reviewed; public domain (US government work)\n")
        fh.write("# fda-hcp-table1: https://www.fda.gov/drugs/drug-interactions-labeling/healthcare-professionals-fdas-examples-drugs-interact-cyp-enzymes-and-transporter-systems (content current as of 2026-05-29)\n")
        writer = csv.DictWriter(fh, fieldnames=["drug_id", "fda_name", "pathway", "role", "level", "source"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    drugs = {r["drug_id"] for r in rows}
    print(f"wrote {len(rows)} role rows for {len(drugs)} dataset drugs → {OUT.relative_to(ROOT)}", file=sys.stderr)
    print(f"unmatched FDA names ({len(unmatched)}): {', '.join(sorted(set(unmatched)))}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
