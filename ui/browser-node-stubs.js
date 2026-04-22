// Browser stubs for `node:*` builtins that accidentally get pulled into the
// Control UI bundle through shared source files. The real behaviour requires
// a Node runtime; in the browser we return no-ops or empty values so
// top-level module code in server-only paths doesn't throw at load time.
//
// Consumers that actually depend on these functions at runtime (like
// bundled-dir.ts) only run inside the gateway's Node process — the browser
// never reaches their exported functions, only the module import side-effect.

const noopString = () => "";
const noopArray = () => [];
const noopBoolean = () => false;
const noopUndefined = () => undefined;

// Accepts any number of args, returns an empty string — path.join, path.resolve,
// path.dirname, etc. all produce string-shaped values.
const pathLike = () => "";

export const tmpdir = noopString;
export const homedir = noopString;
export const platform = () => "browser";
export const cpus = noopArray;
export const freemem = () => 0;
export const totalmem = () => 0;
export const arch = () => "browser";
export const release = noopString;
export const type = noopString;
export const hostname = noopString;
export const networkInterfaces = () => ({});

export const join = pathLike;
export const resolve = pathLike;
export const dirname = pathLike;
export const basename = pathLike;
export const extname = noopString;
export const relative = pathLike;
export const normalize = pathLike;
export const isAbsolute = noopBoolean;
export const parse = () => ({ root: "", dir: "", base: "", ext: "", name: "" });
export const format = noopString;
export const sep = "/";
export const delimiter = ":";
export const posix = { join: pathLike, resolve: pathLike, sep: "/" };
export const win32 = { join: pathLike, resolve: pathLike, sep: "\\" };

export const readFileSync = () => "";
export const writeFileSync = noopUndefined;
export const existsSync = noopBoolean;
export const readdirSync = noopArray;
export const statSync = () => ({
  isDirectory: noopBoolean,
  isFile: noopBoolean,
  isSymbolicLink: noopBoolean,
  mtime: new Date(0),
  size: 0,
});
export const mkdirSync = noopUndefined;
export const rmSync = noopUndefined;
export const unlinkSync = noopUndefined;
export const renameSync = noopUndefined;
export const realpathSync = (p) => p;
export const symlinkSync = noopUndefined;
export const readFile = () => Promise.resolve("");
export const writeFile = () => Promise.resolve();
export const access = () => Promise.resolve();
export const mkdir = () => Promise.resolve();
export const rm = () => Promise.resolve();
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };
export const promises = {
  readFile: () => Promise.resolve(""),
  writeFile: () => Promise.resolve(),
  mkdir: () => Promise.resolve(),
  access: () => Promise.resolve(),
  rm: () => Promise.resolve(),
  stat: () => Promise.resolve({ isDirectory: noopBoolean, isFile: noopBoolean, size: 0 }),
};

export const fileURLToPath = (input) => (typeof input === "string" ? input : String(input ?? ""));
export const pathToFileURL = (input) => ({ href: String(input ?? ""), toString: () => String(input ?? "") });
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

export const createRequire = () => () => null;
export const pathToBuiltinModule = noopUndefined;

export const spawn = () => ({ on: () => undefined, stdout: null, stderr: null, stdin: null });
export const spawnSync = () => ({ status: 0, stdout: "", stderr: "" });
export const execSync = noopString;
export const exec = () => undefined;
export const execFile = () => undefined;
export const execFileSync = noopString;
export const fork = () => ({ on: () => undefined });

// node:util
export const promisify = (fn) => (...args) =>
  new Promise((resolve, reject) => {
    try {
      const result = fn?.(...args);
      if (result && typeof result.then === "function") {
        result.then(resolve, reject);
      } else {
        resolve(result);
      }
    } catch (err) {
      reject(err);
    }
  });
export const isDeepStrictEqual = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};
export const callbackify = (fn) => (...args) => {
  const cb = args.pop();
  Promise.resolve()
    .then(() => fn(...args))
    .then((v) => cb(null, v), (err) => cb(err));
};
export const inspect = (v) => String(v);
export const types = {};
export const inherits = () => undefined;

// node:crypto
export const createHash = () => ({
  update: function (data) { this._data = (this._data || "") + String(data); return this; },
  digest: () => "",
  copy: function () { return this; },
});
export const createHmac = createHash;
export const randomBytes = (size) => new Uint8Array(size);
export const randomUUID = () =>
  "00000000-0000-0000-0000-000000000000";
export const createCipheriv = () => ({ update: noopString, final: noopString });
export const createDecipheriv = () => ({ update: noopString, final: noopString });

// node:events
export class EventEmitter {
  on() { return this; }
  off() { return this; }
  once() { return this; }
  emit() { return false; }
  removeListener() { return this; }
  removeAllListeners() { return this; }
  setMaxListeners() { return this; }
}

// node:stream
export class Readable { on() { return this; } pipe() { return this; } }
export class Writable { on() { return this; } write() { return true; } end() { return this; } }
export class Duplex extends Readable {}
export class Transform extends Duplex {}

// node:async_hooks — AsyncLocalStorage is used by gateway request-scope
// modules that get pulled in transitively. Single-thread browser fallback
// just stores the current store on the instance; good enough for stubs.
export class AsyncLocalStorage {
  constructor() { this._store = undefined; }
  run(store, fn, ...args) {
    const previous = this._store;
    this._store = store;
    try { return fn(...args); }
    finally { this._store = previous; }
  }
  enterWith(store) { this._store = store; }
  exit(fn, ...args) {
    const previous = this._store;
    this._store = undefined;
    try { return fn(...args); }
    finally { this._store = previous; }
  }
  getStore() { return this._store; }
  disable() { this._store = undefined; }
}
export class AsyncResource {
  constructor() {}
  runInAsyncScope(fn, thisArg, ...args) { return fn.apply(thisArg, args); }
  emitDestroy() {}
  asyncId() { return 0; }
  triggerAsyncId() { return 0; }
}
export const executionAsyncId = () => 0;
export const triggerAsyncId = () => 0;
export const createHook = () => ({ enable() {}, disable() {} });

// node:buffer
export const Buffer = globalThis.Buffer ?? {
  from: (v) => new TextEncoder().encode(String(v ?? "")),
  isBuffer: () => false,
  concat: () => new Uint8Array(),
  alloc: (n) => new Uint8Array(n),
};

// node:process
export const env = {};
export const argv = [];
export const execArgv = [];
export const execPath = "";
export const stdin = null;
export const stdout = { write: () => true, isTTY: false };
export const stderr = { write: () => true, isTTY: false };
export const cwd = noopString;
export const chdir = noopUndefined;
export const nextTick = (fn, ...args) => Promise.resolve().then(() => fn(...args));
export const exit = noopUndefined;
export const on = noopUndefined;

// Default export supplies the same surface so `import os from "node:os"`
// + `os.tmpdir()` also works.
export default {
  tmpdir,
  homedir,
  platform,
  cpus,
  freemem,
  totalmem,
  arch,
  release,
  type,
  hostname,
  networkInterfaces,
  join,
  resolve,
  dirname,
  basename,
  extname,
  relative,
  normalize,
  isAbsolute,
  parse,
  format,
  sep,
  delimiter,
  posix,
  win32,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  renameSync,
  realpathSync,
  symlinkSync,
  readFile,
  writeFile,
  access,
  mkdir,
  rm,
  constants,
  promises,
  fileURLToPath,
  pathToFileURL,
  URL,
  URLSearchParams,
  createRequire,
  pathToBuiltinModule,
  spawn,
  spawnSync,
  execSync,
  exec,
};
