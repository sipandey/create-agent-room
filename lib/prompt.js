'use strict';

const readline = require('readline');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => {
      rl.close();
      console.log('\nScaffolding cancelled. Goodbye!');
      process.exit(0);
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

module.exports = { ask };
