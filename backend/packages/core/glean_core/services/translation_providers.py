"""
Translation provider abstraction.

Supports Google Translate (free), DeepL, and OpenAI as configurable
translation backends. Users configure their preferred provider and
API key via user settings; no key falls back to Google free.
"""

import os
from abc import ABC, abstractmethod
from typing import Any

import httpx

from glean_core import get_logger

logger = get_logger(__name__)

# Google Translate has a ~5000 character limit per request
_CHUNK_SIZE = 4500
_SEPARATOR = " ||| "


class TranslationProvider(ABC):
    """Base class for translation providers."""

    @abstractmethod
    def translate(self, text: str, source: str, target: str) -> str:
        """Translate a single text string."""

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        """Translate a list of texts. Default: translate one by one."""
        return [self.translate(t, source, target) for t in texts]


class FallbackProvider(TranslationProvider):
    """Provider wrapper that falls back to another provider on failures."""

    def __init__(self, primary: TranslationProvider, fallback: TranslationProvider) -> None:
        self.primary = primary
        self.fallback = fallback

    def translate(self, text: str, source: str, target: str) -> str:
        try:
            return self.primary.translate(text, source, target)
        except Exception:
            logger.exception("Primary translation provider failed; using fallback")
            return self.fallback.translate(text, source, target)

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        try:
            return self.primary.translate_batch(texts, source, target)
        except Exception:
            logger.exception("Primary batch translation failed; using fallback")
            return self.fallback.translate_batch(texts, source, target)


class GoogleFreeProvider(TranslationProvider):
    """Free Google Translate via deep-translator."""

    def translate(self, text: str, source: str, target: str) -> str:
        from deep_translator import GoogleTranslator

        if not text or not text.strip():
            return text
        translator = GoogleTranslator(source=source, target=target)
        result: str = translator.translate(text[:_CHUNK_SIZE])
        return result

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        """Batch translate using ||| separator for efficiency."""
        from deep_translator import GoogleTranslator

        if not texts:
            return []

        translator = GoogleTranslator(source=source, target=target)
        results: list[str] = [""] * len(texts)

        batch_start = 0
        while batch_start < len(texts):
            batch_texts: list[str] = []
            batch_indices: list[int] = []
            current_length = 0

            for i in range(batch_start, len(texts)):
                text = texts[i]
                needed = len(text) + len(_SEPARATOR)
                if current_length + needed > _CHUNK_SIZE and batch_texts:
                    break
                batch_texts.append(text)
                batch_indices.append(i)
                current_length += needed

            if not batch_texts:
                break

            combined = _SEPARATOR.join(batch_texts)

            if len(combined) <= _CHUNK_SIZE:
                translated_combined: str = translator.translate(combined)
                translated_parts = translated_combined.split("|||")
                for j, idx in enumerate(batch_indices):
                    results[idx] = translated_parts[j].strip() if j < len(translated_parts) else ""
            else:
                for j, idx in enumerate(batch_indices):
                    result: str = translator.translate(batch_texts[j][:_CHUNK_SIZE])
                    results[idx] = result

            batch_start += len(batch_texts)

        return results


class DeepLProvider(TranslationProvider):
    """DeepL translation provider."""

    # DeepL uses different language codes than standard
    _LANG_MAP: dict[str, str] = {
        "zh-CN": "ZH-HANS",
        "zh-TW": "ZH-HANT",
        "en": "EN-US",
        "pt": "PT-BR",
    }

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def _map_lang(self, lang: str, *, is_source: bool = False) -> str | None:
        if is_source and lang == "auto":
            return None
        mapped = self._LANG_MAP.get(lang, lang.upper())
        return mapped

    def translate(self, text: str, source: str, target: str) -> str:
        import deepl

        if not text or not text.strip():
            return text

        translator = deepl.Translator(self.api_key)
        source_lang = self._map_lang(source, is_source=True)
        target_lang = self._map_lang(target)
        result = translator.translate_text(
            text,
            source_lang=source_lang,
            target_lang=target_lang,  # type: ignore[arg-type]
        )
        return str(result)

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        import deepl

        if not texts:
            return []

        translator = deepl.Translator(self.api_key)
        source_lang = self._map_lang(source, is_source=True)
        target_lang = self._map_lang(target)
        results = translator.translate_text(
            texts,
            source_lang=source_lang,
            target_lang=target_lang,  # type: ignore[arg-type]
        )
        if isinstance(results, list):
            return [str(r) for r in results]
        return [str(results)]


class OpenAIProvider(TranslationProvider):
    """OpenAI translation provider."""

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self.api_key = api_key
        self.model = model

    def translate(self, text: str, source: str, target: str) -> str:
        from openai import OpenAI

        if not text or not text.strip():
            return text

        client = OpenAI(api_key=self.api_key)
        source_desc = "the source language" if source == "auto" else source
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are a translator. Translate the following text from "
                        f"{source_desc} to {target}. Output only the translation, "
                        f"nothing else."
                    ),
                },
                {"role": "user", "content": text},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        from openai import OpenAI

        if not texts:
            return []

        client = OpenAI(api_key=self.api_key)
        source_desc = "the source language" if source == "auto" else source
        numbered = "\n".join(f"[{i + 1}] {t}" for i, t in enumerate(texts))
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are a translator. Translate each numbered line from "
                        f"{source_desc} to {target}. Keep the [N] numbering format. "
                        f"Output only the translations, one per line."
                    ),
                },
                {"role": "user", "content": numbered},
            ],
            temperature=0.3,
        )
        raw = response.choices[0].message.content or ""

        # Parse numbered results
        results: list[str] = [""] * len(texts)
        for line in raw.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            # Match [N] prefix
            if line.startswith("["):
                bracket_end = line.find("]")
                if bracket_end > 0:
                    try:
                        idx = int(line[1:bracket_end]) - 1
                        if 0 <= idx < len(texts):
                            results[idx] = line[bracket_end + 1 :].strip()
                    except ValueError:
                        pass

        return results


