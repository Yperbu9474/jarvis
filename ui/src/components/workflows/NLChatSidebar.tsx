import React, { useState, useRef, useEffect } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function NLChatSidebar({
  workflowId,
  onDefinitionUpdate,
}: {
  workflowId: string;
  onDefinitionUpdate: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const resp = await fetch("/api/workflows/nl-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          message: text,
          history: messages.slice(-10),
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setMessages(prev => [...prev, { role: "assistant", content: data.reply ?? data.message ?? "Done." }]);
        if (data.updated) {
          onDefinitionUpdate();
        }
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to connect." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--j-border)",
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--j-text)",
      }}>
        AI Assistant
      </div>

      {/* Messages */}
      <div ref={listRef} style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}>
        {messages.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--j-text-muted)", fontSize: "11px" }}>
            Describe what you want to build or modify. For example:
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {[
                "\"Add a step that sends an email when done\"",
                "\"Connect the HTTP node to the filter\"",
                "\"Add error handling for the API call\"",
              ].map(hint => (
                <button
                  key={hint}
                  onClick={() => { setInput(hint.replace(/"/g, "")); }}
                  style={{
                    background: "var(--j-bg)",
                    border: "1px solid var(--j-border)",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "10px",
                    color: "var(--j-text-dim)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "85%",
            padding: "6px 10px",
            borderRadius: "8px",
            fontSize: "11px",
            lineHeight: "1.4",
            background: msg.role === "user"
              ? "rgba(0, 212, 255, 0.15)"
              : "var(--j-bg)",
            color: msg.role === "user"
              ? "var(--j-accent)"
              : "var(--j-text)",
            border: `1px solid ${msg.role === "user" ? "rgba(0, 212, 255, 0.2)" : "var(--j-border)"}`,
          }}>
            {msg.content}
          </div>
        ))}

        {loading && (
          <div style={{
            alignSelf: "flex-start",
            padding: "6px 10px",
            borderRadius: "8px",
            fontSize: "11px",
            background: "var(--j-bg)",
            color: "var(--j-text-muted)",
            border: "1px solid var(--j-border)",
          }}>
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: "8px",
        borderTop: "1px solid var(--j-border)",
        display: "flex",
        gap: "6px",
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
          placeholder="Describe a change..."
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid var(--j-border)",
            background: "var(--j-bg)",
            color: "var(--j-text)",
            fontSize: "11px",
            outline: "none",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "none",
            background: "var(--j-accent)",
            color: "#fff",
            fontSize: "11px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
