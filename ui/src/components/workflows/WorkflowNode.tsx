import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type WorkflowNodeData = {
  label: string;
  nodeType: string;
  icon: string;
  color: string;
  config: Record<string, unknown>;
  configSchema: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
  status?: "running" | "completed" | "failed";
};

function WorkflowNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  const statusColor = d.status === "running"
    ? "var(--j-accent)"
    : d.status === "completed"
    ? "var(--j-success)"
    : d.status === "failed"
    ? "var(--j-error, #ef4444)"
    : undefined;

  return (
    <div style={{
      minWidth: "160px",
      background: "var(--j-surface)",
      border: `1.5px solid ${selected ? "var(--j-accent)" : "var(--j-border)"}`,
      borderRadius: "8px",
      overflow: "hidden",
      boxShadow: selected
        ? "0 0 0 2px rgba(0, 212, 255, 0.2)"
        : "0 1px 4px rgba(0,0,0,0.3)",
      transition: "border-color 0.15s, box-shadow 0.15s",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 12px",
        background: d.color,
        color: "#fff",
        fontSize: "12px",
        fontWeight: 600,
        position: "relative",
      }}>
        <span style={{ fontSize: "14px" }}>{d.icon}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {d.label}
        </span>
        {statusColor && (
          <span style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            animation: d.status === "running" ? "pulse 1.5s infinite" : undefined,
          }} />
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "8px 12px", fontSize: "10px", color: "var(--j-text-muted)" }}>
        <div style={{ opacity: 0.7 }}>{d.nodeType}</div>
        {Object.keys(d.config).length > 0 && (
          <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {Object.entries(d.config).slice(0, 3).map(([key, val]) => (
              <div key={key} style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "140px",
              }}>
                <span style={{ color: "var(--j-text-dim)" }}>{key}:</span>{" "}
                <span style={{ color: "var(--j-text)" }}>
                  {typeof val === "string" ? val : JSON.stringify(val)}
                </span>
              </div>
            ))}
            {Object.keys(d.config).length > 3 && (
              <div style={{ color: "var(--j-text-dim)", fontStyle: "italic" }}>
                +{Object.keys(d.config).length - 3} more
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input handles */}
      {d.inputs.map((input, i) => (
        <Handle
          key={`in-${input}`}
          type="target"
          position={Position.Left}
          id={input}
          style={{
            top: `${((i + 1) / (d.inputs.length + 1)) * 100}%`,
            width: "10px",
            height: "10px",
            background: "var(--j-border)",
            border: "2px solid var(--j-surface)",
          }}
          title={input}
        />
      ))}

      {/* Output handles */}
      {d.outputs.map((output, i) => (
        <Handle
          key={`out-${output}`}
          type="source"
          position={Position.Right}
          id={output}
          style={{
            top: `${((i + 1) / (d.outputs.length + 1)) * 100}%`,
            width: "10px",
            height: "10px",
            background: d.color,
            border: "2px solid var(--j-surface)",
          }}
          title={output}
        />
      ))}
    </div>
  );
}

export default memo(WorkflowNodeComponent);
