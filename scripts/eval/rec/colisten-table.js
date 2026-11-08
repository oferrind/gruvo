// The co-listening table the harness uses: $COLISTEN_DATA (a freshly built colisten-data.js) or the shipped one.
const path = require('path');
const file = process.env.COLISTEN_DATA || path.join(__dirname, '../../../renderer/colisten-data.js');
module.exports = require('../../../renderer/colisten')(require(path.resolve(file)));
