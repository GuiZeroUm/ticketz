"""Build the static OneWorks avatar catalog with SVG filters intact.

Requires Python 3.12, Pillow 12.3.0 and Node.js. The pinned upstream archive
and @resvg/resvg-js are used only while generating assets, never at runtime.
"""

import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image


REVISION = "a06ba84c123cf82e2b1a59c36b403392e22f9d08"
RESVG_VERSION = "2.6.2"
COUNT = 512
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "avatars" / "oneworks" / "v1"
ARCHIVE_URL = f"https://github.com/oneworks-ai/avatar/archive/{REVISION}.zip"
BACKGROUNDS = (
    "#82b8d2", "#f7b955", "#9ac4a5", "#d8a4b8",
    "#9fb2d6", "#e6b493", "#9cc8c1", "#c5abe0",
    "#e4cb8f", "#9fbe9c", "#dca9a0", "#98b2d4",
)


def main():
    request = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "ticketz-avatar-generator"})
    with urllib.request.urlopen(request, timeout=120) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))

    # Breed and species cards are the cheerful faces shown in the OneWorks
    # gallery. Pixel variants and animation covers have a different style.
    source_files = sorted(
        name for name in archive.namelist()
        if name.endswith(".svg")
        and "/src/avatarPresetSnapshots/" in name
        and "/pixel/" not in name
    )
    if len(source_files) < 150:
        raise RuntimeError(f"Expected at least 150 OneWorks presets; got {len(source_files)}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries = []
    with tempfile.TemporaryDirectory(prefix="ticketz-oneworks-") as temporary:
        work = Path(temporary)
        subprocess.run(
            [shutil.which("npm.cmd" if os.name == "nt" else "npm"), "install", "--prefix", str(work), "--no-save", f"@resvg/resvg-js@{RESVG_VERSION}"],
            check=True,
        )
        for index in range(COUNT):
            source = source_files[index % len(source_files)]
            variant = index // len(source_files)
            background = BACKGROUNDS[(index % len(source_files) + variant * 5) % len(BACKGROUNDS)]
            svg = archive.read(source).decode("utf-8")
            svg, count = re.subn(
                r'(<rect width="420" height="420" rx="34" fill=")[^"]+',
                lambda match: match.group(1) + background,
                svg,
                count=1,
            )
            if count != 1:
                raise RuntimeError(f"Missing card background: {source}")
            # Gallery thumbnails deliberately crop the animal for a large-card
            # layout. Center the whole character for 32–72px UI avatars.
            svg, count = re.subn(
                r'(<g filter="url\(#[^\"]+\)" transform=")[^"]+',
                r'\g<1>translate(210 210) scale(1.15) translate(-210 -210)',
                svg,
                count=1,
            )
            if count != 1:
                raise RuntimeError(f"Missing character transform: {source}")
            svg_path = work / f"{index:03d}.svg"
            svg_path.write_text(svg, encoding="utf-8")
            entries.append({
                "file": f"{index:03d}.webp",
                "source": source.split("/src/", 1)[1],
                "variant": variant,
                "background": background,
            })

        subprocess.run(
            ["node", str(Path(__file__).with_name("render-oneworks-svg.cjs")),
             str(work / "node_modules" / "@resvg" / "resvg-js"), str(work)],
            check=True,
        )
        for entry in entries:
            png = work / entry["file"].replace(".webp", ".png")
            path = OUTPUT / entry["file"]
            with Image.open(png) as image:
                image.convert("RGB").save(path, "WEBP", quality=90, method=6)
            entry["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()

    manifest = {
        "source": "https://github.com/oneworks-ai/avatar",
        "revision": REVISION,
        "renderer": f"@resvg/resvg-js@{RESVG_VERSION}",
        "license": "MIT",
        "size": 256,
        "count": COUNT,
        "entries": entries,
    }
    license_path = next(name for name in archive.namelist() if name.endswith("/LICENSE"))
    (OUTPUT.parent / "LICENSE.oneworks.txt").write_bytes(archive.read(license_path))
    (OUTPUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {COUNT} avatars in {OUTPUT}")


if __name__ == "__main__":
    main()
