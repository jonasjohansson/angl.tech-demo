#!/usr/bin/env python3
"""
Group font families into foundry subfolders within their classification category.
e.g. sans/GT America -> sans/Grilli Type/GT America
Only groups foundries with 2+ families. Singles stay at category root.
"""

import os
import shutil
from pathlib import Path
from collections import defaultdict
from fontTools.ttLib import TTFont

BASE = Path(os.path.expanduser("~/Documents/fonts-organized"))

# Normalize variant foundry names from metadata to canonical names
FOUNDRY_NORMALIZE = {
    "Commercial Type": "Commercial Type",
    "Commercial Type, Inc.": "Commercial Type",
    "Christian Schwartz & Paul Barnes": "Commercial Type",
    "Klim Type Foundry": "Klim",
    "Kris Sowersby": "Klim",
    "Grilli Type GmbH": "Grilli Type",
    "Grilli Type": "Grilli Type",
    "Reto Moser, Tobias Rechsteiner, Grilli Type": "Grilli Type",
    "Dinamo": "Dinamo",
    "Due Studio": "Schick Toikka",
    "Schick Toikka": "Schick Toikka",
    "Swiss Typefaces": "Swiss Typefaces",
    "Millieu Grotesque": "Milieu Grotesque",
    "Stefan Gandl": "NB Studio",
    "Neubau (Stefan Gandl)": "NB Studio",
    "Colophon Foundry": "Colophon",
    "The Entente (AS&EH)": "Colophon",
    "The Entente": "Colophon",
    "Connary Fagen": "Connary Fagen",
    "Optimo": "Optimo",
    "Hoefler & Frere-Jones": "Hoefler & Co",
    "Hoefler & Co.": "Hoefler & Co",
    "TypeType": "TypeType",
    "Linotype GmbH": "Linotype",
    "Monotype Imaging Inc.": "Monotype",
    "Adobe Systems Incorporated": "Adobe",
    "Radim Pesko": "Radim Pesko",
    "Berthold": "Berthold",
    "Canada Type": "Canada Type",
    "Indian Type Foundry": "Indian Type Foundry",
    "General Type Studio": "General Type Studio",
    "Stawix Foundry": "Stawix",
    "Letters from Sweden": "Letters from Sweden",
    "Bold Monday": "Bold Monday",
    "Dalton Maag Ltd": "Dalton Maag",
    "OurType": "OurType",
    "TIGHTYPE": "TIGHTYPE",
    "Fontstore Pte Ltd": "Fontstore",
    "Displaay": "Displaay",
    "FSI Fonts und Software GmbH": "FSI",
    "FSI": "FSI",
    "René Bieder": "René Bieder",
    "Rui Abreu": "Rui Abreu",
    "www.blazetype.eu": "Blaze Type",
    "Typonine": "Typonine",
    "MCKL": "MCKL",
    "The Northern Block Ltd.": "Northern Block",
    "House Industries": "House Industries",
    "Good Type Foundry": "Good Type Foundry",
    "OMSE TYPE": "OMSE",
    "Daniel Hernandez": "Latinotype",
    "Latinotype": "Latinotype",
    "Greg Shutters & Typetanic Fonts": "Typetanic",
    "TypeTogether": "TypeTogether",
    "Svetoslav Simov": "Fontfabric",
    "Nico Inosanto": "Nootype",
    "Set Sail Studios": "Set Sail Studios",
    "Henrik Kubel, A2/SW/HK + A2-TYPE": "A2 Type",
    "Sharp Type Co.": "Sharp Type",
    "Sharp Type": "Sharp Type",
    "International Typeface Corporation": "ITC",
}

