const fs = require("fs");
const path = require("path");

const [modulePath, sourceDirectory] = process.argv.slice(2);
const { Resvg } = require(modulePath);

for (const file of fs
  .readdirSync(sourceDirectory)
  .filter(name => name.endsWith(".svg"))) {
  const source = path.join(sourceDirectory, file);
  const svg = fs.readFileSync(source);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 256 } })
    .render()
    .asPng();
  fs.writeFileSync(
    path.join(path.dirname(source), `${path.parse(source).name}.png`),
    png
  );
}
