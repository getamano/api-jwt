"use client";

import { useState, useEffect, useCallback } from "react";

interface KeyMeta {
  id: string;
  name: string;
  email: string;
  status: "active" | "revoked";
  tier: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface User {
  id: string;
  email: string;
  role: "user" | "admin";
}

interface UsageData {
  keyId: string;
  limits: { rateLimit: number; quota: number };
  usage: {
    totalCalls: number;
    callsThisMinute: number;
    callsThisMonth: number;
    lastCallAt: string | null;
    history: { date: string; calls: number }[];
  };
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth form state
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Key management state
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("starter");
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [keys, setKeys] = useState<KeyMeta[]>([]);

  // Usage detail state
  const [usageKeyId, setUsageKeyId] = useState<string | null>(null);
  const [usageKeyName, setUsageKeyName] = useState("");
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  // Check session on load
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      const data = await res.json();
      if (res.ok) setKeys(data.keys);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user) fetchKeys();
  }, [user, fetchKeys]);

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);

    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Something went wrong");
        return;
      }

      setUser({ id: data.id, email: data.email, role: data.role });
      setAuthEmail("");
      setAuthPassword("");
    } catch {
      setAuthError("Network error");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setKeys([]);
    setApiKey("");
  }

  async function generateKey() {
    setError("");
    setApiKey("");
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        name: name || "Default",
        expiresAt: expiresAt || undefined,
      };
      if (isAdmin) {
        body.tier = tier;
        if (email) body.email = email;
      }

      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setApiKey(data.apiKey);
      setName("");
      setExpiresAt("");
      if (isAdmin) setEmail("");
      fetchKeys();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleTierChange(id: string, newTier: string) {
    try {
      const res = await fetch("/api/keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tier: newTier }),
      });
      if (res.ok) fetchKeys();
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) fetchKeys();
    } catch {
      // ignore
    } finally {
      setDeleteConfirmId(null);
    }
  }

  async function handleUsageClick(keyId: string, keyName: string) {
    setUsageKeyId(keyId);
    setUsageKeyName(keyName);
    setUsageData(null);
    setUsageLoading(true);
    try {
      const res = await fetch(`/api/usage/${encodeURIComponent(keyId)}`);
      if (res.ok) {
        setUsageData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setUsageLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto", fontFamily: "system-ui, sans-serif", padding: "0 20px", textAlign: "center" }}>
        Loading...
      </div>
    );
  }

  // Not logged in — show auth form
  if (!user) {
    return (
      <div style={{ maxWidth: 400, margin: "60px auto", fontFamily: "system-ui, sans-serif", padding: "0 20px" }}>
        <h1 style={{ marginBottom: 24 }}>API Key Manager</h1>
        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            required
            minLength={6}
            style={inputStyle}
          />
          <button type="submit" disabled={authSubmitting} style={btnStyle}>
            {authSubmitting
              ? "..."
              : authMode === "login"
                ? "Log In"
                : "Register"}
          </button>
        </form>

        {authError && (
          <div style={{ marginTop: 16, padding: 12, background: "#fee", color: "#c00", borderRadius: 6 }}>
            {authError}
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 14, color: "#555" }}>
          {authMode === "login" ? (
            <>
              No account?{" "}
              <button
                onClick={() => { setAuthMode("register"); setAuthError(""); }}
                style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", textDecoration: "underline", fontSize: 14 }}
              >
                Register
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button
                onClick={() => { setAuthMode("login"); setAuthError(""); }}
                style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", textDecoration: "underline", fontSize: 14 }}
              >
                Log In
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Logged in — key management
  return (
    <div style={{ maxWidth: 640, margin: "60px auto", fontFamily: "system-ui, sans-serif", padding: "0 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>API Key Manager</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, color: "#555" }}>
            {user.email}
            {isAdmin && (
              <span style={{ marginLeft: 6, padding: "2px 6px", background: "#e8d5f5", color: "#6b21a8", borderRadius: 4, fontSize: 11 }}>
                admin
              </span>
            )}
          </span>
          <button onClick={handleLogout} style={{ ...btnStyle, background: "#666", padding: "6px 12px", fontSize: 13 }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isAdmin && (
          <input
            type="email"
            placeholder="Email (leave blank for yourself)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        )}
        <input
          type="text"
          placeholder="Key name (e.g. Production, Testing)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        {isAdmin && (
          <select value={tier} onChange={(e) => setTier(e.target.value)} style={inputStyle}>
            <option value="starter">Starter</option>
            <option value="unlimited">Unlimited</option>
          </select>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 14, color: "#555", whiteSpace: "nowrap" }}>Expires on</label>
          <input
            type="date"
            value={expiresAt}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          {expiresAt && (
            <button
              onClick={() => setExpiresAt("")}
              style={{ ...btnStyle, background: "#999", padding: "8px 12px", fontSize: 13 }}
            >
              Clear
            </button>
          )}
        </div>

        <button onClick={generateKey} disabled={loading} style={btnStyle}>
          {loading ? "Generating..." : "Generate API Key"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: 12, background: "#fee", color: "#c00", borderRadius: 6 }}>
          {error}
        </div>
      )}

      {apiKey && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Your API Key:</h3>
          <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 6, fontFamily: "monospace", fontSize: 14, wordBreak: "break-all" }}>
            {apiKey}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => navigator.clipboard.writeText(apiKey)}
              style={btnStyle}
            >
              Copy to Clipboard
            </button>
            <button
              onClick={() => setApiKey("")}
              style={{ ...btnStyle, background: "#666" }}
            >
              Dismiss
            </button>
          </div>
          <div style={{ marginTop: 12, padding: 12, background: "#fff3cd", borderRadius: 6, fontSize: 13 }}>
            Save this key now — it cannot be retrieved again.
          </div>
          <div style={{ marginTop: 12, padding: 12, background: "#f0f7ff", borderRadius: 6, fontSize: 13 }}>
            <strong>Usage:</strong>
            <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
{`curl http://localhost:3000/api/protected \\
  -H "X-Api-Key: ${apiKey}"`}
            </pre>
          </div>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h2 style={{ marginBottom: 12 }}>{isAdmin ? "All API Keys" : "Your API Keys"}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {["Name", ...(isAdmin ? ["Email"] : []), "Status", "Tier", "Created", "Last Used", "Expires", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "2px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} style={{ ...cellStyle, textAlign: "center", color: "#999" }}>
                  No API keys yet
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id}>
                  <td style={cellStyle}>{k.name}</td>
                  {isAdmin && <td style={cellStyle}>{k.email}</td>}
                  <td style={cellStyle}>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      background: k.status === "active" ? "#d4edda" : "#f8d7da",
                      color: k.status === "active" ? "#155724" : "#721c24",
                    }}>
                      {k.status}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    {k.status === "active" && isAdmin ? (
                      <select
                        value={k.tier}
                        onChange={(e) => handleTierChange(k.id, e.target.value)}
                        style={{ padding: "2px 4px", fontSize: 12, borderRadius: 4, border: "1px solid #ccc" }}
                      >
                        <option value="starter">starter</option>
                        <option value="unlimited">unlimited</option>
                      </select>
                    ) : (
                      k.tier
                    )}
                  </td>
                  <td style={cellStyle}>{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td style={cellStyle}>
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td style={cellStyle}>
                    {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Never"}
                  </td>
                  <td style={{ ...cellStyle, display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => handleUsageClick(k.id, k.name)}
                      style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0 }}
                    >
                      Usage
                    </button>
                    {k.status === "active" && (
                      <button
                        onClick={() => isAdmin ? handleDelete(k.id) : setDeleteConfirmId(k.id)}
                        style={{ ...btnStyle, background: "#dc3545", padding: "4px 10px", fontSize: 12 }}
                      >
                        {isAdmin ? "Revoke" : "Delete"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteConfirmId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "#fff", borderRadius: 8, padding: 24, maxWidth: 440, width: "90%",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ margin: "0 0 12px" }}>Are you sure you want to delete this token?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#555", lineHeight: 1.5 }}>
              Any applications or scripts using this token will no longer be able to access the API. You cannot undo this action.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                style={{ ...btnStyle, background: "#e9ecef", color: "#333" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                style={{ ...btnStyle, background: "#dc3545" }}
              >
                I understand, delete this token
              </button>
            </div>
          </div>
        </div>
      )}

      {usageKeyId && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => { setUsageKeyId(null); setUsageData(null); }}
        >
          <div
            style={{
              background: "#fff", borderRadius: 8, padding: 24, maxWidth: 520, width: "90%",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Usage — {usageKeyName}</h3>
              <button
                onClick={() => { setUsageKeyId(null); setUsageData(null); }}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999", padding: 0 }}
              >
                ✕
              </button>
            </div>
            {usageLoading ? (
              <span style={{ color: "#999", fontSize: 13 }}>Loading...</span>
            ) : usageData ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={statBox}>
                    <div style={statLabel}>Total Calls</div>
                    <div style={statValue}>{usageData.usage.totalCalls.toLocaleString()}</div>
                  </div>
                  <div style={statBox}>
                    <div style={statLabel}>Last Call</div>
                    <div style={statValue}>
                      {usageData.usage.lastCallAt
                        ? new Date(usageData.usage.lastCallAt).toLocaleString()
                        : "Never"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginTop: 12 }}>
                  <div style={statBox}>
                    <div style={statLabel}>Rate Limit (per minute)</div>
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                        <span>{usageData.usage.callsThisMinute} used</span>
                        <span>{usageData.limits.rateLimit.toLocaleString()} limit</span>
                      </div>
                      <div style={meterTrack}>
                        <div style={{
                          ...meterFill,
                          width: `${Math.min(100, (usageData.usage.callsThisMinute / usageData.limits.rateLimit) * 100)}%`,
                          background: (usageData.usage.callsThisMinute / usageData.limits.rateLimit) > 0.8 ? "#dc3545" : "#28a745",
                        }} />
                      </div>
                    </div>
                  </div>
                  <div style={statBox}>
                    <div style={statLabel}>Monthly Quota</div>
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                        <span>{usageData.usage.callsThisMonth.toLocaleString()} used</span>
                        <span>{usageData.limits.quota.toLocaleString()} limit</span>
                      </div>
                      <div style={meterTrack}>
                        <div style={{
                          ...meterFill,
                          width: `${Math.min(100, (usageData.usage.callsThisMonth / usageData.limits.quota) * 100)}%`,
                          background: (usageData.usage.callsThisMonth / usageData.limits.quota) > 0.8 ? "#dc3545" : "#28a745",
                        }} />
                      </div>
                    </div>
                  </div>
                </div>
                {usageData.usage.history.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={statLabel}>Recent History</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                      {usageData.usage.history.slice(-7).map((h) => (
                        <span key={h.date} style={{ padding: "2px 8px", background: "#e9ecef", borderRadius: 4, fontSize: 12 }}>
                          {h.date}: {h.calls}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span style={{ color: "#999", fontSize: 13 }}>No usage data</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 15,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const btnStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 15,
  borderRadius: 6,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};

const cellStyle: React.CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #eee",
};

const statBox: React.CSSProperties = {
  padding: "8px 10px",
  background: "#fff",
  borderRadius: 6,
  border: "1px solid #e9ecef",
};

const statLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const statValue: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  marginTop: 2,
};

const meterTrack: React.CSSProperties = {
  height: 8,
  background: "#e9ecef",
  borderRadius: 4,
  overflow: "hidden",
};

const meterFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 4,
  transition: "width 0.3s ease",
};