# Manual overrides for fonts whose metadata doesn't have manufacturer
MANUAL_FOUNDRY = {
    "Favorit": "Dinamo",
    "Mondwest Neuebit": "Dinamo",
    "Action Condensed": "Commercial Type",
    "Atlas Typewriter": "Commercial Type",
    "Druk": "Commercial Type",
    "Stag": "Commercial Type",
    "Stag Sans": "Commercial Type",
    "Stag Stencil": "Commercial Type",
    "GT Pressura": "Grilli Type",
    "Financier Display": "Klim",
    "Heldane Display & Text": "Klim",
    "TiemposText": "Klim",
    "TiemposHeadline": "Klim",
    "National": "Klim",
    "Untitled Serif": "Klim",
    "Founders Grotesk_Mono": "Klim",
    "Akkurat": "Lineto",
    "Replica": "Lineto",
    "Maison Neue": "Milieu Grotesque",
    "Maison Neue Extended": "Milieu Grotesque",
    "Sharp": "Sharp Type",
    "Sharp Sans No 1 2": "Sharp Type",
    "SharpGrotesk": "Sharp Type",
    "Apercu": "Colophon",
    "Apercu Pro": "Colophon",
    "Noe Display": "Schick Toikka",
    "Noe Text": "Schick Toikka",
    "NoeText": "Schick Toikka",
    "Saol Display 2": "Schick Toikka",
    "Saol Text 2": "Schick Toikka",
    "Chap": "Schick Toikka",
    "Scto Grotesk A": "Schick Toikka",
    "IBM": "Bold Monday",
    "IBM Plex": "Bold Monday",
    "Sequel": "OGJ Type Design",
    "Sequel 100 Wide Family 2": "OGJ Type Design",
    "ITC Avant Garde": "ITC",
    "ITC Caslon 224": "ITC",
    "ITC Grouch": "ITC",
    "ITC New Veljovic Pro 2": "ITC",
    "ITC Serif Gothic": "ITC",
    "ITC Souvenir": "ITC",
    "FF Clan Pro": "FSI",
    "FF Mark": "FSI",
    "FF Tisa": "FSI",
    "Heimat-Mono": "MCKL",
    "Heimat-Sans": "MCKL",
    "Heimat-Stencil": "MCKL",
    "Google Sans": "Google",
    "Noto_Sans": "Google",
    "Roboto": "Google",
    "Roboto_Condensed 2": "Google",
    "San Fransisco": "Apple",
    "NB Akademie": "NB Studio",
    "NB Architekt Std": "NB Studio",
    "NB Grotesk Pro": "NB Studio",
    "NB International Pro Edition 2": "NB Studio",
    "NB National Std": "NB Studio",
    "NB Plan Pro": "NB Studio",
    "NB-Typewriter Pro 35-75™ Package": "NB Studio",
    "TT Commons": "TypeType",
    "TT Firs Neue": "TypeType",
    "TT Mussels": "TypeType",
    "TT Norms": "TypeType",
    "Stawix Amsi Pro": "Stawix",
    "Stawix Amsi Pro Cond": "Stawix",
    "Stawix Amsi Pro Narw": "Stawix",
    "Apoc Display": "Blaze Type",
    "Apoc LC": "Blaze Type",
    "Nocturno Display Pro": "Typonine",
    "Nocturno Text Pro": "Typonine",
    "Suisse BP": "Swiss Typefaces",
    "Suisse Int'l Font Family @ Swiss Typefaces": "Swiss Typefaces",
    "SangBleu": "Swiss Typefaces",
    "Simplon": "Swiss Typefaces",
    "Funkis ABC": "Letters from Sweden",
    "Ivar": "Letters from Sweden",
    "Mikro": "Letters from Sweden",
    "Trim": "Letters from Sweden",
    "Trim Poster": "Letters from Sweden",
    "Garamond Premier Pro": "Adobe",
    "Minion": "Adobe",
    "Source Serif Pro": "Adobe",
    "Acumin": "Adobe",
    "Sentinel": "Hoefler & Co",
    "Archer": "Hoefler & Co",
    "Mercury": "Hoefler & Co",
    "Ideal-Sans": "Hoefler & Co",
    "Idlewild": "Hoefler & Co",
    "Mallory_H&F": "Hoefler & Co",
    "Surveyor Pro": "Hoefler & Co",
    "Inkwell": "Hoefler & Co",
    "Artifex_CF": "Connary Fagen",
    "Integral CF": "Connary Fagen",
    "Roxborough_CF": "Connary Fagen",
    "Gryffith CF": "Connary Fagen",
    "Argent CF": "Connary Fagen",
    "The Harriet Series @ Okay Type": "Okay Type",
    "Font Bureau - Benton Sans Complete (128xOTF)": "Font Bureau",
    "Theinhardt": "Optimo",
    "Stanley": "Optimo",
    "Next (Optimo Type)": "Optimo",
    "Formular": "Production Type",
    "Agrandir": "Displaay",
    "Morion": "Displaay",
    "Matter": "Displaay",
    "Moderat": "TIGHTYPE",
    "Sneak": "TIGHTYPE",
    "Radikal": "Nootype",
    "Campton": "René Bieder",
    "RB Rat 2": "René Bieder",
    "DINAMO Trial Fonts": "Dinamo",
    "Grifo": "Rui Abreu",
    "Azo Sans Font Family": "Rui Abreu",
    "Arnhem Pro": "OurType",
    "Fakt Pro": "OurType",
    "Aktiv Grotesk": "Dalton Maag",
    "Netflix Sans": "Dalton Maag",
}


