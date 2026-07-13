'use strict'

// Re-export the shipped config loader so the CLI and the consumer's copied
// scripts share one implementation. The loader lives under assets/ because it is
// also copied into the consumer's scripts/lib/ (zero-dependency).
module.exports = require('../assets/scripts/lib/config.js')
