from scrapal.schemas import SearchHit
from scrapal.services.search import cite_uncited_sentences, cosine


def test_cosine_similarity() -> None:
    assert cosine([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert cosine([1.0, 0.0], [0.0, 1.0]) == 0.0


def test_uncited_local_answer_gets_closest_source() -> None:
    hits = [
        SearchHit(
            chunk_id="chunk-1",
            document_id="doc-1",
            title="Computer science degrees",
            url="https://example.test/computing",
            heading="Postgraduate study",
            excerpt="Computer science and cyber security masters courses are available.",
            score=1,
        )
    ]
    assert cite_uncited_sentences("Computer science masters courses are available.", hits) == (
        "Computer science masters courses are available [1]."
    )
