/**
 * Log levels supported by the logger
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

/**
 * Logger interface with methods for each log level
 */
export interface Logger {
  trace: (...args: any[]) => void
  debug: (...args: any[]) => void
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  level?: LogLevel
  prefix?: string
  persistent?: boolean
}

/**
 * Named logger factory options
 */
export interface NamedLoggerOptions extends LoggerConfig {
  name: string
}
