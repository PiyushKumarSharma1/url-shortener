import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

const API_BASE = "http://127.0.0.1:8000";

function formatCreatedAt(createdAt) {
  // Keep it simple—backend sends a string.
  // If it looks like ISO, we can pretty it, otherwise return as-is.
  try {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  } catch {}
  return String(createdAt ?? "");
}

function makeSparklinePath(values, width, height, padding = 6) {
  if (!values?.length) return "";
  const w = width - padding * 2;
  const h = height - padding * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xStep = values.length === 1 ? 0 : w / (values.length - 1);

  return values
    .map((v, i) => {
      const x = padding + i * xStep;
      // higher value -> higher line (smaller y)
      const y = padding + (1 - (v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function App() {
  const [longUrl, setLongUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);

  // Toast
  const [toast, setToast] = useState({ open: false, msg: "", kind: "success" });
  const toastTimer = useRef(null);

  // Live chart samples
  const [samples, setSamples] = useState([]); // array of click counts
  const pollTimer = useRef(null);
  const [isPolling, setIsPolling] = useState(false);
  const qrWrapRef = useRef(null);

  const code = useMemo(() => result?.code ?? "", [result]);

  function showToast(msg, kind = "success") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ open: true, msg, kind });
    toastTimer.current = setTimeout(() => {
      setToast((t) => ({ ...t, open: false }));
    }, 2000);
  }

  async function shorten(e) {
    e.preventDefault();
    setErr("");
    setStats(null);
    setSamples([]);
    setCopied(false);

    if (!longUrl.trim()) {
      setErr("Paste a URL first.");
      showToast("Paste a URL first.", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ long_url: longUrl.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.detail || `Request failed (${res.status})`);

      setResult(data);
      setLongUrl("");
      showToast("Short link created ✅", "success");
    } catch (e2) {
      const msg = e2?.message || "Something went wrong.";
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function copyShortUrl() {
    if (!result?.short_url) return;
    try {
      await navigator.clipboard.writeText(result.short_url);
      setCopied(true);
      showToast("Copied to clipboard", "success");
      setTimeout(() => setCopied(false), 1200);
    } catch {
      showToast("Could not copy. Try manual copy.", "error");
    }
  }

  async function loadStats() {
    if (!code) return;
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/stats/${code}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.detail || `Stats failed (${res.status})`);
      setStats(data);
      // Start samples with current clicks
      const c = data.clicks ?? 0;
      // Seed with 2 identical points so the sparkline renders visibly immediately
      setSamples([c, c]);
      showToast("Stats loaded", "success");
    } catch (e2) {
      const msg = e2?.message || "Could not load stats.";
      setErr(msg);
      showToast(msg, "error");
    }
  }

  // Poll stats to build a live sparkline (makes the UI feel like a real product)
  useEffect(() => {
    if (!code || !stats) return;

    // clear old timer
    if (pollTimer.current) clearInterval(pollTimer.current);

    setIsPolling(true);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/stats/${code}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;

        setStats(data);
        setSamples((prev) => {
          const c = data.clicks ?? 0;
          const base = prev.length ? prev : [c, c];
          const next = [...base, c];
          const trimmed =
            next.length > 30 ? next.slice(next.length - 30) : next;
          return trimmed.length === 1 ? [trimmed[0], trimmed[0]] : trimmed;
        });
      } catch {
        // ignore transient network errors
      }
    }, 1000);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      setIsPolling(false);
    };
  }, [code, stats?.code]);

  // Stop polling when code changes / component unmounts
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const sparkW = 260;
  const sparkH = 70;
  const sparkPath = makeSparklinePath(samples, sparkW, sparkH);

  const accent = "#34d399";
  const border = "#27272a";

  return (
    <div
      style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f4f4f5" }}
    >
      {/* lightweight CSS for animations */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Toast */}
      <div
        style={{
          position: "fixed",
          top: 18,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          pointerEvents: "none",
        }}
      >
        {toast.open && (
          <div
            style={{
              animation: "fadeUp 140ms ease-out",
              border: `1px solid ${border}`,
              background: "rgba(24,24,27,.85)",
              color: "#e4e4e7",
              padding: "10px 12px",
              borderRadius: 999,
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 10px 30px rgba(0,0,0,.35)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: toast.kind === "error" ? "#fb7185" : accent,
              }}
            />
            {toast.msg}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px" }}>
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              border: `1px solid ${border}`,
              background: "rgba(24,24,27,.5)",
              padding: "6px 10px",
              borderRadius: 999,
              fontSize: 12,
              color: "#d4d4d8",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: accent,
              }}
            />
            URL Shortener • FastAPI + Postgres + Redis
          </div>

          <h1 style={{ fontSize: 40, marginTop: 14, marginBottom: 8 }}>
            Shorten links. Track clicks.
          </h1>
          <p style={{ color: "#a1a1aa" }}>
            Modern UI on top of your backend (caching + rate limiting +
            analytics).
          </p>
        </div>

        <form
          onSubmit={shorten}
          style={{
            border: `1px solid ${border}`,
            background: "rgba(24,24,27,.25)",
            borderRadius: 18,
            padding: 18,
          }}
        >
          <label style={{ fontSize: 13, color: "#d4d4d8" }}>Long URL</label>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <input
              value={longUrl}
              onChange={(e) => setLongUrl(e.target.value)}
              placeholder="https://example.com/some/long/link"
              style={{
                width: "100%",
                background: "#0a0a0a",
                border: `1px solid ${border}`,
                borderRadius: 14,
                padding: "12px 14px",
                color: "#f4f4f5",
                outline: "none",
              }}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                borderRadius: 14,
                padding: "12px 14px",
                fontWeight: 700,
                background: loading ? "#3f3f46" : accent,
                color: loading ? "#e4e4e7" : "#0a0a0a",
                border: "none",
                cursor: loading ? "default" : "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {loading && (
                <span
                  aria-hidden
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    border: "2px solid rgba(255,255,255,.4)",
                    borderTopColor: "rgba(0,0,0,.6)",
                    animation: "spin 700ms linear infinite",
                  }}
                />
              )}
              {loading ? "Shortening…" : "Shorten"}
            </button>
          </div>

          {err && (
            <p style={{ marginTop: 10, color: "#fb7185", fontSize: 13 }}>
              {err}
            </p>
          )}

          {result && (
            <div
              style={{
                marginTop: 16,
                borderRadius: 14,
                border: `1px solid ${border}`,
                background: "rgba(9,9,11,.6)",
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                    Short URL
                  </div>
                  <a
                    href={result.short_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: accent,
                      fontSize: 14,
                      wordBreak: "break-all",
                    }}
                  >
                    {result.short_url}
                  </a>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#71717a",
                      marginTop: 6,
                      wordBreak: "break-all",
                    }}
                  >
                    {result.long_url}
                  </div>
                </div>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <button
                    type="button"
                    onClick={copyShortUrl}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${border}`,
                      background: "#18181b",
                      color: "#f4f4f5",
                      padding: "8px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {copied ? "Copied ✅" : "Copy"}
                  </button>

                  <button
                    type="button"
                    onClick={loadStats}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${border}`,
                      background: "#18181b",
                      color: "#f4f4f5",
                      padding: "8px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    View stats
                  </button>
                </div>
              </div>

              {stats && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginTop: 12,
                  }}
                >
                  <div
                    style={{
                      border: `1px solid ${border}`,
                      borderRadius: 14,
                      padding: 12,
                      background: "#0f0f12",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#a1a1aa" }}>Clicks</div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      {stats.clicks}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#a1a1aa",
                          marginBottom: 6,
                        }}
                      >
                        Live clicks (last {samples.length} sec)
                      </div>
                      <div
                        style={{
                          border: `1px solid ${border}`,
                          borderRadius: 12,
                          background: "rgba(24,24,27,.35)",
                          padding: 10,
                        }}
                      >
                        <svg
                          width={sparkW}
                          height={sparkH}
                          style={{ display: "block", width: "100%" }}
                        >
                          {/* soft baseline */}
                          <path
                            d={`M6 ${sparkH - 6} L${sparkW - 6} ${sparkH - 6}`}
                            stroke="rgba(255,255,255,.08)"
                            strokeWidth="2"
                            fill="none"
                          />
                          {sparkPath && (
                            <>
                              <path
                                d={sparkPath}
                                stroke={accent}
                                strokeWidth="3"
                                fill="none"
                              />
                              <path
                                d={`${sparkPath} L${sparkW - 6} ${sparkH - 6} L6 ${sparkH - 6} Z`}
                                fill="rgba(52,211,153,.12)"
                              />
                            </>
                          )}
                        </svg>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 6,
                            fontSize: 12,
                          }}
                        >
                          <span style={{ color: "#71717a" }}>
                            min {Math.min(...(samples.length ? samples : [0]))}
                          </span>
                          <span style={{ color: "#71717a" }}>
                            max {Math.max(...(samples.length ? samples : [0]))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${border}`,
                      borderRadius: 14,
                      padding: 12,
                      background: "#0f0f12",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                      Created
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#e4e4e7",
                        wordBreak: "break-all",
                        marginTop: 6,
                      }}
                    >
                      {formatCreatedAt(stats.created_at)}
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, color: "#a1a1aa" }}>Code</div>
                      <div
                        style={{
                          marginTop: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          border: `1px solid ${border}`,
                          background: "rgba(24,24,27,.35)",
                          borderRadius: 999,
                          padding: "6px 10px",
                          fontSize: 12,
                          color: "#e4e4e7",
                        }}
                      >
                        <span style={{ color: accent, fontWeight: 700 }}>
                          {stats.code}
                        </span>
                        <span style={{ color: "#71717a" }}>|</span>
                        <span style={{ color: "#a1a1aa" }}>
                          polling: {isPolling ? "on" : "off"}
                        </span>
                      </div>
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                          QR Code
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div
                            ref={qrWrapRef}
                            style={{
                              border: `1px solid ${border}`,
                              background: "#0a0a0a",
                              borderRadius: 14,
                              padding: 12,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <QRCodeCanvas
                              value={result?.short_url || ""}
                              size={128}
                              includeMargin={true}
                              level="M"
                              bgColor="#0a0a0a"
                              fgColor={accent}
                            />
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const canvas =
                                  qrWrapRef.current?.querySelector("canvas");
                                if (!canvas) {
                                  showToast("QR canvas not found", "error");
                                  return;
                                }
                                const pngUrl = canvas.toDataURL("image/png");
                                const a = document.createElement("a");
                                a.href = pngUrl;
                                a.download = `qr-${stats.code}.png`;
                                a.click();
                              }}
                              style={{
                                borderRadius: 12,
                                border: `1px solid ${border}`,
                                background: "#18181b",
                                color: "#f4f4f5",
                                padding: "8px 10px",
                                fontSize: 12,
                                cursor: "pointer",
                                fontWeight: 600,
                                width: "fit-content",
                              }}
                            >
                              Download PNG
                            </button>

                            <div
                              style={{
                                fontSize: 12,
                                color: "#71717a",
                                maxWidth: 220,
                              }}
                            >
                              Scan to open the short link on your phone.
                            </div>
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          color: "#71717a",
                        }}
                      >
                        Tip: open the short URL in a new tab a few times and
                        watch the chart move.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        <div style={{ marginTop: 18, fontSize: 12, color: "#71717a" }}>
          Tip: Your backend must be running at{" "}
          <code style={{ color: "#a1a1aa" }}>http://127.0.0.1:8000</code>.
        </div>
      </div>
    </div>
  );
}
