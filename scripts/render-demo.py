"""Render a demo video from the recorded terminal output, with readable holds.

This is a terminal replay, not a claim of a live API or screen capture.
Requires Pillow and ffmpeg. Frames are derived solely from the .cast recording.
"""
import json
import pathlib
import subprocess
import textwrap
from PIL import Image, ImageDraw, ImageFont

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'demo-output'
events = [json.loads(line) for line in (out / 'demo.cast').read_text().splitlines()[1:]]
recorded = ''.join(event[2] for event in events).replace('\r\n', '\n')
lines = []
for line in recorded.splitlines():
    lines.extend(textwrap.wrap(line, width=100, replace_whitespace=False) or [''])
font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 19)
title_font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 24)
frames = out / 'frames'
frames.mkdir(exist_ok=True)
for index in range(40):
    # Extend the short real run into a readable 20s replay. Preserve line order.
    count = max(1, round(len(lines) * min((index + 1) / 27, 1)))
    canvas = Image.new('RGB', (1280, 1000), '#101820')
    draw = ImageDraw.Draw(canvas)
    draw.text((32, 24), 'GibWork Evidence | 404khai', font=title_font, fill='#85e8c1')
    draw.text((32, 66), 'Actual CLI output replay - offline SDK fixture - $0 spent', font=font, fill='#a8bbcb')
    draw.line((32, 107, 1248, 107), fill='#354553', width=2)
    for row, line in enumerate(lines[:count][-31:]):
        color = '#ffcf7a' if 'BLOCKER' in line else '#e4ecf2'
        if 'PASS' in line or 'DETECTED' in line:
            color = '#85e8c1'
        draw.text((32, 128 + row * 25), line, font=font, fill=color)
    draw.text((32, 947), 'Fixture funding is synthetic. No submission or payout occurred.', font=font, fill='#a8bbcb')
    canvas.save(frames / f'{index:04d}.png')
canvas.save(out / 'terminal-replay.png')
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','2','-i',str(frames / '%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-r','24','-movflags','+faststart',str(out / 'demo.mp4')], check=True)
print(out / 'demo.mp4')
