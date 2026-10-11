"""Language-neutral user-facing messages. The server sends {"key", "params"}; the web UI translates."""
from __future__ import annotations


class UserError(Exception):
    def __init__(self, key: str, **params):
        super().__init__(key)
        self.key = key
        self.params = params

    def to_dict(self) -> dict:
        return {"key": self.key, "params": self.params}
