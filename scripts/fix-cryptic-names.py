#!/usr/bin/env python3
"""
Rename cryptic font filenames (H74ANARC.TTF, LTe50665.ttf, etc.)
using the font's internal metadata (name table).
"""

import re
from collections import defaultdict
from pathlib import Path
from fontTools.ttLib import TTFont

BASE = Path.home() / "Documents/fonts-organized"


def get_meta_name(font_path):
    """Extract family + style from font metadata and build a proper filename."""
    try:
        font = TTFont(str(font_path), lazy=True)
        family = ""
        style = ""
        for rec in font["name"].names:
            try:
                if rec.nameID == 1 and not family:
                    family = rec.toUnicode()
                if rec.nameID == 2 and not style:
                    style = rec.toUnicode()
            except Exception:
                pass
        font.close()

        if not family:
            return None

        # Clean family: remove spaces -> PascalCase
        family_clean = re.sub(r"\s+", "", family)

        # Clean style
        style_clean = style.strip()
        if style_clean.lower() in ("regular", "roman"):
            style_clean = "Regular"
        style_clean = re.sub(r"\s+", "", style_clean)

        if style_clean and style_clean != "Regular":
            return f"{family_clean}-{style_clean}"
        else:
            return f"{family_clean}-Regular"
    except Exception:
        return None


def needs_rename(filepath):
    """Check if a font file has a cryptic/problematic filename."""
    stem = filepath.stem

    # ALL CAPS (H74ANARC, HOUSHBIA)
    if stem == stem.upper() and len(stem) > 2:
        return True
    # Code-like (LTe50665, TE111761)
    if re.match(r"^[A-Z][A-Za-z]*\d{3,}", stem):
        return True
    # Short codes (RhodBW01, RhodBC03)
    if re.match(r"^[A-Z][a-z]{0,4}[A-Z0-9]{2}\d+", stem):
        return True
    # Generic names with no family prefix (Bold.otf, Book.otf)
    if re.match(r"^(Bold|Book|Medium|Light|Heavy|Semibold|Extrabold|Regular|Thin)(-Italic)?$", stem, re.I):
        return True
    # Foundry prefix still embedded
    if re.match(r"^(TypoforgeStudio|Tyfomono|URW\+\+|DINNeuzeit)-", stem):
        return True
    # Munged/broken
    if "Munged" in stem:
        return True

    return False


def main():
    problems = []

    for ext in ("*.otf", "*.ttf", "*.OTF", "*.TTF"):
        for f in sorted(BASE.rglob(ext)):
            if needs_rename(f):
                new_stem = get_meta_name(f)
                if new_stem and new_stem != f.stem:
                    problems.append((f, new_stem))

    print(f"Found {len(problems)} files to rename\n")

    # Group by directory to check for conflicts
    by_dir = defaultdict(list)
    for old, new in problems:
        by_dir[old.parent].append((old, new))

    renamed = 0
    skipped = 0

    for dir_path, items in sorted(by_dir.items()):
        seen = set()
        for old_path, new_stem in items:
            ext = old_path.suffix.lower()
            new_path = dir_path / (new_stem + ext)

            if str(new_path) in seen or (new_path.exists() and new_path != old_path):
                print(f"  SKIP (conflict): {old_path.name} -> {new_stem}{ext}")
                skipped += 1
                continue
            seen.add(str(new_path))

            print(f"  {old_path.name} -> {new_stem}{ext}")
            old_path.rename(new_path)
            renamed += 1

            # Also rename matching woff2
            old_woff2 = dir_path / (old_path.stem + ".woff2")
            new_woff2 = dir_path / (new_stem + ".woff2")
            if old_woff2.exists() and not new_woff2.exists():
                old_woff2.rename(new_woff2)
                renamed += 1

    print(f"\nRenamed {renamed} files, skipped {skipped} conflicts")


if __name__ == "__main__":
    main()
