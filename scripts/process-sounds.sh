#!/usr/bin/env bash
# Turns raw sound files into the site's UI sounds.
#   in:  client/public/sounds/raw/**/*.{wav,flac,ogg,mp3,aif,aiff,webm,m4a}   (raw/ is never deployed)
#        files under raw/ambient/ or raw/intro/ become beds (longer, kept as is); everything else is a UI sound
#   out: client/public/sounds/ui/<name>.webm + .mp3       (UI sounds:      aim < 30 KB each)
#        client/public/sounds/ambient/<name>.webm + .mp3  (ambient / intro beds: aim < 300 KB)
# Each file: leading and trailing silence trimmed, loudness normalised to about -16 LUFS (two-pass, linear),
# mono, then encoded to WebM/Opus (most browsers) with an MP3 fallback (Safari).
# Usage:  bash scripts/process-sounds.sh            (needs ffmpeg on PATH, or FFMPEG=/path/to/ffmpeg)
#         bash scripts/process-sounds.sh --force    (re-encode files that already exist)
# Licences: Kenney / soundcn files are CC0. Sonniss GameAudioGDC files are royalty free with no attribution,
# but must not be used for AI / ML training. List every file you add in client/public/sounds/CREDITS.md.
set -euo pipefail
FFMPEG="${FFMPEG:-ffmpeg}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/client/public/sounds/raw"
FORCE="${1:-}"
command -v "$FFMPEG" >/dev/null 2>&1 || [ -x "$FFMPEG" ] || { echo "ffmpeg not found. Install it, or run: FFMPEG=/path/to/ffmpeg bash scripts/process-sounds.sh"; exit 1; }
[ -d "$RAW" ] || { echo "No raw folder at $RAW"; exit 0; }

TRIM="silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.004,areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.03,areverse"
count=0; big=0
while IFS= read -r -d '' src; do
  rel="${src#"$RAW"/}"
  name="$(basename "${src%.*}" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9._-')"
  case "$rel" in ambient/*|intro/*) out="$ROOT/client/public/sounds/ambient"; limit=307200; bitrate=64k ;; *) out="$ROOT/client/public/sounds/ui"; limit=30720; bitrate=48k ;; esac
  mkdir -p "$out"
  if [ -z "$FORCE" ] && [ -f "$out/$name.webm" ] && [ -f "$out/$name.mp3" ] && [ "$out/$name.webm" -nt "$src" ]; then continue; fi
  # pass 1: measure loudness (short clicks are padded so the meter has enough to read, then trimmed again)
  stats="$("$FFMPEG" -nostdin -hide_banner -nostats -i "$src" -af "$TRIM,apad=whole_dur=3,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | tr -d '\r' | sed -n '/^{/,/^}/p')"
  get(){ printf '%s' "$stats" | grep "\"$1\"" | head -1 | sed -E 's/.*: *"?(-?[0-9.inf]+)"?.*/\1/'; }
  mi="$(get input_i)"; mtp="$(get input_tp)"; mlra="$(get input_lra)"; mth="$(get input_thresh)"; off="$(get target_offset)"
  if [ -n "$mi" ] && [ "$mi" != "-inf" ]; then
    NORM="loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:offset=$off:linear=true"
  else
    NORM="anull"   # silent or unreadable: leave the level alone
  fi
  # pass 2: apply, drop the padding again, mono
  "$FFMPEG" -nostdin -hide_banner -loglevel error -y -i "$src" -af "$TRIM,apad=whole_dur=3,$NORM,$TRIM" -ac 1 -ar 48000 -c:a libopus -b:a "$bitrate" -vbr on "$out/$name.webm"
  "$FFMPEG" -nostdin -hide_banner -loglevel error -y -i "$src" -af "$TRIM,apad=whole_dur=3,$NORM,$TRIM" -ac 1 -ar 44100 -c:a libmp3lame -q:a 5 "$out/$name.mp3"
  # a very short click can be trimmed away entirely: then keep it untrimmed (only normalised)
  if [ "$(wc -c < "$out/$name.mp3")" -lt 700 ]; then
    "$FFMPEG" -nostdin -hide_banner -loglevel error -y -i "$src" -af "$NORM" -ac 1 -ar 48000 -c:a libopus -b:a "$bitrate" -vbr on "$out/$name.webm"
    "$FFMPEG" -nostdin -hide_banner -loglevel error -y -i "$src" -af "$NORM" -ac 1 -ar 44100 -c:a libmp3lame -q:a 5 "$out/$name.mp3"
  fi
  for f in "$out/$name.webm" "$out/$name.mp3"; do
    size=$(wc -c < "$f"); if [ "$size" -gt "$limit" ]; then echo "  ! $(basename "$f") is $((size / 1024)) KB (budget $((limit / 1024)) KB): trim it or lower the bitrate"; big=$((big + 1)); fi
  done
  count=$((count + 1)); echo "  ✓ $rel → ${out#"$ROOT"/}/$name.{webm,mp3}"
done < <(find "$RAW" -type f \( -iname '*.wav' -o -iname '*.flac' -o -iname '*.ogg' -o -iname '*.mp3' -o -iname '*.aif' -o -iname '*.aiff' -o -iname '*.webm' -o -iname '*.m4a' \) -print0)
echo "Processed $count file(s)$([ "$big" -gt 0 ] && echo ", $big over budget")."
