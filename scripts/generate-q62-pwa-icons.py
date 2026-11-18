#!/usr/bin/env python3
"""Generate bitmaps ONLY from official DLI SVG's embedded WebP source."""
import base64, io, pathlib, re
from PIL import Image, ImageDraw
ROOT=pathlib.Path(__file__).resolve().parents[1]
svg=(ROOT/"public/dli-mark.svg").read_text(encoding="utf8")
found=re.search(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',svg)
if not found:
    raise SystemExit("Official DLI logo embedded bitmap not found; no generated substitutes")
im=Image.open(io.BytesIO(base64.b64decode(found.group(1)))).convert("RGBA")
for size in (192,512):
    # Use the official logo without modifying its form or colours. Maskable
    # icon padding prevents an OS circular crop cutting off the open book.
    canvas=Image.new("RGBA",(size,size),(8,40,119,255))
    mark=int(size*.70)
    resized=im.resize((mark,mark),Image.Resampling.LANCZOS)
    x=y=(size-mark)//2
    canvas.alpha_composite(resized,(x,y))
    target=ROOT/"public"/f"dli-icon-{size}.png"
    canvas.convert("RGB").save(target,format="PNG",optimize=True)
    print(f"Created {target.name}: {size}x{size} from official DLI source")
