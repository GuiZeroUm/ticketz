# OneWorks avatar catalog

The 512 static WebP illustrations in `v1/` were derived from the [OneWorks
Avatar](https://github.com/oneworks-ai/avatar) preset and animation previews at
revision `a06ba84c123cf82e2b1a59c36b403392e22f9d08`. The upstream artwork
is MIT licensed; its copyright notice and license are in `LICENSE.oneworks.txt`.

To regenerate with Python 3.12:

```sh
python -m pip install Pillow==12.3.0 CairoSVG==2.8.2
python frontend/scripts/generate-oneworks-avatars.py
```

Each file is 256 × 256 pixels. `v1/manifest.json` records its source preview,
color variant and SHA-256 digest. The browser loads just the selected image;
neither the OneWorks editor nor its renderer is shipped to the frontend.
