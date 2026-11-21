import io
import os
import sys
import unittest
import zipfile
from unittest.mock import patch

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import importer
from database import get_db
from main import app
from models import Base


def make_pdf():
    stream = b"BT /F1 12 Tf 20 100 Td (Hallo Welt) Tj ET"
    objs = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length %d>>stream\n%s\nendstream" % (len(stream), stream),
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (i, o)
    x = len(out)
    out += b"xref\n0 6\n0000000000 65535 f \n" + b"".join(
        b"%010d 00000 n \n" % o for o in offs
    )
    return out + b"trailer<</Root 1 0 R/Size 6>>\nstartxref\n%d\n%%%%EOF" % x


PDF = make_pdf()


def make_epub(
    spine_order=("c2", "c1"), href_a="a.xhtml", name_a="a.xhtml", body_a=None
):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(
            "META-INF/container.xml",
            '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>'
            '<rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
        )
        refs = "".join(f'<itemref idref="{i}"/>' for i in spine_order)
        z.writestr(
            "OEBPS/content.opf",
            '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
            "<dc:title>Mein Buch</dc:title></metadata><manifest>"
            f'<item id="c1" href="{href_a}"/><item id="c2" href="b.xhtml"/></manifest>'
            f"<spine>{refs}</spine></package>",
        )
        z.writestr(
            "OEBPS/" + name_a,
            body_a
            or "<html><head><title>x</title></head><body><p>Erstes Kapitel</p></body></html>",
        )
        z.writestr(
            "OEBPS/b.xhtml",
            "<html><body><h1>Zweites</h1><script>no()</script><p>Kapitel</p></body></html>",
        )
    return buf.getvalue()


class FakeResp:
    def __init__(self, body=b"", status=200, headers=None):
        self.raw = type(
            "Raw",
            (io.BytesIO,),
            {"read": lambda self, n, decode_content=True: io.BytesIO.read(self, n)},
        )(body)
        self.status_code = status
        self.headers = headers or {}
        self.is_redirect = "location" in self.headers
        self.encoding = "utf-8"
        self.apparent_encoding = "utf-8"

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass


ARTICLE = (
    "<html><head><title>Ein Titel</title></head><body><article><p>"
    + "Das ist ein langer deutscher Satz über das Leben in Berlin. " * 30
    + "</p></article></body></html>"
).encode()
PUBLIC = [(None, None, None, None, ("93.184.216.34", 80))]


class UrlTests(unittest.TestCase):
    def test_non_http_scheme_refused(self):
        for u in ("file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)"):
            with self.assertRaises(importer.ImportError_):
                importer.fetch_url(u)

    def test_malformed_url_is_import_error_not_crash(self):
        for u in ("http://a:99999/", "http://[::1"):
            with self.assertRaisesRegex(importer.ImportError_, "not a valid URL"):
                importer.fetch_url(u)

    def test_private_address_refused(self):
        with self.assertRaises(importer.ImportError_):
            importer.fetch_url("http://127.0.0.1:8000/x")

    @patch("importer.socket.getaddrinfo", return_value=PUBLIC)
    @patch("importer.requests.get", return_value=FakeResp(ARTICLE))
    def test_extracts_article_and_title(self, get, _dns):
        title, text = importer.fetch_url("https://example.com/a")
        self.assertEqual(title, "Ein Titel")
        self.assertIn("Leben in Berlin", text)

    @patch("importer.socket.getaddrinfo", return_value=PUBLIC)
    def test_utf8_page_without_charset_keeps_umlauts(self, _dns):
        page = ARTICLE.replace(b"<head>", b'<head><meta charset="utf-8">').replace(
            "über".encode(), "über Größe".encode()
        )
        resp = FakeResp(page)
        resp.encoding = (
            "ISO-8859-1"  # what requests reports for text/html with no charset header
        )
        with patch("importer.requests.get", return_value=resp):
            _, text = importer.fetch_url("https://example.com/a")
        self.assertIn("Größe", text)

    @patch("importer.socket.getaddrinfo", return_value=PUBLIC)
    @patch(
        "importer.requests.get",
        return_value=FakeResp(b"x" * (importer.MAX_DOWNLOAD + 1)),
    )
    def test_too_large(self, *_):
        with self.assertRaisesRegex(importer.ImportError_, "too large"):
            importer.fetch_url("https://example.com/a")

    @patch("importer.socket.getaddrinfo", return_value=PUBLIC)
    @patch("importer.requests.get", return_value=FakeResp(status=404))
    def test_http_error(self, *_):
        with self.assertRaisesRegex(importer.ImportError_, "404"):
            importer.fetch_url("https://example.com/a")

    @patch("importer.socket.getaddrinfo", return_value=PUBLIC)
    @patch(
        "importer.requests.get",
        return_value=FakeResp(headers={"location": "file:///etc/passwd"}),
    )
    def test_redirect_to_bad_scheme_refused(self, *_):
        with self.assertRaisesRegex(importer.ImportError_, "http"):
            importer.fetch_url("https://example.com/a")


