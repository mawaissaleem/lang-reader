import gzip
import json
import logging
import os
import zlib

log = logging.getLogger(__name__)
nlp = None  # set once by load_model() at startup; None = lemmatizing off
lookup: dict[str, str] = {}  # form -> lemma from spacy-lookups-data, see data/README.md
NOUNS = ("NOUN", "PROPN")
lemmas: set[str] = set()  # the table's lemmas, to trust a model lemma the table knows
LOOKUP_PATH = os.path.join(os.path.dirname(__file__), "data", "de_lemma_lookup.json.gz")


def load_model():
    global nlp, lookup, lemmas
    try:
        import spacy

        nlp = spacy.load("de_core_news_sm", exclude=["ner", "parser"])
    except Exception as e:  # spaCy can fail in many ways (missing package or model, version clash); none may stop the server
        log.warning(
            "spaCy model unavailable, using clicked words as-is: %s", e, exc_info=True
        )
    try:
        with gzip.open(LOOKUP_PATH, "rt", encoding="utf-8") as f:
            lookup = json.load(f)
        lemmas = set(lookup.values())
    # missing, truncated or invalid gzip/JSON; zlib.error is a gzip corrupted mid-stream
    except (OSError, EOFError, ValueError, zlib.error) as e:
        log.warning(
            "German lemma table unavailable, verbs keep the clicked form: %s", e
        )


ARTICLES = {"Masc": "der", "Fem": "die", "Neut": "das"}


def lemmatize(word: str, sentence: str | None = None) -> str:
    return analyze(word, sentence)[0]


def verb_lemma(tok, word: str) -> str:
    form = tok.text.lower()
    # infinitives and wir/sie present forms already are the base form; the table maps some to other words (sein -> mein, führen -> fahren)
    if tok.tag_.endswith("INF") or (
        "Tense=Pres" in tok.morph and "Number=Plur" in tok.morph and form.endswith("n")
    ):
        return form
    model = tok.lemma_.lower()
    return lookup.get(form) or (model if model in lemmas else word)


def phrase(words: str, sentence: str | None) -> str:
    """Several selected words: a verb plus its separable particle (PTKVZ) merge into one infinitive (fängt an -> anfangen);
    anything else stays as written. shortcut: no dependency parse, the user's selection is the link; upgrade if single-word clicks should merge too"""
    parts = {p.lower() for p in words.split()}
    toks = [t for t in nlp(sentence) if t.text.lower() in parts] if sentence else []
    verb = next((t for t in toks if t.pos_ in ("VERB", "AUX")), None)
    particle = next((t for t in toks if t.tag_ == "PTKVZ"), None)
    if verb is None or particle is None or len(parts) != 2:
        return words
    return particle.text.lower() + verb_lemma(verb, verb.text.lower())


def separable_particle(word: str, sentence: str | None) -> tuple[str, int] | None:
    """(particle, skip) for the split-off particle (PTKVZ) of the verb `word` in `sentence` (an in "fängt um acht an"), else None.
    `skip` counts the words with the particle's text between verb and particle (the preposition in "kommt an der Haltestelle an"),
    so the reader can pick the same occurrence.
    shortcut: the model has no parser, so this takes the first particle after the verb before the next verb or
    punctuation; a verb in a long clause with other verbs between may miss it, upgrade to the dependency parse if so"""
    if nlp is None or not sentence or " " in word:
        return None
    tokens = list(nlp(sentence))
    verb = next(
        (i for i, t in enumerate(tokens) if t.text.lower() == word.lower()), None
    )
    if verb is None or tokens[verb].pos_ not in ("VERB", "AUX"):
        return None
    after = tokens[verb + 1 :]
    for i, tok in enumerate(after):
        if tok.tag_ == "PTKVZ":
            text = tok.text.lower()
            skip = sum(1 for t in after[:i] if t.text.lower() == text)
            return tok.text, skip
        if tok.pos_ in ("VERB", "AUX", "PUNCT"):
            return None
    return None


def analyze(
    word: str, sentence: str | None = None
) -> tuple[str, str | None, str | None]:
    """(base form, part of speech, article) of `word`, read in `sentence` when it appears there.
    Nouns come back capitalized with their der/die/das; the article is None when spaCy finds no gender."""
    if nlp is None:
        return word, None, None
    if " " in word:
        return phrase(word, sentence), None, None
    # shortcut: first case-insensitive match of the word in the sentence, not the clicked occurrence; upgrade if homographs matter
    tokens = nlp(sentence) if sentence else []
    tok = next((t for t in tokens if t.text.lower() == word.lower()), None)
    if tok is None:
        doc = nlp(word)
        if len(doc) != 1:
            return word, None, None
        tok = doc[0]
    # the small model invents verb lemmas (isst -> issen, weißt -> weißen) or leaves them unchanged (gehst),
    # so verbs come from the lookup table; no entry -> keep the clicked word rather than guess
    if tok.pos_ in ("VERB", "AUX"):
        return verb_lemma(tok, word), tok.pos_, None
    lemma = tok.lemma_ or word
    # the model sometimes lowercases a noun lemma (Essen -> essen)
    if tok.pos_ in NOUNS:
        return (
            lemma[:1].upper() + lemma[1:],
            tok.pos_,
            ARTICLES.get(next(iter(tok.morph.get("Gender")), "")),
        )
    return lemma, tok.pos_, None


def word_key(
    word: str, sentence: str | None = None
) -> tuple[str, str | None, str | None]:
    """(cache key, part of speech, article) for `word`: the base form, capitalized for nouns (Bank != bank), lowercase otherwise."""
    base, pos, article = analyze(word, sentence)
    return (base if pos in NOUNS else base.lower()), pos, article
