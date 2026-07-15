const base = process.env.SMOKE_URL || "http://localhost";
const payload = new TextEncoder().encode(`9ms smoke test ${new Date().toISOString()}\n`);

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.error || ""}`);
  return { response, body };
}

const created = await request("/api/transfers", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "Smoke test",
    message: "End-to-end verification",
    password: "correct-horse",
    files: [{ name: "smoke.txt", size: payload.byteLength, type: "text/plain" }],
  }),
});

const session = created.body;
const remote = session.files[0];
const endpoint = `/api/transfers/${session.transferId}/files/${remote.id}/multipart`;
const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${session.manageToken}` };
const initialized = await request(endpoint, { method: "POST", headers: authHeaders, body: JSON.stringify({ action: "init" }) });
const signed = await request(endpoint, {
  method: "POST", headers: authHeaders,
  body: JSON.stringify({ action: "sign", uploadId: initialized.body.uploadId, partNumbers: [1] }),
});
const put = await fetch(signed.body.urls[0].url, { method: "PUT", body: payload });
if (!put.ok || !put.headers.get("etag")) throw new Error(`Object upload failed: ${put.status}`);
await request(endpoint, {
  method: "POST", headers: authHeaders,
  body: JSON.stringify({ action: "complete", uploadId: initialized.body.uploadId, parts: [{ partNumber: 1, etag: put.headers.get("etag") }] }),
});
await request(`/api/transfers/${session.transferId}/finalize`, { method: "POST", headers: authHeaders, body: "{}" });

let status = "scanning";
for (let attempt = 0; attempt < 90 && status === "scanning"; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  status = (await request(`/api/transfers/${session.transferId}/status`, { headers: { Authorization: `Bearer ${session.manageToken}` } })).body.status;
}
if (status !== "ready") throw new Error(`Transfer did not become ready: ${status}`);

const lockedDownload = await fetch(`${base}/api/share/${session.shareToken}/files/${remote.id}`, { redirect: "manual" });
if (lockedDownload.status !== 401) throw new Error(`Locked file should return 401, received ${lockedDownload.status}`);
const wrongPassword = await fetch(`${base}/api/share/${session.shareToken}/unlock`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "incorrect-password" }),
});
if (wrongPassword.status !== 401) throw new Error(`Wrong password should return 401, received ${wrongPassword.status}`);
const unlocked = await request(`/api/share/${session.shareToken}/unlock`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "correct-horse" }),
});
const cookie = unlocked.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Unlock did not return an access cookie");

const download = await fetch(`${base}/api/share/${session.shareToken}/files/${remote.id}`, { headers: { Cookie: cookie }, redirect: "follow" });
if (!download.ok || Buffer.compare(Buffer.from(await download.arrayBuffer()), Buffer.from(payload)) !== 0) throw new Error("Downloaded bytes did not match");
const zip = await fetch(`${base}/api/share/${session.shareToken}/download-all`, { headers: { Cookie: cookie } });
const zipBytes = new Uint8Array(await zip.arrayBuffer());
if (!zip.ok || zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) throw new Error("ZIP download was invalid");

await request(`/api/share/${session.shareToken}/report`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "other", details: "Automated smoke test" }),
});
const removed = await fetch(`${base}/api/manage/transfers/${session.transferId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.manageToken}` } });
if (removed.status !== 204) throw new Error(`Sender deletion failed: ${removed.status}`);

const secretValue = "smoke-test-password-🔐";
const createdSecret = await request("/api/secrets", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: secretValue, label: "Smoke credential" }),
});
const secretToken = new URL(createdSecret.body.shareUrl).pathname.split("/").pop();
const preview = await fetch(`${base}/s/${secretToken}`);
if (!preview.ok) throw new Error(`Secret preview failed: ${preview.status}`);
const revealed = await request(`/api/secrets/${secretToken}/reveal`, { method: "POST" });
if (revealed.body.secret !== secretValue) throw new Error("Revealed secret did not match");
const secondReveal = await fetch(`${base}/api/secrets/${secretToken}/reveal`, { method: "POST" });
if (secondReveal.status !== 410) throw new Error(`Second reveal should return 410, received ${secondReveal.status}`);

const revocable = await request("/api/secrets", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: "revoke me" }),
});
const revocableToken = new URL(revocable.body.shareUrl).pathname.split("/").pop();
const revoked = await fetch(`${base}/api/manage/secrets/${revocable.body.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${revocable.body.manageToken}` } });
if (revoked.status !== 204) throw new Error(`Secret revocation failed: ${revoked.status}`);
const revokedReveal = await fetch(`${base}/api/secrets/${revocableToken}/reveal`, { method: "POST" });
if (revokedReveal.status !== 410) throw new Error(`Revoked reveal should return 410, received ${revokedReveal.status}`);

console.log(JSON.stringify({ ok: true, transferId: session.transferId, checks: ["multipart", "scan", "password", "download", "zip", "report", "delete", "secret-reveal-once", "secret-revoke"] }));
