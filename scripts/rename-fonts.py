#!/usr/bin/env python3
"""
Rename font files to a consistent convention:
  FamilyName-Weight.ext
  FamilyName-WeightItalic.ext

Rules:
  1. Strip foundry prefixes
  2. Hyphen separates family from weight
  3. No spaces in filename (PascalCase)
  4. Keep -Trial suffix where present
  5. Standardize italic naming to "Italic"
  6. Regenerate WOFF2 filenames to match

Run with --dry-run (default) to preview, --execute to apply.
"""

import os
import re
import sys
from pathlib import Path

BASE = Path(os.path.expanduser("~/Documents/fonts-organized"))

# Foundry prefixes to strip (order matters — longer first)
FOUNDRY_PREFIXES = [
    re.compile(r"^\{[^}]+\}\s*"),
    re.compile(r"^\d+\s*-\s*"),
    re.compile(
        r"^(?:Nootype|Latinotype|S-Core|Rene Bieder|Type Dynamic|"
        r"OGJ Type Design|Storm|G-Type|TypeType|"
        r"Greater\.Albion\.Typefounders|Copyright-General-Type-Studio|"
        r"Rui Abreu|Copernicus|Font Bureau)\s*[-–]\s*",
        re.I,
    ),
]

# Known weight tokens (order: longest first to avoid partial matches)
WEIGHT_TOKENS = [
    "UltraBlack", "ExtraBlack",
    "UltraBold", "ExtraBold", "SemiBold", "Semibold", "DemiBold", "Demibold",
    "UltraLight", "ExtraLight",
    "Hairline", "Thin", "Light", "Regular", "Normal", "Book",
    "Medium", "Bold", "Heavy", "Black", "Fat", "Fett", "Ultra",
    "Air", "Blond", "News", "Livre",
]

# Width tokens
WIDTH_TOKENS = [
    "UltraCondensed", "ExtraCondensed", "SemiCondensed",
    "UltraCompressed", "ExtraCompressed",
    "Condensed", "Compressed", "Narrow", "Cond", "Cn",
    "UltraExtended", "ExtraExtended", "SemiExtended",
    "Extended", "Expanded", "Wide", "Ext",
]

# Italic variants to normalize
ITALIC_VARIANTS = [
    (re.compile(r"\bKursiv\b", re.I), "Italic"),
    (re.compile(r"\bRotalic\b", re.I), "Rotalic"),  # Keep GT-specific term
    (re.compile(r"\bOblique\b", re.I), "Oblique"),   # Keep as distinct
    (re.compile(r"\bItal\b(?!ic)", re.I), "Italic"),
    (re.compile(r"\bIt\b", re.I), "Italic"),
]


def strip_foundry(name: str) -> str:
    for pat in FOUNDRY_PREFIXES:
        name = pat.sub("", name)
    return name.strip()


def to_pascal_case(s: str) -> str:
    """Convert 'some words here' to 'SomeWordsHere', preserving existing PascalCase."""
    if " " not in s and "-" not in s:
        return s
    # Split on spaces, keeping hyphens within tokens
    parts = s.split(" ")
    result = []
    for p in parts:
        if p:
            # Capitalize first letter of each space-separated word
            result.append(p[0].upper() + p[1:] if p else p)
    return "".join(result)


def normalize_name(stem: str) -> str:
    """Normalize a font filename stem to FamilyName-Weight convention."""
    original = stem

    # 1. Strip foundry prefix
    name = strip_foundry(stem)

    # 2. Remove common junk suffixes (but keep Trial)
    name = re.sub(r"\s*\[[^\]]*\]", "", name)  # Strip [TheFontsMaster.com] etc
    name = re.sub(r"\s+Typeface$", "", name)
    name = re.sub(r"\s+copy\s*\d*$", "", name, flags=re.I)

    # 3. Detect and preserve Trial
    has_trial = bool(re.search(r"-?Trial\b", name, re.I))
    name = re.sub(r"-?Trial\b", "", name, flags=re.I)

    # 4. Detect and normalize italic
    has_italic = False
    italic_label = "Italic"
    for pat, replacement in ITALIC_VARIANTS:
        if pat.search(name):
            has_italic = True
            italic_label = replacement
            name = pat.sub("", name)
            break
    if re.search(r"Italic", name):
        has_italic = True
        name = re.sub(r"Italic", "", name)

    # 5. Handle different separator patterns
    # Pattern: "Family-Weight" (most common)
    # Pattern: "Family Name Weight" (spaces)
    # Pattern: "FamilyWeight" (camelCase, no separator)

    # Try to split on last hyphen that separates family from weight
    family = ""
    weight = ""

    # First, check if there's a clear hyphen separator
    if "-" in name:
        # Find the split point - try to identify weight portion after hyphen
        parts = name.split("-")

        # Reconstruct: everything before the weight-containing part is family
        # Try from the right to find where weight tokens start
        family_parts = []
        weight_parts = []
        found_weight = False

        for i, part in enumerate(parts):
            part_clean = part.strip()
            # Check if this part starts with a weight or width token
            is_weight_part = False
            for w in WEIGHT_TOKENS + WIDTH_TOKENS:
                if part_clean.lower().startswith(w.lower()):
                    is_weight_part = True
                    break
            if is_weight_part and not found_weight:
                found_weight = True
            if found_weight:
                weight_parts.append(part_clean)
            else:
                family_parts.append(part_clean)

        if family_parts and weight_parts:
            family = "-".join(family_parts)
            weight = "".join(weight_parts)
        elif family_parts:
            # No weight found - might be like "FamilyName-SubFamily"
            # Keep as is but join with hyphen
            family = "-".join(family_parts)
            weight = ""
        else:
            family = name
            weight = ""
    else:
        # Space-separated or camelCase
        # Try to find weight tokens in the name
        best_split = -1
        for w in WEIGHT_TOKENS + WIDTH_TOKENS:
            # Find weight token as a word boundary
            m = re.search(r"(?:^|\s)" + re.escape(w) + r"(?:\s|$)", name, re.I)
            if m:
                pos = m.start()
                if pos > 0:
                    best_split = pos
                    break
            # Also try at camelCase boundary
            m = re.search(r"(?<=[a-z])" + re.escape(w), name)
            if m:
                best_split = m.start()
                break

        if best_split > 0:
            family = name[:best_split].strip()
            weight = name[best_split:].strip()
        else:
            family = name.strip()
            weight = ""

    # 6. Clean up family name - PascalCase, no spaces
    family = to_pascal_case(family.strip().strip("-"))
    # Remove trailing hyphens/spaces
    family = family.rstrip("- ")

    # 7. Clean up weight - PascalCase, no spaces or hyphens
    weight = weight.strip().strip("-")
    weight = re.sub(r"[\s-]+", "", weight)  # Remove spaces/hyphens within weight
    # Capitalize first letter
    if weight:
        weight = weight[0].upper() + weight[1:]

    # 8. Reassemble
    result = family
    if weight:
        result += "-" + weight
    if has_italic:
        # Append italic to weight portion
        if "-" in result:
            result += italic_label
        else:
            result += "-" + italic_label
    if has_trial:
        result += "-Trial"

    # 9. Final cleanup
    # Remove double hyphens
    result = re.sub(r"-{2,}", "-", result)
    # Remove trailing hyphen
    result = result.rstrip("-")

    # If we ended up with nothing useful, keep original
    if not result or result == "-":
        return original

    return result


