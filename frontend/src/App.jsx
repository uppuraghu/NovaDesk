
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Products from "./components/Products";
import {
  Activity, Bot, CheckCircle2, CircleHelp, FileText,
  LayoutDashboard, MessageSquare, Plus, Send, ShieldCheck,
  Ticket, UploadCloud, Wifi, WifiOff, X, Clock3,
  AlertCircle, Trash2, RefreshCw, ShoppingBag, Users, LogOut, UserPlus
} from "lucide-react";
import api from "./api";

const initialMessages = [{
  role: "assistant",
  content: "Hi! I’m Nova, your AI support assistant. Ask me a question, or upload a PDF knowledge-base document so I can answer using your company information."
}];

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState("overview");
  const [health, setHealth] = useState({ api: "checking", database: "checking", ollama: "checking" });
  const [stats, setStats] = useState({
    total: 0, open: 0, in_progress: 0,
    resolved: 0, urgent: 0, documents: 0
  });
  const [tickets, setTickets] = useState([]);
  const [members, setMembers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    customer_name: "Website visitor",
    customer_email: "",
    subject: "",
    description: "",
    priority: "medium",
    category: "general"
  });
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [filter, setFilter] = useState("all");
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("novadesk_access_token");
    if (!token) {
      setAuthReady(true);
    } else {
      api.get("/auth/me")
        .then(result => { if (active) setUser(result.data); })
        .catch(error => {
          if (error.response?.status === 401) api.setAuthToken(null);
        })
        .finally(() => { if (active) setAuthReady(true); });
    }

    const expire = () => setUser(null);
    window.addEventListener("novadesk-auth-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("novadesk-auth-expired", expire);
    };
  }, []);

  const handleAuthenticated = (result) => {
    api.setAuthToken(result.access_token);
    setUser(result.user);
  };

  const logout = () => {
    api.setAuthToken(null);
    setUser(null);
    setTickets([]);
    setDocs([]);
    setMessages(initialMessages);
    setConversationId(null);
  };

  const refresh = useCallback(async () => {
    try {
      const [h, s, t, d, team] = await Promise.all([
        api.get("/health"),
        api.get("/stats"),
        api.get("/tickets"),
        api.get("/documents"),
        api.get("/team")
      ]);
      setHealth(h.data);
      setStats(s.data);
      setTickets(t.data);
      setDocs(d.data);
      setMembers(team.data);
    } catch {
      setHealth({ api: "offline", database: "unknown", ollama: "unknown" });
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh, user]);

  useEffect(() => {
    if (!user) return undefined;
    let socket;
    let retry;
    let stopped = false;

    const connect = async () => {
      try {
        const { data } = await api.post("/auth/ws-token");
        if (stopped) return;
        const apiUrl = new URL(api.defaults.baseURL, window.location.href);
        const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = import.meta.env.VITE_WS_URL || `${wsProtocol}//${apiUrl.host}/ws`;
        socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(data.token)}`);
        socket.onopen = () => setLive(true);
        socket.onmessage = () => refresh();
        socket.onclose = () => {
          setLive(false);
          if (!stopped) retry = setTimeout(connect, 3000);
        };
        socket.onerror = () => socket.close();
      } catch {
        setLive(false);
        if (!stopped) retry = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      stopped = true;
      socket?.close();
      clearTimeout(retry);
    };
  }, [refresh, user]);

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
        customer_email: "",
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

  const updateTicket = async (id, changes) => {
    try {
      await api.patch(`/tickets/${id}`, changes);
      await refresh();
    } catch {
      setNotice("Could not update ticket.");
    }
  };

  const classifyTicket = async (id) => {
    try {
      await api.post(`/tickets/${id}/classify`);
      await refresh();
      setNotice("AI suggestions are ready for human review.");
    } catch (err) {
      setNotice(err.response?.data?.detail || "Could not classify this ticket.");
    }
  };

  const decideClassification = async (id, decision) => {
    try {
      await api.post(`/tickets/${id}/classification/${decision}`);
      await refresh();
      setNotice(decision === "approve" ? "AI suggestions approved and applied." : "AI suggestions rejected.");
    } catch (err) {
      setNotice(err.response?.data?.detail || "Could not update the AI suggestion.");
    }
  };

  const inviteMember = async (event) => {
    event.preventDefault();
    try {
      await api.post("/team/invitations", { email: inviteEmail, role: inviteRole });
      setInviteEmail("");
      setNotice("Invitation sent by email. It expires in 24 hours.");
    } catch (err) {
      setNotice(err.response?.data?.detail || "Could not invite this team member.");
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

  if (!authReady) {
    return <div className="auth-loading">Loading your secure workspace…</div>;
  }
  if (!user) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

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
            <b>{user.tenant_name || "Workspace"}</b>
            <small>{user.role === "admin" ? "Administrator" : "Support agent"}</small>
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
          <button
            className={tab === "team" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("team")}
          >
            <Users size={18} />
            Team
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
            <div className="system-row">
              <span>Database</span>
              <span className={health.database === "connected" ? "status-good" : "status-bad"}>
                {health.database || "Unknown"}
              </span>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">{user.display_name.slice(0, 2).toUpperCase()}</div>
            <div>
              <b>{user.display_name}</b>
              <small>{user.role === "admin" ? "Administrator" : "Support agent"}</small>
            </div>
            <button className="profile-logout" onClick={logout} title="Sign out"><LogOut size={15} /></button>
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
                tab === "products" ? "Products" :
                tab === "team" ? "Team" : ""}
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

            <div className="avatar small">{user.display_name.slice(0, 2).toUpperCase()}</div>
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
                <h1>Welcome, {user.display_name.split(" ")[0]} <span className="wave">✦</span></h1>
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
                  <TicketTable
                    tickets={tickets.slice(0, 5)}
                    members={members}
                    onUpdate={updateTicket}
                    onClassify={classifyTicket}
                    onDecision={decideClassification}
                    onView={setSelectedTicket}
                  /> :
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
              <TicketTable
                tickets={visibleTickets}
                members={members}
                onUpdate={updateTicket}
                onClassify={classifyTicket}
                onDecision={decideClassification}
                onView={setSelectedTicket}
              />
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

        {tab === "team" && (
          <section className="page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">WORKSPACE ACCESS</p>
                <h1>Team members</h1>
                <p className="subheading">Invite agents and administrators to this tenant workspace.</p>
              </div>
            </div>
            {user.role === "admin" && (
              <form className="panel invite-form" onSubmit={inviteMember}>
                <div>
                  <h2>Invite a teammate</h2>
                  <p className="muted">An email invitation link expires after 24 hours.</p>
                </div>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={event => setInviteEmail(event.target.value)}
                  placeholder="teammate@example.com"
                />
                <select value={inviteRole} onChange={event => setInviteRole(event.target.value)}>
                  <option value="agent">Support agent</option>
                  <option value="admin">Administrator</option>
                </select>
                <button className="primary-button"><UserPlus size={16} /> Send invitation</button>
              </form>
            )}
            <div className="panel team-list">
              <div className="panel-heading">
                <div><h2>Active members</h2><p>{members.length} people in this workspace</p></div>
              </div>
              {members.map(member => (
                <div className="team-row" key={member.id}>
                  <div className="avatar">{member.display_name.slice(0, 2).toUpperCase()}</div>
                  <div><b>{member.display_name}</b><small>{member.email}</small></div>
                  <span className="team-role">{member.role}</span>
                </div>
              ))}
            </div>
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
                Customer email (for ticket notifications)
                <input
                  type="email"
                  value={ticketForm.customer_email}
                  onChange={e => setTicketForm({
                    ...ticketForm,
                    customer_email: e.target.value
                  })}
                  placeholder="customer@example.com"
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

        {selectedTicket && (
          <TicketActivity ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
        )}

      </main>
    </div>
  );
}

function AuthPage({ onAuthenticated }) {
  const inviteToken = new URLSearchParams(window.location.hash.slice(1)).get("invite") ||
    new URLSearchParams(window.location.search).get("invite");
  const [registerMode, setRegisterMode] = useState(Boolean(inviteToken));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let response;
      if (inviteToken) {
        response = await api.post("/auth/accept-invitation", {
          token: inviteToken,
          display_name: displayName,
          password
        });
        window.history.replaceState({}, "", window.location.pathname);
      } else if (registerMode) {
        response = await api.post("/auth/register", {
          email,
          password,
          display_name: displayName,
          tenant_name: tenantName
        });
      } else {
        response = await api.post("/auth/login", { email, password });
      }
      onAuthenticated(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Authentication failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark auth-mark"><Bot size={23} /></div>
        <p className="eyebrow">NOVADESK SUPPORT PLATFORM</p>
        <h1>{inviteToken ? "Accept your invitation" : registerMode ? "Create your workspace" : "Welcome back"}</h1>
        <p className="subheading">
          {inviteToken ? "Set your name and password to join the workspace." :
            registerMode ? "Your account will be the workspace administrator." :
              "Sign in to access your secure support workspace."}
        </p>
        {(registerMode || inviteToken) && (
          <label>
            Your name
            <input required value={displayName} onChange={event => setDisplayName(event.target.value)} />
          </label>
        )}
        {!inviteToken && registerMode && (
          <label>
            Workspace name
            <input required minLength="2" value={tenantName} onChange={event => setTenantName(event.target.value)} />
          </label>
        )}
        {!inviteToken && (
          <label>
            Email
            <input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} />
          </label>
        )}
        <label>
          Password
          <input
            type="password"
            required
            minLength={registerMode || inviteToken ? 12 : 1}
            autoComplete={registerMode || inviteToken ? "new-password" : "current-password"}
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          {(registerMode || inviteToken) && <small>Use at least 12 characters.</small>}
        </label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary-button auth-submit" disabled={busy}>
          {busy ? "Please wait…" : inviteToken ? "Join workspace" : registerMode ? "Create account" : "Sign in"}
        </button>
        {!inviteToken && (
          <button type="button" className="auth-switch" onClick={() => setRegisterMode(value => !value)}>
            {registerMode ? "Already have an account? Sign in" : "New to NovaDesk? Create a workspace"}
          </button>
        )}
      </form>
    </main>
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

function TicketTable({ tickets, members, onUpdate, onClassify, onDecision, onView }) {
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
            <th>ASSIGNEE</th>
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
                <select
                  className="status-select"
                  aria-label={`Assign ticket ${t.id}`}
                  value={t.assigned_to_id || ""}
                  onChange={event => onUpdate(t.id, {
                    assigned_to_id: event.target.value ? Number(event.target.value) : null
                  })}
                >
                  <option value="">Unassigned</option>
                  {members.map(member => (
                    <option key={member.id} value={member.id}>{member.display_name}</option>
                  ))}
                </select>
              </td>

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
                  onChange={e => onUpdate(t.id, { status: e.target.value })}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <div className="ticket-tools">
                  <button type="button" onClick={() => onClassify(t.id)}>AI classify</button>
                  <button type="button" onClick={() => onView(t)}>Comments / history</button>
                  {t.suggestion_status === "pending_approval" && (
                    <div className="approval-tools">
                      <span>
                        {t.suggested_category} · {t.suggested_priority} · {t.suggested_sentiment}
                      </span>
                      <button type="button" onClick={() => onDecision(t.id, "approve")}>Approve</button>
                      <button type="button" onClick={() => onDecision(t.id, "reject")}>Reject</button>
                    </div>
                  )}
                  {t.suggestion_status === "approved" && <small>AI suggestions approved</small>}
                  {t.suggestion_status === "rejected" && <small>AI suggestions rejected</small>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketActivity({ ticket, onClose }) {
  const [comments, setComments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [commentResult, auditResult] = await Promise.all([
        api.get(`/tickets/${ticket.id}/comments`),
        api.get(`/tickets/${ticket.id}/audit`)
      ]);
      setComments(commentResult.data);
      setAudit(auditResult.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not load ticket activity.");
    }
  }, [ticket.id]);

  useEffect(() => { load(); }, [load]);

  const addComment = async (event) => {
    event.preventDefault();
    try {
      await api.post(`/tickets/${ticket.id}/comments`, { body, is_internal: isInternal });
      setBody("");
      setError("");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not add comment.");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="activity-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-head">
          <div><h2>Ticket #{ticket.id}: {ticket.subject}</h2><p>Comments and audit history</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <form className="comment-form" onSubmit={addComment}>
          <textarea required value={body} onChange={event => setBody(event.target.value)} placeholder="Write a comment…" rows="3" />
          <label className="internal-toggle">
            <input type="checkbox" checked={isInternal} onChange={event => setIsInternal(event.target.checked)} />
            Internal note (not emailed to customer)
          </label>
          <button className="primary-button"><Send size={15} /> Add comment</button>
        </form>
        <div className="activity-columns">
          <div>
            <h3>Comments</h3>
            {comments.map(comment => (
              <article className="activity-entry" key={comment.id}>
                <b>{comment.author_name} {comment.is_internal && <span className="team-role">Internal</span>}</b>
                <small>{new Date(comment.created_at).toLocaleString()}</small>
                <p>{comment.body}</p>
              </article>
            ))}
            {!comments.length && <p className="muted">No comments yet.</p>}
          </div>
          <div>
            <h3>Audit history</h3>
            {audit.map(entry => (
              <article className="activity-entry" key={entry.id}>
                <b>{entry.actor_name}</b><small>{new Date(entry.created_at).toLocaleString()}</small>
                <p>{entry.action.replaceAll(".", " ")} · {JSON.stringify(entry.details)}</p>
              </article>
            ))}
            {!audit.length && <p className="muted">No activity recorded yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
