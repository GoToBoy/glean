"""Redis key templates and TTL constants.

Centralized management of all Redis keys used in the application to prevent
conflicts and make maintenance easier.
"""


class RedisKeys:
    """Redis key templates and helper methods."""

    # ============================================================================
    # Auth Related Keys
    # ============================================================================

    # OIDC state for CSRF protection
    # Format: oidc_state:{state}
    # TTL: 5 minutes (300 seconds)
    OIDC_STATE_TTL = 300

    @staticmethod
    def oidc_state(state: str) -> str:
        """
        Get OIDC state key for CSRF protection.

        Args:
            state: Random state token generated during authorization.

        Returns:
            Redis key string.
        """
        return f"oidc_state:{state}"

    # ============================================================================
    # Preference System Keys
    # ============================================================================

    # Debounce key for preference update tasks
    # Format: pref_update_debounce:{user_id}:{entry_id}:{signal_type}
    # TTL: 30 seconds
    PREF_UPDATE_DEBOUNCE_TTL = 30

    @staticmethod
    def pref_update_debounce(user_id: int | str, entry_id: int | str, signal_type: str) -> str:
        """
        Get preference update debounce key.

        Prevents duplicate preference update tasks from being queued
        within the debounce window.

        Args:
            user_id: User ID (int or UUID string).
            entry_id: Entry ID (int or UUID string).
            signal_type: Preference signal type (e.g., 'read', 'like', 'bookmark').

        Returns:
            Redis key string.
        """
        return f"pref_update_debounce:{user_id}:{entry_id}:{signal_type}"

    # Lock key for preference updates
    # Format: preference_lock:{user_id}:{vector_type}
    # TTL: 10 seconds
    PREFERENCE_LOCK_TTL = 10
    PREFERENCE_LOCK_BLOCKING_TIMEOUT = 5

    @staticmethod
    def preference_lock(user_id: int | str, vector_type: str) -> str:
        """
        Get preference lock key.

        Prevents race conditions during preference vector updates.

        Args:
            user_id: User ID (int or UUID string).
            vector_type: Vector type (e.g., 'entry', 'feed').

        Returns:
            Redis key string.
        """
        return f"preference_lock:{user_id}:{vector_type}"
