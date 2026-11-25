# Anki setup

This guide connects lang-reader to Anki desktop through the AnkiConnect add-on. After it, **Save + Anki** creates flashcards with audio. AnkiWeb sync then puts them on your phone (AnkiDroid or AnkiMobile).

Anki is optional. Without it the app works the same, and cards you save with **Save + Anki** wait in an outbox until Anki is reachable.

## Contents

1. [What you get](#what-you-get)
2. [Install Anki desktop](#1-install-anki-desktop)
3. [Log in to AnkiWeb](#2-log-in-to-ankiweb)
4. [Install AnkiConnect](#3-install-ankiconnect)
5. [Check the connection](#4-check-the-connection)
6. [Connect the app](#5-connect-the-app)
7. [Send your first card](#6-send-your-first-card)
8. [Import the words you already know](#7-import-the-words-you-already-know)
9. [Pull progress back from Anki](#8-pull-progress-back-from-anki)
10. [No desktop Anki: export an .apkg](#no-desktop-anki-export-an-apkg)
11. [What the app creates in Anki](#what-the-app-creates-in-anki)
12. [Troubleshooting](#troubleshooting)

## What you get

| Feature | Where in the app |
|---|---|
| Word cards (German → English and English → German) with audio and the sentence | Side panel → **Save + Anki** |
| Sentence cards from example sentences | Side panel → AI tab → **+ Anki** on an example |
| Outbox: cards wait while Anki is closed | Side panel footer shows the pending count. Settings → Services → Anki → **Sync now** |
| Your card intervals raise word status in the app | Side panel footer → **Pull from Anki** |
| Words from your existing decks become "known" | Settings → Anki |
| AnkiWeb sync after sending | Automatic |

## 1. Install Anki desktop

Download Anki from [apps.ankiweb.net](https://apps.ankiweb.net) and follow the instructions for your system.

**Linux:** the download is a `.tar.zst` archive. You need `zstd` to unpack it.

```bash
sudo apt install zstd                         # Debian / Ubuntu
tar xaf ~/Downloads/anki-*-linux-qt6.tar.zst  # use the file name you downloaded
cd anki-*-linux-qt6
sudo ./install.sh
anki                                          # start it
```

**macOS / Windows:** run the installer from the download page.

## 2. Log in to AnkiWeb

AnkiWeb is how cards reach your phone. Skip this step if you only use Anki on this computer.

1. Create a free account at [ankiweb.net](https://ankiweb.net) if you do not have one.
2. In Anki desktop, click **Sync** (top bar) and log in.
3. On your phone, log in to the **same** account in AnkiDroid or AnkiMobile.

If Anki asks whether to upload or download on the first sync, pick the side that has your existing cards. If both are empty, either choice is fine.

## 3. Install AnkiConnect

AnkiConnect is the add-on that lets other programs talk to Anki.

1. In Anki desktop, open **Tools → Add-ons**.
2. Click **Get Add-ons…**.
3. Enter the code `2055492159` and click **OK**.
4. **Restart Anki.** The add-on only starts after a restart.

AnkiConnect now listens on `http://127.0.0.1:8765` while Anki is open.

## 4. Check the connection

With Anki open, run:

```bash
curl -s http://localhost:8765 -X POST -d '{"action": "version", "version": 6}'
```

Expected output:

```json
{"result": 6, "error": null}
```

If `curl` prints nothing or "Connection refused", see [Troubleshooting](#troubleshooting).

## 5. Connect the app

If Anki runs on the same computer as the backend, there is nothing to configure. The backend uses `http://localhost:8765` by default.

If Anki runs on a different computer, set its address in `backend/.env`:

```env
ANKI_CONNECT_URL=http://192.168.1.20:8765
```

Then, on the Anki computer, open **Tools → Add-ons → AnkiConnect → Config** and set:

```json
"webBindAddress": "0.0.0.0"
```

Restart Anki and the backend.

The backend talks to AnkiConnect, not the browser, so you do not need to change AnkiConnect's `webCorsOriginList`.

Open the app. The top bar shows whether Anki is connected.

## 6. Send your first card

1. Open a video or text and click a word.
2. In the side panel, press **Save + Anki**.
3. The first time, the app creates its decks and note types in Anki (see [What the app creates in Anki](#what-the-app-creates-in-anki)).
4. The card is added, with audio if [Piper is set up](piper_setup.md), and Anki syncs to AnkiWeb.
5. In Anki, open **Browse** and search `deck:German::Reader::Words` to see it.

To make **Save + Anki** the default button, tick **Make Save + Anki the default** in the side panel footer.

**If Anki is closed:** the card is saved as pending. It is sent the next time the backend starts, or when you press **Sync now** in Settings → Services. The side panel footer shows how many cards are waiting.

**Saving the same word again** updates the existing note instead of adding a duplicate. If the note was deleted in Anki, a new one is added.

## 7. Import the words you already know

If you already study German in Anki, mark those words as known so the reader stops showing them as new. This only reads your decks. It never changes them.

1. Open **Settings → Anki** with Anki running.
2. Under **Decks to import**, tick your German decks.
3. Under **Note type**, choose the note type those cards use.
4. Under **Field with the German word**, choose the field that holds the German word (often `Front`).
5. Press **Import N decks as known**.

The result line says how many words were imported, how many were already in your list (those keep their status), and how many cards were skipped.

How the field is read:

| Card front | Imported as |
|---|---|
| `die Ansage, -n` | `Ansage` |
| `kommen (aus)` | `kommen` |
| `ging` | `gehen` |
| `an sein` | skipped (a phrase, not one word) |

After the import, saving a word that is already in one of these decks does not create a second card.

## 8. Pull progress back from Anki

Press **Pull from Anki** in the side panel footer. The app reads the intervals of its own word cards and raises the word's status:

| Longest card interval | Status in the app |
|---|---|
| 21 days or more | known |
| 7 to 20 days | learning 3 |
| 1 to 6 days | learning 2 |
| new or still in learning | unchanged |

Pull only ever raises a status. A lapse in Anki does not lower it, and ignored words are never touched. Pull is read-only on Anki.

## No desktop Anki: export an .apkg

If you cannot run Anki desktop (for example, you only use AnkiDroid):

1. Save words with **Save + Anki** as usual. They stay pending.
2. Open **Settings → Anki** and click **Export .apkg**.
3. Copy the file to your phone and open it in AnkiDroid (or use **File → Import** in Anki desktop).

The file contains every word you sent or queued for Anki. Importing a newer export updates the same cards instead of duplicating them.

## What the app creates in Anki

The app only adds these. Existing decks and note types with the same name are left as they are.

**Decks**

| Deck | Holds |
|---|---|
| `German::Reader::Words` | Word cards |
| `German::Reader::Sentences` | Sentence cards |

**Note types**

| Note type | Fields | Cards |
|---|---|---|
| `Reader Word` | Lemma, Article, Plural, WordClass, Meaning, SentenceDE, SentenceEN, Audio, Source | DE→EN, EN→DE |
| `Reader Sentence` | SentenceDE, SentenceEN, TargetWord, Audio, Source | DE→EN, EN→DE |

Every note is tagged `reader`, plus `reader::src::<title>` with the video or text it came from. Audio files are stored in Anki's media folder as `reader_<word>_<hash>.mp3`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `curl` gives "Connection refused" | Anki is closed, or AnkiConnect is not installed | Start Anki. Check **Tools → Add-ons** lists AnkiConnect. Restart Anki after installing it. |
| Top bar says Anki is not connected, but `curl` works | The backend uses another address | Check `ANKI_CONNECT_URL` in `backend/.env`, then restart the backend |
| Cards stay pending | Anki was closed when you saved | Open Anki, then press **Sync now** in Settings → Services |
| A card is marked failed | AnkiConnect rejected the note (shown in the backend log as `Anki rejected …`) | Fix the cause in Anki, then save the word again with **Save + Anki** |
| Cards have no sound | Piper or ffmpeg is missing | Follow [piper_setup.md](piper_setup.md). The card is still added without audio. |
| Cards do not appear on the phone | AnkiWeb is not logged in, or the phone uses another account | Do [step 2](#2-log-in-to-ankiweb), then press **Sync** in Anki desktop and on the phone |
| macOS: AnkiConnect stops answering when Anki is in the background | App Nap pauses Anki | Run `defaults write net.ankiweb.dtop NSAppSleepDisabled -bool true` and restart Anki |
| Import says "Note type … has no field …" | The field was renamed in Anki | Reload Settings and choose the field again |
