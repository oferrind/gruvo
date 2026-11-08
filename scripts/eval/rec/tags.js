// Reference: the tag half of the shipped picker alone. Unknown tags rank below every tagged candidate.
const S = require('./shipped');
module.exports = { name: 'tags only', score: (c, train, ctx) => S.sc(c, S.prepare(train, ctx)).t ?? -1 };
