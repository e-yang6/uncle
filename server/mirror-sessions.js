import { randomBytes } from "node:crypto";

const grants = new Map();
export function createMirrorSession(url) {
  for (const [key, grant] of grants) if (grant.expires <= Date.now()) grants.delete(key);
  if (grants.size >= 2000) throw new Error("Mirror sessions full");
  const producer = randomBytes(24).toString("hex"), viewer = randomBytes(24).toString("hex");
  const room = { opened:false, expires:Date.now() + 2 * 60 * 60000 };
  grants.set(producer, {role:"producer", room, expires:room.expires});
  grants.set(viewer, {role:"viewer", room, expires:room.expires});
  const source = new URL(url), target = new URL(url);
  source.searchParams.delete("spectate");
  source.searchParams.set("mirror", producer);
  target.searchParams.set("mirror", viewer);
  target.searchParams.set("spectate", "1");
  return {room, watchToken:viewer, url:source.pathname + source.search, viewerUrl:target.pathname + target.search};
}
export function mirrorAccess(token) {
  const grant = typeof token === "string" && grants.get(token);
  return grant && grant.expires > Date.now() ? grant : null;
}
