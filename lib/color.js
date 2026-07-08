'use strict';

const isColorSupported = (() => {
  if (process.env.FORCE_COLOR === '0') return false;
  if (process.env.FORCE_COLOR === '1') return true;
  if (process.stdout && !process.stdout.isTTY) return false;
  if (process.platform === 'win32') return true;
  return true;
})();

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

const format = (colorCode, str) => {
  if (!isColorSupported) return str;
  return `${colorCode}${str}${colors.reset}`;
};

module.exports = {
  green: (str) => format(colors.green, str),
  yellow: (str) => format(colors.yellow, str),
  red: (str) => format(colors.red, str),
  cyan: (str) => format(colors.cyan, str),
  bold: (str) => format(colors.bold, str)
};
