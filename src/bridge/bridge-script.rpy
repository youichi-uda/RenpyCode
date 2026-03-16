# RenPy Code — File-based IPC Bridge
# This file is auto-installed by the RenPy Code extension.
# It enables live communication between VS Code and the running game.
# DO NOT EDIT — changes will be overwritten on next install.

# Exclude bridge from distribution builds
init python:
    build.classify("game/_mcp_bridge.rpy", None)
    build.classify("game/_mcp_bridge.rpyc", None)
    build.classify("game/_mcp/**", None)

# Only activate in developer mode
init -999 python:
    if not config.developer:
        pass
    else:
        import os
        import json
        import time
        import threading

        _mcp_dir = os.path.join(config.gamedir, "_mcp")
        _mcp_lock = threading.Lock()
        _mcp_last_check = 0.0
        _mcp_heartbeat_time = 0.0
        _mcp_last_label = None
        _mcp_current_label = None
        _mcp_tracking_save_time = 0.0

        def _mcp_ensure_dir():
            if not os.path.exists(_mcp_dir):
                os.makedirs(_mcp_dir)

        # Persist tracking state to file so it survives game restarts (e.g. return to title)
        def _mcp_load_tracking():
            global _mcp_tracking, _mcp_tracking_data
            tp = os.path.join(_mcp_dir, "tracking.json")
            try:
                if os.path.exists(tp):
                    with open(tp, "r", encoding="utf-8") as f:
                        saved = json.load(f)
                    _mcp_tracking = saved.get("active", False)
                    _mcp_tracking_data = saved.get("data", {"visits": {}, "transitions": [], "start_time": None})
                    return
            except Exception:
                pass
            _mcp_tracking = False
            _mcp_tracking_data = {"visits": {}, "transitions": [], "start_time": None}

        def _mcp_save_tracking():
            global _mcp_tracking_save_time
            _mcp_ensure_dir()
            tp = os.path.join(_mcp_dir, "tracking.json")
            tmp = tp + ".tmp"
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump({"active": _mcp_tracking, "data": _mcp_tracking_data}, f, ensure_ascii=False, default=str)
                os.replace(tmp, tp)
                _mcp_tracking_save_time = time.time()
            except Exception:
                pass

        _mcp_ensure_dir()
        _mcp_load_tracking()

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
            # Returns the label tracked by label_callbacks (most reliable)
            return _mcp_current_label

        def _mcp_label_callback(label, abnormal):
            global _mcp_current_label, _mcp_last_label, _mcp_tracking
            prev = _mcp_current_label
            _mcp_current_label = label
            if _mcp_tracking and label and label != prev:
                if label in _mcp_tracking_data["visits"]:
                    _mcp_tracking_data["visits"][label] += 1
                else:
                    _mcp_tracking_data["visits"][label] = 1
                if prev:
                    _mcp_tracking_data["transitions"].append({
                        "from": prev,
                        "to": label,
                        "time": time.time()
                    })
                _mcp_last_label = label
                _mcp_save_tracking()

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
                    renpy.take_screenshot()
                    result = renpy.game.interface.save_screenshot(ss_path)
                    if result:
                        return {"action": "screenshot", "status": "ok", "path": ss_path}
                    return {"action": "screenshot", "status": "error", "message": "save_screenshot returned False"}
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
                    target_node = renpy.game.script.namemap.get(label)
                    if target_node is None:
                        return {"action": "jump", "status": "error", "message": "Label '{}' not found".format(label)}
                    fname = target_node.filename
                    if fname.startswith("game/") or fname.startswith("game\\"):
                        fname = fname[5:]
                    spec = "{}:{}".format(fname, target_node.linenumber)
                    renpy.session["_mcp_pending_warp_spec"] = spec
                    return {"action": "jump", "status": "ok", "message": "Warp to '{}' ({}) queued".format(label, spec)}
                except Exception as e:
                    return {"action": "jump", "status": "error", "message": str(e)}

            elif action == "warp":
                spec = cmd.get("spec", "")
                try:
                    renpy.session["_mcp_pending_warp_spec"] = spec
                    return {"action": "warp", "status": "ok", "message": "Warp to '{}' queued".format(spec)}
                except Exception as e:
                    return {"action": "warp", "status": "error", "message": str(e)}

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
                if not _mcp_tracking_data.get("start_time"):
                    _mcp_tracking_data["start_time"] = time.time()
                _mcp_save_tracking()
                return {"action": "start_tracking", "status": "ok"}

            elif action == "stop_tracking":
                global _mcp_tracking
                _mcp_tracking = False
                _mcp_save_tracking()
                return {"action": "stop_tracking", "status": "ok"}

            elif action == "get_tracking":
                return {"action": "get_tracking", "status": "ok", "data": _mcp_tracking_data, "active": _mcp_tracking}

            elif action == "clear_tracking":
                global _mcp_tracking_data
                _mcp_tracking_data = {"visits": {}, "transitions": [], "start_time": None}
                _mcp_save_tracking()
                return {"action": "clear_tracking", "status": "ok"}

            return {"action": action, "status": "error", "message": "Unknown action"}

        def _mcp_poll_callback():
            global _mcp_last_check, _mcp_heartbeat_time, _mcp_last_label, _mcp_tracking

            now = time.time()

            # Throttle polling to every 0.5s
            if now - _mcp_last_check < 0.5:
                return
            _mcp_last_check = now

            # Heartbeat every 2s
            if now - _mcp_heartbeat_time >= 2.0:
                _mcp_heartbeat_time = now
                label = _mcp_get_current_label()
                # Get current scene tag for change detection
                scene_tag = None
                try:
                    showing = renpy.get_showing_tags()
                    scene_tag = str(sorted(showing)) if showing else None
                except Exception:
                    pass
                _mcp_write_status({"action": "heartbeat", "status": "ok", "label": label, "scene": scene_tag, "time": now})

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
        config.label_callbacks.append(_mcp_label_callback)

        # Warp via periodic_callbacks — uses Ren'Py's built-in warp mechanism
        def _mcp_warp_check():
            spec = renpy.session.get("_mcp_pending_warp_spec")
            if spec:
                del renpy.session["_mcp_pending_warp_spec"]
                renpy.warp.warp_spec = spec
                raise renpy.game.FullRestartException(reason=(None, "_invoke_main_menu", "_main_menu"))

        config.periodic_callbacks.append(_mcp_warp_check)
