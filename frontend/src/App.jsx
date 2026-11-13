
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Products from "./components/Products";
import {
  Activity, Bot, CheckCircle2, CircleHelp, FileText,
  LayoutDashboard, MessageSquare, Plus, Send, ShieldCheck,
  Ticket, UploadCloud, Wifi, WifiOff, X, Clock3,
  AlertCircle, Trash2, RefreshCw, ShoppingBag
} from "lucide-react";
import api from "./api";

const initialMessages = [{
  role: "assistant",
  content: "Hi! I’m Nova, your AI support assistant. Ask me a question, or upload a PDF knowledge-base document so I can answer using your company information."
}];

function App() {
  const [tab, setTab] = useState("overview");
  const [health, setHealth] = useState({ api: "checking", ollama: "checking" });
  const [stats, setStats] = useState({
    total: 0, open: 0, in_progress: 0,
    resolved: 0, urgent: 0, documents: 0
  });
  const [tickets, setTickets] = useState([]);
  const [docs, setDocs] = useState([]);
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    customer_name: "Website visitor",
    subject: "",
    description: "",
    priority: "medium",
    category: "general"
  });
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [h, s, t, d] = await Promise.all([
        api.get("/health"),
        api.get("/stats"),
        api.get("/tickets"),
        api.get("/documents")
      ]);
      setHealth(h.data);
      setStats(s.data);
      setTickets(t.data);
      setDocs(d.data);
    } catch {
      setHealth({ api: "offline", ollama: "unknown" });
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let socket;
    let retry;

    const connect = () => {
      socket = new WebSocket("ws://localhost:8000/ws");
      socket.onopen = () => setLive(true);
      socket.onmessage = () => refresh();
      socket.onclose = () => {
        setLive(false);
        retry = setTimeout(connect, 3000);
      };
      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      socket?.close();
      clearTimeout(retry);
    };
  }, [refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    const value = question.trim();

    if (!value || busy) return;

    setMessages(prev => [
      ...prev,
      { role: "user", content: value }
    ]);

    setQuestion("");
    setBusy(true);
    setNotice("");

    try {
      const result = await api.post("/chat", {
        message: value,
        conversation_id: conversationId
      });

      setConversationId(result.data.conversation_id);

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: result.data.answer,
          sources: result.data.sources
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: err.response?.data?.detail ||
            "I couldn't connect to the AI service. Check that the backend and Ollama are running."
        }
      ]);
    } finally {
      setBusy(false);
    }
  };

  const uploadPdf = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    setUploading(true);
    setNotice("");

    try {
      const result = await api.post(
        "/documents/upload",
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      setNotice(
        `Indexed ${result.data.filename}: ${result.data.chunks_added} chunks across ${result.data.pages} pages.`
      );

      await refresh();
    } catch (err) {
      setNotice(
        err.response?.data?.detail ||
        "Upload failed. Check backend logs and Ollama embedding model."
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const createTicket = async (e) => {
    e.preventDefault();

    try {
      await api.post("/tickets", ticketForm);

      setTicketForm({
        customer_name: "Website visitor",
        subject: "",
        description: "",
        priority: "medium",
        category: "general"
      });

      setShowTicketForm(false);
      setNotice("Ticket created successfully.");
      await refresh();
    } catch (err) {
      setNotice(err.response?.data?.detail || "Could not create ticket.");
    }
  };

  const updateTicket = async (id, status) => {
    try {
      await api.patch(`/tickets/${id}`, { status });
      await refresh();
    } catch {
      setNotice("Could not update ticket.");
    }
  };

  const deleteDoc = async (filename) => {
    if (!confirm(`Remove all indexed chunks for ${filename}?`)) return;

    try {
      await api.delete(
        `/documents/${encodeURIComponent(filename)}`
      );
      await refresh();
    } catch {
      setNotice("Could not delete document.");
    }
  };

  const visibleTickets = useMemo(
    () => tickets.filter(
      t => filter === "all" || t.status === filter
    ),
    [tickets, filter]
  );

  return (
    <div className="app-shell">

      {/* SIDEBAR */}
      <aside className="sidebar">

        <div className="brand">
          <div className="brand-mark">
            <Bot size={22} />
          </div>
          <div>
            <b>NovaDesk</b>
            <span>AI SUPPORT PLATFORM</span>
          </div>
        </div>

        <div className="workspace">
          <span className="workspace-dot"></span>
          <div>
            <b>Acme Workspace</b>
            <small>Local development</small>
          </div>
          <span className="chevron">⌄</span>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <nav>
          <button
            className={tab === "overview" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>

          <button
            className={tab === "assistant" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("assistant")}
          >
            <MessageSquare size={18} />
            AI Assistant
            <span className="nav-count">AI</span>
          </button>

          <button
            className={tab === "tickets" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("tickets")}
          >
            <Ticket size={18} />
            Tickets
            <span className="nav-count">{stats.open}</span>
          </button>

          <button
            className={tab === "knowledge" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("knowledge")}
          >
            <FileText size={18} />
            Knowledge base
          </button>

          <button
            className={tab === "products" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("products")}
          >
            <ShoppingBag size={18} />
            Products
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-title">
              <Activity size={15} /> SYSTEM STATUS
            </div>

            <div className="system-row">
              <span>API server</span>
              <span className={health.api === "ok" ? "status-good" : "status-bad"}>
                {health.api === "ok" ? "Online" : "Offline"}
              </span>
            </div>

            <div className="system-row">
              <span>Ollama</span>
              <span className={health.ollama === "connected" ? "status-good" : "status-warn"}>
                {health.ollama || "Unknown"}
              </span>
            </div>

            <div className="system-row">
              <span>Live events</span>
              <span className={live ? "status-good" : "status-bad"}>
                {live ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">RG</div>
            <div>
              <b>Raghu</b>
              <small>Administrator</small>
            </div>
            <span className="more">•••</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main">

        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span>
            <b>
              {tab === "overview" ? "Overview" :
                tab === "assistant" ? "AI Assistant" :
                tab === "tickets" ? "Tickets" :
                tab === "knowledge" ? "Knowledge base" :
                tab === "products" ? "Products" : ""}
            </b>
          </div>

          <div className="top-actions">
            <span className={live ? "live-pill" : "offline-pill"}>
              {live ? <Wifi size={14} /> : <WifiOff size={14} />}
              {live ? "Live updates on" : "Reconnecting"}
            </span>

            <button
              className="icon-button"
              onClick={refresh}
              title="Refresh"
            >
              <RefreshCw size={17} />
            </button>

            <div className="avatar small">RG</div>
          </div>
        </header>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice("")}>
              <X size={15} />
            </button>
          </div>
        )}

        {/* OVERVIEW */}
        {tab === "overview" && (
          <section className="page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR SUPPORT COMMAND CENTER</p>
                <h1>Good afternoon, Raghu <span className="wave">✦</span></h1>
                <p className="subheading">
                  Here’s what’s happening with your customer support today.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => {
                  setTab("tickets");
                  setShowTicketForm(true);
                }}
              >
                <Plus size={17} /> Create ticket
              </button>
            </div>

            <div className="stats-grid">
              <Stat icon={<Ticket />} label="Total tickets" value={stats.total} note="All recorded tickets" tone="purple" />
              <Stat icon={<AlertCircle />} label="Open tickets" value={stats.open} note="Needs attention" tone="orange" />
              <Stat icon={<Clock3 />} label="In progress" value={stats.in_progress} note="Currently being handled" tone="blue" />
              <Stat icon={<CheckCircle2 />} label="Resolved" value={stats.resolved} note="Successfully closed" tone="green" />
            </div>

            <div className="content-grid">
              <div className="panel tickets-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent tickets</h2>
                    <p>Latest customer support requests</p>
                  </div>
                  <button className="text-button" onClick={() => setTab("tickets")}>
                    View all →
                  </button>
                </div>

                {tickets.length ?
                  <TicketTable tickets={tickets.slice(0, 5)} onUpdate={updateTicket} /> :
                  <Empty icon={<Ticket />} title="No tickets yet" text="Create a ticket to see it appear here." />
                }
              </div>

              <div className="panel quick-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Quick actions</h2>
                    <p>Jump back into your workflow</p>
                  </div>
                </div>

                <button className="quick-action" onClick={() => setTab("assistant")}>
                  <div className="quick-icon violet"><Bot /></div>
                  <div><b>Ask AI assistant</b><small>Get instant support answers</small></div>
                  <span>→</span>
                </button>

                <button className="quick-action" onClick={() => setTab("knowledge")}>
                  <div className="quick-icon cyan"><UploadCloud /></div>
                  <div><b>Upload documents</b><small>Teach AI about your business</small></div>
                  <span>→</span>
                </button>

                <button className="quick-action" onClick={() => setTab("products")}>
                  <div className="quick-icon violet"><ShoppingBag /></div>
                  <div><b>Browse products</b><small>View the product catalogue</small></div>
                  <span>→</span>
                </button>

                <button className="quick-action" onClick={() => {
                  setTab("tickets");
                  setShowTicketForm(true);
                }}>
                  <div className="quick-icon amber"><Plus /></div>
                  <div><b>Create a ticket</b><small>Track a customer issue</small></div>
                  <span>→</span>
                </button>

                <div className="tip-box">
                  <ShieldCheck size={18} />
                  <div>
                    <b>Grounded AI responses</b>
                    <p>Upload trusted PDF documents. The assistant retrieves relevant passages before answering.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* AI ASSISTANT */}
        {tab === "assistant" && (
          <section className="page assistant-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">AI-POWERED CUSTOMER CARE</p>
                <h1>AI Assistant</h1>
                <p className="subheading">
                  Ask questions and get answers grounded in your knowledge base.
                </p>
              </div>
              <div className="model-pill">
                <span></span> llama3.2 · Ollama
              </div>
            </div>

            <div className="chat-layout">
              <div className="chat-panel">
                <div className="chat-top">
                  <div className="bot-avatar"><Bot /></div>
                  <div>
                    <b>Nova AI</b>
                    <small><span className="online-dot"></span> Ready to help</small>
                  </div>
                  <span className="secure">
                    <ShieldCheck size={14} /> Private local model
                  </span>
                </div>

                <div className="messages">
                  {messages.map((m, i) => (
                    <div className={`message-row ${m.role}`} key={i}>
                      {m.role === "assistant" && (
                        <div className="message-avatar"><Bot size={16} /></div>
                      )}
                      <div className="message-content">
                        <div className="bubble">{m.content}</div>

                        {m.sources?.length > 0 && (
                          <div className="sources">
                            <b>Sources used</b>
                            {m.sources.map((s, j) => (
                              <span key={j}>
                                <FileText size={12} />
                                {s.filename} · page {s.page} · {s.similarity}
                              </span>
                            ))}
                          </div>
                        )}

                        <small>{m.role === "assistant" ? "Nova AI" : "You"}</small>
                      </div>
                    </div>
                  ))}

                  {busy && (
                    <div className="message-row assistant">
                      <div className="message-avatar"><Bot size={16} /></div>
                      <div className="bubble typing">
                        <i></i><i></i><i></i>
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>

                <form className="composer" onSubmit={sendMessage}>
                  <textarea
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Ask Nova anything..."
                    rows="1"
                  />
                  <button
                    disabled={!question.trim() || busy}
                    className="send-button"
                  >
                    <Send size={17} />
                  </button>
                </form>

                <div className="composer-foot">
                  <span><ShieldCheck size={12} /> AI can make mistakes. Verify important information.</span>
                  <span>Enter to send · Shift + Enter for new line</span>
                </div>
              </div>

              <aside className="assistant-side">
                <div className="panel">
                  <h3>Knowledge base</h3>
                  <p className="muted">Documents available to Nova</p>

                  {docs.length ?
                    docs.map(d => (
                      <div className="mini-doc" key={d.filename}>
                        <FileText size={16} />
                        <span>{d.filename}</span>
                      </div>
                    )) :
                    <div className="small-empty">No documents indexed yet.</div>
                  }

                  <button className="secondary-button full" onClick={() => setTab("knowledge")}>
                    <UploadCloud size={15} /> Manage documents
                  </button>
                </div>

                <div className="panel">
                  <h3>Try asking</h3>
                  {[
                    "What is your refund policy?",
                    "How do I reset my account password?",
                    "What are your support hours?"
                  ].map(q => (
                    <button className="suggestion" key={q} onClick={() => setQuestion(q)}>
                      {q}<span>↗</span>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* TICKETS */}
        {tab === "tickets" && (
          <section className="page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">CUSTOMER OPERATIONS</p>
                <h1>Support tickets</h1>
                <p className="subheading">Track, prioritize and resolve customer issues.</p>
              </div>
              <button className="primary-button" onClick={() => setShowTicketForm(true)}>
                <Plus size={17} /> Create ticket
              </button>
            </div>

            <div className="filter-row">
              {["all", "open", "in_progress", "resolved"].map(f => (
                <button
                  key={f}
                  className={filter === f ? "filter active" : "filter"}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All tickets" : f.replace("_", " ")}
                </button>
              ))}
              <span className="result-count">{visibleTickets.length} tickets</span>
            </div>

            <div className="panel">
              <TicketTable tickets={visibleTickets} onUpdate={updateTicket} />
            </div>
          </section>
        )}

        {/* KNOWLEDGE BASE */}
        {tab === "knowledge" && (
          <section className="page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">RETRIEVAL-AUGMENTED GENERATION</p>
                <h1>Knowledge base</h1>
                <p className="subheading">
                  Upload PDF documents. Nova will retrieve relevant passages to answer questions.
                </p>
              </div>
            </div>

            <div className="upload-card">
              <div className="upload-symbol"><UploadCloud size={27} /></div>
              <h2>Upload your knowledge documents</h2>
              <p>Choose a PDF with selectable text. Each page is split into chunks and indexed with Ollama embeddings.</p>

              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={uploadPdf}
              />

              <button
                className="primary-button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Indexing document..." : <><UploadCloud size={17} /> Choose PDF file</>}
              </button>

              <small>PDF only · Maximum 15 MB · Scanned PDFs require OCR</small>
            </div>

            <div className="panel docs-panel">
              <div className="panel-heading">
                <div>
                  <h2>Indexed documents</h2>
                  <p>{docs.length} documents in your local knowledge base</p>
                </div>
                <span className="count-badge">{docs.length}</span>
              </div>

              {docs.length ?
                docs.map(d => (
                  <div className="doc-row" key={d.filename}>
                    <div className="doc-icon"><FileText /></div>
                    <div className="doc-info">
                      <b>{d.filename}</b>
                      <small>Indexed and ready for retrieval</small>
                    </div>
                    <span className="indexed"><CheckCircle2 size={14} /> Indexed</span>
                    <button
                      className="icon-button danger"
                      onClick={() => deleteDoc(d.filename)}
                      title="Delete document"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )) :
                <Empty icon={<FileText />} title="Your knowledge base is empty" text="Upload a PDF to give the AI assistant company-specific knowledge." />
              }
            </div>

            <div className="info-note">
              <CircleHelp size={18} />
              <div>
                <b>How RAG works in this app</b>
                <p>PDF text → chunks → Ollama embeddings → cosine-similarity retrieval → relevant context → LLM answer with source references.</p>
              </div>
            </div>
          </section>
        )}

        {/* PRODUCTS */}
        {tab === "products" && (
          <section className="page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">PRODUCT CATALOGUE</p>
                <h1>Products</h1>
                <p className="subheading">
                  Browse products fetched from Fake Store API.
                </p>
              </div>
            </div>

            <Products />
          </section>
        )}

        {/* CREATE TICKET MODAL */}
        {showTicketForm && (
          <div className="modal-backdrop" onClick={() => setShowTicketForm(false)}>
            <form
              className="ticket-modal"
              onSubmit={createTicket}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <h2>Create support ticket</h2>
                  <p>Capture the customer issue and assign a priority.</p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowTicketForm(false)}
                >
                  <X />
                </button>
              </div>

              <label>
                Customer name
                <input
                  value={ticketForm.customer_name}
                  onChange={e => setTicketForm({
                    ...ticketForm,
                    customer_name: e.target.value
                  })}
                />
              </label>

              <label>
                Subject
                <input
                  required
                  minLength="3"
                  value={ticketForm.subject}
                  onChange={e => setTicketForm({
                    ...ticketForm,
                    subject: e.target.value
                  })}
                  placeholder="e.g. Unable to sign in"
                />
              </label>

              <label>
                Description
                <textarea
                  required
                  value={ticketForm.description}
                  onChange={e => setTicketForm({
                    ...ticketForm,
                    description: e.target.value
                  })}
                  placeholder="Describe the issue..."
                  rows="4"
                />
              </label>

              <div className="form-two">
                <label>
                  Priority
                  <select
                    value={ticketForm.priority}
                    onChange={e => setTicketForm({
                      ...ticketForm,
                      priority: e.target.value
                    })}
                  >
                    <option>low</option>
                    <option>medium</option>
                    <option>high</option>
                    <option>urgent</option>
                  </select>
                </label>

                <label>
                  Category
                  <select
                    value={ticketForm.category}
                    onChange={e => setTicketForm({
                      ...ticketForm,
                      category: e.target.value
                    })}
                  >
                    <option value="general">General</option>
                    <option value="billing">Billing</option>
                    <option value="technical">Technical</option>
                    <option value="account">Account</option>
                    <option value="orders">Orders</option>
                  </select>
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowTicketForm(false)}
                >
                  Cancel
                </button>
                <button className="primary-button">
                  <Plus size={16} /> Create ticket
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}

function Stat({ icon, label, value, note, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

function Empty({ icon, title, text }) {
  return (
    <div className="empty-state">
      <div>{icon}</div>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function TicketTable({ tickets, onUpdate }) {
  if (!tickets.length) {
    return (
      <Empty
        icon={<Ticket />}
        title="Nothing to show"
        text="New tickets will appear here as soon as they are created."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>TICKET</th>
            <th>CUSTOMER</th>
            <th>PRIORITY</th>
            <th>STATUS</th>
            <th>CREATED</th>
            <th>ACTION</th>
          </tr>
        </thead>

        <tbody>
          {tickets.map(t => (
            <tr key={t.id}>
              <td>
                <b className="ticket-id">
                  #{String(t.id).padStart(4, "0")}
                </b>
                <span className="ticket-subject">{t.subject}</span>
              </td>

              <td>{t.customer_name}</td>

              <td>
                <span className={`priority ${t.priority}`}>
                  {t.priority}
                </span>
              </td>

              <td>
                <span className={`status ${t.status}`}>
                  {t.status.replace("_", " ")}
                </span>
              </td>

              <td>{new Date(t.created_at).toLocaleDateString()}</td>

              <td>
                <select
                  className="status-select"
                  value={t.status}
                  onChange={e => onUpdate(t.id, e.target.value)}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
