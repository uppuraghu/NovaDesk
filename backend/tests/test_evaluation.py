from app.evaluation import aggregate, evaluate_case, term_recall


def test_evaluation_scores_correctness_grounding_recall_latency_and_cost():
    case = {
        "id": "refund",
        "expected_sources": ["refund-policy.txt"],
        "expected_answer_terms": ["30 days", "unused"],
        "grounding_terms": ["original packaging"],
    }
    response = {
        "answer": "Refunds are available within 30 days for unused items in the original packaging.",
        "sources": [{"filename": "refund-policy.txt"}],
        "metrics": {
            "latency_ms": 125.5,
            "estimated_cost_usd": 0.001,
            "prompt_tokens": 50,
            "completion_tokens": 20,
        },
    }
    result = evaluate_case(case, response, 200)
    assert result["correctness"] == 1
    assert result["groundedness"] == 1
    assert result["retrieval_recall"] == 1
    assert result["latency_ms"] == 125.5
    assert result["estimated_cost_usd"] == 0.001
    assert aggregate([result])["case_count"] == 1


def test_grounding_is_zero_when_expected_source_was_not_retrieved():
    result = evaluate_case({
        "id": "refund",
        "expected_sources": ["refund-policy.txt"],
        "expected_answer_terms": ["30 days"],
        "grounding_terms": ["30 days"],
    }, {
        "answer": "Refunds are available within 30 days.",
        "sources": [],
    }, 99)
    assert result["correctness"] == 1
    assert result["groundedness"] == 0
    assert result["retrieval_recall"] == 0


def test_empty_term_list_is_neutral():
    assert term_recall("any answer", []) == 1
    assert aggregate([])["case_count"] == 0
