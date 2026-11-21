import webvtt
import re


def clean_vtt_text(text):
    text = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d+>", "", text)
    text = re.sub(r"</?c>", "", text)
    return text.strip()


def vtt_seconds(ts):
    """'01:02:03.500' or '02:03.500' -> seconds (webvtt's start_in_seconds truncates to whole seconds)."""
    secs = 0.0
    for part in ts.split(":"):
        secs = secs * 60 + float(part)
    return secs


def extract_cues(vtt_file):
    """Deduplicated cues as {start, end, text} (seconds); the rules the reader text always used."""
    cues = []
    prev = set()
    for caption in webvtt.read(vtt_file):
        text = clean_vtt_text(caption.text)
        lines = text.split("\n")
        # auto-captions scroll: a cue repeats the previous cue's lines; only drop those
        unique_lines = [line for line in lines if line and line not in prev]
        prev = set(lines)
        if unique_lines:
            cues.append(
                {
                    "start": vtt_seconds(caption.start),
                    "end": vtt_seconds(caption.end),
                    "text": " ".join(unique_lines),
                }
            )
    return cues


def extract_subtitles(vtt_file):
    return "\n".join(c["text"] for c in extract_cues(vtt_file))
