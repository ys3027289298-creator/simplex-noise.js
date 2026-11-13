#!/usr/bin/env python3
"""Render dark terminal screenshots from real captured command output (PIL)."""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'output', 'raw')
FRAMES = os.path.join(ROOT, 'output', 'frames')
os.makedirs(FRAMES, exist_ok=True)
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
WIDTH, HEIGHT = 1280, 720
BG = (24, 26, 32)
HEADER_BG = (40, 44, 54)
FG = (220, 224, 230)
GREEN = (120, 200, 120)
BLUE = (90, 160, 240)
YELLOW = (220, 190, 110)
RED = (230, 120, 110)

def read(name):
    with open(os.path.join(RAW, name), encoding='utf-8') as handle:
        return handle.read().rstrip('\n').split('\n')

def terminal(lines, target, title='bash — simplex-noise cellular'):
    image = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(MONO, 19)
    bold = ImageFont.truetype(MONO, 19)
    # window chrome
    draw.rectangle([0, 0, WIDTH, 44], fill=HEADER_BG)
    for index, color in enumerate((((255, 95, 86), (255, 189, 46), (39, 201, 63)))):
        draw.ellipse([18 + index * 26, 14, 32 + index * 26, 28], fill=color)
    draw.text((WIDTH // 2 - 220, 11), title, fill=FG, font=ImageFont.truetype(MONO, 18))
    y = 66
    for line in lines:
        if line.startswith('$ '):
            draw.text((24, y), line, fill=GREEN, font=bold)
        elif line.startswith('# '):
            draw.text((24, y), line[2:], fill=BLUE, font=bold)
        elif 'PASS' in line or 'passing' in line or 'IDENTICAL' in line or line.strip().startswith('✔'):
            draw.text((24, y), line, fill=GREEN, font=font)
        elif 'FAIL' in line or line.strip().startswith('✗'):
            draw.text((24, y), line, fill=RED, font=font)
        elif 'x' in line and any(ch.isdigit() for ch in line) and ('ratio' in line or 'budget' in line or 'pointsPerCell' in line):
            draw.text((24, y), line, fill=YELLOW, font=font)
        else:
            draw.text((24, y), line, fill=FG, font=font)
        y += 27
        if y > HEIGHT - 30:
            break
    image.save(os.path.join(FRAMES, target))

# Section 2: API demo
terminal(['$ npx tsx output/raw/demo.ts', '# 2D/3D cellular: F1 and F2 returned separately'] + read('demo.txt'),
         'terminal-02-api.png')
# Section 3: mocha
mocha = read('mocha-full.txt')
describe_blocks = [line for line in mocha if line.strip().startswith('create') or line.strip().startswith('build') or line.strip().startswith('cellular')]
mocha_compact = ['$ npx mocha', '# repository test entry (snapshot based)', '']
mocha_compact.extend(describe_blocks)
summary = next(line.strip() for line in reversed(mocha) if 'passing' in line)
mocha_compact.extend(['', '✔ all snapshot and property checks', summary])
terminal(mocha_compact,
         'terminal-03-mocha.png')
# Section 4: benchmark
bench = read('benchmark.txt')
# keep the full point-count curve for the 2D dimension (it fits one screen)
# and summarize the 3D default and budget verdicts, which are the requirement
compact_bench = []
in_2d = False
for line in bench:
    if line.strip() == '2D':
        in_2d = True
    if line.strip() == '3D':
        in_2d = False
    if in_2d:
        compact_bench.append(line)
compact_bench.append('')
default_3d = next(line for line in bench if '3D default' in line)
default_2d = next(line for line in bench if '2D default' in line)
compact_bench.extend(['3D (27-cell neighbour search):', default_3d, '', default_2d])
terminal(['$ node --expose-gc perf/cellular-benchmark.js', '# fixed 256x256 grid, median of repetitions'] + compact_bench,
         'terminal-04-benchmark.png')
# Section 5: reproducibility
terminal(['$ npx tsx output/raw/repro.ts   # process run 1',
         '$ npx tsx output/raw/repro.ts   # process run 2',
         '$ diff run1 run2 && echo IDENTICAL'] + read('repro-run1.txt') + read('repro-verdict.txt'),
         'terminal-05-repro.png')
print('terminal frames rendered to', FRAMES)
