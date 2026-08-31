from scrapal.services.ingestion import retryable_status


def test_retryable_http_statuses() -> None:
    assert retryable_status(429)
    assert retryable_status(500)
    assert retryable_status(503)


def test_permanent_http_statuses_are_not_retried() -> None:
    assert not retryable_status(400)
    assert not retryable_status(404)
    assert not retryable_status(410)
