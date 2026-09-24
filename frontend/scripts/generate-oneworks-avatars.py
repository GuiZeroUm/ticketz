"""Build the static OneWorks fallback avatar catalog.

Run with Python 3.12 after installing Pillow==12.3.0 and CairoSVG==2.8.2.
The upstream archive is pinned; no OneWorks code runs in the frontend.
"""

import hashlib
import io
import json
import urllib.request
import zipfile
from pathlib import Path

import cairosvg
from PIL import Image


REVISION = "a06ba84c123cf82e2b1a59c36b403392e22f9d08"
COUNT = 512
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "avatars" / "oneworks" / "v1"
ARCHIVE_URL = f"https://github.com/oneworks-ai/avatar/archive/{REVISION}.zip"


def render(svg_bytes, hue_shift):
    png = cairosvg.svg2png(bytestring=svg_bytes, output_width=256, output_height=256)
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    if hue_shift:
        rgb = image.convert("RGB").convert("HSV")
        h, s, v = rgb.split()
        h = h.point(lambda value: (value + hue_shift) % 256)
        recolored = Image.merge("HSV", (h, s, v)).convert("RGB")
        recolored.putalpha(image.getchannel("A"))
        image = recolored
    return image


def main():
    request = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "ticketz-avatar-generator"})
    with urllib.request.urlopen(request, timeout=120) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))

    source_files = sorted(
        name for name in archive.namelist()
        if name.endswith(".svg") and (
            "/src/avatarPresetSnapshots/" in name
            or (
                "/src/avatarAnimationPresetCovers/" in name
                and ".frame-" not in name
            )
        )
    )
    if len(source_files) < 180:
        raise RuntimeError(f"Expected at least 180 OneWorks previews; got {len(source_files)}")

    # Character/breed presets come first; the remaining previews add expressions.
    source_files.sort(key=lambda name: ("avatarAnimationPresetCovers" in name, name))
    backgrounds = ("#e8f1fb", "#f8eee7", "#e9f4e9", "#f3eafa")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for index in range(COUNT):
        source = source_files[index % len(source_files)]
        variant = index // len(source_files)
        image = render(archive.read(source), variant * 19)
        background = Image.new("RGBA", (256, 256), backgrounds[variant % len(backgrounds)])
        image = Image.alpha_composite(background, image)
        filename = f"{index:03d}.webp"
        path = OUTPUT / filename
        image.save(path, "WEBP", quality=86, method=6)
        entries.append({
            "file": filename,
            "source": source.split("/src/", 1)[1],
            "variant": variant,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        })

    manifest = {
        "source": "https://github.com/oneworks-ai/avatar",
        "revision": REVISION,
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
