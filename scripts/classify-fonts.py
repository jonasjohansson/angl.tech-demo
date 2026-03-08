#!/usr/bin/env python3
"""
Classify _unsorted fonts into sans/serif/display/script using
font metadata (OS/2 sFamilyClass, panose) and name heuristics.
"""

import os
import re
import shutil
from pathlib import Path
from fontTools.ttLib import TTFont

BASE = Path(os.path.expanduser("~/Documents/fonts-organized"))
UNSORTED = BASE / "_unsorted"

# Name-based heuristics (checked in order, first match wins)
NAME_RULES = [
    # Script/handwriting
    (re.compile(r"(script|hand|brush|callig|cursive|signature|fresh\s*script|roller)", re.I), "script"),
    # Display/decorative
    (re.compile(r"(display|poster|headline|stencil|ornament|decorat|titling|condensed|compress|narrow|extended|wide|druk|action|alpha headline|integral|monument|morion|stag stencil|trend|glyphworld)", re.I), "display"),
    # Mono (shouldn't be here but just in case)
    (re.compile(r"(mono|typewriter|code|console|terminal)", re.I), "mono"),
    # Serif indicators
    (re.compile(r"(serif|roman|antiqua|garamond|caslon|bodoni|didot|baskerville|minion|mercury|miller|lyon|sentinel|surveyor|arnhem|athelas|calluna|canela|feijoa|freight|ingeborg|nocturno|noe\b|saol|tiempos|ivar|orpheus|grifo|trinite|mediaeval|roxborough|argent|archer|chap|fortescue|cambon|source serif|sainte colombe|heldane|newparis|stanley|untitled serif|gt sectra|gt super|americana|abril)", re.I), "serif"),
    # Sans indicators
    (re.compile(r"(sans|grotesk|grotesque|grot\b|gothic|helvetica|univers|futura|avenir|proxima|apercu|calibre|circular|inter\b|roboto|montserrat|gilroy|poppins|lato|nunito|open sans|work sans|dm sans|manrope|outfit|sora|urbanist|barlow|exo|jost|karla|lexend|mulish|noto|overpass|raleway|rubik|space|satoshi|general|aeonik|akkurat|aktiv|akzidenz|atlas|campton|cerial|ciutadella|cooper hewitt|core sans|fakt|falster|f grotesk|f37|formular|founders|funkis|funktional|gebaude|geogrot|geoman|gibson|gilroy|glober|google sans|graphik|gryffith|guardian|guillon|hk grot|heimat.sans|heebo|ideal.sans|idlewild|inbox|maison(?! mono)|mabry|matter|messina|metric|miedinger|mier|mikro|moderat|modern era|mont\b|muller|national|nb grot|nb plan|netflix|neue haas|neurial|neusa|neutra|neutral|neutrif|neuzeit|nexa|nimbus sans|oakes|opposit|radikal|radnika|rasmus|reader|recta|regular\b|regulator|relevant|replica|roboto|rois|rubrik|sailec|sang.?bleu|scandia|scene|scto|septima|sequel|sharp|siri|sneak|sofia|solomon|sporting|stawix|stolzl|styrene|suisse|superior|synchro|texta|theinhardt|trio|trivia|trim\b|tf opicular|tt commons|tt firs|tt mussels|tt norms|tenez|ulm|union|unit pro|unit slab|uomo|wise sans|averta|aveny|azo|agipo|agrandir|agentur|adieu|adria|andes|argn|argumentum|arimo|arquitecta|ars maquette|artifex|athletics|az[b]uka|benton|cartel|carter|caros|coduit|cukier|ferry|flama|freya|fugue|function|gerstner|giorgio|gza|hiruko|houston|heliacore|linco|maax|magallanes|marr|mier|mondwest|mr.? porter|neusa|new.forest|novecento|random|rhode|robinson|rois|saol|scan|solomon|sterling|super grot|timmons|trash|traulha|vectro|cervo)", re.I), "sans"),
]

