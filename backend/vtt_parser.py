import webvtt
import re


def clean_vtt_text(text):
    text = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d+>", "", text)
    text = re.sub(r"</?c>", "", text)
    return text.strip()


def extract_subtitles(vtt_file):
    captions = []
    seen = set()
    for caption in webvtt.read(vtt_file):
        text = clean_vtt_text(caption.text)
        lines = text.split("\n")
        unique_lines = []
        for line in lines:
            if line and line not in seen:
                unique_lines.append(line)
                seen.add(line)
        if unique_lines:
            captions.append(" ".join(unique_lines))
    return "\n".join(captions)