class MTranProvider(TranslationProvider):
    """MTranServer translation provider via local HTTP service."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str = "",
        model: str = "",
        timeout: float = 20.0,
    ) -> None:
        self.base_url = (
            (base_url or os.getenv("MTRAN_SERVER_URL", "http://mtranserver:5001")).rstrip("/")
        )
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _payload(self, text: str, source: str, target: str) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "text": text,
            "source": source,
            "target": target,
            "source_language": source,
            "target_language": target,
        }
        if self.model:
            payload["model"] = self.model
        return payload

    def _extract_single(self, data: Any) -> str | None:
        if isinstance(data, str):
            return data

        if isinstance(data, dict):
            for key in ("translation", "translated_text", "text", "result"):
                value = data.get(key)
                if isinstance(value, str):
                    return value

            nested = data.get("data")
            if isinstance(nested, dict):
                for key in ("translation", "translated_text", "text", "result"):
                    value = nested.get(key)
                    if isinstance(value, str):
                        return value
        return None

    def _extract_batch(self, data: Any, expected_count: int) -> list[str] | None:
        items: Any | None = None
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for key in ("translations", "translated_texts", "results", "data"):
                value = data.get(key)
                if isinstance(value, list):
                    items = value
                    break

        if not isinstance(items, list):
            return None

        parsed: list[str] = []
        for item in items:
            single = self._extract_single(item)
            if single is None:
                return None
            parsed.append(single)

        if len(parsed) != expected_count:
            return None
        return parsed

    def translate(self, text: str, source: str, target: str) -> str:
        if not text or not text.strip():
            return text

        payload = self._payload(text, source, target)
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                f"{self.base_url}/translate",
                json=payload,
                headers=self._headers(),
            )
            response.raise_for_status()
            translated = self._extract_single(response.json())
            if translated is None:
                raise ValueError("MTranServer response does not contain translated text")
            return translated

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        if not texts:
            return []

        payload: dict[str, Any] = {
            "texts": texts,
            "source": source,
            "target": target,
            "source_language": source,
            "target_language": target,
        }
        if self.model:
            payload["model"] = self.model

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}/translate/batch",
                    json=payload,
                    headers=self._headers(),
                )
                response.raise_for_status()
                parsed = self._extract_batch(response.json(), len(texts))
                if parsed is not None:
                    return parsed
                raise ValueError("MTranServer batch response is not parseable")
        except Exception:
            logger.exception("MTranServer batch translation failed; fallback to single requests")
            return [self.translate(t, source, target) for t in texts]


def _is_mtran_available(base_url: str, timeout: float = 0.8) -> bool:
    """Check whether MTranServer is reachable."""
    check_urls = [f"{base_url}/health", base_url]
    with httpx.Client(timeout=timeout) as client:
        for url in check_urls:
            try:
                response = client.get(url)
                # Any HTTP response means the server is reachable.
                if response.status_code >= 100:
                    return True
            except httpx.RequestError:
                continue
    return False


def create_translation_provider(settings: dict[str, Any] | None) -> TranslationProvider:
    """
    Create a translation provider from user settings.

    Settings keys:
        - translation_provider: "google" | "deepl" | "openai" | "mtran"
        - translation_api_key: API key for non-Google providers
        - translation_model: Model name for OpenAI/MTran (default: "gpt-4o-mini")
        - translation_base_url: Base URL for MTranServer (optional)

    Falls back to GoogleFreeProvider when provider is google, no key is
    provided for non-google providers, or settings are empty.
    """
    if not settings:
        return GoogleFreeProvider()

    provider = settings.get("translation_provider", "google")
    api_key = settings.get("translation_api_key", "")
    raw_model = settings.get("translation_model")
    model = raw_model if isinstance(raw_model, str) else None
    base_url = settings.get("translation_base_url", "")

    if provider == "deepl" and api_key:
        logger.info("Using DeepL translation provider")
        return DeepLProvider(api_key)

    if provider == "openai" and api_key:
        openai_model = model or "gpt-4o-mini"
        logger.info(
            "Using OpenAI translation provider",
            extra={"model": openai_model},
        )
        return OpenAIProvider(api_key, openai_model)

    if provider == "mtran":
        resolved_base_url = base_url or os.getenv("MTRAN_SERVER_URL", "http://mtranserver:5001")
        logger.info(
            "Using MTran translation provider",
            extra={"base_url": resolved_base_url},
        )
        if not _is_mtran_available(resolved_base_url):
            logger.warning(
                "MTranServer is not reachable; falling back to Google Translate",
                extra={"base_url": resolved_base_url},
            )
            return GoogleFreeProvider()

        return FallbackProvider(
            primary=MTranProvider(
                base_url=resolved_base_url,
                api_key=api_key,
                model=model or "",
            ),
            fallback=GoogleFreeProvider(),
        )

    return GoogleFreeProvider()
