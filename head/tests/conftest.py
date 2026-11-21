import sys
from pathlib import Path

import pytest

HEAD_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HEAD_DIR))
MODELS = HEAD_DIR / "models"


@pytest.fixture(scope="session")
def models_dir():
    if not (MODELS / "base.obj").exists():
        pytest.skip("run head/setup.sh first")
    return MODELS


@pytest.fixture(scope="session")
def template(models_dir):
    from uncle_head.template import load_head_template

    return load_head_template(models_dir)
