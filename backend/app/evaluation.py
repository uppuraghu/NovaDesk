import argparse
import getpass
import json
import time
from pathlib import Path

import httpx


DEFAULT_CASES = Path(__file__).parent.parent / "evaluation" / "cases.json"


def term_recall(text: str, terms: list[str]) -> float:
    if not terms:
        return 1.0
    answer = text.casefold()
    return sum(term.casefold() in answer for term in terms) / len(terms)


def evaluate_case(case: dict, response: dict, elapsed_ms: float) -> dict:
    answer = response.get("answer", "")
    sources = {source["filename"] for source in response.get("sources", [])}
    expected_sources = set(case.get("expected_sources", []))
    retrieval_recall = (
        len(sources.intersection(expected_sources)) / len(expected_sources)
        if expected_sources else 1.0
    )
    evidence_coverage = term_recall(answer, case.get("grounding_terms", []))
    metrics = response.get("metrics") or {}
    return {
        "id": case["id"],
        "correctness": term_recall(answer, case.get("expected_answer_terms", [])),
        "groundedness": evidence_coverage if retrieval_recall > 0 else 0.0,
        "retrieval_recall": retrieval_recall,
        "latency_ms": metrics.get("api_latency_ms") or metrics.get("latency_ms") or round(elapsed_ms, 2),
        "estimated_cost_usd": metrics.get("estimated_cost_usd", 0.0),
        "prompt_tokens": metrics.get("prompt_tokens", 0),
        "completion_tokens": metrics.get("completion_tokens", 0),
    }


def aggregate(results: list[dict]) -> dict:
    count = len(results)
    if not count:
        return {
            "case_count": 0,
            "correctness": 0.0,
            "groundedness": 0.0,
            "retrieval_recall": 0.0,
            "latency_ms": 0.0,
            "estimated_cost_usd": 0.0,
        }
    return {
        "case_count": count,
        "correctness": round(sum(row["correctness"] for row in results) / count, 4),
        "groundedness": round(sum(row["groundedness"] for row in results) / count, 4),
        "retrieval_recall": round(sum(row["retrieval_recall"] for row in results) / count, 4),
        "latency_ms": round(sum(row["latency_ms"] for row in results) / count, 2),
        "estimated_cost_usd": round(sum(row["estimated_cost_usd"] for row in results), 8),
    }


def run_evaluation(api_url: str, token: str, cases: list[dict]) -> dict:
    results = []
    with httpx.Client(timeout=180) as client:
        for case in cases:
            started = time.perf_counter()
            response = client.post(
                f"{api_url.rstrip('/')}/chat",
                headers={"Authorization": f"Bearer {token}"},
                json={"message": case["question"]},
            )
            response.raise_for_status()
            elapsed_ms = (time.perf_counter() - started) * 1000
            results.append(evaluate_case(case, response.json(), elapsed_ms))
    return {"results": results, "aggregate": aggregate(results)}


def main():
    parser = argparse.ArgumentParser(description="Evaluate grounded support answers and retrieval.")
    parser.add_argument("--api-url", default="http://localhost:8000/api")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--token", default="")
    parser.add_argument("--email", default="")
    args = parser.parse_args()

    token = args.token
    if not token:
        email = args.email or input("Email: ").strip()
        password = getpass.getpass("Password: ")
        with httpx.Client(timeout=30) as client:
            login = client.post(
                f"{args.api_url.rstrip('/')}/auth/login",
                json={"email": email, "password": password},
            )
            login.raise_for_status()
            token = login.json()["access_token"]

    cases = json.loads(args.cases.read_text(encoding="utf-8"))
    print(json.dumps(run_evaluation(args.api_url, token, cases), indent=2))


if __name__ == "__main__":
    main()
