from scrapal.schemas import QueryPlan
from scrapal.services.generation import validate_sentence_support
from scrapal.services.search import cosine, lexical_query, reciprocal_rank_fusion


def test_cosine_similarity() -> None:
    assert cosine([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert cosine([1.0, 0.0], [0.0, 1.0]) == 0.0


def test_rrf_weights_and_combines_independent_lanes() -> None:
    scores = reciprocal_rank_fusion([(1.0, ["a", "b"]), (1.35, ["b", "c"])])
    assert scores["b"] > scores["a"]
    assert scores["b"] > scores["c"]


def test_lexical_query_uses_planned_constraints_without_stop_words() -> None:
    plan = QueryPlan(
        requested_fields=["computer science masters courses"], intake="January"
    )

    assert lexical_query(plan, "Which courses are available?") == (
        "computer OR courses OR january OR masters OR science"
    )


def test_sentence_citations_must_exist_and_support_the_claim() -> None:
    evidence = [
        {
            "text": "Computer science and cyber security masters courses are available.",
        }
    ]
    assert validate_sentence_support(
        "Computer science masters courses are available [1].", evidence
    ) == (True, [1], None)
    assert validate_sentence_support("The tuition fee is £25,000 [1].", evidence)[0] is False
    assert validate_sentence_support("Computer science masters courses are available.", evidence) == (
        False,
        [],
        "missing_citation",
    )
