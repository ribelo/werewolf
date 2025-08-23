import { invoke } from '@tauri-apps/api/core';

// Store original console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
  info: console.info
};

// Flag to prevent infinite recursion during logging
let loggingInProgress = false;

// These convenience functions are now optional since monkey patching captures everything
// But we keep them for explicit structured logging when needed
export function debug(msg: string, ctx?: any) { console.debug(msg, ctx); }
export function info(msg: string, ctx?: any) { console.info(msg, ctx); }
export function warn(msg: string, ctx?: any) { console.warn(msg, ctx); }
export function error(msg: string, ctx?: any) { console.error(msg, ctx); }

// Helper function to safely convert arguments to string
function argsToString(args: any[]): string {
  try {
    return args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
      if (arg === null || arg === undefined) return String(arg);
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }).join(' ');
  } catch (e) {
    return `Failed to serialize log arguments: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// Low-level file write function (without console fallback to avoid infinite loops)
async function writeToFileOnly(level: string, message: string): Promise<void> {
  if (loggingInProgress) return;
  
  loggingInProgress = true;
  try {
    const timestamp = new Date().toISOString();
    await invoke('write_log', {
      level,
      message,
      timestamp
    });
  } catch (err) {
    // Silently ignore logging failures to prevent cascading errors
  } finally {
    loggingInProgress = false;
  }
}

// Monkey patch console methods
export function monkeyPatchConsole(): void {
  console.log = (...args: any[]) => {
    const message = argsToString(args);
    writeToFileOnly('info', message);
    // Call original method directly to avoid recursion
    originalConsole.log.apply(console, args);
  };

  console.info = (...args: any[]) => {
    const message = argsToString(args);
    writeToFileOnly('info', message);
    originalConsole.info.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    const message = argsToString(args);
    writeToFileOnly('warn', message);
    originalConsole.warn.apply(console, args);
  };

  console.error = (...args: any[]) => {
    const message = argsToString(args);
    writeToFileOnly('error', message);
    originalConsole.error.apply(console, args);
  };

  console.debug = (...args: any[]) => {
    const message = argsToString(args);
    writeToFileOnly('debug', message);
    originalConsole.debug.apply(console, args);
  };
}

// Global error handlers
export function setupGlobalErrorHandlers(): void {
  // Catch unhandled JavaScript errors
  window.onerror = (message, source, lineno, colno, error) => {
    const errorInfo = {
      message: String(message),
      source: String(source),
      line: Number(lineno),
      column: Number(colno),
      stack: error?.stack
    };
    const errorMsg = `Unhandled error: ${message} at ${source}:${lineno}:${colno}`;
    writeToFileOnly('error', `${errorMsg} ${JSON.stringify(errorInfo)}`);
    // Let the browser handle the error normally
    return false;
  };

  // Catch unhandled Promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const errorMsg = `Unhandled Promise rejection: ${reason}`;
    writeToFileOnly('error', errorMsg);
  });
}

// Initialize all logging systems
export function initLogging(): void {
  monkeyPatchConsole();
  setupGlobalErrorHandlers();
  // Use original console method to avoid any potential recursion
  originalConsole.info.call(console, 'Unified logging system initialized');
}