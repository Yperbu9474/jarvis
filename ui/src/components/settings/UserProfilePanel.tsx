import React from "react";

export function UserProfilePanel() {
  return (
    <div
      style={{
        padding: "20px",
        background: "var(--j-surface)",
        border: "1px solid var(--j-border)",
        borderRadius: "8px",
      }}
    >
      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--j-text)" }}>
        User Profile
      </h3>
      <p style={{ margin: "8px 0 0", fontSize: "12px", lineHeight: 1.6, color: "var(--j-text-muted)" }}>
        Profile controls are available after merging the latest settings updates.
      </p>
    </div>
  );
}
