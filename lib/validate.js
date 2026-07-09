'use strict';

const { green, yellow, red, cyan, bold } = require('./color');
const { collectFindings } = require('./checks');

function runValidate(target) {
  console.log(bold(`Running agent-room integrity checks in: ${cyan(target)}\n`));

  const { errors, warnings } = collectFindings(target);

  if (warnings.length > 0) {
    console.log(bold(yellow('Warnings:')));
    for (const w of warnings) {
      console.log(yellow(`  ⚠️  ${w}`));
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.log(bold(red('Validation FAILED:')));
    for (const e of errors) {
      console.log(red(`  ❌  ${e}`));
    }
    console.log('');
    process.exitCode = 1;
  } else {
    console.log(bold(green('Validation PASSED!')));
    console.log(green('  ✅  All core files are present.'));
    console.log(green('  ✅  guardrails.json is valid and populated.'));
    console.log(green('  ✅  All skills have valid frontmatter metadata.'));
    console.log('');
  }
}

module.exports = {
  runValidate
};
