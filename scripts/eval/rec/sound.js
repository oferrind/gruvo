// Reference: the sound half of the shipped picker alone (minus the distance to the nearest loved fingerprint).
const S = require('./shipped');
module.exports = { name: 'sound only', score: (c, train, ctx) => S.sc(c, S.prepare(train, ctx)).s ?? -1e9 };
