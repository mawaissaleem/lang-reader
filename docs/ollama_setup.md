# Ollama setup (local AI)

This guide sets up [Ollama](https://ollama.com) so the side panel can explain a word in its sentence. Everything runs on your machine. No text is sent to an online AI service.

Ollama is optional. Without it, the PONS and LibreTranslate tabs work as usual.

## Contents

1. [What you get](#what-you-get)
2. [Hardware](#hardware)
3. [Install Ollama](#1-install-ollama)
4. [Pull a model](#2-pull-a-model)
5. [Check it works](#3-check-it-works)
6. [Connect the app](#4-connect-the-app)
7. [Choose and switch models](#5-choose-and-switch-models)
8. [Free the memory](#6-free-the-memory)
9. [Ollama on another computer](#ollama-on-another-computer)
10. [Troubleshooting](#troubleshooting)

## What you get

| Feature | Where in the app |
|---|---|
| "In this sentence" box: what the word means here | Top of the side panel |
| AI tab: base form, word class, article, plural, meaning in context, sentence translation, two example sentences, a grammar note | Side panel → **AI** |
| **+ Anki** on each example sentence | AI tab (needs [Anki](anki_setup.md)) |
| Pick any installed model, see if it is loaded, unload it | Settings → Translations |

The prompt gives the model the dictionary meanings from PONS or LibreTranslate and tells it to choose from them instead of inventing a meaning. Answers are cached per base form, sentence and model, so the second click on the same word is instant. Switching models never shows another model's cached answer.

## Hardware

Small models (3–4B parameters) run on a normal laptop CPU. A GPU makes them much faster but is not needed.

| | Minimum | Better |
|---|---|---|
| Free RAM | 4 GB | 8 GB |
| Disk | 2–3 GB per model | |
| Answer time | about 20 s per word on CPU (measured, see below) | a few seconds with a supported GPU |

## 1. Install Ollama

**Linux**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

The script installs Ollama and starts it as a systemd service, so it also starts at boot. Check it:

```bash
systemctl status ollama
```

**macOS / Windows:** download the app from [ollama.com/download](https://ollama.com/download), install it and start it. It runs in the menu bar or system tray.

Check the version:

```bash
ollama --version
```

## 2. Pull a model

Pull the recommended model:

```bash
ollama pull qwen2.5:3b
```

This downloads about 2 GB. These three models were compared on the same 10 hard German cases (separable verbs, plurals, cases and so on) with `backend/scripts/compare_llms.py`:

| Model | Valid answers | Average time | Notes |
|---|---|---|---|
| `qwen2.5:3b` | 10/10 | 20.1 s | **Recommended.** The default in this project |
| `llama3.2:3b` | 10/10 | 18.8 s | Similar speed |
| `gemma3:4b` | 7/10 | 51.0 s | Slower, more failed answers |

The full outputs are in [llm_comparison.md](llm_comparison.md). Any other Ollama model works too. Larger models (7B and up) give better German but need more RAM and time.

To pull all three for your own comparison:

```bash
ollama pull qwen2.5:3b
ollama pull llama3.2:3b
ollama pull gemma3:4b
```

## 3. Check it works

List the installed models:

```bash
ollama list
```

Ask the model something:

```bash
ollama run qwen2.5:3b "Was bedeutet 'anfangen'? Antworte auf Englisch in einem Satz."
```

Check the API the app uses:

```bash
curl -s http://localhost:11434/api/tags
```

The output is JSON that lists your models under `"models"`.

## 4. Connect the app

Set the default model in `backend/.env`:

```env
OLLAMA_MODEL=qwen2.5:3b
```

Restart the backend. If Ollama runs on the same computer, nothing else is needed: the backend uses `http://localhost:11434` by default.

Open **Settings → Services**. The **Local AI (Ollama)** row should say "Running at localhost:11434".

Now click a word in the reader and open the **AI** tab. The first answer takes longer, because Ollama loads the model into memory.

## 5. Choose and switch models

Open **Settings → Translations**. The **AI model** dropdown lists every model Ollama has installed. A model you pull while the app is running appears without a restart.

The choice is saved in the database and wins over `OLLAMA_MODEL`. **Default (…)** in the dropdown means "use `OLLAMA_MODEL`". If the chosen model is removed from Ollama later, Settings says so and the app falls back to `OLLAMA_MODEL`.

## 6. Free the memory

Ollama keeps a model in memory for 5 minutes after the last answer, then unloads it.

Next to the model picker, Settings shows whether the model is loaded and when it will unload. Press **Unload** to free the memory now. The same from a terminal:

```bash
ollama ps                    # what is loaded
ollama stop qwen2.5:3b       # unload it
```

## Ollama on another computer

You can run Ollama on a stronger machine (for example one with a GPU) and use it from the app.

On the Ollama machine (Linux, systemd):

```bash
sudo systemctl edit ollama
```

Add these lines, then save:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
```

```bash
sudo systemctl restart ollama
```

On the app machine, in `backend/.env`:

```env
OLLAMA_URL=http://192.168.1.30:11434
```

Restart the backend. Ollama has no login, so only do this on a network you trust.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Settings says "Not reachable at localhost:11434" | Ollama is not running | Linux: `sudo systemctl start ollama`. macOS / Windows: start the Ollama app |
| The model dropdown is empty | No model pulled | `ollama pull qwen2.5:3b` |
| The AI tab says "No model set" | No model chosen in Settings and no `OLLAMA_MODEL` | Set `OLLAMA_MODEL` in `backend/.env`, or choose a model in Settings |
| The AI tab shows an error that the model was not found | `OLLAMA_MODEL` names a model that is not installed | Run `ollama list` and fix the name in `backend/.env`, or choose a model in Settings |
| The first answer takes a minute | The model is loading into memory | Normal. Later answers are faster while it stays loaded |
| Answers are always slow | CPU only, or the model is too big for your RAM and swaps | Use a 3B model, close other programs, or [use a GPU machine](#ollama-on-another-computer) |
| The AI tab shows an error after a long wait | The model returned broken JSON twice (the app retries once) | Try again, or switch to `qwen2.5:3b` or `llama3.2:3b`, which gave valid answers 10/10 |
| The computer is slow after using the AI tab | The model is still in memory | Press **Unload** in Settings, or `ollama stop <model>` |
