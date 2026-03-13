# RenPy Code — File-based IPC Bridge
# This file is auto-installed by the RenPy Code extension.
# It enables live communication between VS Code and the running game.
# DO NOT EDIT — changes will be overwritten on next install.

init -999 python:
    import os
    import json
    import time
    import threading

    _mcp_dir = os.path.join(config.gamedir, "_mcp")
    _mcp_lock = threading.Lock()
    _mcp_last_check = 0.0
    _mcp_heartbeat_time = 0.0
    _mcp_tracking = False
    _mcp_tracking_data = {"visits": {}, "transitions": [], "start_time": None}
    _mcp_last_label = None

    def _mcp_ensure_dir():
        if not os.path.exists(_mcp_dir):
            os.makedirs(_mcp_dir)

    def _mcp_serialize_value(val, depth=0):
        if depth > 3:
            return str(val)
        if val is None or isinstance(val, (bool, int, float)):
            return val
        if isinstance(val, str):
            return val[:500] if len(val) > 500 else val
        if hasattr(val, "keys"):
            result = {}
            count = 0
            for k in val:
                if count >= 50:
                    break
                try:
                    result[str(k)] = _mcp_serialize_value(val[k], depth + 1)
                except Exception:
                    result[str(k)] = "<error>"
                count += 1
            return result
        if hasattr(val, "__iter__"):
            result = []
            count = 0
            for item in val:
                if count >= 50:
                    break
                try:
                    result.append(_mcp_serialize_value(item, depth + 1))
                except Exception:
                    result.append("<error>")
                count += 1
            return result
        return str(val)

    def _mcp_get_variables():
        skip = {"say", "menu", "renpy", "store", "config", "style", "persistent",
                "gui", "build", "director", "iap", "achievement", "updater",
                "define", "default", "layeredimage", "screen"}
        import types
        result = {}
        for name in dir(store):
            if name.startswith("_") or name in skip:
                continue
            try:
                val = getattr(store, name)
                if isinstance(val, (types.ModuleType, types.FunctionType, type)):
                    continue
                if callable(val) and not hasattr(val, "keys"):
                    continue
                result[name] = _mcp_serialize_value(val)
            except Exception:
                pass
        return result

    def _mcp_get_current_label():
        try:
            ctx = renpy.game.context()
            node = ctx.current
            if hasattr(node, "name"):
                return node.name
            return str(node) if node else None
        except Exception:
            return None

    def _mcp_write_status(data):
        _mcp_ensure_dir()
        status_path = os.path.join(_mcp_dir, "status.json")
        tmp_path = status_path + ".tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, default=str)
            os.replace(tmp_path, status_path)
        except Exception:
            pass

    def _mcp_handle_command(cmd):
        action = cmd.get("action", "")

        if action == "ping":
            return {"action": "ping", "status": "ok", "engine": "renpy", "version": str(renpy.version_tuple)}

        elif action == "get_state":
            label = _mcp_get_current_label()
            variables = _mcp_get_variables()
            return {"action": "get_state", "status": "ok", "label": label, "variables": variables}

        elif action == "screenshot":
            _mcp_ensure_dir()
            ss_path = os.path.join(_mcp_dir, "screenshot.png")
            try:
                iface = renpy.game.interface
                if getattr(iface, "surftree", None) is not None:
                    surf = iface.save_screenshot()
                    if surf:
                        import pygame
                        pygame.image.save(surf, ss_path)
                        return {"action": "screenshot", "status": "ok", "path": ss_path}
                return {"action": "screenshot", "status": "error", "message": "Display not ready"}
            except Exception as e:
                return {"action": "screenshot", "status": "error", "message": str(e)}

        elif action == "eval":
            expr = cmd.get("expression", "")
            try:
                result = eval(expr)
                return {"action": "eval", "status": "ok", "result": _mcp_serialize_value(result)}
            except SyntaxError:
                try:
                    exec(expr, vars(store))
                    return {"action": "eval", "status": "ok", "result": None}
                except Exception as e:
                    return {"action": "eval", "status": "error", "message": str(e)}
            except Exception as e:
                return {"action": "eval", "status": "error", "message": str(e)}

        elif action == "notify":
            msg = cmd.get("message", "")
            renpy.notify(msg)
            return {"action": "notify", "status": "ok"}

        elif action == "jump":
            label = cmd.get("label", "")
            try:
                renpy.warp.warp(label)
                return {"action": "jump", "status": "ok"}
            except Exception as e:
                return {"action": "jump", "status": "error", "message": str(e)}

        elif action == "set_variable":
            name = cmd.get("name", "")
            value = cmd.get("value", "")
            try:
                import ast
                parsed = ast.literal_eval(value)
                setattr(store, name, parsed)
                return {"action": "set_variable", "status": "ok"}
            except Exception as e:
                return {"action": "set_variable", "status": "error", "message": str(e)}

        elif action == "screen_hierarchy":
            try:
                screens = []
                for s in renpy.display.screen.screens_by_name:
                    screens.append(s)
                return {"action": "screen_hierarchy", "status": "ok", "screens": screens}
            except Exception as e:
                return {"action": "screen_hierarchy", "status": "error", "message": str(e)}

        elif action == "start_tracking":
            global _mcp_tracking, _mcp_tracking_data
            _mcp_tracking = True
            _mcp_tracking_data = {"visits": {}, "transitions": [], "start_time": time.time()}
            return {"action": "start_tracking", "status": "ok"}

        elif action == "stop_tracking":
            global _mcp_tracking
            _mcp_tracking = False
            return {"action": "stop_tracking", "status": "ok"}

        elif action == "get_tracking":
            return {"action": "get_tracking", "status": "ok", "data": _mcp_tracking_data}

        elif action == "clear_tracking":
            global _mcp_tracking_data
            _mcp_tracking_data = {"visits": {}, "transitions": [], "start_time": None}
            return {"action": "clear_tracking", "status": "ok"}

        return {"action": action, "status": "error", "message": "Unknown action"}

    def _mcp_poll_callback():
        global _mcp_last_check, _mcp_heartbeat_time, _mcp_last_label, _mcp_tracking

        now = time.time()

        # Throttle polling to every 0.5s
        if now - _mcp_last_check < 0.5:
            return
        _mcp_last_check = now

        # Track label visits
        if _mcp_tracking:
            current = _mcp_get_current_label()
            if current and current != _mcp_last_label:
                if current in _mcp_tracking_data["visits"]:
                    _mcp_tracking_data["visits"][current] += 1
                else:
                    _mcp_tracking_data["visits"][current] = 1
                if _mcp_last_label:
                    _mcp_tracking_data["transitions"].append({
                        "from": _mcp_last_label,
                        "to": current,
                        "time": now
                    })
                _mcp_last_label = current

        # Heartbeat every 3s
        if now - _mcp_heartbeat_time >= 3.0:
            _mcp_heartbeat_time = now
            label = _mcp_get_current_label()
            _mcp_write_status({"action": "heartbeat", "status": "ok", "label": label, "time": now})

        # Check for commands
        with _mcp_lock:
            cmd_path = os.path.join(_mcp_dir, "cmd.json")
            if not os.path.exists(cmd_path):
                return

            try:
                mtime = os.path.getmtime(cmd_path)
                if mtime < _mcp_last_check - 0.5:
                    return

                with open(cmd_path, "r", encoding="utf-8") as f:
                    cmd = json.load(f)

                os.remove(cmd_path)
                response = _mcp_handle_command(cmd)
                _mcp_write_status(response)

            except Exception:
                pass

    config.periodic_callbacks.append(_mcp_poll_callback)
