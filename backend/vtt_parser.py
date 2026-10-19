import webvtt
import re


def clean_vtt_text(text):
    text = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d+>", "", text)
    text = re.sub(r"</?c>", "", text)
    return text.strip()


def extract_subtitles(vtt_file):
    captions = []
    prev = set()
    for caption in webvtt.read(vtt_file):
        text = clean_vtt_text(caption.text)
        lines = text.split("\n")
        # auto-captions scroll: a cue repeats the previous cue's lines; only drop those
        unique_lines = [line for line in lines if line and line not in prev]
        prev = set(lines)
        if unique_lines:
            captions.append(" ".join(unique_lines))
    return "\n".join(captions)
