import chalk from 'chalk';

/**
 * Simple logging utility with color support
 */
export class Logger {
  constructor(options = {}) {
    this.options = {
      level: 'info',
      timestamp: true,
      colors: true,
      ...options
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    this.currentLevel = this.levels[this.options.level] || 2;
  }

  /**
   * Format message with timestamp and colors
   * @param {string} level - Log level
   * @param {string} message - Message to log
   * @param {any} data - Optional data to include
   * @returns {string} - Formatted message
   */
  formatMessage(level, message, data) {
    let formatted = '';

    // Add timestamp
    if (this.options.timestamp) {
      const timestamp = new Date().toISOString();
      formatted += this.options.colors ? 
        chalk.gray(`[${timestamp}]`) : 
        `[${timestamp}]`;
      formatted += ' ';
    }

    // Add level
    const levelStr = `[${level.toUpperCase()}]`;
    if (this.options.colors) {
      switch (level) {
        case 'error':
          formatted += chalk.red(levelStr);
          break;
        case 'warn':
          formatted += chalk.yellow(levelStr);
          break;
        case 'info':
          formatted += chalk.blue(levelStr);
          break;
        case 'debug':
          formatted += chalk.magenta(levelStr);
          break;
        default:
          formatted += levelStr;
      }
    } else {
      formatted += levelStr;
    }

    // Add message
    formatted += ' ' + message;

    // Add data if present
    if (data !== undefined) {
      if (typeof data === 'object') {
        formatted += '\n' + JSON.stringify(data, null, 2);
      } else {
        formatted += ' ' + String(data);
      }
    }

    return formatted;
  }

  /**
   * Check if level should be logged
   * @param {string} level - Log level to check
   * @returns {boolean} - True if should log
   */
  shouldLog(level) {
    const levelNum = this.levels[level];
    return levelNum !== undefined && levelNum <= this.currentLevel;
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {any} data - Optional error data
   */
  error(message, data) {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data));
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {any} data - Optional warning data
   */
  warn(message, data) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {any} data - Optional info data
   */
  info(message, data) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {any} data - Optional debug data
   */
  debug(message, data) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  /**
   * Log success message (always shown as info level)
   * @param {string} message - Success message
   * @param {any} data - Optional success data
   */
  success(message, data) {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, data);
      const colorized = this.options.colors ? 
        chalk.green(formatted) : 
        formatted;
      console.log(colorized);
    }
  }

  /**
   * Set log level
   * @param {string} level - New log level
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.options.level = level;
      this.currentLevel = this.levels[level];
    }
  }

  /**
   * Enable/disable colors
   * @param {boolean} enabled - Whether to enable colors
   */
  setColors(enabled) {
    this.options.colors = enabled;
  }

  /**
   * Enable/disable timestamps
   * @param {boolean} enabled - Whether to enable timestamps
   */
  setTimestamp(enabled) {
    this.options.timestamp = enabled;
  }
}