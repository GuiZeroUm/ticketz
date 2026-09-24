const TOTAL_AVATARES = 512;

export function avatarIlustrado(tipo, id) {
  if (id === undefined || id === null || id === "") return undefined;

  const chave = `v1:${tipo}:${id}`;
  let hash = 2166136261;
  for (let i = 0; i < chave.length; i += 1) {
    hash ^= chave.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const numero = String((hash >>> 0) % TOTAL_AVATARES).padStart(3, "0");
  return `/avatars/oneworks/v1/${numero}.webp`;
}
