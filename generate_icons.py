#!/usr/bin/env python3
"""Generate placeholder icons for the Chrome extension."""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("PIL/Pillow not installed. Installing...")
    import subprocess
    subprocess.check_call(["pip", "install", "pillow"])
    from PIL import Image, ImageDraw, ImageFont

def create_icon(size, filename):
    """Create a simple icon with a document/markdown symbol."""
    img = Image.new('RGB', (size, size), color='#2563eb')
    draw = ImageDraw.Draw(img)

    # Draw a simple document shape
    margin = size // 4
    draw.rectangle(
        [margin, margin, size - margin, size - margin],
        fill='white',
        outline='#1e40af',
        width=max(1, size // 32)
    )

    # Draw lines to represent text
    line_margin = margin + size // 8
    line_spacing = size // 8
    for i in range(3):
        y = margin + line_margin + (i * line_spacing)
        if y < size - margin - line_margin:
            draw.line(
                [line_margin, y, size - line_margin, y],
                fill='#2563eb',
                width=max(1, size // 32)
            )

    img.save(filename, 'PNG')
    print(f"Created {filename}")

if __name__ == '__main__':
    import os
    os.chdir('public/icons')

    create_icon(16, 'icon16.png')
    create_icon(48, 'icon48.png')
    create_icon(128, 'icon128.png')

    print("All icons created successfully!")
