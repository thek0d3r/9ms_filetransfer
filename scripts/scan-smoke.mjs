const base = process.env.SMOKE_URL || "http://localhost:3000";
const eicar = new TextEncoder().encode("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.error || ""}`);
  return body;
}

const session = await request("/api/transfers", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "EICAR scanner check", files: [{ name: "eicar.com.txt", size: eicar.byteLength, type: "text/plain" }] }),
});
const file = session.files[0];
const endpoint = `/api/transfers/${session.transferId}/files/${file.id}/multipart`;
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.manageToken}` };
const initialized = await request(endpoint, { method: "POST", headers, body: JSON.stringify({ action: "init" }) });
const signed = await request(endpoint, { method: "POST", headers, body: JSON.stringify({ action: "sign", uploadId: initialized.uploadId, partNumbers: [1] }) });
const uploaded = await fetch(signed.urls[0].url, { method: "PUT", body: eicar });
const etag = uploaded.headers.get("etag");
if (!uploaded.ok || !etag) throw new Error(`Object upload failed: ${uploaded.status}`);
await request(endpoint, { method: "POST", headers, body: JSON.stringify({ action: "complete", uploadId: initialized.uploadId, parts: [{ partNumber: 1, etag }] }) });
await request(`/api/transfers/${session.transferId}/finalize`, { method: "POST", headers, body: "{}" });

let status = "scanning";
for (let attempt = 0; attempt < 90 && status === "scanning"; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  status = (await request(`/api/transfers/${session.transferId}/status`, { headers: { Authorization: `Bearer ${session.manageToken}` } })).status;
}
if (status !== "quarantined") throw new Error(`EICAR transfer should be quarantined, received ${status}`);
console.log(JSON.stringify({ ok: true, transferId: session.transferId, status }));
