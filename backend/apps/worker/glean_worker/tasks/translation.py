"""Translation worker task.

Translates entry content using Google Translate via deep-translator.
Produces bilingual HTML where each block element is followed by its
translated counterpart, enabling side-by-side reading.
"""

from typing import Any

from bs4 import BeautifulSoup, Tag
from deep_translator import GoogleTranslator
from sqlalchemy import select

from glean_core import get_logger
from glean_database.models import Entry
from glean_database.models.entry_translation import EntryTranslation
from glean_database.session import get_session_context

logger = get_logger(__name__)

# Google Translate has a ~5000 character limit per request
CHUNK_SIZE = 4500

# Block-level elements that get bilingual treatment
_BLOCK_TAGS = frozenset({
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "blockquote", "figcaption", "dt", "dd",
})

# Elements whose children should not be translated
_SKIP_ANCESTORS = frozenset({"code", "pre", "script", "style"})


def _translate_text(text: str, source: str, target: str) -> str:
    """Translate a single text string, handling chunking for long text."""
    if not text or not text.strip():
        return text

    # For short text, translate directly
    if len(text) <= CHUNK_SIZE:
        translator = GoogleTranslator(source=source, target=target)
        result: str = translator.translate(text)
        return result

    # For long text, split into chunks at sentence boundaries
    chunks: list[str] = []
    current = ""
    for sentence in text.replace("\n", "\n ").split(". "):
        if len(current) + len(sentence) + 2 > CHUNK_SIZE:
            if current:
                chunks.append(current)
            current = sentence
        else:
            current = current + ". " + sentence if current else sentence
    if current:
        chunks.append(current)

    translated_chunks: list[str] = []
    translator = GoogleTranslator(source=source, target=target)
    for chunk in chunks:
        result = translator.translate(chunk)
        translated_chunks.append(result)

    return " ".join(translated_chunks)


def _has_skip_ancestor(element: Tag) -> bool:
    """Check if an element is nested inside code/pre/script/style."""
    for parent in element.parents:
        if parent.name in _SKIP_ANCESTORS:
            return True
    return False


def _translate_html_bilingual(html_content: str, source: str, target: str) -> str:
    """
    Translate HTML content in bilingual mode.

    For each block-level element, inserts a translated copy immediately
    after the original, marked with class ``glean-translation``.
    Non-block content (images, code blocks, etc.) is left untouched.

    Args:
        html_content: Original HTML string.
        source: Source language code (or "auto").
        target: Target language code (e.g. "zh-CN", "en").

    Returns:
        HTML string with interleaved original and translated blocks.
    """
    soup = BeautifulSoup(html_content, "html.parser")

    # Collect block elements with translatable text
    blocks: list[tuple[Tag, str]] = []
    for el in soup.find_all(list(_BLOCK_TAGS)):
        if _has_skip_ancestor(el):
            continue
        text = el.get_text(strip=True)
        if text:
            blocks.append((el, text))

    if not blocks:
        return html_content

    # Batch blocks into groups that fit within CHUNK_SIZE
    batches: list[list[tuple[Tag, str]]] = []
    current_batch: list[tuple[Tag, str]] = []
    current_length = 0
    separator = " ||| "

    for el, text in blocks:
        needed = len(text) + len(separator)
        if current_length + needed > CHUNK_SIZE and current_batch:
            batches.append(current_batch)
            current_batch = []
            current_length = 0
        current_batch.append((el, text))
        current_length += needed

    if current_batch:
        batches.append(current_batch)

    # Translate batches and insert bilingual elements
    translator = GoogleTranslator(source=source, target=target)

    for batch in batches:
        texts = [t for _, t in batch]
        combined = separator.join(texts)

        if len(combined) <= CHUNK_SIZE and all(len(t) <= CHUNK_SIZE for _, t in batch):
            translated_combined: str = translator.translate(combined)
            translated_parts = translated_combined.split("|||")

            for i, (el, _) in enumerate(batch):
                translated_text = translated_parts[i].strip() if i < len(translated_parts) else ""
                if translated_text:
                    new_tag = soup.new_tag(el.name)
                    new_tag.string = translated_text
                    new_tag["class"] = "glean-translation"
                    el.insert_after(new_tag)
        else:
            # Translate individually if batch is too long
            for el, text in batch:
                translated = _translate_text(text, source, target)
                if translated and translated.strip():
                    new_tag = soup.new_tag(el.name)
                    new_tag.string = translated.strip()
                    new_tag["class"] = "glean-translation"
                    el.insert_after(new_tag)

    return str(soup)


async def translate_entry_task(
    _ctx: dict[str, Any], entry_id: str, target_language: str
) -> dict[str, Any]:
    """
    Translate an entry's title and content.

    Args:
        _ctx: Worker context.
        entry_id: Entry UUID.
        target_language: Target language code (e.g. "zh-CN", "en").

    Returns:
        Result dictionary with status.
    """
    logger.info(
        "Starting translation task",
        extra={"entry_id": entry_id, "target_language": target_language},
    )

    async with get_session_context() as session:
        # Get the translation record
        stmt = select(EntryTranslation).where(
            EntryTranslation.entry_id == entry_id,
            EntryTranslation.target_language == target_language,
        )
        result = await session.execute(stmt)
        translation = result.scalar_one_or_none()

        if not translation:
            logger.error("Translation record not found", extra={"entry_id": entry_id})
            return {"status": "error", "message": "Translation record not found"}

        # Mark as processing
        translation.status = "processing"
        await session.commit()

        # Get the entry
        entry_stmt = select(Entry).where(Entry.id == entry_id)
        entry_result = await session.execute(entry_stmt)
        entry = entry_result.scalar_one_or_none()

        if not entry:
            translation.status = "failed"
            translation.error = "Entry not found"
            await session.commit()
            return {"status": "error", "message": "Entry not found"}

        try:
            source = "auto"

            # Translate title
            translated_title = None
            if entry.title:
                translated_title = _translate_text(entry.title, source, target_language)
                logger.info(
                    "Title translated",
                    extra={"entry_id": entry_id, "original": entry.title[:50]},
                )

            # Translate content (HTML) — bilingual mode
            translated_content = None
            content = entry.content or entry.summary
            if content:
                translated_content = _translate_html_bilingual(content, source, target_language)
                logger.info(
                    "Content translated",
                    extra={
                        "entry_id": entry_id,
                        "content_length": len(content),
                        "translated_length": len(translated_content),
                    },
                )

            # Update translation record
            translation.translated_title = translated_title
            translation.translated_content = translated_content
            translation.status = "done"
            translation.error = None
            await session.commit()

            logger.info(
                "Translation completed successfully",
                extra={"entry_id": entry_id, "target_language": target_language},
            )
            return {"status": "success", "entry_id": entry_id}

        except Exception as e:
            error_msg = str(e)
            logger.exception(
                "Translation failed",
                extra={"entry_id": entry_id, "error": error_msg},
            )
            translation.status = "failed"
            translation.error = error_msg
            await session.commit()
            return {"status": "error", "entry_id": entry_id, "error": error_msg}
