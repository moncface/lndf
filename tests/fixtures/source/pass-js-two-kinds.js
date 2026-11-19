// @lndf:why-not Promise.all | one failure must not reject the whole batch
const r = await Promise.allSettled(tasks);
// @lndf:temporal 2099-12-01 | remove after Auth v3 migration
const auth = legacyAuth();
