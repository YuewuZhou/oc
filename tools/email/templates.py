from __future__ import annotations

import re
from html import unescape
from pathlib import Path
from typing import Any, Mapping

from jinja2 import Environment, FileSystemLoader, TemplateNotFound


class TemplateNotFoundError(Exception):
    pass


_TEMPLATE_DIR = Path(__file__).with_name("templates")
_environment = Environment(loader=FileSystemLoader(_TEMPLATE_DIR), autoescape=True)


def _strip_html_tags(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def template_exists(name: str) -> bool:
    return (_TEMPLATE_DIR / f"{name}.html").is_file()


def render_template(name: str, context: Mapping[str, Any]) -> tuple[str, str]:
    try:
        template = _environment.get_template(f"{name}.html")
    except TemplateNotFound as exc:
        raise TemplateNotFoundError(name) from exc

    html_body = template.render(**context)
    text_body = _strip_html_tags(html_body)
    return html_body, text_body
