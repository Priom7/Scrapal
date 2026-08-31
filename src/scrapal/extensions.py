from abc import ABC, abstractmethod
from importlib.metadata import entry_points
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field


class ExtensionManifest(BaseModel):
    name: str
    version: str
    description: str
    capabilities: list[str] = Field(default_factory=list)
    content_types: list[str] = Field(default_factory=list)
    required_secrets: list[str] = Field(default_factory=list)


ConfigT = TypeVar("ConfigT", bound=BaseModel)


class Connector(ABC, Generic[ConfigT]):
    manifest: ExtensionManifest
    config_model: type[ConfigT]

    @abstractmethod
    async def discover(self, config: ConfigT) -> list[str]: ...

    @abstractmethod
    async def extract(self, url: str, content: bytes, content_type: str) -> dict[str, Any]: ...

    async def health(self) -> dict[str, Any]:
        return {"status": "ok", "extension": self.manifest.name, "version": self.manifest.version}


def extension_catalog() -> dict[str, list[ExtensionManifest]]:
    catalog: dict[str, list[ExtensionManifest]] = {}
    for group in (
        "scrapal.connectors",
        "scrapal.schema_packs",
        "scrapal.extractors",
        "scrapal.ai_providers",
        "scrapal.agent_tools",
        "scrapal.exporters",
    ):
        catalog[group] = []
        for point in entry_points(group=group):
            loaded = point.load()
            manifest = getattr(loaded, "manifest", None)
            if manifest:
                catalog[group].append(manifest)
    return catalog
