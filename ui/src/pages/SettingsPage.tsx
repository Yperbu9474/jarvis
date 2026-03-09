import React from "react";
import { PersonalityPanel } from "../components/settings/PersonalityPanel";
import { LLMPanel } from "../components/settings/LLMPanel";
import { HeartbeatPanel } from "../components/settings/HeartbeatPanel";
import { RolePanel } from "../components/settings/RolePanel";
import { IntegrationsPanel } from "../components/settings/IntegrationsPanel";
import { ChannelsPanel } from "../components/settings/ChannelsPanel";
import { SidecarPanel } from "../components/settings/SidecarPanel";

export default function SettingsPage() {
  return (
    <div style={{ padding: "24px", overflow: "auto", height: "100%" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 600,
            color: "var(--j-text)",
            margin: 0,
          }}
        >
          Settings
        </h1>
        <div style={{ fontSize: "13px", color: "var(--j-text-muted)", marginTop: "4px" }}>
          System configuration and personality
        </div>
      </div>

      <div style={{ display: "flex", gap: "20px" }}>
        {/* Left column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          <PersonalityPanel />
          <RolePanel />
        </div>

        {/* Right column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          <LLMPanel />
          <HeartbeatPanel />
          <IntegrationsPanel />
          <ChannelsPanel />
          <SidecarPanel />
        </div>
      </div>
    </div>
  );
}
