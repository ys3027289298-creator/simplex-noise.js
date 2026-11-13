#!/usr/bin/env python3
"""Render section title cards (Chinese) for the segmented screen recording."""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'output', 'titles')
os.makedirs(OUT, exist_ok=True)
FONT = '/mnt/c/Windows/Fonts/simhei.ttf'
WIDTH, HEIGHT = 1280, 720

sections = [
    ('01', '需求与方案：新增 Worley/细胞噪声，复用 simplex 哈希底座'),
    ('02', 'API 演示：2D/3D、F1 与 F2、三种距离度量、每格特征点数'),
    ('03', '仓库自带入口验证：mocha 56 项测试与图像快照'),
    ('04', '性能基准：固定网格耗时与特征点数量影响曲线'),
    ('05', '可复现性：同 seed 跨进程逐位一致'),
]

for index, (number, title) in enumerate(sections, start=1):
    image = Image.new('RGB', (WIDTH, HEIGHT), (24, 28, 38))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, 14, HEIGHT], fill=(52, 120, 210))
    draw.text((90, 220), f'第 {number} 段', fill=(120, 170, 240), font=ImageFont.truetype(FONT, 44))
    draw.text((90, 300), title, fill=(245, 247, 250), font=ImageFont.truetype(FONT, 40))
    draw.text((90, 420), 'simplex-noise.js · cellular noise 改动验证', fill=(150, 158, 170),
              font=ImageFont.truetype(FONT, 26))
    image.save(os.path.join(OUT, f'title-{number}.png'))
print('title cards written to', OUT)
