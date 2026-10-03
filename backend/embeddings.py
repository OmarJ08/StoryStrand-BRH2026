"""BGE-M3 on MLX for request-time text embedding (same setup as data/scripts/embed_items.py).

BAAI/bge-m3 ships no safetensors, so the MLX conversion is used. Dense vectors are the
CLS token, L2-normalized; mlx-embeddings' text_embeds is mean-pooled and must not be used.
"""
import threading

import mlx.core as mx
import numpy as np
from mlx_embeddings.utils import load

MODEL = "mlx-community/bge-m3-mlx-fp16"
MAX_TOKENS = 512

_lock = threading.Lock()      # MLX calls are serialized; FastAPI runs sync handlers in threads
_model = None
_tokenizer = None


def embed(texts: list[str]) -> np.ndarray:
    global _model, _tokenizer
    with _lock:
        if _model is None:
            _model, _tokenizer = load(MODEL)
        inp = _tokenizer._tokenizer(texts, return_tensors="mlx", padding=True,
                                    truncation=True, max_length=MAX_TOKENS)
        h = _model(inp["input_ids"], attention_mask=inp["attention_mask"]).last_hidden_state[:, 0]
        h = np.array(h.astype(mx.float32))
    return h / np.linalg.norm(h, axis=1, keepdims=True)


def warm_in_background() -> None:
    """Load the model off the request path so the first route query isn't slow."""
    threading.Thread(target=lambda: embed(["warm up"]), daemon=True).start()
