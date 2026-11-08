"""Icône PROVISOIRE et neutre (aucune identité graphique) : sera remplacée par la direction artistique."""
import sys
from PIL import Image, ImageDraw, ImageFont

taille = 1024
img = Image.new("RGBA", (taille, taille), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([64, 64, taille - 64, taille - 64], radius=180, fill=(31, 33, 37, 255))
police = None
for chemin in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
    try:
        police = ImageFont.truetype(chemin, 440)
    except OSError:
        pass
police = police or ImageFont.load_default()
d.text((taille / 2, taille / 2), "35", font=police, fill=(230, 231, 234, 255), anchor="mm")
img.save(sys.argv[1])
