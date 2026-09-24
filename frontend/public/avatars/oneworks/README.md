# OneWorks avatar catalog

The 512 static WebP illustrations in `v1/` were derived from the [OneWorks
Avatar](https://github.com/oneworks-ai/avatar) breed and species presets at
revision `a06ba84c123cf82e2b1a59c36b403392e22f9d08`. The upstream artwork
is MIT licensed; its copyright notice and license are in `LICENSE.oneworks.txt`.
The assets preserve the original SVG shadows and outlines. Background colors
vary while character colors remain unchanged.

To regenerate with Python 3.12:

```sh
python -m pip install Pillow==12.3.0
python frontend/scripts/generate-oneworks-avatars.py
```

The generator uses Node.js and temporarily installs `@resvg/resvg-js@2.6.2` to
render the source SVGs. Each file is 256 × 256 pixels. `v1/manifest.json`
records its source preview, background variant and SHA-256 digest. The browser
loads just the selected image; neither the OneWorks editor nor its renderer is
shipped to the frontend. The UI animates the avatar card on hover and opens a
larger preview on click. The `design=2` URL revision refreshes assets already
cached by browsers after the first release.