# OS/2 sFamilyClass mapping
# High byte = class, low byte = subclass
FAMILY_CLASS_MAP = {
    1: "serif",   # Oldstyle Serifs
    2: "serif",   # Transitional Serifs
    3: "serif",   # Modern Serifs
    4: "serif",   # Clarendon Serifs
    5: "serif",   # Slab Serifs
    7: "serif",   # Freeform Serifs
    8: "sans",    # Sans Serif
    9: "display", # Ornamentals
    10: "script", # Scripts
    12: "display", # Symbolic
}


def classify_by_metadata(font_path: Path) -> str | None:
    """Try to classify using font OS/2 and panose tables."""
    try:
        font = TTFont(str(font_path), lazy=True)

        if "OS/2" in font:
            os2 = font["OS/2"]

            # sFamilyClass
            family_class = os2.sFamilyClass >> 8  # high byte
            if family_class in FAMILY_CLASS_MAP:
                result = FAMILY_CLASS_MAP[family_class]
                font.close()
                return result

            # Panose
            if hasattr(os2, "panose"):
                p = os2.panose
                if p.bFamilyType == 3:  # Latin Hand Written
                    font.close()
                    return "script"
                if p.bFamilyType == 4:  # Latin Decoratives
                    font.close()
                    return "display"
                if p.bFamilyType == 2:  # Latin Text
                    # bSerifStyle: 11-15 = sans serif
                    if p.bSerifStyle >= 11:
                        font.close()
                        return "sans"
                    elif 2 <= p.bSerifStyle <= 10:
                        font.close()
                        return "serif"

        font.close()
    except Exception:
        pass
    return None


def classify_by_name(family_name: str) -> str | None:
    """Classify using name heuristics."""
    for pattern, category in NAME_RULES:
        if pattern.search(family_name):
            return category
    return None


def classify_family(family_dir: Path) -> str:
    """Classify a font family, combining name and metadata signals."""
    name = family_dir.name

    # Name heuristics first (high confidence for known patterns)
    name_result = classify_by_name(name)

    # Try metadata on first font file found
    meta_result = None
    for f in family_dir.iterdir():
        if f.suffix.lower() in {".otf", ".ttf"} and f.is_file():
            meta_result = classify_by_metadata(f)
            if meta_result:
                break

    # If both agree, high confidence
    if name_result and meta_result and name_result == meta_result:
        return name_result

    # Name heuristics are generally more reliable for well-known fonts
    if name_result:
        return name_result

    # Fall back to metadata
    if meta_result:
        return meta_result

    return "_unsorted"


def main():
    if not UNSORTED.exists():
        print(f"ERROR: {UNSORTED} not found")
        return

    families = sorted([d for d in UNSORTED.iterdir() if d.is_dir()])
    print(f"Classifying {len(families)} unsorted families...\n")

    moves: dict[str, list[str]] = {}
    still_unsorted = []

    for family_dir in families:
        category = classify_family(family_dir)
        if category == "_unsorted":
            still_unsorted.append(family_dir.name)
        else:
            if category not in moves:
                moves[category] = []
            moves[category].append(family_dir.name)

    # Print plan
    total_classified = sum(len(v) for v in moves.values())
    print(f"Can classify {total_classified}/{len(families)} families:\n")

    for cat in sorted(moves.keys()):
        print(f"  {cat}/ ({len(moves[cat])} families):")
        for name in sorted(moves[cat]):
            print(f"    {name}")
        print()

    if still_unsorted:
        print(f"  Still unsorted ({len(still_unsorted)}):")
        for name in sorted(still_unsorted):
            print(f"    {name}")
        print()

    # Ask for confirmation
    answer = input(f"Move {total_classified} families? [y/N] ").strip().lower()
    if answer != "y":
        print("Aborted.")
        return

    # Execute moves
    moved = 0
    for cat, names in moves.items():
        dest_dir = BASE / cat
        dest_dir.mkdir(exist_ok=True)
        for name in names:
            src = UNSORTED / name
            dst = dest_dir / name
            if src.exists() and not dst.exists():
                shutil.move(str(src), str(dst))
                moved += 1
                print(f"  Moved {name} -> {cat}/")

    print(f"\nDone! Moved {moved} families.")


if __name__ == "__main__":
    main()
