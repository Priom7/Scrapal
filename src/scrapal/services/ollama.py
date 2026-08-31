from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import monotonic
from typing import Any

import httpx
from redis.asyncio import Redis
from redis.exceptions import LockError

from scrapal.config import get_settings


class OllamaUnavailable(RuntimeError):
    pass


class OllamaService:
    _last_chat_error: str | None = None
    _last_chat_error_at: float = 0

    def __init__(self) -> None:
        self.settings = get_settings()

    @asynccontextmanager
    async def workload(self) -> AsyncIterator[None]:
        redis = Redis.from_url(self.settings.redis_url)
        lock = redis.lock("scrapal:ollama:workload", timeout=360, blocking_timeout=120)
        acquired = False
        try:
            acquired = bool(await lock.acquire())
            if not acquired:
                raise OllamaUnavailable(
                    "Local AI is busy with another embedding or chat workload. Retry in a moment."
                )
            yield
        finally:
            if acquired:
                try:
                    await lock.release()
                except LockError:
                    pass
            await redis.aclose()

    async def health(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                version, tags = await _gather(
                    client.get(f"{self.settings.ollama_base_url}/api/version"),
                    client.get(f"{self.settings.ollama_base_url}/api/tags"),
                )
            version.raise_for_status()
            tags.raise_for_status()
            degraded = self._last_chat_error and monotonic() - self._last_chat_error_at < 300
            return {
                "status": "degraded" if degraded else "ok",
                "version": version.json().get("version"),
                "models": [model["name"] for model in tags.json().get("models", [])],
                **({"detail": self._last_chat_error} if degraded else {}),
            }
        except (httpx.HTTPError, ValueError) as exc:
            return {"status": "unavailable", "detail": str(exc)}

    async def embed(
        self,
        texts: list[str],
        *,
        keep_alive: str | int = "10m",
        locked: bool = False,
        unload_chat: bool = False,
    ) -> list[list[float]]:
        if not texts:
            return []
        if not locked:
            async with self.workload():
                return await self.embed(
                    texts,
                    keep_alive=keep_alive,
                    locked=True,
                    unload_chat=unload_chat,
                )
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                if unload_chat:
                    for model in {self.settings.ollama_chat_model, self.settings.ollama_fast_model}:
                        unload = await client.post(
                            f"{self.settings.ollama_base_url}/api/generate",
                            json={"model": model, "keep_alive": 0},
                        )
                        unload.raise_for_status()
                response = await client.post(
                    f"{self.settings.ollama_base_url}/api/embed",
                    json={
                        "model": self.settings.ollama_embed_model,
                        "input": texts,
                        "keep_alive": keep_alive,
                    },
                )
            response.raise_for_status()
            return response.json()["embeddings"]
        except (httpx.HTTPError, KeyError) as exc:
            raise OllamaUnavailable(str(exc)) from exc

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        locked: bool = False,
        model: str | None = None,
    ) -> str:
        if not locked:
            async with self.workload():
                return await self.chat(messages, locked=True, model=model)
        selected_model = model or self.settings.ollama_chat_model
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                response = await client.post(
                    f"{self.settings.ollama_base_url}/api/chat",
                    json={
                        "model": selected_model,
                        "messages": messages,
                        "stream": False,
                        "keep_alive": "10m",
                        "options": {"temperature": 0.1, "num_predict": 256},
                    },
                )
            response.raise_for_status()
            content = response.json()["message"]["content"]
            type(self)._last_chat_error = None
            type(self)._last_chat_error_at = 0
            return content
        except httpx.TimeoutException as exc:
            detail = "The chat model timed out while Ollama was busy. Crawl embeddings may still be running; retry shortly."
            type(self)._last_chat_error = detail
            type(self)._last_chat_error_at = monotonic()
            raise OllamaUnavailable(detail) from exc
        except httpx.HTTPStatusError as exc:
            raise OllamaUnavailable(
                f"Ollama returned HTTP {exc.response.status_code} for chat generation"
            ) from exc
        except (httpx.HTTPError, KeyError) as exc:
            raise OllamaUnavailable(str(exc) or type(exc).__name__) from exc


async def _gather(*coroutines: Any) -> tuple[Any, ...]:
    import asyncio

    return tuple(await asyncio.gather(*coroutines))
