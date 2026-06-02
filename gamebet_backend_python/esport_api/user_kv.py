ARRAY_KEYS = {"ACCOUNT", "PROXY", "GoogleCode", "Wallet"}


def is_array_key(key: str) -> bool:
    return key in ARRAY_KEYS


def empty_direct_value(key: str):
    return [] if is_array_key(key) else {}


def wrap_object_direct(data):
    return data
