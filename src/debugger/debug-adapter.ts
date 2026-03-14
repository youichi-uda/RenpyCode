/**
 * Ren'Py Debug Adapter (DAP implementation).
 * Provides breakpoint debugging via file-based IPC with debug-bridge.rpy.
 *
 * Architecture:
 *   VS Code DAP UI ↔ debug-adapter.ts ↔ File IPC (game/_debug/) ↔ debug-bridge.rpy
 *
 * Pro feature: requires license key.
 */

import {
  DebugSession,
  InitializedEvent,
  StoppedEvent,
  TerminatedEvent,
  OutputEvent,
  Thread,
  StackFrame,
  Scope,
  Source,
  Variable,
  Breakpoint,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

interface DebugCommand {
  action: string;
  [key: string]: unknown;
}

interface DebugStatus {
  action: string;
  status: string;
  file?: string;
  line?: number;
  label?: string;
  variables?: Record<string, unknown>;
  stack?: { file: string; line: number; name: string }[];
  [key: string]: unknown;
}

interface LaunchRequestArgs extends DebugProtocol.LaunchRequestArguments {
  gameRoot: string;
  sdkPath?: string;
}

const THREAD_ID = 1;

export class RenpyDebugSession extends DebugSession {
  static bridgeConnected = false;

  private _debugDir = '';
  private _gameRoot = '';
  private _sdkPath = '';
  private _gameProcess: ChildProcess | null = null;
  private _breakpoints = new Map<string, DebugProtocol.SourceBreakpoint[]>();
  private _pollTimer: NodeJS.Timeout | null = null;
  private _paused = false;
  private _currentFile = '';
  private _currentLine = 0;
  private _variables: Record<string, unknown> = {};
  private _stack: { file: string; line: number; name: string }[] = [];

  constructor() {
    super();
    this.setDebuggerColumnsStartAt1(true);
    this.setDebuggerLinesStartAt1(true);
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments,
  ): void {
    response.body = {
      supportsConfigurationDoneRequest: true,
      supportsFunctionBreakpoints: false,
      supportsConditionalBreakpoints: true,
      supportsHitConditionalBreakpoints: false,
      supportsEvaluateForHovers: true,
      supportsStepBack: false,
      supportsSetVariable: true,
      supportsRestartFrame: false,
      supportsGotoTargetsRequest: false,
      supportsStepInTargetsRequest: false,
      supportsCompletionsRequest: false,
      supportsModulesRequest: false,
      supportsExceptionOptions: false,
      supportsValueFormattingOptions: false,
      supportsExceptionInfoRequest: false,
      supportTerminateDebuggee: true,
      supportSuspendDebuggee: false,
      supportsDelayedStackTraceLoading: false,
      supportsLoadedSourcesRequest: false,
      supportsLogPoints: true,
      supportsTerminateThreadsRequest: false,
      supportsSetExpression: false,
      supportsTerminateRequest: true,
      supportsDataBreakpoints: false,
      supportsReadMemoryRequest: false,
      supportsWriteMemoryRequest: false,
      supportsDisassembleRequest: false,
      supportsBreakpointLocationsRequest: false,
      supportsCancelRequest: false,
      supportsSteppingGranularity: false,
      supportsInstructionBreakpoints: false,
    };

    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchRequestArgs,
  ): Promise<void> {
    this._gameRoot = args.gameRoot || '';
    this._debugDir = path.join(this._gameRoot, 'game', '_debug');

    // Create debug directory
    if (!fs.existsSync(this._debugDir)) {
      fs.mkdirSync(this._debugDir, { recursive: true });
    }

    // Install debug bridge
    this.installDebugBridge();

    // Write initial breakpoints
    this.syncBreakpoints();

    // Find SDK (prefer launch arg, then env, then common paths)
    this._sdkPath = args.sdkPath || this.findSDK();
    if (!this._sdkPath) {
      this.sendEvent(new OutputEvent('Error: Ren\'Py SDK not found. Set renpyCode.sdkPath.\n', 'stderr'));
      this.sendEvent(new TerminatedEvent());
      this.sendResponse(response);
      return;
    }

    // Launch game
    this.launchGame();

    // Start polling for debug status
    this.startPolling();

    this.sendResponse(response);
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments,
  ): void {
    this.sendResponse(response);
  }

  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): void {
    const source = args.source;
    const filePath = source.path || '';
    const breakpoints = args.breakpoints || [];

    this._breakpoints.set(filePath, breakpoints);

    // Respond with verified breakpoints
    const verified = breakpoints.map((bp, idx) => {
      const b = new Breakpoint(true, bp.line);
      b.setId(idx);
      return b;
    });

    response.body = { breakpoints: verified };
    this.sendResponse(response);

    // Sync to bridge
    this.syncBreakpoints();
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [new Thread(THREAD_ID, 'Ren\'Py Main')],
    };
    this.sendResponse(response);
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments,
  ): void {
    const frames: StackFrame[] = [];

    if (this._stack.length > 0) {
      for (let i = 0; i < this._stack.length; i++) {
        const entry = this._stack[i];
        const source = new Source(
          path.basename(entry.file),
          path.join(this._gameRoot, 'game', entry.file),
        );
        frames.push(new StackFrame(i, entry.name, source, entry.line));
      }
    } else if (this._currentFile) {
      const source = new Source(
        path.basename(this._currentFile),
        path.join(this._gameRoot, 'game', this._currentFile),
      );
      frames.push(new StackFrame(0, this._currentFile, source, this._currentLine));
    }

    response.body = {
      stackFrames: frames,
      totalFrames: frames.length,
    };
    this.sendResponse(response);
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments,
  ): void {
    response.body = {
      scopes: [
        new Scope('Store Variables', 1, false),
      ],
    };
    this.sendResponse(response);
  }

  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
  ): void {
    const variables: Variable[] = [];

    for (const [name, value] of Object.entries(this._variables)) {
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      variables.push(new Variable(name, strValue));
    }

    response.body = { variables };
    this.sendResponse(response);
  }

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments,
  ): void {
    this._paused = false;
    this.sendDebugCommand({ action: 'continue' });
    response.body = { allThreadsContinued: true };
    this.sendResponse(response);
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments,
  ): void {
    this.sendDebugCommand({ action: 'step_over' });
    this.sendResponse(response);
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments,
  ): void {
    this.sendDebugCommand({ action: 'step_in' });
    this.sendResponse(response);
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments,
  ): void {
    this.sendDebugCommand({ action: 'step_out' });
    this.sendResponse(response);
  }

  protected evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): void {
    const expr = args.expression;

    // Check if it's a variable name in our store
    if (expr in this._variables) {
      const val = this._variables[expr];
      response.body = {
        result: typeof val === 'object' ? JSON.stringify(val) : String(val),
        variablesReference: 0,
      };
      this.sendResponse(response);
      return;
    }

    // Send eval to bridge
    this.sendDebugCommand({ action: 'eval', expression: expr });
    response.body = {
      result: `(evaluating: ${expr})`,
      variablesReference: 0,
    };
    this.sendResponse(response);
  }

  protected setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    args: DebugProtocol.SetVariableArguments,
  ): void {
    this.sendDebugCommand({
      action: 'set_variable',
      name: args.name,
      value: args.value,
    });
    response.body = { value: args.value };
    this.sendResponse(response);
  }

  protected pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments,
  ): void {
    this.sendDebugCommand({ action: 'pause' });
    this.sendResponse(response);
  }

  protected terminateRequest(
    response: DebugProtocol.TerminateResponse,
    _args: DebugProtocol.TerminateArguments,
  ): void {
    this.cleanup();
    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments,
  ): void {
    this.cleanup();
    this.sendResponse(response);
  }

  // ── Private helpers ──

  private installDebugBridge(): void {
    const bridgeContent = this.generateDebugBridge();
    const bridgePath = path.join(this._gameRoot, 'game', '_debug_bridge.rpy');
    fs.writeFileSync(bridgePath, bridgeContent, 'utf-8');
  }

  private generateDebugBridge(): string {
    return `# RenPy Code Debug Bridge — auto-generated, do not edit
init -998 python:
    import os, json, time, threading

    _debug_dir = os.path.join(config.gamedir, "_debug")
    if not os.path.exists(_debug_dir):
        os.makedirs(_debug_dir)
    _debug_lock = threading.Lock()
    _debug_paused = False
    _debug_step_mode = None  # None, 'over', 'in', 'out'
    _debug_last_check = 0.0

    def _debug_get_breakpoints():
        bp_path = os.path.join(_debug_dir, "breakpoints.json")
        if not os.path.exists(bp_path):
            return {}
        try:
            with open(bp_path, "r") as f:
                return json.load(f)
        except Exception:
            return {}

    def _debug_write_status(data):
        if not os.path.exists(_debug_dir):
            os.makedirs(_debug_dir)
        status_path = os.path.join(_debug_dir, "status.json")
        tmp = status_path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, default=str)
            os.replace(tmp, status_path)
        except Exception:
            pass

    def _debug_check_breakpoint(file, line):
        bps = _debug_get_breakpoints()
        file_bps = bps.get(file, [])
        return line in file_bps

    def _debug_poll():
        global _debug_paused, _debug_step_mode, _debug_last_check

        now = time.time()
        if now - _debug_last_check < 0.1:
            return
        _debug_last_check = now

        # Check for commands
        with _debug_lock:
            cmd_path = os.path.join(_debug_dir, "cmd.json")
            if os.path.exists(cmd_path):
                try:
                    with open(cmd_path, "r") as f:
                        cmd = json.load(f)
                    os.remove(cmd_path)

                    action = cmd.get("action", "")
                    if action == "continue":
                        _debug_paused = False
                        _debug_step_mode = None
                    elif action == "step_over":
                        _debug_paused = False
                        _debug_step_mode = "over"
                    elif action == "step_in":
                        _debug_paused = False
                        _debug_step_mode = "in"
                    elif action == "step_out":
                        _debug_paused = False
                        _debug_step_mode = "out"
                    elif action == "pause":
                        _debug_paused = True
                    elif action == "eval":
                        try:
                            result = eval(cmd.get("expression", ""))
                            _debug_write_status({"action": "eval", "status": "ok", "result": str(result)})
                        except Exception as e:
                            _debug_write_status({"action": "eval", "status": "error", "message": str(e)})
                    elif action == "set_variable":
                        try:
                            import ast
                            setattr(store, cmd["name"], ast.literal_eval(cmd["value"]))
                            _debug_write_status({"action": "set_variable", "status": "ok"})
                        except Exception as e:
                            _debug_write_status({"action": "set_variable", "status": "error", "message": str(e)})
                except Exception:
                    pass

    def _debug_statement_callback(_stmt_name):
        global _debug_paused, _debug_step_mode

        # Get current file and line via Ren'Py API
        try:
            fn, ln = renpy.get_filename_line()
        except Exception:
            return
        if fn == "unknown":
            return

        # Make path relative to game dir
        rel_file = fn.replace("\\\\", "/")
        if config.gamedir:
            gd = config.gamedir.replace("\\\\", "/").rstrip("/") + "/"
            if rel_file.startswith(gd):
                rel_file = rel_file[len(gd):]
        # Also strip leading "game/" if present
        if rel_file.startswith("game/"):
            rel_file = rel_file[5:]

        hit_bp = _debug_check_breakpoint(rel_file, ln)

        if hit_bp or _debug_paused or _debug_step_mode:
            _debug_paused = True
            _debug_step_mode = None

            # Get variables — only show simple user-defined values
            # Ren'Py system variables to exclude
            skip = {
                "say", "menu", "renpy", "store", "config", "style", "persistent",
                "gui", "build", "director", "iap", "achievement", "updater", "layeredimage",
                "define", "default", "preferences", "layout", "theme", "bubble",
                "PY2", "basestring", "default_transition", "ext", "main_menu",
                "mouse_visible", "nvl_list", "nvl_variant", "quick_menu",
                "save_name", "suppress_overlay", "narrator", "name_only",
                "centered", "vcentered", "adv", "nvl", "nvl_narrator",
                "nvl_menu", "nvl_erase", "predict_menu",
            }
            _simple_types = (bool, int, float, str, type(None), list, dict, tuple)
            variables = {}
            for vname in dir(store):
                if vname.startswith("_") or vname in skip:
                    continue
                try:
                    val = getattr(store, vname)
                    if callable(val):
                        continue
                    if isinstance(val, _simple_types):
                        variables[vname] = repr(val)
                except Exception:
                    pass

            # Get call stack
            stack = [{"file": rel_file, "line": ln, "name": _stmt_name}]
            try:
                for ctx in renpy.game.contexts:
                    if hasattr(ctx, "current") and ctx.current:
                        try:
                            n = renpy.game.script.namemap.get(ctx.current)
                            if n:
                                f = n.filename.replace("\\\\", "/")
                                if config.gamedir:
                                    gd2 = config.gamedir.replace("\\\\", "/").rstrip("/") + "/"
                                    if f.startswith(gd2):
                                        f = f[len(gd2):]
                                if f.startswith("game/"):
                                    f = f[5:]
                                stack.append({"file": f, "line": n.linenumber, "name": str(ctx.current)})
                        except Exception:
                            pass
            except Exception:
                pass

            _debug_write_status({
                "action": "stopped",
                "status": "ok",
                "file": rel_file,
                "line": ln,
                "variables": variables,
                "stack": stack,
                "reason": "breakpoint" if hit_bp else "step",
            })

            # Block until continued
            while _debug_paused:
                _debug_poll()
                time.sleep(0.1)

    config.periodic_callbacks.append(_debug_poll)

    # Hook into statement execution
    try:
        config.statement_callbacks.append(_debug_statement_callback)
    except Exception:
        pass
`;
  }

  private syncBreakpoints(): void {
    if (!this._debugDir) return;

    const bpData: Record<string, number[]> = {};

    for (const [filePath, bps] of this._breakpoints) {
      // Convert absolute path to game-relative
      const normalized = filePath.replace(/\\/g, '/');
      const gameDir = path.join(this._gameRoot, 'game').replace(/\\/g, '/');
      let relPath: string;
      if (normalized.toLowerCase().startsWith(gameDir.toLowerCase() + '/')) {
        relPath = normalized.substring(gameDir.length + 1);
      } else {
        relPath = normalized;
      }

      bpData[relPath] = bps.map(bp => bp.line);
    }

    const bpPath = path.join(this._debugDir, 'breakpoints.json');
    const tmpPath = bpPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(bpData), 'utf-8');
    fs.renameSync(tmpPath, bpPath);
  }

  private launchGame(): void {
    const exe = this.getRenpyExe();
    if (!exe) {
      this.sendEvent(new OutputEvent(`Error: Ren'Py executable not found at ${this._sdkPath}\n`, 'stderr'));
      this.sendEvent(new TerminatedEvent());
      return;
    }

    if (!this._gameRoot || !fs.existsSync(path.join(this._gameRoot, 'game'))) {
      this.sendEvent(new OutputEvent(`Error: No Ren'Py project found at "${this._gameRoot}". Ensure gameRoot points to a directory containing a game/ folder.\n`, 'stderr'));
      this.sendEvent(new TerminatedEvent());
      return;
    }

    this.sendEvent(new OutputEvent(`Launching: ${exe} ${this._gameRoot}\n`, 'console'));
    const args = [this._gameRoot];

    const options: Parameters<typeof spawn>[2] = {
      cwd: this._sdkPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    };

    this._gameProcess = spawn(exe, args, options);

    this._gameProcess.stdout?.on('data', (data: Buffer) => {
      this.sendEvent(new OutputEvent(data.toString(), 'stdout'));
    });

    this._gameProcess.stderr?.on('data', (data: Buffer) => {
      this.sendEvent(new OutputEvent(data.toString(), 'stderr'));
    });

    this._gameProcess.on('close', (code) => {
      this.sendEvent(new OutputEvent(`Game exited with code ${code}\n`, 'console'));
      this.sendEvent(new TerminatedEvent());
    });

    RenpyDebugSession.bridgeConnected = true;
  }

  private startPolling(): void {
    this._pollTimer = setInterval(() => {
      this.pollDebugStatus();
    }, 200);
  }

  private pollDebugStatus(): void {
    try {
      const statusPath = path.join(this._debugDir, 'status.json');
      if (!fs.existsSync(statusPath)) return;

      const content = fs.readFileSync(statusPath, 'utf-8');
      const status: DebugStatus = JSON.parse(content);

      if (status.action === 'stopped') {
        this._paused = true;
        this._currentFile = status.file || '';
        this._currentLine = status.line || 0;
        this._variables = (status.variables as Record<string, unknown>) || {};
        this._stack = (status.stack as { file: string; line: number; name: string }[]) || [];

        const reason = (status.reason as string) === 'breakpoint' ? 'breakpoint' : 'step';
        this.sendEvent(new StoppedEvent(reason, THREAD_ID));

        // Clear the status so we don't re-trigger
        fs.unlinkSync(statusPath);
      }
    } catch {
      // File might be partially written
    }
  }

  private sendDebugCommand(command: DebugCommand): void {
    if (!this._debugDir) return;

    if (!fs.existsSync(this._debugDir)) {
      fs.mkdirSync(this._debugDir, { recursive: true });
    }

    const cmdPath = path.join(this._debugDir, 'cmd.json');
    const tmpPath = cmdPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(command), 'utf-8');
    fs.renameSync(tmpPath, cmdPath);
  }

  private findSDK(): string {
    // TODO: Read from VS Code config via env var passed in launch args
    const envPath = process.env.RENPY_SDK;
    if (envPath && fs.existsSync(envPath)) return envPath;

    // Common locations
    const common = [
      'C:/renpy',
      path.join(process.env.HOME || process.env.USERPROFILE || '', 'renpy'),
    ];
    for (const p of common) {
      if (fs.existsSync(p)) return p;
    }

    return '';
  }

  private getRenpyExe(): string {
    if (!this._sdkPath) return '';
    if (process.platform === 'win32') {
      const exe = path.join(this._sdkPath, 'renpy.exe');
      if (fs.existsSync(exe)) return exe;
    }
    return path.join(this._sdkPath, 'renpy.sh');
  }

  private cleanup(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    if (this._gameProcess) {
      this._gameProcess.kill();
      this._gameProcess = null;
    }

    // Remove debug bridge
    try {
      const bridgePath = path.join(this._gameRoot, 'game', '_debug_bridge.rpy');
      if (fs.existsSync(bridgePath)) fs.unlinkSync(bridgePath);
      const bridgeC = bridgePath + 'c';
      if (fs.existsSync(bridgeC)) fs.unlinkSync(bridgeC);

      // Clean debug directory
      if (fs.existsSync(this._debugDir)) {
        for (const f of fs.readdirSync(this._debugDir)) {
          fs.unlinkSync(path.join(this._debugDir, f));
        }
        fs.rmdirSync(this._debugDir);
      }
    } catch {
      // Best effort cleanup
    }

    RenpyDebugSession.bridgeConnected = false;
  }
}
