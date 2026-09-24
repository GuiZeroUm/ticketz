import { avatarIlustrado } from "./avatarIlustrado";

it("assigns stable local assets by type and persistent ID", () => {
  expect(avatarIlustrado("contato", 42)).toBe(avatarIlustrado("contato", 42));
  expect(avatarIlustrado("usuario", 42)).not.toBe(
    avatarIlustrado("contato", 42)
  );
  expect(avatarIlustrado("contato", undefined)).toBeUndefined();
  for (let id = 1; id <= 1000; id += 1) {
    const number = Number(
      avatarIlustrado("contato", id).match(/(\d+)\.webp\?design=2$/)[1]
    );
    expect(number).toBeGreaterThanOrEqual(0);
    expect(number).toBeLessThan(512);
  }
});
