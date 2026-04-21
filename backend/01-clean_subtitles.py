import webvtt
import re


def clean_vtt_text(text):
    # Remove inline timing tags like <00:00:01.199><c> and </c>
    text = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d+>", "", text)
    text = re.sub(r"</?c>", "", text)
    return text.strip()


def extract_subtitles(vtt_file):
    captions = []
    seen = set()

    for caption in webvtt.read(vtt_file):
        text = clean_vtt_text(caption.text)
        # Deduplicate repeated lines (common in format 1)
        lines = text.split("\n")
        unique_lines = []
        for line in lines:
            if line and line not in seen:
                unique_lines.append(line)
                seen.add(line)
        if unique_lines:
            captions.append(" ".join(unique_lines))

    return "\n".join(captions)


# Usage
print(
    extract_subtitles(
        "./subtitles/Supermarket in Slow German ｜ Super Easy German 288.de.vtt"
    )
)
