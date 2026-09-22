"""Genera le icone PWA di Fitness Time Club (dark mode + rosso sportivo)."""
from PIL import Image, ImageDraw
import math

BG_DEEP = (8, 9, 10, 255)      # #08090a
RED = (229, 57, 53, 255)       # #e53935
RED_DARK = (211, 47, 47, 255)  # #d32f2f
WHITE = (255, 255, 255, 255)


def rounded_square(size, radius_ratio=0.22, bg=BG_DEEP):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=bg)
    return img, draw


def draw_dumbbell(draw, size, scale=1.0, color=RED, plate_color=WHITE):
    cx, cy = size / 2, size / 2
    bar_w = size * 0.46 * scale
    bar_h = size * 0.075 * scale
    draw.rounded_rectangle(
        [cx - bar_w / 2, cy - bar_h / 2, cx + bar_w / 2, cy + bar_h / 2],
        radius=bar_h / 2, fill=color,
    )
    plate_w = size * 0.11 * scale
    plate_h_outer = size * 0.34 * scale
    plate_h_inner = size * 0.24 * scale
    for side in (-1, 1):
        x_outer = cx + side * (bar_w / 2)
        x_inner = cx + side * (bar_w / 2 - plate_w * 0.55)
        # disco esterno (piu' grande)
        draw.rounded_rectangle(
            [x_outer - plate_w if side > 0 else x_outer,
             cy - plate_h_outer / 2,
             x_outer if side > 0 else x_outer + plate_w,
             cy + plate_h_outer / 2],
            radius=plate_w * 0.35, fill=color,
        )
        # disco interno (piu' piccolo, leggermente sovrapposto)
        draw.rounded_rectangle(
            [x_inner - plate_w * 0.8 if side > 0 else x_inner,
             cy - plate_h_inner / 2,
             x_inner if side > 0 else x_inner + plate_w * 0.8,
             cy + plate_h_inner / 2],
            radius=plate_w * 0.3, fill=plate_color,
        )


def make_icon(size, maskable=False, out_path=""):
    img, draw = rounded_square(size, radius_ratio=0.0 if maskable else 0.22)
    scale = 0.62 if maskable else 0.86
    draw_dumbbell(draw, size, scale=scale)
    img.save(out_path)
    print("saved", out_path, img.size)


if __name__ == "__main__":
    make_icon(192, maskable=False, out_path="icons/icon-192.png")
    make_icon(512, maskable=False, out_path="icons/icon-512.png")
    make_icon(512, maskable=True, out_path="icons/icon-512-maskable.png")
    make_icon(180, maskable=False, out_path="icons/apple-touch-icon.png")
    make_icon(32, maskable=False, out_path="icons/favicon-32.png")
