from scrapal.services.chunking import chunk_text


def test_chunking_keeps_content_and_overlap() -> None:
    text = "Heading\n\n" + "First paragraph. " * 120 + "\n\n" + "Second paragraph. " * 120
    chunks = chunk_text(text, target_tokens=100, overlap_tokens=10)
    assert len(chunks) >= 2
    assert chunks[0].position == 0
    assert all(chunk.content for chunk in chunks)
    assert "Second paragraph" in chunks[-1].content


def test_empty_text_has_no_chunks() -> None:
    assert chunk_text(" \n\n ") == []
