#!/usr/bin/env python3
"""
Organize a font library and generate WOFF2 versions.

- Copies fonts from source to organized output directory
- Auto-classifies: _trials, mono, _variable, _unsorted
- Keeps OTF or TTF (prefers OTF if both exist) + generates WOFF2
- Skips WOFF v1, EOT, and other legacy formats
"""

import os
import re
import shutil
import sys
from pathlib import Path
from fontTools.ttLib import TTFont

SOURCE = Path(
    "/Users/jonas/Library/CloudStorage/GoogleDrive-j@jonasjohansson.se"
    "/Shared drives/PUBLIC/FONTS"
)
OUTPUT = Path(os.path.expanduser("~/Documents/fonts-organized"))

TRIAL_PATTERNS = re.compile(
    r"(trial|demo|test|preview|sample)(?:s|\b)", re.IGNORECASE
)
MONO_PATTERNS = re.compile(
    r"(mono|typewriter|code|console|terminal)", re.IGNORECASE
)
VARIABLE_PATTERNS = re.compile(
    r"(variable|gx|vf\b)", re.IGNORECASE
)
VARIABLE_EXTENSIONS = {".ttf"}  # variable fonts are typically .ttf

FONT_EXTENSIONS = {".otf", ".ttf"}


def classify_family(family_dir: Path, font_files: list[Path]) -> str:
    """Classify a font family into a category."""
    name = family_dir.name.lower()

    # Check trial
    if TRIAL_PATTERNS.search(name):
        return "_trials"

    # Check variable (by name or by inspecting font tables)
    if VARIABLE_PATTERNS.search(name):
        return "_variable"
    for f in font_files:
        if f.suffix.lower() in VARIABLE_EXTENSIONS:
            try:
                font = TTFont(str(f), lazy=True)
                if "fvar" in font:
                    font.close()
                    return "_variable"
                font.close()
            except Exception:
                pass

    # Check mono (by name or by OS/2 panose)
    if MONO_PATTERNS.search(name):
        return "mono"
    for f in font_files:
        try:
            font = TTFont(str(f), lazy=True)
            if "OS/2" in font:
                os2 = font["OS/2"]
                # panose family kind 2 = Latin Text, proportion 9 = Monospaced
                if hasattr(os2, "panose") and os2.panose.bProportion == 9:
                    font.close()
                    return "mono"
            if "post" in font:
                post = font["post"]
                if post.isFixedPitch:
                    font.close()
                    return "mono"
            font.close()
        except Exception:
            pass

    return "_unsorted"


def convert_to_woff2(source_path: Path, dest_path: Path) -> bool:
    """Convert a font file to WOFF2."""
    try:
        font = TTFont(str(source_path))
        font.flavor = "woff2"
        font.save(str(dest_path))
        font.close()
        return True
    except Exception as e:
        print(f"  WARN: Failed to convert {source_path.name} -> woff2: {e}")
        return False


def collect_font_files(directory: Path) -> list[Path]:
    """Recursively collect all font files in a directory."""
    files = []
    for f in directory.rglob("*"):
        if f.suffix.lower() in FONT_EXTENSIONS and f.is_file():
            files.append(f)
    return files


def pick_source_format(font_files: list[Path]) -> dict[str, Path]:
    """
    For each font style, pick OTF if available, else TTF.
    Returns {stem: path} where stem is the filename without extension.
    """
    by_stem: dict[str, dict[str, Path]] = {}
    for f in font_files:
        stem = f.stem
        ext = f.suffix.lower()
        if stem not in by_stem:
            by_stem[stem] = {}
        by_stem[stem][ext] = f

    result = {}
    for stem, formats in by_stem.items():
        # Prefer OTF over TTF
        if ".otf" in formats:
            result[stem] = formats[".otf"]
        elif ".ttf" in formats:
            result[stem] = formats[".ttf"]
    return result


def process_family(family_dir: Path, category: str, stats: dict):
    """Process a single font family directory."""
    font_files = collect_font_files(family_dir)
    if not font_files:
        return

    family_name = family_dir.name
    out_dir = OUTPUT / category / family_name
    out_dir.mkdir(parents=True, exist_ok=True)

    selected = pick_source_format(font_files)

    for stem, source_file in selected.items():
        ext = source_file.suffix.lower()
        fmt_name = ext.lstrip(".")

        # Copy source font
        dest_source = out_dir / source_file.name
        if not dest_source.exists():
            shutil.copy2(str(source_file), str(dest_source))
            stats["copied"] += 1

        # Generate WOFF2
        woff2_name = stem + ".woff2"
        dest_woff2 = out_dir / woff2_name
        if not dest_woff2.exists():
            if convert_to_woff2(source_file, dest_woff2):
                stats["converted"] += 1
            else:
                stats["failed"] += 1


def main():
    if not SOURCE.exists():
        print(f"ERROR: Source directory not found: {SOURCE}")
        sys.exit(1)

    OUTPUT.mkdir(parents=True, exist_ok=True)

    # Create category dirs
    for cat in ["sans", "serif", "mono", "display", "script", "_trials", "_variable", "_unsorted"]:
        (OUTPUT / cat).mkdir(exist_ok=True)

    stats = {"families": 0, "copied": 0, "converted": 0, "failed": 0, "skipped": 0}
    categories: dict[str, int] = {}

    # Collect all family directories (depth 2 under source)
    family_dirs = []
    for letter_dir in sorted(SOURCE.iterdir()):
        if not letter_dir.is_dir():
            continue
        for family_dir in sorted(letter_dir.iterdir()):
            if not family_dir.is_dir():
                continue
            family_dirs.append(family_dir)

    total = len(family_dirs)
    print(f"Found {total} font families to process\n")

    for i, family_dir in enumerate(family_dirs, 1):
        font_files = collect_font_files(family_dir)
        if not font_files:
            stats["skipped"] += 1
            continue

        category = classify_family(family_dir, font_files)
        categories[category] = categories.get(category, 0) + 1

        print(f"[{i}/{total}] {family_dir.name} -> {category}")
        process_family(family_dir, category, stats)
        stats["families"] += 1

    print(f"\n{'='*50}")
    print(f"Done!")
    print(f"  Families processed: {stats['families']}")
    print(f"  Fonts copied:       {stats['copied']}")
    print(f"  WOFF2 generated:    {stats['converted']}")
    print(f"  Conversions failed: {stats['failed']}")
    print(f"  Empty dirs skipped: {stats['skipped']}")
    print(f"\nCategories:")
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count}")
    print(f"\nOutput: {OUTPUT}")


if __name__ == "__main__":
    main()
