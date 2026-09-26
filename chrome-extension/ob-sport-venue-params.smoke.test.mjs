import assert from "node:assert/strict";

const { readObSportVenueParams } = await import("./src/content/ob-sport-venue-params.js");

function fakeIndexedDb(rows) {
  return {
    open: () => {
      const open = {};
      queueMicrotask(() => {
        const tx = {
          objectStore: () => ({
            getAll: () => {
              const getAll = {};
              queueMicrotask(() => {
                getAll.result = rows;
                getAll.onsuccess?.();
              });
              return getAll;
            },
          }),
        };
        open.result = {
          objectStoreNames: { contains: name => name === "shared_params" },
          transaction: () => tx,
          close: () => {},
        };
        open.onsuccess?.();
      });
      return open;
    },
  };
}

const token = "3d2d98226690510f2575b5d4c7a2de26f9b5e666";
assert.deepEqual(
  await readObSportVenueParams(fakeIndexedDb([{
    requestId: token,
    origin: "https://api.cgfoznmy.com/path",
    cuid: "53554662319712599617",
  }])),
  {
    token,
    gateway: "https://api.cgfoznmy.com",
    sessionId: "53554662319712599617",
    uid: "53554662319712599617",
  },
);
assert.equal(
  await readObSportVenueParams(fakeIndexedDb([{
    requestId: token,
    origin: "https://app-h5.janbo0931.com",
    cuid: "53554662319712599617",
  }])),
  null,
);

const activeToken = "f06fd7130bfaa8a28ff7c6fbbc6c2b020f9d7133";
assert.deepEqual(
  await readObSportVenueParams(fakeIndexedDb([
    {
      requestId: activeToken,
      origin: "https://api.current.example",
      cuid: "535543613407503536",
    },
    {
      requestId: token,
      origin: "https://api.stale.example",
      cuid: "53554662319712599617",
    },
  ]), activeToken),
  {
    token: activeToken,
    gateway: "https://api.current.example",
    sessionId: "535543613407503536",
    uid: "535543613407503536",
  },
);
assert.equal(
  await readObSportVenueParams(fakeIndexedDb([{
    requestId: token,
    origin: "https://api.cgfoznmy.com",
    cuid: "sport-placeholder",
  }])),
  null,
);
assert.equal(
  await readObSportVenueParams(fakeIndexedDb([{
    requestId: token,
    origin: "https://api.cgfoznmy.com",
    cuid: "53554662319712599617",
  }]), activeToken),
  null,
);

console.log("ob-sport-venue-params.smoke: ok");
