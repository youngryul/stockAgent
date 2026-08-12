"""LLM helper shared by specialist agents."""

from __future__ import annotations

import json
from typing import TypeVar

from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from src.config import get_settings

T = TypeVar("T", bound=BaseModel)


def get_llm(temperature: float = 0.2) -> ChatOpenAI:
    """Create a ChatOpenAI client from settings."""
    settings = get_settings()
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openai_api_key or None,
        temperature=temperature,
    )


def structured_invoke(system: str, user: str, schema: type[T]) -> T:
    """Invoke the LLM with structured output bound to a Pydantic schema."""
    llm = get_llm().with_structured_output(schema)
    result = llm.invoke(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    )
    if isinstance(result, schema):
        return result
    if isinstance(result, dict):
        return schema.model_validate(result)
    return schema.model_validate_json(json.dumps(result))
