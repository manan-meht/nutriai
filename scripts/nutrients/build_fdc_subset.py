#!/usr/bin/env python3
"""Builds data/food-composition/usda-fdc-subset.json from the official USDA
FoodData Central CSV downloads and scripts/nutrients/fdc-manifest.json.

USDA FoodData Central is in the public domain (CC0 1.0):
https://fdc.nal.usda.gov/download-datasets

Download and unzip these two files somewhere outside the repository:
  FoodData_Central_sr_legacy_food_csv_2018-04.zip   (SR Legacy, April 2018)
  FoodData_Central_survey_food_csv_2024-10-31.zip   (FNDDS 2021-2023 survey foods)

Then run (stdlib only; -I keeps the data directory off the import path):
  python3 -I scripts/nutrients/build_fdc_subset.py \
      --sr <dir with SR Legacy CSVs> --fndds <dir with survey CSVs> \
      --manifest scripts/nutrients/fdc-manifest.json \
      --out data/food-composition/usda-fdc-subset.json

What it guarantees, because the matcher and calculator depend on it:
  - A nutrient FDC has no value for is left out of the food's record. Absent
    means unknown. It is never written as 0.
  - A value FDC reports as 0 is kept as 0 (a known zero).
  - Vitamin D: FDC's microgram value when present; otherwise IU / 40, the
    standard conversion, recorded in the food's "derived" list.
  - Folate: FDC's DFE value when present; otherwise food folate + 1.7 x folic
    acid when both are present. Total folate alone is never treated as DFE,
    because the two differ whenever folic acid is present.
  - Vitamin A: only RAE. IU is never converted, because the conversion depends
    on the form (retinol vs carotenoids), which IU doesn't say.
  - Preformed retinol and folic acid are kept separately, for upper limits
    that apply only to those forms.
  - Values that reflect US practice rather than the food as eaten in India
    are dropped (left unknown) and the reason recorded under "excluded":
    iron and folate in anything with added folic acid ("us_enrichment"),
    and per-entry exclusions from the manifest, e.g. vitamin D in dishes
    whose USDA recipe assumes vitamin-D-fortified milk ("us_fortified_milk").
"""
import argparse
import csv
import json
import sys

# FDC nutrient ids -> our stable keys (see src/lib/nutrients/catalog.ts).
NUTRIENTS = {
    "1008": "energy",
    "1003": "protein",
    "1005": "carbs",
    "1004": "fat",
    "1079": "fiber",
    "1087": "calcium",
    "1089": "iron",
    "1090": "magnesium",
    "1092": "potassium",
    "1095": "zinc",
    "1190": "folate",        # µg DFE
    "1106": "vitamin_a",     # µg RAE
    "1105": "retinol",       # µg, preformed vitamin A
    "1186": "folic_acid",    # µg
    "1178": "vitamin_b12",
    "1162": "vitamin_c",
    "1114": "vitamin_d",     # µg (D2 + D3)
    "1100": "iodine",
}
VITAMIN_D_IU = "1110"
FOLATE_FOOD = "1187"

DATASETS = {
    "sr": {"id": "sr_legacy", "release": "2018-04", "label": "SR Legacy (April 2018)"},
    "fndds": {"id": "fndds", "release": "2024-10-31", "label": "FNDDS 2021-2023 survey foods (October 2024 release)"},
}

DECIMALS = {"energy": 0}


def rounded(key, value):
    d = DECIMALS.get(key, 3)
    v = round(float(value), d)
    if d == 0:
        return int(v)
    # Trim to 3 significant-ish figures without losing small values.
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return float(s) if "." in s else int(s)


