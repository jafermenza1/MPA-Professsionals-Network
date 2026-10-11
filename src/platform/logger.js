const levels = { debug: 10, info: 20, warn: 30, error: 40 };
export function createLogger({ level = "info", base = {} } = {}) {
  const threshold = levels[level] ?? levels.info;
  function write(name, message, fields = {}) {
    if (levels[name] < threshold) return;
    process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level: name, message, ...base, ...fields }) + "\n");
  }
  return { debug:(m,f)=>write("debug",m,f), info:(m,f)=>write("info",m,f), warn:(m,f)=>write("warn",m,f), error:(m,f)=>write("error",m,f) };
}
