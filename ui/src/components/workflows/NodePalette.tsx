import React, { useState } from "react";

type NodeCatalogItem = {
  type: string;
  label: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  configSchema: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
};

const CATEGORY_ORDER = ["trigger", "action", "logic", "transform", "error"];
const CATEGORY_LABELS: Record<string, string> = {
  trigger: "Triggers",
  action: "Actions",
  logic: "Logic",
  transform: "Transform",
  error: "Error Handling",
};

export default function NodePalette({ catalog, onCollapse }: { catalog: NodeCatalogItem[]; onCollapse?: () => void }) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = search
    ? catalog.filter(n =>
        n.label.toLowerCase().includes(search.toLowerCase()) ||
        n.type.toLowerCase().includes(search.toLowerCase()) ||
        n.description.toLowerCase().includes(search.toLowerCase())
      )
    : catalog;

  const grouped = new Map<string, NodeCatalogItem[]>();
  for (const cat of CATEGORY_ORDER) {
    const items = filtered.filter(n => n.category === cat);
    if (items.length > 0) grouped.set(cat, items);
  }

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const onDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData("nodeType", nodeType);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div style={{
      width: "220px",
      minWidth: "220px",
      borderRight: "1px solid var(--j-border)",
      background: "var(--j-surface)",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
    }}>
      {/* Header + Search */}
      <div style={{ padding: "8px 8px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--j-text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", paddingLeft: "4px" }}>Nodes</span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            style={{
              background: "none",
              border: "1px solid var(--j-border)",
              color: "var(--j-text-dim)",
              cursor: "pointer",
              fontSize: "10px",
              width: "22px",
              height: "22px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Collapse palette"
          >{"\u25C0"}</button>
        )}
      </div>
      <div style={{ padding: "8px 12px 8px" }}>
        <input
          type="text"
          placeholder="Search nodes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid var(--j-border)",
            background: "var(--j-bg)",
            color: "var(--j-text)",
            fontSize: "12px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Categories */}
      <div style={{ flex: 1, padding: "0 8px 12px", overflowY: "auto" }}>
        {Array.from(grouped.entries()).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: "8px" }}>
            <button
              onClick={() => toggleCategory(cat)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "6px 8px",
                background: "none",
                border: "none",
                color: "var(--j-text-dim)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              <span>{CATEGORY_LABELS[cat] ?? cat}</span>
              <span style={{ fontSize: "10px" }}>{collapsed.has(cat) ? "\u25B6" : "\u25BC"}</span>
            </button>

            {!collapsed.has(cat) && (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {items.map(node => (
                  <div
                    key={node.type}
                    draggable
                    onDragStart={e => onDragStart(e, node.type)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      cursor: "grab",
                      fontSize: "12px",
                      color: "var(--j-text)",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--j-surface-hover, rgba(255,255,255,0.05))"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    title={node.description}
                  >
                    <span style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "4px",
                      background: node.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      flexShrink: 0,
                    }}>
                      {node.icon}
                    </span>
                    <span style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {node.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {grouped.size === 0 && (
          <div style={{
            padding: "20px",
            textAlign: "center",
            color: "var(--j-text-muted)",
            fontSize: "12px",
          }}>
            {search ? "No nodes match" : "Loading nodes..."}
          </div>
        )}
      </div>
    </div>
  );
}
