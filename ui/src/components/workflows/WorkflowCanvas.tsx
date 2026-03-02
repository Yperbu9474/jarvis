import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useApiData, api } from "../../hooks/useApi";
import type { WorkflowEvent } from "../../hooks/useWebSocket";
import WorkflowNodeComponent from "./WorkflowNode";
import NodePalette from "./NodePalette";
import NodeProperties from "./NodeProperties";
import ExecutionMonitor from "./ExecutionMonitor";
import VersionHistory from "./VersionHistory";
import NLChatSidebar from "./NLChatSidebar";

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

type WorkflowVersion = {
  id: string;
  workflow_id: string;
  version: number;
  definition: {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      position: { x: number; y: number };
      config: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      label?: string;
    }>;
    settings: Record<string, unknown>;
  };
  changelog: string | null;
  created_at: number;
};

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNodeComponent,
};

export default function WorkflowCanvas({
  workflowId,
  workflowEvents,
  sendMessage,
}: {
  workflowId: string;
  workflowEvents: WorkflowEvent[];
  sendMessage: (text: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"properties" | "executions" | "versions" | "chat">("properties");
  const [showPalette, setShowPalette] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: nodeCatalog } = useApiData<NodeCatalogItem[]>("/api/workflows/nodes");
  const { data: latestVersion, refetch: refetchVersion } = useApiData<WorkflowVersion[]>(
    `/api/workflows/${workflowId}/versions`
  );

  const catalogMap = useMemo(() => {
    const map = new Map<string, NodeCatalogItem>();
    nodeCatalog?.forEach(n => map.set(n.type, n));
    return map;
  }, [nodeCatalog]);

  // Load workflow definition from latest version
  useEffect(() => {
    if (!latestVersion || latestVersion.length === 0) return;
    const version = latestVersion[0]; // newest first
    const def = version.definition;

    const flowNodes: Node[] = def.nodes.map(n => {
      const catalogItem = catalogMap.get(n.type);
      return {
        id: n.id,
        type: "workflowNode",
        position: n.position,
        data: {
          label: n.label,
          nodeType: n.type,
          icon: catalogItem?.icon ?? "?",
          color: catalogItem?.color ?? "#666",
          config: n.config,
          configSchema: catalogItem?.configSchema ?? {},
          inputs: catalogItem?.inputs ?? ["default"],
          outputs: catalogItem?.outputs ?? ["default"],
        },
      };
    });

    const flowEdges: Edge[] = def.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      label: e.label,
      style: { stroke: "var(--j-text-muted)" },
      animated: false,
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [latestVersion, catalogMap]);

  // Connect edges
  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({
      ...connection,
      id: `e-${Date.now()}`,
      style: { stroke: "var(--j-text-muted)" },
    }, eds));
    scheduleSave();
  }, []);

  // Node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Drop handler for adding nodes from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData("nodeType");
    if (!nodeType || !catalogMap.has(nodeType)) return;

    const catalogItem = catalogMap.get(nodeType)!;
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return;

    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: "workflowNode",
      position: {
        x: event.clientX - bounds.left - 90,
        y: event.clientY - bounds.top - 20,
      },
      data: {
        label: catalogItem.label,
        nodeType: catalogItem.type,
        icon: catalogItem.icon,
        color: catalogItem.color,
        config: {},
        configSchema: catalogItem.configSchema,
        inputs: catalogItem.inputs,
        outputs: catalogItem.outputs,
      },
    };

    setNodes(nds => [...nds, newNode]);
    setSelectedNodeId(newNode.id);
    scheduleSave();
  }, [catalogMap]);

  // Save workflow (debounced)
  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const definition = {
          nodes: nodes.map(n => ({
            id: n.id,
            type: n.data.nodeType,
            label: n.data.label,
            position: n.position,
            config: n.data.config ?? {},
          })),
          edges: edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            label: e.label,
          })),
          settings: latestVersion?.[0]?.definition.settings ?? {
            maxRetries: 3, retryDelayMs: 5000, timeoutMs: 300000,
            parallelism: "parallel", onError: "stop",
          },
        };
        await api(`/api/workflows/${workflowId}/versions`, {
          method: "POST",
          body: JSON.stringify({ definition, changelog: "Auto-save" }),
        });
      } catch (err) {
        console.error("Failed to save workflow:", err);
      }
    }, 2000);
  }, [nodes, edges, workflowId, latestVersion]);

  // Update node config
  const handleConfigUpdate = useCallback((nodeId: string, config: Record<string, unknown>) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
    ));
    scheduleSave();
  }, [scheduleSave]);

  // Animate running nodes based on WS events
  useEffect(() => {
    const runningNodes = new Set<string>();
    for (const evt of workflowEvents) {
      if (evt.workflowId !== workflowId) continue;
      if (evt.type === "step_started" && evt.nodeId) runningNodes.add(evt.nodeId);
      if ((evt.type === "step_completed" || evt.type === "step_failed") && evt.nodeId) runningNodes.delete(evt.nodeId);
    }

    setEdges(eds => eds.map(e => ({
      ...e,
      animated: runningNodes.has(e.source),
    })));
  }, [workflowEvents, workflowId]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const toggleBtnStyle: React.CSSProperties = {
    background: "var(--j-surface)",
    border: "1px solid var(--j-border)",
    color: "var(--j-text-dim)",
    cursor: "pointer",
    fontSize: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    width: "28px",
    height: "28px",
    flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--j-bg)" }}>
      {/* Left: Node Palette (collapsible) */}
      {showPalette ? (
        <NodePalette catalog={nodeCatalog ?? []} onCollapse={() => setShowPalette(false)} />
      ) : (
        <div style={{
          width: "32px", minWidth: "32px",
          borderRight: "1px solid var(--j-border)",
          background: "var(--j-surface)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "8px",
        }}>
          <button onClick={() => setShowPalette(true)} style={toggleBtnStyle} title="Show node palette">
            {"\u25B6"}
          </button>
        </div>
      )}

      {/* Center: Canvas */}
      <div ref={reactFlowWrapper} style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => { onNodesChange(changes); scheduleSave(); }}
          onEdgesChange={(changes) => { onEdgesChange(changes); scheduleSave(); }}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--j-bg)" }}
        >
          <Controls style={{ background: "var(--j-surface)", borderColor: "var(--j-border)" }} />
          <MiniMap
            style={{ background: "var(--j-surface)" }}
            nodeColor="#00d4ff"
            maskColor="rgba(0,0,0,0.5)"
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--j-border)" />
        </ReactFlow>
      </div>

      {/* Right: Tabbed Panel (collapsible) */}
      {showPanel ? (
        <div style={{
          width: "300px", minWidth: "300px",
          borderLeft: "1px solid var(--j-border)",
          background: "var(--j-surface)",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Tabs + collapse button */}
          <div style={{
            display: "flex",
            borderBottom: "1px solid var(--j-border)",
            flexShrink: 0,
            alignItems: "center",
          }}>
            {(["properties", "executions", "versions", "chat"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  background: "none",
                  border: "none",
                  borderBottom: rightTab === tab ? "2px solid var(--j-accent)" : "2px solid transparent",
                  color: rightTab === tab ? "var(--j-accent)" : "var(--j-text-dim)",
                  fontSize: "10px",
                  fontWeight: rightTab === tab ? 600 : 400,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {tab === "chat" ? "AI" : tab === "properties" ? "Config" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setShowPanel(false)}
              style={{ ...toggleBtnStyle, margin: "4px", width: "22px", height: "22px", fontSize: "10px" }}
              title="Collapse panel"
            >
              {"\u25B6"}
            </button>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {rightTab === "properties" && (
              selectedNode ? (
                <NodeProperties
                  node={selectedNode}
                  onConfigUpdate={(config) => handleConfigUpdate(selectedNode.id, config)}
                />
              ) : (
                <div style={{ padding: "20px", color: "var(--j-text-dim)", fontSize: "12px", textAlign: "center" }}>
                  Select a node to configure it, or drag one from the palette.
                </div>
              )
            )}
            {rightTab === "executions" && (
              <ExecutionMonitor workflowId={workflowId} workflowEvents={workflowEvents} />
            )}
            {rightTab === "versions" && (
              <VersionHistory workflowId={workflowId} />
            )}
            {rightTab === "chat" && (
              <NLChatSidebar workflowId={workflowId} onDefinitionUpdate={refetchVersion} />
            )}
          </div>
        </div>
      ) : (
        <div style={{
          width: "32px", minWidth: "32px",
          borderLeft: "1px solid var(--j-border)",
          background: "var(--j-surface)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "8px",
        }}>
          <button onClick={() => setShowPanel(true)} style={toggleBtnStyle} title="Show panel">
            {"\u25C0"}
          </button>
        </div>
      )}
    </div>
  );
}
