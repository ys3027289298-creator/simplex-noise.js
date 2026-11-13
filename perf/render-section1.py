#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'output', 'frames')
FONT = '/mnt/c/Windows/Fonts/simhei.ttf'
W, H = 1280, 720
img = Image.new('RGB', (W, H), (245, 247, 250))
d = ImageDraw.Draw(img)
d.text((70, 60), '改动集中在 simplex-noise.ts 的少数几处', fill=(20, 24, 32), font=ImageFont.truetype(FONT, 38))
bullets = [
    '· 共用 fastFloor 与 buildPermutationTable 生成的 perm 表，不新增哈希底座',
    '· 新增代码只做：邻域特征点搜索 + F1/F2 距离组合',
    '· 2D 搜索 3×3 邻域，3D 搜索 3×3×3 邻域，保证 F2 正确',
    '· 距离度量可切换：euclidean / manhattan / chebyshev',
    '· 同 seed 经同一条 perm 表与确定性 LCG，跨进程逐位可复现',
    '· 原有 createNoise2D/3D/4D 一行未改，快照逐位不变',
]
y = 150
for text in bullets:
    d.text((90, y), text, fill=(45, 52, 64), font=ImageFont.truetype(FONT, 28))
    y += 72
d.rectangle([70, y + 10, W - 70, y + 150], outline=(180, 184, 190), width=2, fill=(255, 255, 255))
d.text((95, y + 28), '新增导出：createCellular2D / createCellular3D', fill=(38, 120, 210),
       font=ImageFont.truetype(FONT, 28))
d.text((95, y + 78), "返回 { f1, f2 }，options: { metric, pointsPerCell }", fill=(80, 88, 100),
       font=ImageFont.truetype(FONT, 26))
img.save(os.path.join(OUT, 'section-01-overview.png'))
print('section 1 frame rendered')
