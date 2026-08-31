from io import BytesIO
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup
from docx import Document as WordDocument
from pydantic import BaseModel
from pypdf import PdfReader

from scrapal.extensions import Connector, ExtensionManifest


class DocumentConfig(BaseModel):
    filename: str = "document"


class DocumentConnector(Connector[DocumentConfig]):
    manifest = ExtensionManifest(
        name="document",
        version="0.1.0",
        description="Parse uploaded PDF, DOCX, HTML, Markdown, and text files.",
        capabilities=["upload", "pdf-pages", "docx", "text"],
        content_types=[
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/html",
            "text/markdown",
            "text/plain",
        ],
    )
    config_model = DocumentConfig

    async def discover(self, config: DocumentConfig) -> list[str]:
        return []

    async def extract(self, url: str, content: bytes, content_type: str) -> dict[str, Any]:
        filename = Path(url).name or "document"
        pages: list[dict[str, Any]] = []
        if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
            reader = PdfReader(BytesIO(content))
            pages = [
                {"page": index + 1, "text": page.extract_text() or ""}
                for index, page in enumerate(reader.pages)
            ]
            text = "\n\n".join(page["text"] for page in pages)
        elif "wordprocessingml" in content_type or filename.lower().endswith(".docx"):
            document = WordDocument(BytesIO(content))
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        elif content_type == "text/html" or filename.lower().endswith((".html", ".htm")):
            soup = BeautifulSoup(content, "html.parser")
            text = soup.get_text("\n", strip=True)
        else:
            text = content.decode("utf-8", errors="replace")
        return {"title": filename, "text": text, "pages": pages, "metadata": {"filename": filename}}