def read_foods(path):
    by_desc = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            by_desc.setdefault(row["description"], []).append(row["fdc_id"])
    return by_desc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sr", required=True)
    ap.add_argument("--fndds", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    dirs = {"sr": args.sr, "fndds": args.fndds}
    manifest = json.load(open(args.manifest, encoding="utf-8"))["foods"]

    descs = {ds: read_foods(f"{d}/food.csv") for ds, d in dirs.items()}
    errors = []
    wanted = {}  # (ds, fdc_id) -> manifest entry
    seen_keys, seen_aliases = set(), {}
    for entry in manifest:
        ids = descs[entry["ds"]].get(entry["desc"], [])
        if len(ids) != 1:
            errors.append(f"{entry['key']}: {len(ids)} matches for {entry['ds']} '{entry['desc']}'")
            continue
        if entry["key"] in seen_keys:
            errors.append(f"duplicate key {entry['key']}")
        seen_keys.add(entry["key"])
        for alias in entry.get("aliases", []):
            name = alias.lstrip("~")
            if name in seen_aliases:
                errors.append(f"alias '{name}' on both {seen_aliases[name]} and {entry['key']}")
            seen_aliases[name] = entry["key"]
        wanted[(entry["ds"], ids[0])] = entry
    for entry in manifest:
        for variant in (entry.get("variants") or {}).values():
            if variant not in seen_keys:
                errors.append(f"{entry['key']}: variant {variant} is not in the manifest")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)

    values = {k: {} for k in wanted}
    portions = {k: [] for k in wanted}
    for ds, d in dirs.items():
        ids = {fid for (wds, fid) in wanted if wds == ds}
        # The FNDDS download's food_nutrient.csv carries the legacy nutrient
        # number (e.g. 301 for calcium) in its nutrient_id column, where SR
        # Legacy carries the FDC nutrient id (1087). nutrient.csv maps one to
        # the other.
        by_number = {}
        with open(f"{d}/nutrient.csv", newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                # Exact match only: "205" is carbohydrate by difference,
                # "205.2" is carbohydrate by summation.
                if row.get("nutrient_nbr"):
                    by_number[row["nutrient_nbr"]] = row["id"]
        with open(f"{d}/food_nutrient.csv", newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["fdc_id"] in ids and row["amount"] != "":
                    nid = by_number.get(row["nutrient_id"], row["nutrient_id"]) if ds == "fndds" else row["nutrient_id"]
                    values[(ds, row["fdc_id"])][nid] = float(row["amount"])
        units = {}
        with open(f"{d}/measure_unit.csv", newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                units[row["id"]] = row["name"]
        with open(f"{d}/food_portion.csv", newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["fdc_id"] not in ids or not row["gram_weight"]:
                    continue
                grams = float(row["gram_weight"])
                if grams <= 0:
                    continue
                if ds == "fndds":
                    label = row["portion_description"].strip()
                    if not label or label.lower().startswith("quantity not specified"):
                        continue
                else:
                    unit = units.get(row["measure_unit_id"], "")
                    amount = row["amount"].rstrip("0").rstrip(".") if "." in row["amount"] else row["amount"]
                    parts = [amount] if amount else []
                    if unit and unit != "undetermined":
                        parts.append(unit)
                    if row["modifier"]:
                        parts.append(row["modifier"].strip())
                    label = " ".join(parts).strip()
                if label:
                    portions[(ds, row["fdc_id"])].append({"label": label, "grams": round(grams, 1)})

    foods = []
    for (ds, fid), entry in sorted(wanted.items(), key=lambda kv: kv[1]["key"]):
        raw = values[(ds, fid)]
        per100g, derived = {}, []
        for nid, key in NUTRIENTS.items():
            if nid in raw:
                per100g[key] = rounded(key, raw[nid])
        if "vitamin_d" not in per100g and VITAMIN_D_IU in raw:
            per100g["vitamin_d"] = rounded("vitamin_d", raw[VITAMIN_D_IU] / 40)
            derived.append("vitamin_d_from_iu")
        if "folate" not in per100g and FOLATE_FOOD in raw and "1186" in raw:
            per100g["folate"] = rounded("folate", raw[FOLATE_FOOD] + 1.7 * raw["1186"])
            derived.append("folate_dfe_from_food_and_folic_acid")
        excluded = dict(entry.get("exclude") or {})
        # In US data, folic acid only gets into a food by enrichment or
        # fortification, and enriched grain also carries added iron. Indian
        # rice, flour and the dishes made from them usually aren't enriched,
        # so those values would overstate intake: leave them unknown.
        if per100g.get("folic_acid", 0) > 0 and not entry.get("keepEnrichment"):
            for key in ("iron", "folate", "folic_acid"):
                excluded.setdefault(key, "us_enrichment")
        for key in excluded:
            per100g.pop(key, None)
        item = {
            "key": entry["key"],
            "id": f"fdc:{fid}",
            "fdcId": int(fid),
            "dataset": DATASETS[ds]["id"],
            "description": entry["desc"],
            "state": entry["state"],
            "group": entry["group"],
            "aliases": entry.get("aliases", []),
            "per100g": per100g,
        }
        if derived:
            item["derived"] = derived
        if excluded:
            item["excluded"] = excluded
        if entry.get("variants"):
            item["variants"] = entry["variants"]
        # Up to five household measures, smallest first, without repeats.
        uniq, seen = [], set()
        for p in sorted(portions[(ds, fid)], key=lambda p: p["grams"]):
            if p["label"] in seen:
                continue
            seen.add(p["label"])
            uniq.append(p)
        if uniq:
            item["portions"] = uniq[:5]
        foods.append(item)

    out = {
        "source": {
            "id": "usda-fdc",
            "name": "USDA FoodData Central",
            "licence": "CC0 1.0 Universal (public domain)",
            "url": "https://fdc.nal.usda.gov/download-datasets",
            "datasets": [{"id": v["id"], "release": v["release"], "label": v["label"]} for v in DATASETS.values()],
        },
        "version": "usda-fdc-subset-2026-11-09",
        "builtBy": "scripts/nutrients/build_fdc_subset.py",
        "foods": foods,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{len(foods)} foods written to {args.out}")


if __name__ == "__main__":
    main()