def get_foundry_from_metadata(family_dir):
    """Try to get manufacturer from the first font file's name table."""
    for f in family_dir.iterdir():
        if f.suffix.lower() in {".otf", ".ttf"} and f.is_file():
            try:
                font = TTFont(str(f), lazy=True)
                manufacturer = ""
                for rec in font["name"].names:
                    try:
                        if rec.nameID == 8 and not manufacturer:
                            manufacturer = rec.toUnicode().strip()
                    except Exception:
                        pass
                font.close()
                if manufacturer:
                    return FOUNDRY_NORMALIZE.get(manufacturer, manufacturer)
            except Exception:
                pass
            break
    return None


def main():
    # Build family -> foundry map
    family_foundry = {}

    for cat_dir in sorted(BASE.iterdir()):
        if not cat_dir.is_dir():
            continue
        for fam_dir in sorted(cat_dir.iterdir()):
            if not fam_dir.is_dir():
                continue
            name = fam_dir.name

            # Manual override first
            if name in MANUAL_FOUNDRY:
                family_foundry[(cat_dir.name, name)] = MANUAL_FOUNDRY[name]
            else:
                # Try metadata
                foundry = get_foundry_from_metadata(fam_dir)
                if foundry:
                    family_foundry[(cat_dir.name, name)] = foundry

    # Count families per foundry (across all categories)
    foundry_counts = defaultdict(int)
    for (cat, name), foundry in family_foundry.items():
        foundry_counts[foundry] += 1

    # Only create foundry folders for foundries with 2+ families
    eligible_foundries = {f for f, c in foundry_counts.items() if c >= 2}

    # Plan moves
    moves = []
    for (cat, name), foundry in sorted(family_foundry.items()):
        if foundry in eligible_foundries:
            src = BASE / cat / name
            dst = BASE / cat / foundry / name
            if src.exists() and not dst.exists():
                moves.append((src, dst, cat, foundry, name))

    print(f"Will group {len(moves)} families into foundry subfolders")
    print(f"({len(eligible_foundries)} foundries with 2+ families)\n")

    # Show plan
    by_foundry = defaultdict(list)
    for src, dst, cat, foundry, name in moves:
        by_foundry[foundry].append(f"  {cat}/{foundry}/{name}")

    for foundry in sorted(by_foundry.keys()):
        items = by_foundry[foundry]
        print(f"{foundry} ({len(items)}):")
        for item in items:
            print(item)
        print()

    answer = input(f"Execute {len(moves)} moves? [y/N] ").strip().lower()
    if answer != "y":
        print("Aborted.")
        return

    done = 0
    for src, dst, cat, foundry, name in moves:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        done += 1

    print(f"\nMoved {done} families into foundry subfolders.")


if __name__ == "__main__":
    main()
