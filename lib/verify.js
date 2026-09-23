'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { green, yellow, red, cyan, bold } = require('./color');
const { detectTestCommand } = require('./init');

function resolveTestCommand(target, opts) {
  if (opts && opts.testCommand) return opts.testCommand;

  const configPath = path.join(target, '.agent-room.json');
  let config = null;
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      // ignore
    }
  }

  if (config && config.verification && typeof config.verification.testCommand === 'string') {
    return config.verification.testCommand;
  }
  if (config && typeof config.testCommand === 'string') {
    return config.testCommand;
  }

  return detectTestCommand(target, config && config.language, config && config.packageManager);
}

function verifyProject(target, opts) {
  opts = opts || {};
  const testCommand = resolveTestCommand(target, opts);

  if (!testCommand) {
    if (opts.strict) {
      return {
        ok: false,
        command: null,
        exitCode: 1,
        durationMs: 0,
        output: 'No verification command configured in .agent-room.json',
        reason: 'no-verification-configured'
      };
    }
    return {
      ok: true,
      command: null,
      exitCode: 0,
      durationMs: 0,
      output: '',
      skipped: true,
      reason: 'no-verification-configured'
    };
  }

  const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : 120000;
  const startTime = Date.now();

  let res;
  if (typeof opts.runCommand === 'function') {
    res = opts.runCommand(testCommand, { cwd: target, timeout: timeoutMs });
  } else {
    try {
      res = spawnSync(testCommand, {
        cwd: target,
        shell: true,
        timeout: timeoutMs,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (err) {
      res = { status: 1, stdout: '', stderr: err.message || String(err) };
    }
  }

  const durationMs = Date.now() - startTime;
  const rawOutput = [(res.stdout || ''), (res.stderr || '')].filter(Boolean).join('\n').trim();

  if (res.error && res.error.code === 'ETIMEDOUT') {
    return {
      ok: false,
      command: testCommand,
      exitCode: 124,
      durationMs,
      timedOut: true,
      output: `Verification timed out after ${timeoutMs}ms: "${testCommand}"`,
      reason: 'timeout'
    };
  }

  const exitCode = res.status !== null && res.status !== undefined ? res.status : (res.signal ? 1 : 0);

  return {
    ok: exitCode === 0,
    command: testCommand,
    exitCode,
    durationMs,
    output: rawOutput
  };
}

function runVerify(target, args) {
  args = args || {};
  const isJson = args.format === 'json';
  const result = verifyProject(target, args);

  if (isJson) {
    const jsonStr = JSON.stringify(result, null, 2);
    if (args.output) {
      fs.writeFileSync(path.resolve(args.output), jsonStr + '\n');
    }
    console.log(jsonStr);
  } else {
    if (result.skipped) {
      console.log(yellow(`⚠️  No verification command configured in .agent-room.json (skipping).`));
      console.log(yellow(`   Use "create-agent-room init --test-command <cmd>" or add verification to .agent-room.json.`));
    } else if (result.timedOut) {
      console.error(bold(red(`❌ Verification TIMED OUT after ${args.timeout || 60000}ms:`)));
      console.error(red(`   Command: ${result.command}`));
    } else if (result.ok) {
      console.log(bold(green(`✅ Verification PASSED!`)));
      console.log(green(`   Command:  ${cyan(result.command)}`));
      console.log(green(`   Duration: ${result.durationMs}ms`));
      if (result.output) {
        console.log(`\n${result.output}\n`);
      }
    } else {
      console.error(bold(red(`❌ Verification FAILED:`)));
      console.error(red(`   Command:   ${cyan(result.command)}`));
      console.error(red(`   Exit Code: ${result.exitCode}`));
      console.error(red(`   Duration:  ${result.durationMs}ms`));
      if (result.output) {
        console.error(`\n${result.output}\n`);
      }
    }

    if (args.output) {
      fs.writeFileSync(path.resolve(args.output), result.output || '');
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
  return result;
}

module.exports = {
  verifyProject,
  runVerify,
  resolveTestCommand
};
