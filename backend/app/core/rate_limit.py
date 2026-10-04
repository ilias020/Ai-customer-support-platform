import math
import threading
import time
from collections import deque
from collections.abc import Callable


class InMemoryRateLimiter:
    """Process-local sliding-window rate limiter.

    State is kept in memory of the current process, so limits apply per backend process.
    """

    def __init__(
        self,
        max_attempts: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._clock = clock
        self._attempts: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_cleanup = clock()

    def hit(self, key: str) -> int | None:
        """Registers an attempt for `key`.

        Returns `None` when the attempt is allowed, otherwise the number of seconds
        after which a new attempt is allowed.
        """
        with self._lock:
            now = self._clock()
            window_start = now - self.window_seconds
            self._cleanup_expired(now, window_start)

            attempts = self._attempts.setdefault(key, deque())
            while attempts and attempts[0] <= window_start:
                attempts.popleft()

            if len(attempts) >= self.max_attempts:
                retry_after = attempts[0] + self.window_seconds - now
                return max(1, math.ceil(retry_after))

            attempts.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._attempts.clear()

    def _cleanup_expired(self, now: float, window_start: float) -> None:
        if now - self._last_cleanup < self.window_seconds:
            return
        self._last_cleanup = now
        for key in [k for k, v in self._attempts.items() if not v or v[-1] <= window_start]:
            del self._attempts[key]
