export const isSharedOpenView = (
  profile: string,
  status?: string,
  groups = false
): boolean => profile !== "admin" && status === "open" && !groups;
