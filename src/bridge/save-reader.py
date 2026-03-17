#!/usr/bin/env python3
"""
Extract game variables from a Ren'Py save file.
Uses stub classes to safely unpickle without requiring full Ren'Py initialization.
Output: JSON to stdout.
Usage: python save-reader.py <save_file_path>
"""

import sys
import os
import zipfile
import pickle
import json
import io


class StubObj:
    def __init__(self, *a, **kw):
        pass

    def __setstate__(self, state):
        try:
            if isinstance(state, dict):
                self.__dict__.update(state)
            elif isinstance(state, (tuple, list)):
                for item in state:
                    if isinstance(item, dict):
                        self.__dict__.update(item)
        except Exception:
            pass

    def __hash__(self):
        return id(self)

    def __repr__(self):
        return "<stub>"


class StubDict(dict):
    def __setstate__(self, state):
        try:
            if isinstance(state, dict):
                self.update(state)
            elif isinstance(state, (tuple, list)):
                for item in state:
                    if isinstance(item, dict):
                        self.update(item)
        except Exception:
            pass


class StubList(list):
    def __setstate__(self, state):
        try:
            if isinstance(state, (list, tuple)):
                if state and isinstance(state[0], list):
                    self.extend(state[0])
                else:
                    self.extend(state)
        except Exception:
            pass


class StubSet(set):
    def __setstate__(self, state):
        try:
            if isinstance(state, (list, tuple)):
                for item in state:
                    try:
                        super().add(item)
                    except TypeError:
                        pass
            elif isinstance(state, (set, frozenset)):
                self.update(state)
        except Exception:
            pass


class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        safe = {"builtins", "collections", "datetime", "copyreg", "_codecs"}
        if module in safe:
            try:
                return super().find_class(module, name)
            except Exception:
                return StubObj
        if "Dict" in name:
            return StubDict
        if "List" in name:
            return StubList
        if "Set" in name:
            return StubSet
        return StubObj


def serialize_value(val, depth=0):
    if depth > 3:
        return str(val)
    if val is None or isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, str):
        return val[:500]
    if isinstance(val, dict):
        result = {}
        for k in list(val.keys())[:50]:
            try:
                result[str(k)] = serialize_value(val[k], depth + 1)
            except Exception:
                result[str(k)] = "<error>"
        return result
    if isinstance(val, (list, tuple)):
        result = []
        for item in list(val)[:50]:
            try:
                result.append(serialize_value(item, depth + 1))
            except Exception:
                result.append("<error>")
        return result
    if isinstance(val, set):
        return list(val)[:50]
    return str(val)


def extract_variables(save_path):
    with zipfile.ZipFile(save_path) as z:
        log_data = z.read("log")

    obj = SafeUnpickler(io.BytesIO(log_data)).load()

    variables = {}

    if isinstance(obj, tuple) and len(obj) >= 1 and isinstance(obj[0], dict):
        store_dict = obj[0]
        for key, val in store_dict.items():
            # Filter: only show store.* variables, skip internal ones
            if not key.startswith("store."):
                continue
            var_name = key[6:]  # Remove "store." prefix
            # Skip internal/private variables
            if var_name.startswith("_") and var_name not in ("_version",):
                continue
            try:
                variables[var_name] = serialize_value(val)
            except Exception:
                variables[var_name] = "<error>"

    return variables


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: save-reader.py <save_file_path>"}))
        sys.exit(1)

    save_path = sys.argv[1]
    if not os.path.exists(save_path):
        print(json.dumps({"error": f"File not found: {save_path}"}))
        sys.exit(1)

    try:
        variables = extract_variables(save_path)
        print(json.dumps({"variables": variables}, ensure_ascii=False, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
