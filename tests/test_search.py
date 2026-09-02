from scrapal.schemas import QueryPlan
from scrapal.services.generation import validate_sentence_support
from scrapal.services.ollama import OllamaUnavailable
from scrapal.services.search import (
    cosine,
    lexical_query,
    plan_query,
    reciprocal_rank_fusion,
)


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


async def test_plan_query_reports_a_model_derived_plan() -> None:
    class Ollama:
        async def structured(self, messages, schema, *, locked):  # noqa: ANN001, ARG002
            return {"intent": "compare", "entities": ["computer science"]}

    plan, source = await plan_query("Compare CS courses", ollama=Ollama(), locked=True)

    assert source == "model"
    assert plan.entities == ["computer science"]


async def test_plan_query_marks_the_degraded_plan_as_a_fallback() -> None:
    class Down:
        async def structured(self, messages, schema, *, locked):  # noqa: ANN001, ARG002
            raise OllamaUnavailable("ollama is down")

    plan, source = await plan_query("Which courses?", ollama=Down(), locked=True)

    # The console must be able to tell this apart from a real plan, otherwise it
    # presents the raw question back as though a model had interpreted it.
    assert source == "fallback"
    assert plan.entities == ["Which courses?"]
