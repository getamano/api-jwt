"use client";

import { useState } from "react";

interface UsageData {
  email: string;
  tier: string;
  limits: { rateLimit: number; quota: number };
  usage: {
    totalCalls: number;
    callsThisMinute: number;
    callsThisMonth: number;
    lastCallAt: string | null;
    history: { date: string; calls: number }[];
  };
}

export default function UsagePage() {
  const [apiKey, setApiKey] = useState("");
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchUsage() {
    setError("");
    setData(null);
    setLoading(true);

    try {
      const res = await fetch("/api/usage", {
        headers: { "X-Api-Key": apiKey },
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to fetch usage");
        return;
      }

      setData(json);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: "60px auto", fontFamily: "system-ui, sans-serif", padding: "0 20px" }}>
      <h1 style={{ marginBottom: 24 }}>Usage Report</h1>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Paste your API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ flex: 1, padding: "10px 12px", fontSize: 15, borderRadius: 6, border: "1px solid #ccc" }}
        />
        <button
          onClick={fetchUsage}
          disabled={loading || !apiKey}
          style={{ padding: "10px 20px", fontSize: 15, borderRadius: 6, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}
        >
          {loading ? "Loading..." : "Check"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: 12, background: "#fee", color: "#c00", borderRadius: 6 }}>
          {error}
        </div>
      )}

      {data && (
        <div style={{ marginTop: 24 }}>
          {/* User Info */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={cardStyle}>
              <div style={labelStyle}>Email</div>
              <div style={valueStyle}>{data.email}</div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Tier</div>
              <div style={{ ...valueStyle, textTransform: "capitalize" }}>{data.tier}</div>
            </div>
          </div>

          {/* Rate Limit */}
          <h3 style={{ marginBottom: 12 }}>Rate Limit (per minute)</h3>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>{data.usage.callsThisMinute} / {data.limits.rateLimit}</span>
              <span>{Math.round((data.usage.callsThisMinute / data.limits.rateLimit) * 100)}%</span>
            </div>
            <div style={barBgStyle}>
              <div style={{ ...barFillStyle, width: `${Math.min((data.usage.callsThisMinute / data.limits.rateLimit) * 100, 100)}%` }} />
            </div>
          </div>

          {/* Monthly Quota */}
          <h3 style={{ marginBottom: 12 }}>Monthly Quota</h3>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>{data.usage.callsThisMonth.toLocaleString()} / {data.limits.quota.toLocaleString()}</span>
              <span>{Math.round((data.usage.callsThisMonth / data.limits.quota) * 100)}%</span>
            </div>
            <div style={barBgStyle}>
              <div style={{ ...barFillStyle, width: `${Math.min((data.usage.callsThisMonth / data.limits.quota) * 100, 100)}%` }} />
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={cardStyle}>
              <div style={labelStyle}>Total Calls</div>
              <div style={valueStyle}>{data.usage.totalCalls.toLocaleString()}</div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Last Call</div>
              <div style={{ fontSize: 13 }}>
                {data.usage.lastCallAt ? new Date(data.usage.lastCallAt).toLocaleString() : "Never"}
              </div>
            </div>
          </div>

          {/* Daily History */}
          {data.usage.history.length > 0 && (
            <>
              <h3 style={{ marginBottom: 12 }}>Daily History</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usage.history.slice(-10).reverse().map((entry) => (
                    <tr key={entry.date}>
                      <td style={tdStyle}>{entry.date}</td>
                      <td style={tdStyle}>{entry.calls.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  flex: 1,
  padding: 16,
  borderRadius: 8,
  border: "1px solid #e0e0e0",
  background: "#fafafa",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const valueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
};

const barBgStyle: React.CSSProperties = {
  height: 8,
  borderRadius: 4,
  background: "#e0e0e0",
  overflow: "hidden",
};

const barFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 4,
  background: "#111",
  transition: "width 0.3s",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "2px solid #e0e0e0",
  fontSize: 13,
  color: "#666",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #f0f0f0",
  fontSize: 14,
};
