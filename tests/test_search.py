from types import SimpleNamespace

from scrapal.schemas import QueryPlan
from scrapal.services.generation import validate_sentence_support
from scrapal.services.ollama import OllamaUnavailable
from scrapal.services.search import (
    cosine,
    lexical_query,
    plan_query,
    reciprocal_rank_fusion,
    record_matches_plan,
    terms,
    transcript,
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


def test_plan_slots_reject_values_that_are_not_real_constraints() -> None:
    # A 7B planner restating the question into a slot must not become a filter.
    plan = QueryPlan.model_validate(
        {
            "intent": "browse",
            "entities": ["computer science"],
            "intake": "Any other course related to this",
            "level": "masters",
            "residency": "overseas",
            "study_mode": "online",
        }
    )

    assert plan.intake is None
    assert plan.intent == "research"
    assert plan.level == "postgraduate"
    assert plan.residency == "international"
    assert plan.study_mode == "distance learning"


def test_plan_normalizes_a_real_intake_month() -> None:
    assert QueryPlan.model_validate({"intake": "jan"}).intake == "January"
    assert QueryPlan.model_validate({"intake": "September 2027"}).intake == "September"


def test_record_matching_reads_the_published_slot_field_names() -> None:
    january = SimpleNamespace(
        data={
            "title": "Computer Science, MSc",
            "level": "postgraduate",
            "intake_months": ["January", "September"],
            "study_modes": ["full-time"],
            "fees": [{"residency": "international", "amount": 17000}],
        },
        confidence=0.9,
    )
    september_only = SimpleNamespace(
        data={"title": "Computer Science, MSc", "intake_months": ["September"]},
        confidence=0.9,
    )
    unknown_intake = SimpleNamespace(
        data={"title": "Computer Science, MSc"},
        confidence=0.9,
    )
    plan = QueryPlan(entities=["computer science"], intake="January")
    query_terms = terms("computer science courses")

    assert record_matches_plan(january, plan, query_terms) > 0
    # Published evidence contradicts the constraint, so the record is excluded.
    assert record_matches_plan(september_only, plan, query_terms) == 0.0
    # Silence is not a contradiction: incomplete extraction must not hide a course.
    assert record_matches_plan(unknown_intake, plan, query_terms) > 0


def test_record_matching_reads_residency_out_of_the_fee_entries() -> None:
    record = SimpleNamespace(
        data={"title": "Computer Science, MSc", "fees": [{"residency": "home", "amount": 9250}]},
        confidence=0.5,
    )
    query_terms = terms("computer science")

    assert record_matches_plan(record, QueryPlan(residency="home"), query_terms) > 0
    assert record_matches_plan(record, QueryPlan(residency="international"), query_terms) == 0.0


async def test_plan_query_resolves_a_follow_up_against_the_conversation() -> None:
    captured: dict[str, object] = {}

    class Ollama:
        async def structured(self, messages, schema, *, locked):  # noqa: ANN001, ARG002
            captured["messages"] = messages
            return {
                "entities": ["computer science"],
                "search_query": "courses related to Computer Science MSc",
            }

    plan, source = await plan_query(
        "Any other course related to this?",
        ollama=Ollama(),
        locked=True,
        history=[
            ("user", "I am looking for computer science course to masters in the Uk"),
            ("assistant", "The Computer Science, MSc program is accredited by BCS."),
        ],
    )

    assert source == "model"
    assert plan.search_query == "courses related to Computer Science MSc"
    prompt = " ".join(str(message["content"]) for message in captured["messages"])  # type: ignore[index]
    assert "computer science course to masters" in prompt
    # Earlier turns must reach the planner as context to resolve against, never
    # as evidence the answer may cite.
    assert "untrusted context" in prompt


async def test_plan_query_leaves_a_standalone_question_alone() -> None:
    class Ollama:
        async def structured(self, messages, schema, *, locked):  # noqa: ANN001, ARG002
            assert len(messages) == 2, "no transcript should be sent without history"
            return {"entities": ["january intake"]}

    plan, _ = await plan_query("Which courses have a January intake?", ollama=Ollama(), locked=True)

    assert plan.search_query == ""


def test_transcript_keeps_the_last_turns_within_a_bounded_size() -> None:
    history = [("user", f"question {index}") for index in range(10)]
    rendered = transcript(history, turns=3)

    assert rendered.splitlines() == ["user: question 7", "user: question 8", "user: question 9"]
    assert transcript([("user", "  "), ("assistant", "kept")]) == "assistant: kept"


def test_a_rambling_reformulation_is_dropped_rather_than_searched() -> None:
    plan = QueryPlan.model_validate({"search_query": "word " * 60})

    assert plan.search_query == ""
    assert QueryPlan.model_validate({"search_query": "  spaced   out  "}).search_query == "spaced out"


def test_lexical_query_searches_the_resolved_phrasing() -> None:
    plan = QueryPlan(search_query="Computer Science MSc related courses")

    assert lexical_query(plan, "Any other course related to this?") == (
        "computer OR courses OR msc OR related OR science"
    )
