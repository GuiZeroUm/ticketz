import fs from "fs";
import path from "path";

const routesDir = path.resolve(__dirname, "../../routes");

describe("rotas com isSuper", () => {
  const files = fs.readdirSync(routesDir).filter(file => file.endsWith(".ts"));

  it("importam isSuper do middleware isSuper", () => {
    const wrong = files.filter(file => {
      const source = fs.readFileSync(path.join(routesDir, file), "utf8");
      return /import\s+isSuper\s+from\s+["\x27]\.\.\/middleware\/(?!isSuper["\x27])/.test(
        source
      );
    });
    expect(wrong).toEqual([]);
  });

  it.each(["authRoutes.ts", "ticketzOSSRoutes.ts"])(
    "%s usa o middleware isSuper",
    file => {
      const source = fs.readFileSync(path.join(routesDir, file), "utf8");
      expect(source).toContain('import isSuper from "../middleware/isSuper"');
    }
  );
});
