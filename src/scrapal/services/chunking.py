import re
from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    position: int
    heading: str
    content: str
    token_count: int
    page_number: int | None = None


def estimated_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def chunk_text(text: str, target_tokens: int = 600, overlap_tokens: int = 80) -> list[TextChunk]:
    clean = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not clean:
        return []
    target_chars = target_tokens * 4
    overlap_chars = overlap_tokens * 4
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", clean) if part.strip()]
    chunks: list[TextChunk] = []
    buffer = ""
    heading = ""
    for paragraph in paragraphs:
        if len(paragraph) < 140 and not paragraph.endswith((".", "!", "?")):
            heading = paragraph
        candidate = f"{buffer}\n\n{paragraph}".strip()
        if buffer and len(candidate) > target_chars:
            chunks.append(TextChunk(len(chunks), heading, buffer, estimated_tokens(buffer)))
            buffer = f"{buffer[-overlap_chars:]}\n\n{paragraph}".strip()
        else:
            buffer = candidate
    if buffer:
        chunks.append(TextChunk(len(chunks), heading, buffer, estimated_tokens(buffer)))
    return chunks