class FileTests(unittest.TestCase):
    def test_pdf_text(self):
        self.assertIn("Hallo Welt", importer.read_pdf(PDF)[1])

    def test_pdf_without_text(self):
        w, buf = PdfWriter(), io.BytesIO()
        w.add_blank_page(100, 100)
        w.write(buf)
        with self.assertRaisesRegex(importer.ImportError_, "No text"):
            importer.read_pdf(buf.getvalue())

    def test_epub_spine_order_and_title(self):
        title, text = importer.read_epub(make_epub())
        self.assertEqual(title, "Mein Buch")
        self.assertEqual(text, "Zweites\nKapitel\n\nErstes Kapitel")

    def test_epub_percent_encoded_href(self):
        data = make_epub(
            href_a="mein%20kapitel.xhtml#start", name_a="mein kapitel.xhtml"
        )
        self.assertIn("Erstes Kapitel", importer.read_epub(data)[1])

    def test_epub_unzipped_size_capped(self):
        data = make_epub(body_a="a" * (importer.MAX_EPUB_UNZIPPED + 1))
        self.assertLess(len(data), 200_000)
        with self.assertRaisesRegex(importer.ImportError_, "too large"):
            importer.read_epub(data)

    def test_bad_epub(self):
        with self.assertRaises(importer.ImportError_):
            importer.read_epub(b"not a zip")

    def test_unsupported_and_oversized(self):
        with self.assertRaisesRegex(importer.ImportError_, "Only"):
            importer.read_file("a.txt", b"x")
        with self.assertRaisesRegex(importer.ImportError_, "too large"):
            importer.read_file("a.pdf", b"x" * (importer.MAX_UPLOAD + 1))


class EndpointTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        def override():
            db = Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_file_import_saves_text(self):
        r = self.client.post(
            "/texts/import-file", files={"file": ("b.epub", make_epub())}
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["title"], "Mein Buch")
        tid = r.json()["id"]
        self.assertIn("Erstes Kapitel", self.client.get(f"/texts/{tid}").json()["text"])

    def test_file_import_error(self):
        r = self.client.post("/texts/import-file", files={"file": ("b.txt", b"hi")})
        self.assertEqual(r.status_code, 422)
        self.assertIn("Only", r.json()["detail"])

    @patch("importer.socket.getaddrinfo", return_value=PUBLIC)
    @patch("importer.requests.get", return_value=FakeResp(ARTICLE))
    def test_url_import_saves_text(self, *_):
        r = self.client.post("/texts/import-url", json={"url": "https://example.com/a"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["title"], "Ein Titel")

    def test_url_import_error(self):
        r = self.client.post("/texts/import-url", json={"url": "file:///etc/passwd"})
        self.assertEqual(r.status_code, 422)
        self.assertIn("http", r.json()["detail"])
