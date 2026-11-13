# Cellular / Worley 噪声改动产物（output/）

本目录的所有数据都由仓库自带入口和依赖生成，可复现。

## 代码与测试产物
- `raw/demo.txt`：`createCellular2D/3D` 的真实 API 输出（F1/F2、三种距离度量）。
- `raw/mocha-full.txt`：`npx mocha` 完整输出，共 56 项测试通过。
- `raw/repro-run1.txt`、`raw/repro-run2.txt`、`raw/repro-verdict.txt`：
  两个独立进程使用同一 seed 的输出，`diff` 结果为逐位一致。
- `raw/benchmark.txt`：固定 256×256 网格性能基准原始输出。

## 纹理样图（384×384，带中文标题）
- `stone-cellular2D-f1.png`：2D F1 最近特征点距离。
- `stone-cellular2D-f2-minus-f1.png`：F2−F1，石材/裂纹所需的胞腔边界。
- `stone-cellular2D-manhattan.png`、`stone-cellular2D-chebyshev.png`：另两种距离度量。
- `stone-cellular2D-four-points.png`：每格 4 个特征点。
- `stone-cellular3D-f1-slice.png`：3D 噪声在 z=0.5 的切片。
- `comparison-simplex2D.png`：对照，单纯形噪声无法形成胞腔花纹。

## 特征点数量对耗时的影响曲线
- `feature-points-timing-curve.png`：随 `pointsPerCell` 增长的耗时倍数曲线（2D/3D）。
- `feature-points-timing.csv`、`benchmark-data.json`：同一份数据的表格与结构化形式。

## 分段录屏（每段带中文标题卡）
- `videos/segment-01.mp4`：需求与方案（复用 simplex 哈希底座）。
- `videos/segment-02.mp4`：API 演示（2D/3D、F1/F2、度量切换、特征点数）。
- `videos/segment-03.mp4`：仓库入口测试 `npx mocha`（56 项）。
- `videos/segment-04.mp4`：固定网格性能基准与预算结论。
- `videos/segment-05.mp4`：同 seed 跨进程可复现。
- `videos/cellular-noise-full.mp4`：以上五段的合集。
- `titles/`、`frames/`：录屏使用的标题卡与内容帧。

## 一键再生成
```bash
npm run build
node --random_seed=1 --hash_seed=1 --expose-gc perf/cellular-benchmark.js
node perf/render-output.js
python3 perf/annotate-output.py
python3 perf/make-titles.py
python3 perf/render-terminal.py
python3 perf/render-section1.py
bash perf/build-videos.sh
```

## 性能预算说明（实测中位数，256×256 网格）
- 2D 默认 `pointsPerCell=1`：约 1.4–1.7× simplex，满足不超过 3 倍的要求。
- 3D 默认 `pointsPerCell=1`：约 3.3–3.7× simplex。3D 为保证 F2 正确必须搜索
  3×3×3=27 个邻域格（simplex 3D 只评估 4 个四面体角点），这是该算法的固有工作量；
  在 64/128 小网格下约 3.0×，256 网格约 3.4×，512 网格约 3.6×。
  已通过 jitter 表、度量分支外提、内层展开、结果对象复用等手段压到该地板。
