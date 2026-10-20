from pathlib import Path
import re
import secrets


STORAGE_NAME = re.compile(r"^[0-9a-f]{64}\.bin$")


class EncryptedStorage:
    def __init__(self, directory: str):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)

    def new_name(self) -> str:
        return f"{secrets.token_hex(32)}.bin"

    def path(self, storage_name: str) -> Path:
        if not STORAGE_NAME.fullmatch(storage_name):
            raise ValueError("Invalid storage identifier")
        candidate = (self.directory / storage_name).resolve()
        if candidate.parent != self.directory:
            raise ValueError("Invalid storage path")
        return candidate

    def delete(self, storage_name: str) -> None:
        try:
            self.path(storage_name).unlink(missing_ok=True)
        except ValueError:
            pass

