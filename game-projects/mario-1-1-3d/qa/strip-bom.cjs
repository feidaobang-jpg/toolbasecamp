const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) {
    fs.writeFileSync(f, b.subarray(3));
    console.log('BOM stripped:', f);
  } else {
    console.log('no BOM:', f);
  }
}
