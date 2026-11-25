"""Turn a URL, PDF or EPUB into (title, text) for a manual text."""

import io
import ipaddress
import logging
import posixpath
import socket
import time
import zipfile
from html.parser import HTMLParser
from typing import Optional, Tuple
from urllib.parse import unquote, urljoin, urlparse
from xml.etree import ElementTree as ET

import requests
import urllib3

logger = logging.getLogger(__name__)

MAX_DOWNLOAD = 5 * 1024 * 1024
MAX_UPLOAD = 20 * 1024 * 1024
MAX_EPUB_UNZIPPED = 50 * 1024 * 1024
TIMEOUT = 15
# Seconds for the whole body. Checked between reads, so the worst case is
# DOWNLOAD_DEADLINE plus one TIMEOUT for a read that started just before it.
DOWNLOAD_DEADLINE = 30
CHUNK = 64 * 1024
MAX_REDIRECTS = 5


class ImportError_(ValueError):
    """User-facing import failure (shown in the UI)."""


def _check_url(url: str) -> None:
    try:
        p = urlparse(url)
        port = p.port  # raises ValueError when out of range
    except ValueError:  # "http://[::1", "http://a:99999/"
        raise ImportError_("That is not a valid URL")
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ImportError_("Only http and https URLs are supported")
    try:
        infos = socket.getaddrinfo(p.hostname, port or 80, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ImportError_("Could not resolve that host")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ImportError_("Private or local addresses are not allowed")
    # shortcut: DNS is resolved again by requests (rebinding possible), upgrade by pinning the IP


def _read_body(r) -> bytes:
    """Read a response in chunks, enforcing the size cap and a total deadline."""
    deadline = time.monotonic() + DOWNLOAD_DEADLINE
    chunks, size = [], 0
    while True:
        # read1 returns whatever has arrived; read would wait for a full CHUNK,
        # so a server dripping bytes could hold the worker past the deadline.
        chunk = r.raw.read1(CHUNK, decode_content=True)
        if not chunk:
            return b"".join(chunks)
        size += len(chunk)
        if size > MAX_DOWNLOAD:
            raise ImportError_("The page is too large (max 5 MB)")
        if time.monotonic() > deadline:
            raise ImportError_("The page took too long to download")
        chunks.append(chunk)


def fetch_url(url: str) -> Tuple[str, str]:
    import trafilatura

    url = url.strip()
    html = None  # raw bytes: trafilatura sniffs the charset from <meta>, requests would guess ISO-8859-1
    for _ in range(MAX_REDIRECTS + 1):
        _check_url(url)  # re-checked on every redirect hop
        try:
            r = requests.get(
                url,
                timeout=TIMEOUT,
                stream=True,
                allow_redirects=False,
                headers={"User-Agent": "Mozilla/5.0 lang-reader"},
            )
        except requests.RequestException:
            raise ImportError_("Could not download that page")
        with r:
            if r.is_redirect:
                url = urljoin(url, r.headers.get("location", ""))
                continue
            if r.status_code >= 400:
                raise ImportError_(f"The page returned HTTP {r.status_code}")
            try:
                html = _read_body(r)
            except (urllib3.exceptions.HTTPError, requests.RequestException):
                # a stall or reset after the headers arrived surfaces from the raw stream
                raise ImportError_("Could not download that page")
            break
    if html is None:
        raise ImportError_("Too many redirects")
    text = trafilatura.extract(html, include_comments=False, include_tables=False)
    if not text or not text.strip():
        raise ImportError_("No article text found on that page")
    meta = trafilatura.extract_metadata(html)
    return (meta.title if meta and meta.title else "") or urlparse(
        url
    ).hostname or "", text.strip()


def read_pdf(data: bytes) -> Tuple[str, str]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        text = "\n\n".join(
            (p.extract_text() or "").strip() for p in reader.pages
        ).strip()
        title = (reader.metadata.title if reader.metadata else "") or ""
    except Exception as e:  # pypdf raises its own errors plus KeyError/ValueError/etc. on malformed files
        logger.warning("Could not read PDF: %s", e, exc_info=True)
        raise ImportError_("Could not read that PDF") from e
    if not text:
        raise ImportError_("No text found in that PDF (scanned PDFs are not supported)")
    return title, text


class _Text(HTMLParser):
    BLOCKS = {"p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self.skip += 1
        elif tag in self.BLOCKS:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head"):
            self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCKS:
            self.out.append("\n")

    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)


def _xhtml_text(raw: bytes) -> str:
    p = _Text()
    p.feed(raw.decode("utf-8", errors="replace"))
    lines = (" ".join(l.split()) for l in "".join(p.out).splitlines())
    return "\n".join(l for l in lines if l)


def read_epub(data: bytes) -> Tuple[str, str]:
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        container = ET.fromstring(z.read("META-INF/container.xml"))
        opf_path = next(
            e.get("full-path") for e in container.iter() if e.tag.endswith("rootfile")
        )
        opf = ET.fromstring(z.read(opf_path))
        base = posixpath.dirname(opf_path)
        manifest = {
            e.get("id"): e.get("href")
            for e in opf.iter()
            if e.tag.endswith("}item") or e.tag == "item"
        }
        spine = [e.get("idref") for e in opf.iter() if e.tag.endswith("itemref")]
        title = next(
            (e.text for e in opf.iter() if e.tag.endswith("}title") and e.text), ""
        )
        names = [
            posixpath.normpath(posixpath.join(base, unquote(manifest[i].split("#")[0])))
            for i in spine
            if manifest.get(i)
        ]
        # zipfile stops reading at the declared file_size, so this caps memory even if the header lies
        if sum(z.getinfo(n).file_size for n in names) > MAX_EPUB_UNZIPPED:
            raise ImportError_("EPUB is too large")
        parts = [_xhtml_text(z.read(n)) for n in names]
    except (zipfile.BadZipFile, KeyError, StopIteration, ET.ParseError):
        raise ImportError_("Could not read that EPUB")
    text = "\n\n".join(p for p in parts if p).strip()
    if not text:
        raise ImportError_("No text found in that EPUB")
    return title.strip(), text


def read_file(filename: Optional[str], data: bytes) -> Tuple[str, str]:
    if len(data) > MAX_UPLOAD:
        raise ImportError_("File is too large (max 20 MB)")
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return read_pdf(data)
    if name.endswith(".epub"):
        return read_epub(data)
    raise ImportError_("Only .pdf and .epub files are supported")
