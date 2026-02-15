"""Tests for translation providers."""

from typing import Any

from glean_core.services.translation_providers import (
    FallbackProvider,
    GoogleFreeProvider,
    MTranProvider,
    create_translation_provider,
)


class _FakeResponse:
    def __init__(self, payload: Any):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Any:
        return self._payload


class _FakeClient:
    def __init__(self, payload: Any):
        self.payload = payload
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __enter__(self) -> "_FakeClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:  # type: ignore[no-untyped-def]
        return False

    def post(self, url: str, **kwargs: Any) -> _FakeResponse:
        self.calls.append((url, kwargs))
        return _FakeResponse(self.payload)


def test_create_provider_returns_mtran() -> None:
    from unittest.mock import patch

    with patch(
        "glean_core.services.translation_providers._is_mtran_available",
        return_value=True,
    ):
        provider = create_translation_provider(
            {
                "translation_provider": "mtran",
                "translation_base_url": "http://localhost:8080",
                "translation_api_key": "token-123",
                "translation_model": "mtran-large",
            }
        )

    assert isinstance(provider, FallbackProvider)
    assert isinstance(provider.primary, MTranProvider)
    assert provider.primary.base_url == "http://localhost:8080"
    assert provider.primary.api_key == "token-123"
    assert provider.primary.model == "mtran-large"


def test_create_provider_falls_back_when_mtran_unavailable() -> None:
    from unittest.mock import patch

    with patch(
        "glean_core.services.translation_providers._is_mtran_available",
        return_value=False,
    ):
        provider = create_translation_provider(
            {
                "translation_provider": "mtran",
                "translation_base_url": "http://localhost:8080",
            }
        )

    assert isinstance(provider, GoogleFreeProvider)


def test_create_provider_falls_back_to_google_for_unknown() -> None:
    provider = create_translation_provider({"translation_provider": "unknown"})
    assert isinstance(provider, GoogleFreeProvider)


def test_mtran_translate_parses_standard_payload(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _FakeClient({"translation": "你好世界"})

    def _client_factory(*args: Any, **kwargs: Any) -> _FakeClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    result = provider.translate("Hello world", "auto", "zh-CN")

    assert result == "你好世界"
    assert fake_client.calls[0][0] == "http://mtran.local/translate"


def test_mtran_batch_parses_payload(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _FakeClient({"translations": ["你好", "世界"]})

    def _client_factory(*args: Any, **kwargs: Any) -> _FakeClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    result = provider.translate_batch(["hello", "world"], "auto", "zh-CN")

    assert result == ["你好", "世界"]
    assert fake_client.calls[0][0] == "http://mtran.local/translate/batch"
