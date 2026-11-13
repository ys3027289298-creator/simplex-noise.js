#!/usr/bin/env bash
# Builds the segmented screen recordings (title card + content per section)
# with ffmpeg/libx264. Every section gets its own MP4 and a concatenated
# full recording is produced as well.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=output/videos
FRAMES=output/frames
TITLES=output/titles
mkdir -p "$OUT"
FPS=30

# section number : title card : content frame
sections=(
  "1 $TITLES/title-01.png $FRAMES/section-01-overview.png"
  "2 $TITLES/title-02.png $FRAMES/terminal-02-api.png"
  "3 $TITLES/title-03.png $FRAMES/terminal-03-mocha.png"
  "4 $TITLES/title-04.png $FRAMES/terminal-04-benchmark.png"
  "5 $TITLES/title-05.png $FRAMES/terminal-05-repro.png"
)

concat_list=()
for entry in "${sections[@]}"; do
  set -- $entry
  number=$1
  title=$2
  content=$3
  target="$OUT/segment-0$number.mp4"
  ffmpeg -hide_banner -loglevel error -y \
    -loop 1 -t 2 -i "$title" \
    -loop 1 -t 5 -i "$content" \
    -filter_complex "[0:v]fps=$FPS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v0]; \
                     [1:v]fps=$FPS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v1]; \
                     [v0][v1]concat=n=2:v=1:a=0[out]" \
    -map "[out]" -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 "$target"
  concat_list+=("file 'segment-0$number.mp4'")
done

printf '%s\n' "${concat_list[@]}" > "$OUT/concat.txt"
( cd "$OUT" && ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i concat.txt -c copy cellular-noise-full.mp4 )
rm -f "$OUT/concat.txt"
echo "videos written to $OUT"
