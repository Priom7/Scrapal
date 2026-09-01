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


def test_chunk_hash_and_anchor_are_stable() -> None:
    first = chunk_text("Admissions\n\nInternational entry requirements and documents.")
    second = chunk_text("Admissions\n\nInternational entry requirements and documents.")
    assert first[0].content_hash == second[0].content_hash
    assert first[0].anchor == second[0].anchor
    assert first[0].section_path == second[0].section_path
