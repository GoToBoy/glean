"""Tests for translation worker task."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from glean_worker.tasks.translation import (
    _has_skip_ancestor,
    _translate_html_bilingual,
    _translate_text,
    translate_entry_task,
)


class TestTranslateText:
    """Test _translate_text helper function."""

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_short_text_translated_directly(self, mock_translator_class):
        """Test that short text is translated in a single call."""
        mock_instance = MagicMock()
        mock_instance.translate.return_value = "你好世界"
        mock_translator_class.return_value = mock_instance

        result = _translate_text("Hello world", "auto", "zh-CN")

        assert result == "你好世界"
        mock_translator_class.assert_called_once_with(source="auto", target="zh-CN")
        mock_instance.translate.assert_called_once_with("Hello world")

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_empty_text_returns_as_is(self, mock_translator_class):
        """Test that empty text is returned without translation."""
        result = _translate_text("", "auto", "zh-CN")

        assert result == ""
        mock_translator_class.assert_not_called()

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_whitespace_text_returns_as_is(self, mock_translator_class):
        """Test that whitespace-only text is returned without translation."""
        result = _translate_text("   ", "auto", "zh-CN")

        assert result == "   "
        mock_translator_class.assert_not_called()

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_long_text_chunked(self, mock_translator_class):
        """Test that long text is split into chunks."""
        mock_instance = MagicMock()
        mock_instance.translate.side_effect = lambda t: f"translated({t[:20]}...)"
        mock_translator_class.return_value = mock_instance

        # Create text longer than CHUNK_SIZE (4500)
        long_text = ". ".join(["This is a sentence"] * 500)

        result = _translate_text(long_text, "auto", "zh-CN")

        assert result is not None
        assert mock_instance.translate.call_count > 1


class TestHasSkipAncestor:
    """Test _has_skip_ancestor helper function."""

    def test_inside_code(self):
        """Test element inside code is skipped."""
        from bs4 import BeautifulSoup

        soup = BeautifulSoup("<code><span>var x</span></code>", "html.parser")
        span = soup.find("span")
        assert _has_skip_ancestor(span) is True

    def test_inside_pre(self):
        """Test element inside pre is skipped."""
        from bs4 import BeautifulSoup

        soup = BeautifulSoup("<pre><p>code</p></pre>", "html.parser")
        p = soup.find("p")
        assert _has_skip_ancestor(p) is True

    def test_normal_element(self):
        """Test normal element is not skipped."""
        from bs4 import BeautifulSoup

        soup = BeautifulSoup("<div><p>text</p></div>", "html.parser")
        p = soup.find("p")
        assert _has_skip_ancestor(p) is False


class TestTranslateHtmlBilingual:
    """Test _translate_html_bilingual function."""

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_inserts_translation_after_paragraph(self, mock_translator_class):
        """Test that translation is inserted after each paragraph."""
        mock_instance = MagicMock()
        mock_instance.translate.return_value = "你好世界"
        mock_translator_class.return_value = mock_instance

        html = "<p>Hello world</p>"
        result = _translate_html_bilingual(html, "auto", "zh-CN")

        assert "<p>Hello world</p>" in result
        assert 'class="glean-translation"' in result
        assert "你好世界" in result

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_preserves_original_content(self, mock_translator_class):
        """Test that original content is preserved unchanged."""
        mock_instance = MagicMock()
        mock_instance.translate.return_value = "第一 ||| 第二"
        mock_translator_class.return_value = mock_instance

        html = "<p>First</p><p>Second</p>"
        result = _translate_html_bilingual(html, "auto", "zh-CN")

        assert "<p>First</p>" in result
        assert "<p>Second</p>" in result

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_skips_code_blocks(self, mock_translator_class):
        """Test that code blocks are not translated."""
        mock_instance = MagicMock()
        mock_instance.translate.return_value = "可见文本"
        mock_translator_class.return_value = mock_instance

        html = "<p>Visible text</p><pre><code>var x = 1;</code></pre>"
        result = _translate_html_bilingual(html, "auto", "zh-CN")

        # Only the <p> should have a translation, not the code
        assert "可见文本" in result
        assert result.count("glean-translation") == 1

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_handles_headings(self, mock_translator_class):
        """Test that headings get bilingual treatment."""
        mock_instance = MagicMock()
        mock_instance.translate.return_value = "标题 ||| 内容"
        mock_translator_class.return_value = mock_instance

        html = "<h2>Title</h2><p>Content</p>"
        result = _translate_html_bilingual(html, "auto", "zh-CN")

        assert "<h2>Title</h2>" in result
        assert "glean-translation" in result

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_empty_html_returns_as_is(self, mock_translator_class):
        """Test that HTML with no translatable blocks returns unchanged."""
        html = "<div><img src='test.png'/></div>"
        result = _translate_html_bilingual(html, "auto", "zh-CN")

        assert result == html
        mock_translator_class.assert_not_called()

    @patch("glean_worker.tasks.translation.GoogleTranslator")
    def test_handles_list_items(self, mock_translator_class):
        """Test that list items get bilingual treatment."""
        mock_instance = MagicMock()
        mock_instance.translate.return_value = "项目一 ||| 项目二"
        mock_translator_class.return_value = mock_instance

        html = "<ul><li>Item one</li><li>Item two</li></ul>"
        result = _translate_html_bilingual(html, "auto", "zh-CN")

        assert "<li>Item one</li>" in result
        assert "<li>Item two</li>" in result
        assert result.count("glean-translation") == 2


class TestTranslateEntryTask:
    """Test translate_entry_task worker function."""

    @pytest.mark.asyncio
    async def test_translation_record_not_found(self):
        """Test task handles missing translation record."""
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        with patch("glean_worker.tasks.translation.get_session_context") as mock_ctx:
            mock_ctx.return_value.__aenter__.return_value = mock_session

            result = await translate_entry_task(
                {}, entry_id="nonexistent-id", target_language="zh-CN"
            )

        assert result["status"] == "error"
        assert "not found" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_entry_not_found(self):
        """Test task handles missing entry."""
        mock_translation = MagicMock()
        mock_translation.status = "pending"
        mock_translation.entry_id = "test-entry-id"

        mock_session = AsyncMock()

        translation_result = MagicMock()
        translation_result.scalar_one_or_none.return_value = mock_translation
        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = None

        mock_session.execute.side_effect = [translation_result, entry_result]

        with patch("glean_worker.tasks.translation.get_session_context") as mock_ctx:
            mock_ctx.return_value.__aenter__.return_value = mock_session

            result = await translate_entry_task(
                {}, entry_id="test-entry-id", target_language="zh-CN"
            )

        assert result["status"] == "error"
        assert mock_translation.status == "failed"

    @pytest.mark.asyncio
    async def test_successful_translation(self):
        """Test successful entry translation produces bilingual content."""
        mock_translation = MagicMock()
        mock_translation.status = "pending"
        mock_translation.entry_id = "test-entry-id"

        mock_entry = MagicMock()
        mock_entry.id = "test-entry-id"
        mock_entry.title = "Hello World"
        mock_entry.content = "<p>This is content.</p>"
        mock_entry.summary = None

        mock_session = AsyncMock()

        translation_result = MagicMock()
        translation_result.scalar_one_or_none.return_value = mock_translation
        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = mock_entry

        mock_session.execute.side_effect = [translation_result, entry_result]

        with (
            patch("glean_worker.tasks.translation.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.translation._translate_text") as mock_translate_text,
            patch(
                "glean_worker.tasks.translation._translate_html_bilingual"
            ) as mock_translate_html,
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            mock_translate_text.return_value = "你好世界"
            mock_translate_html.return_value = (
                '<p>This is content.</p><p class="glean-translation">这是内容。</p>'
            )

            result = await translate_entry_task(
                {}, entry_id="test-entry-id", target_language="zh-CN"
            )

        assert result["status"] == "success"
        assert mock_translation.status == "done"
        assert mock_translation.translated_title == "你好世界"
        assert "glean-translation" in mock_translation.translated_content
        assert mock_translation.error is None

    @pytest.mark.asyncio
    async def test_translation_uses_summary_when_no_content(self):
        """Test that summary is used when content is None."""
        mock_translation = MagicMock()
        mock_translation.status = "pending"

        mock_entry = MagicMock()
        mock_entry.id = "test-entry-id"
        mock_entry.title = "Title"
        mock_entry.content = None
        mock_entry.summary = "<p>Summary text.</p>"

        mock_session = AsyncMock()

        translation_result = MagicMock()
        translation_result.scalar_one_or_none.return_value = mock_translation
        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = mock_entry

        mock_session.execute.side_effect = [translation_result, entry_result]

        with (
            patch("glean_worker.tasks.translation.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.translation._translate_text") as mock_translate_text,
            patch(
                "glean_worker.tasks.translation._translate_html_bilingual"
            ) as mock_translate_html,
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            mock_translate_text.return_value = "标题"
            mock_translate_html.return_value = "<p>摘要文本。</p>"

            await translate_entry_task({}, entry_id="test-entry-id", target_language="zh-CN")

        mock_translate_html.assert_called_once_with("<p>Summary text.</p>", "auto", "zh-CN")

    @pytest.mark.asyncio
    async def test_translation_error_sets_failed_status(self):
        """Test that translation errors set failed status."""
        mock_translation = MagicMock()
        mock_translation.status = "pending"

        mock_entry = MagicMock()
        mock_entry.id = "test-entry-id"
        mock_entry.title = "Title"
        mock_entry.content = "<p>Content</p>"
        mock_entry.summary = None

        mock_session = AsyncMock()

        translation_result = MagicMock()
        translation_result.scalar_one_or_none.return_value = mock_translation
        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = mock_entry

        mock_session.execute.side_effect = [translation_result, entry_result]

        with (
            patch("glean_worker.tasks.translation.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.translation._translate_text") as mock_translate_text,
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            mock_translate_text.side_effect = Exception("API rate limit exceeded")

            result = await translate_entry_task(
                {}, entry_id="test-entry-id", target_language="zh-CN"
            )

        assert result["status"] == "error"
        assert mock_translation.status == "failed"
        assert "rate limit" in mock_translation.error.lower()