def plan_renames(dry_run: bool = True):
    """Plan and optionally execute renames."""
    renames = []  # (old_path, new_path)
    skipped = 0
    errors = []

    for category_dir in sorted(BASE.iterdir()):
        if not category_dir.is_dir():
            continue
        for family_dir in sorted(category_dir.iterdir()):
            if not family_dir.is_dir():
                continue

            # Process source fonts (otf/ttf)
            source_files = sorted(
                f for f in family_dir.iterdir()
                if f.is_file() and f.suffix.lower() in {".otf", ".ttf"}
            )

            for src_file in source_files:
                stem = src_file.stem
                ext = src_file.suffix

                new_stem = normalize_name(stem)

                if new_stem != stem:
                    new_path = src_file.parent / (new_stem + ext)
                    renames.append((src_file, new_path))

                    # Also rename matching woff2
                    woff2_file = src_file.parent / (stem + ".woff2")
                    if woff2_file.exists():
                        new_woff2 = src_file.parent / (new_stem + ".woff2")
                        renames.append((woff2_file, new_woff2))
                else:
                    skipped += 1

    # Report
    if dry_run:
        changed_count = len([r for r in renames if r[0].suffix != ".woff2"])
        print(f"Proposed renames: {changed_count} fonts ({len(renames)} total with woff2)")
        print(f"Already correct: {skipped}")
        print()

        # Group by type of change for easier review
        changes = {}
        for old, new in renames:
            if old.suffix == ".woff2":
                continue
            change_type = categorize_change(old.stem, new.stem)
            changes.setdefault(change_type, []).append((old.stem, new.stem))

        for ctype in sorted(changes.keys()):
            items = changes[ctype]
            print(f"\n--- {ctype} ({len(items)} files) ---")
            for old_stem, new_stem in items[:15]:
                print(f"  {old_stem}")
                print(f"    → {new_stem}")
            if len(items) > 15:
                print(f"  ... and {len(items) - 15} more")
    else:
        # Execute renames, skipping conflicts (duplicates)
        claimed = set()  # target paths already taken
        done = 0
        dupes = 0
        for old_path, new_path in renames:
            if new_path in claimed or (new_path.exists() and old_path != new_path):
                # Duplicate — delete the source since the target already exists
                if old_path.exists():
                    old_path.unlink()
                    dupes += 1
                continue
            claimed.add(new_path)
            try:
                old_path.rename(new_path)
                done += 1
            except Exception as e:
                print(f"  ERROR: {old_path.name} → {e}")

        print(f"Renamed {done} files. Removed {dupes} duplicates.")


def categorize_change(old: str, new: str) -> str:
    old_lower = old.lower()
    new_lower = new.lower()

    if re.match(r"^\{", old) or re.match(r"^\d+ -", old):
        return "Strip foundry/number prefix"
    for pat in FOUNDRY_PREFIXES[2:]:
        if pat.match(old):
            return "Strip foundry prefix"
    if " " in old and " " not in new:
        return "Remove spaces (PascalCase)"
    if "Kursiv" in old or ("Ital" in old and "Italic" not in old):
        return "Normalize italic naming"
    if "Typeface" in old:
        return "Remove 'Typeface' suffix"
    if old != new:
        return "Other cleanup"
    return "Unknown"


def main():
    execute = "--execute" in sys.argv
    if execute:
        print("EXECUTING renames...\n")
    else:
        print("DRY RUN (use --execute to apply)\n")

    plan_renames(dry_run=not execute)


if __name__ == "__main__":
    main()
