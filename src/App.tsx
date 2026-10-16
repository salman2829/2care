import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity, Bell, Bot, CalendarDays, CalendarCheck, Check, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsUpDown, Clock3, Command, Headphones, LayoutDashboard,
  Menu, MoreHorizontal, Phone, PhoneCall, Play, RefreshCw, Search, Settings, ShieldCheck,
  SlidersHorizontal, Sparkles, Stethoscope, TestTube2, UserRoundCheck, Users,
  X, XCircle, Zap, AlertCircle, Plus, Loader2
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import {
  Appointment, Doctor, DoctorSlot, OverviewData, HealthStatus, PatientSummary
} from "./lib/types";
import { appointmentService } from "./lib/services/appointments";
import { doctorService } from "./lib/services/doctors";
import { availabilityService } from "./lib/services/availability";
import { healthService } from "./lib/services/health";
import { patientService } from "./lib/services/patients";
import CreateAppointmentModal from "./components/CreateAppointmentModal";
import AppointmentDetailDrawer from "./components/AppointmentDetailDrawer";
import CallDetailModal from "./components/CallDetailModal";
import RetellAgentConfigModal from "./components/RetellAgentConfigModal";
import VoiceCallWidget from "./components/VoiceCallWidget";
import PatientPortal from "./components/PatientPortal";
import PatientsPage from "./components/PatientsPage";
import PatientDetailDrawer from "./components/PatientDetailDrawer";
import { retellService, CallLogItem } from "./lib/services/retell";
import { LOGO_BASE64 } from "./assets/logo-base64";

// Fallback data for demo mode or initial offline view
import {
  activity as mockActivity,
  appointments as mockAppointments,
  chartData as mockChartData,
  doctors as mockDoctors
} from "./data";

type Page = "Overview" | "Appointments" | "Patients" | "Doctors" | "Availability" | "Voice Agents" | "Call Logs" | "AI Evaluations" | "Settings";

const nav: { label: Page; icon: typeof Activity }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Appointments", icon: CalendarDays },
  { label: "Patients", icon: Users },
  { label: "Doctors", icon: Stethoscope },
  { label: "Availability", icon: Clock3 },
  { label: "Voice Agents", icon: Bot },
  { label: "Call Logs", icon: Headphones },
  { label: "AI Evaluations", icon: TestTube2 },
  { label: "Settings", icon: Settings },
];

function Button({
  children,
  variant = "secondary",
  className = "",
  onClick,
  disabled = false,
  title,
  style
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "dark" | "danger";
  className?: string;
  onClick?: (e?: any) => void;
  disabled?: boolean;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={`button button-${variant} ${className}`}
    >
      {children}
    </button>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Logo({ size = 40 }: { size?: number }) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="brand-mark" style={{ width: size, height: size }} aria-label="2care">
      {!hasError ? (
        <img
          src={LOGO_BASE64}
          alt="2care"
          className="brand-logo-img"
          onError={() => setHasError(true)}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", color: "#56d9f2" }}>
          <Activity size={size * 0.55} />
        </div>
      )}
    </div>
  );
}

function Sidebar({
  page,
  setPage,
  open,
  close,
  health,
  callLogsCount,
  hasActiveCall,
  appointmentsCount,
  patientsCount,
}: {
  page: Page;
  setPage: (p: Page) => void;
  open: boolean;
  close: () => void;
  health: HealthStatus | null;
  callLogsCount?: number;
  hasActiveCall?: boolean;
  appointmentsCount?: number;
  patientsCount?: number;
}) {
  const isLive = health?.status === "healthy";

  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="brand">
        <Logo />
        <div>
          <strong>2care</strong>
          <span>Healthcare Intelligence</span>
        </div>
        <Button variant="ghost" className="mobile-close" onClick={close}>
          <X size={18} />
        </Button>
      </div>

      <nav className="nav-list" aria-label="Primary navigation">
        <p className="nav-caption">Command center</p>
        {nav.map(({ label, icon: Icon }) => (
          <button
            type="button"
            key={label}
            className={`nav-item ${page === label ? "active" : ""}`}
            onClick={() => {
              setPage(label);
              close();
            }}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
            {label === "Voice Agents" && <i className="live-dot" />}
            {label === "Call Logs" && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                {hasActiveCall && <i className="live-dot" style={{ position: "static" }} />}
                {callLogsCount !== undefined && callLogsCount > 0 && (
                  <span className="badge badge-confirmed" style={{ fontSize: "10px", padding: "1px 6px" }}>
                    {callLogsCount}
                  </span>
                )}
              </span>
            )}
            {label === "Appointments" && appointmentsCount !== undefined && (
              <span className="badge badge-neutral" style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 6px" }}>
                {appointmentsCount}
              </span>
            )}
            {label === "Patients" && patientsCount !== undefined && (
              <span className="badge badge-neutral" style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 6px" }}>
                {patientsCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function Header({
  page,
  openMenu,
  onRefresh,
  isLive,
  onSwitchToCustomer
}: {
  page: Page;
  openMenu: () => void;
  onRefresh: () => void;
  isLive: boolean;
  onSwitchToCustomer: () => void;
}) {
  return (
    <header className="topbar">
      <div className="page-identity">
        <Button variant="ghost" className="menu-button" onClick={openMenu}>
          <Menu size={20} />
        </Button>
        <div>
          <span>Clinical Operations / {page}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>{page}</strong>
            {isLive ? (
              <Badge tone="live"><i /> Live API</Badge>
            ) : (
              <Badge tone="demo">Demo Mode</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="header-actions">
        <Button
          variant="secondary"
          onClick={onSwitchToCustomer}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          title="Open customer patient portal"
        >
          <UserRoundCheck size={15} className="text-teal-600 shrink-0" />
          <span className="hidden sm:inline">Patient Portal View</span>
          <span className="sm:hidden">Portal</span>
        </Button>
        <Button variant="ghost" className="icon-button" title="Refresh data" onClick={onRefresh}>
          <RefreshCw size={17} />
        </Button>
        <Button variant="ghost" className="icon-button hidden sm:inline-flex" title="Notifications">
          <Bell size={19} />
          <i className="notification-dot" />
        </Button>
        <button type="button" className="profile">
          <span>AK</span>
          <div className="hidden sm:flex">
            <strong>Alex Kim</strong>
            <small>Clinical Admin</small>
          </div>
          <ChevronDown size={14} className="hidden sm:inline" />
        </button>
      </div>
    </header>
  );
}

const sparks = [
  "M1 25 C12 22 14 10 25 14 S39 21 48 9 S66 13 78 4",
  "M1 21 C10 22 15 8 25 13 S42 18 50 7 S67 5 78 3",
  "M1 23 C12 25 13 15 24 16 S38 8 49 12 S67 7 78 5",
  "M1 22 C13 17 17 21 27 12 S42 17 51 8 S68 11 78 3",
];

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  index,
  tone,
  isLive,
  loading
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  index: number;
  tone: string;
  isLive: boolean;
  loading?: boolean;
}) {
  return (
    <motion.article
      className="metric-card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
    >
      <div className="metric-head">
        <span className={`metric-icon ${tone}`}>
          <Icon size={18} />
        </span>
        <Badge tone={isLive ? "confirmed" : "demo"}>
          {isLive ? "Live data" : "Demo data"}
        </Badge>
      </div>
      <div className="metric-body">
        <span>{label}</span>
        {loading ? (
          <div className="skeleton-box" style={{ height: 28, width: 80, margin: "5px 0" }} />
        ) : (
          <strong>{value}</strong>
        )}
        <small>
          <b>↑</b> {detail}
        </small>
      </div>
      <svg className={`spark ${tone}`} viewBox="0 0 80 30" role="img" aria-label={`${label} increasing trend`}>
        <path d={`${sparks[index]} L78 30 L1 30 Z`} className="spark-fill" />
        <path d={sparks[index]} className="spark-line" />
      </svg>
    </motion.article>
  );
}

function VoiceOrb({ active }: { active: boolean }) {
  return (
    <div
      className={`orb-wrap ${active ? "active" : ""}`}
      aria-label={active ? "Demo voice agent active" : "Demo voice agent idle"}
    >
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="orbit orbit-three" />
      <div className="orb-glow" />
      <div className="orb">
        <Bot size={30} />
      </div>
      <div className="sound-bars">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <i key={n} />
        ))}
      </div>
      <span className="float-chip chip-one">
        <Zap size={12} /> 24ms
      </span>
      <span className="float-chip chip-two">EN-US</span>
    </div>
  );
}

function VoiceAgent({
  startDemo,
  active,
  callLogs = [],
  onNavigateToCalls
}: {
  startDemo: () => void;
  active: boolean;
  callLogs?: CallLogItem[];
  onNavigateToCalls?: () => void;
}) {
  const callsCount = callLogs.length;
  const bookedCount = useMemo(() => callLogs.filter(c => !!c.appointment_id).length, [callLogs]);

  const avgDuration = useMemo(() => {
    if (callLogs.length === 0) return "2m 15s";
    const totalSecs = callLogs.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
    const avg = Math.round(totalSecs / callLogs.length);
    return `${Math.floor(avg / 60)}m ${avg % 60}s`;
  }, [callLogs]);

  const latestCallTime = useMemo(() => {
    if (callLogs.length === 0) return "Ready";
    const latest = callLogs[0];
    if (latest.status === "in_progress" || latest.status === "active") return "Active now";
    const dt = new Date(latest.created_at);
    const diffMin = Math.round((Date.now() - dt.getTime()) / 60000);
    if (diffMin < 2) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [callLogs]);

  const hasLiveCall = active || callLogs.some(c => c.status === "in_progress" || c.status === "active");

  return (
    <section className="voice-card">
      <div className="voice-noise" />
      <div className="voice-copy">
        <div className="section-label">
          <Sparkles size={14} /> LIVE VOICE INTELLIGENCE
        </div>
        <div className="voice-title">
          <div>
            <h2>2care Scheduling Agent</h2>
            <p>Autonomous appointment coordination with Retell AI</p>
          </div>
          <Badge tone={hasLiveCall ? "live" : "demo-dark"}>
            <i /> {hasLiveCall ? "Call in progress" : "Agent ready"}
          </Badge>
        </div>
        <div className="voice-stats">
          <div>
            <span>Calls recorded</span>
            <strong>{callsCount > 0 ? callsCount : 48}</strong>
          </div>
          <div>
            <span>AI bookings</span>
            <strong>{bookedCount > 0 ? bookedCount : 37}</strong>
          </div>
          <div>
            <span>Avg. duration</span>
            <strong>{avgDuration}</strong>
          </div>
          <div>
            <span>Latest session</span>
            <strong style={{ color: hasLiveCall ? "var(--mint)" : undefined }}>
              {latestCallTime}
            </strong>
          </div>
        </div>
        <div className="voice-actions">
          <Button variant="primary" onClick={startDemo}>
            {hasLiveCall ? (
              <>
                <span className="calling-dot" /> Call in progress
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" /> Test voice booking
              </>
            )}
          </Button>
          <Button variant="dark" onClick={onNavigateToCalls}>
            <Headphones size={16} /> View call logs
          </Button>
          <Button variant="dark" onClick={onNavigateToCalls}>
            <TestTube2 size={16} /> Run evaluation
          </Button>
        </div>
        <p className="voice-note">
          <ShieldCheck size={13} /> Voice booking agent wired to authoritative appointment database
        </p>
      </div>
      <VoiceOrb active={hasLiveCall} />
    </section>
  );
}

function BookingChart({ data }: { data?: any[] }) {
  const [range, setRange] = useState("7 days");
  const chartPoints = data && data.length > 0 ? data : mockChartData;

  const total = useMemo(() => {
    return chartPoints.reduce((acc, p) => acc + (p.confirmed || 0), 0);
  }, [chartPoints]);

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">BOOKING VOLUME</span>
          <h2>Appointment activity</h2>
          <p>Confirmed vs cancelled appointments</p>
        </div>
        <button
          className="select-button"
          type="button"
          onClick={() => setRange(range === "7 days" ? "30 days" : "7 days")}
        >
          {range}
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="chart-total">
        <strong>{total}</strong>
        <span>
          <b>+12.4%</b> from previous period
        </span>
        <div className="legend">
          <i className="confirmed" /> Confirmed <i className="cancelled" /> Cancelled
        </div>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartPoints} margin={{ top: 8, right: 4, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="cyanFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#56D9F2" stopOpacity=".28" />
                <stop offset="100%" stopColor="#56D9F2" stopOpacity=".01" />
              </linearGradient>
              <linearGradient id="redFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F28B82" stopOpacity=".18" />
                <stop offset="100%" stopColor="#F28B82" stopOpacity=".01" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#E9EEF5" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#8995A8", fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8995A8", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #E3EAF3",
                boxShadow: "0 12px 30px rgba(25,40,65,.1)",
                fontSize: 12,
              }}
            />
            <Area type="monotone" dataKey="confirmed" stroke="#29BFD9" strokeWidth={2.5} fill="url(#cyanFill)" />
            <Area type="monotone" dataKey="cancelled" stroke="#F28B82" strokeWidth={2} fill="url(#redFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ActivityFeed({
  items,
  onNavigateToCalls
}: {
  items?: any[];
  onNavigateToCalls?: () => void;
}) {
  const displayItems = items && items.length > 0 ? items : mockActivity;

  const sanitizeDetail = (detail: string) => {
    if (!detail) return "";
    return detail
      .replace(/^Call #call_([a-zA-Z0-9]{8})[a-zA-Z0-9]*/, "Call #$1")
      .replace(/^Call #([a-zA-Z0-9]{8})[a-zA-Z0-9]*/, "Call #$1")
      .replace(/\(\+1--\*\*\*-/g, "(+1-***-")
      .replace(/\(\+1-(\d{4})\)/g, "(+1-***-$1)");
  };

  return (
    <section className="panel feed-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">OPERATIONAL AUDIT</span>
          <h2>Live activity</h2>
        </div>
        <Button variant="ghost" className="small-button" onClick={onNavigateToCalls} title="View all call logs">
          View all
        </Button>
      </div>
      <div className="feed-list">
        {displayItems.map((item, i) => (
          <div className="feed-item" key={item.title + i}>
            <span className={`feed-icon ${item.kind}`}>
              {item.kind === "success" ? (
                <Check size={14} />
              ) : item.kind === "danger" ? (
                <XCircle size={14} />
              ) : item.kind === "warning" ? (
                <Zap size={14} />
              ) : (
                <Activity size={14} />
              )}
            </span>
            <div>
              <strong title={item.title}>{item.title}</strong>
              <p title={item.detail}>{sanitizeDetail(item.detail)}</p>
            </div>
            <time>{item.time}</time>
            {i < displayItems.length - 1 && <span className="feed-line" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={status.toLowerCase()}>
      <i /> {status}
    </Badge>
  );
}

function AppointmentsTable({
  appointments,
  loading,
  error,
  onRefresh,
  onOpenCreate,
  onSelectAppointment,
  full = false,
  isLive
}: {
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onSelectAppointment: (id: string) => void;
  full?: boolean;
  isLive: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const filtered = useMemo(() => {
    return appointments
      .filter((a) => {
        const matchesQuery =
          `${a.patient_name} ${a.reference_id} ${a.doctor_name || ""}`
            .toLowerCase()
            .includes(query.toLowerCase());
        const matchesStatus =
          statusFilter === "All" || a.status.toLowerCase() === statusFilter.toLowerCase();
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) =>
        sortAsc
          ? a.patient_name.localeCompare(b.patient_name)
          : b.patient_name.localeCompare(a.patient_name)
      );
  }, [appointments, query, sortAsc, statusFilter]);

  const displayRows = full ? filtered : filtered.slice(0, 6);

  return (
    <section className={`panel table-panel ${full ? "full-table" : ""}`}>
      <div className="panel-heading table-heading">
        <div>
          <span className="eyebrow">{full ? "APPOINTMENT MANAGEMENT" : "LATEST BOOKINGS"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2>{full ? "All appointments" : "Recent appointments"}</h2>
            <Badge tone={isLive ? "confirmed" : "demo"}>
              {isLive ? "PostgreSQL synced" : "Demo records"}
            </Badge>
          </div>
          <p>Real-time patient bookings coordinated by 2care operations</p>
        </div>
        <div className="table-tools">
          <label className="table-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search appointments..."
            />
          </label>

          {full && (
            <select
              className="select-button"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: 32 }}
            >
              <option value="All">All statuses</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Pending">Pending</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Failed">Failed</option>
            </select>
          )}

          <Button variant="secondary" onClick={onRefresh} title="Refresh appointments">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>

          {full && (
            <Button variant="primary" onClick={onOpenCreate}>
              <Plus size={15} /> Create appointment
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: "0 19px 12px" }}>
          <div className="error-banner">
            <span>
              <AlertCircle size={15} /> {error}
            </span>
            <Button variant="ghost" onClick={onRefresh}>
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>
                <button type="button" onClick={() => setSortAsc(!sortAsc)}>
                  Patient <ChevronsUpDown size={12} />
                </button>
              </th>
              <th>Care provider</th>
              <th>Appointment</th>
              <th>Source</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading && appointments.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "#8a96a7" }}>
                  <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                  Loading real appointments from database...
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <Search size={25} />
                    <strong>No appointments found</strong>
                    <span>Try adjusting your search or filters.</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayRows.map((a) => {
                const dt = new Date(a.scheduled_at);
                const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const timeStr = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

                return (
                  <tr key={a.id}>
                    <td>
                      <strong className="reference">{a.reference_id}</strong>
                    </td>
                    <td>
                      <div className="patient">
                        <span>
                          {a.patient_name
                            .split(" ")
                            .map((x) => x[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                        <div>
                          <strong>{a.patient_name}</strong>
                          <small style={{ color: "#64748b", display: "block" }}>{a.patient_phone || "Contact on file"}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{a.doctor_name || "Doctor"}</strong>
                      <small>{a.specialty}</small>
                    </td>
                    <td>
                      <strong>{dateStr}</strong>
                      <small>{timeStr}</small>
                    </td>
                    <td>
                      <Badge tone={a.source === "AI Voice" ? "ai" : "neutral"}>
                        {a.source === "AI Voice" && <Bot size={12} />}
                        {a.source}
                      </Badge>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        className="row-action"
                        onClick={() => onSelectAppointment(a.id)}
                        title="View details"
                      >
                        <MoreHorizontal size={17} />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <span>
          Showing 1–{displayRows.length} of {filtered.length} {isLive ? "live" : "demo"} records
        </span>
        <div>
          <Button variant="ghost" disabled>
            <ChevronLeft size={15} />
          </Button>
          <Button variant="ghost" disabled={displayRows.length === filtered.length}>
            <ChevronRight size={15} />
          </Button>
        </div>
      </div>
    </section>
  );
}

function Overview({
  overviewData,
  loading,
  error,
  isLive,
  onRefresh,
  appointments,
  onSelectAppointment,
  demoVoice,
  startDemoVoice,
  callLogs = [],
  onNavigateToCalls,
  onOpenCallDetail
}: {
  overviewData: OverviewData | null;
  loading: boolean;
  error: string | null;
  isLive: boolean;
  onRefresh: () => void;
  appointments: Appointment[];
  onSelectAppointment: (id: string) => void;
  demoVoice: boolean;
  startDemoVoice: () => void;
  callLogs?: CallLogItem[];
  onNavigateToCalls?: () => void;
  onOpenCallDetail?: (call: CallLogItem) => void;
}) {
  const kpis = overviewData?.kpis;
  const latestLiveCall = callLogs.find(c => c.status === "in_progress" || c.status === "active");

  return (
    <>
      <section className="welcome">
        <div>
          <Badge tone={isLive ? "live" : "demo"}>
            {isLive ? "Authoritative Command Center" : "Demo Workspace"}
          </Badge>
          <h1>Healthcare, intelligently coordinated.</h1>
          <p>Monitor AI-powered scheduling, availability, and operational performance.</p>
        </div>
        <div className="welcome-actions">
          {latestLiveCall && (
            <button
              type="button"
              className="button button-primary"
              style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", border: "none" }}
              onClick={() => onOpenCallDetail && onOpenCallDetail(latestLiveCall)}
            >
              <PhoneCall size={14} className="animate-pulse" />
              <span>Live Patient Call Active</span>
            </button>
          )}
          <Button variant="secondary" onClick={onNavigateToCalls}>
            <Headphones size={15} /> Call Logs ({callLogs.length})
          </Button>
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </section>

      {error && (
        <div className="error-banner">
          <span>
            <AlertCircle size={16} /> Backend sync issue: {error}
          </span>
          <Button variant="ghost" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      )}

      <div className="metrics-grid">
        <MetricCard
          index={0}
          label="Total appointments"
          value={kpis ? String(kpis.total_appointments) : "1,284"}
          detail={kpis?.total_change_percent || "8.2% vs last month"}
          icon={CalendarDays}
          tone="cyan"
          isLive={isLive}
          loading={loading}
        />
        <MetricCard
          index={1}
          label="Today's appointments"
          value={kpis ? String(kpis.today_appointments) : "64"}
          detail={kpis?.today_change_text || "active today"}
          icon={UserRoundCheck}
          tone="mint"
          isLive={isLive}
          loading={loading}
        />
        <MetricCard
          index={2}
          label="Available slots"
          value={kpis ? String(kpis.available_slots) : "127"}
          detail={kpis?.slots_change_text || "open capacity"}
          icon={Clock3}
          tone="violet"
          isLive={isLive}
          loading={loading}
        />
        <MetricCard
          index={3}
          label="AI booking success"
          value={kpis ? `${kpis.ai_booking_success_rate}%` : "92.4%"}
          detail={kpis?.ai_success_change_text || "this week"}
          icon={Sparkles}
          tone="orange"
          isLive={isLive}
          loading={loading}
        />
      </div>

      <VoiceAgent
        active={demoVoice}
        startDemo={startDemoVoice}
        callLogs={callLogs}
        onNavigateToCalls={onNavigateToCalls}
      />

      <div className="insights-grid">
        <BookingChart data={overviewData?.chart_data} />
        <ActivityFeed items={overviewData?.recent_activity} onNavigateToCalls={onNavigateToCalls} />
      </div>

      <AppointmentsTable
        appointments={appointments}
        loading={loading}
        error={error}
        onRefresh={onRefresh}
        onOpenCreate={() => {}}
        onSelectAppointment={onSelectAppointment}
        full={false}
        isLive={isLive}
      />
    </>
  );
}

function DoctorsPage({
  doctors,
  loading,
  error,
  onRefresh,
  onSelectDoctorForAvailability,
  isLive
}: {
  doctors: Doctor[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectDoctorForAvailability: (doctorId: string) => void;
  isLive: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return doctors.filter((d) =>
      `${d.name} ${d.specialty}`.toLowerCase().includes(search.toLowerCase())
    );
  }, [doctors, search]);

  return (
    <div className="page-stack">
      <section className="subpage-hero">
        <div>
          <Badge tone={isLive ? "live" : "demo"}>
            {isLive ? "PostgreSQL Care Team" : "Demo Directory"}
          </Badge>
          <h1>Care team</h1>
          <p>Explore provider coverage, status, and upcoming availability.</p>
        </div>
        <div className="welcome-actions">
          <label className="table-search" style={{ width: 220 }}>
            <Search size={15} />
            <input
              placeholder="Search doctors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </section>

      {error && (
        <div className="error-banner">
          <span>
            <AlertCircle size={16} /> {error}
          </span>
          <Button variant="ghost" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      )}

      <div className="doctor-grid">
        {loading && doctors.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "#8a96a7" }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 10px" }} />
            Loading doctors from database...
          </div>
        ) : (
          filtered.map((doctor, i) => (
            <motion.article
              className="doctor-card"
              key={doctor.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className="doctor-top">
                <span className={`doctor-avatar ${doctor.color}`}>{doctor.initials}</span>
                <Badge tone={doctor.is_active ? "confirmed" : "neutral"}>
                  <i /> {doctor.is_active ? "Active" : "Away"}
                </Badge>
              </div>
              <h2>{doctor.name}</h2>
              <p>{doctor.specialty}</p>

              <div className="availability-box">
                <Clock3 size={17} />
                <div>
                  <span>Next available</span>
                  <strong>{doctor.next_slot || "No open slots"}</strong>
                </div>
              </div>

              <div className="doctor-footer">
                <span>
                  <b>{doctor.slots_count}</b> open slots in schedule
                </span>
                <Button
                  variant="secondary"
                  onClick={() => onSelectDoctorForAvailability(doctor.id)}
                >
                  View availability <ChevronRight size={14} />
                </Button>
              </div>
            </motion.article>
          ))
        )}
      </div>
    </div>
  );
}

function AvailabilityPage({
  doctors,
  slots,
  loading,
  error,
  selectedDoctorId,
  setSelectedDoctorId,
  onRefresh,
  onBookSlot,
  isLive
}: {
  doctors: Doctor[];
  slots: DoctorSlot[];
  loading: boolean;
  error: string | null;
  selectedDoctorId: string;
  setSelectedDoctorId: (id: string) => void;
  onRefresh: () => void;
  onBookSlot: (slot: DoctorSlot) => void;
  isLive: boolean;
}) {
  const times = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30"];

  // Group slots by date
  const daysMap = useMemo(() => {
    const map = new Map<string, DoctorSlot[]>();
    slots.forEach((s) => {
      const dt = new Date(s.start_time);
      const dayKey = dt.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
      if (!map.has(dayKey)) {
        map.set(dayKey, []);
      }
      map.get(dayKey)!.push(s);
    });
    return map;
  }, [slots]);

  const daysList = Array.from(daysMap.keys()).slice(0, 5);

  return (
    <div className="page-stack">
      <section className="subpage-hero">
        <div>
          <Badge tone={isLive ? "live" : "demo"}>
            {isLive ? "Real-time Database Schedule" : "Demo Schedule"}
          </Badge>
          <h1>Availability explorer</h1>
          <p>Find open capacity across specialties and book directly with care providers.</p>
        </div>
        <div className="welcome-actions">
          <select
            className="select-button"
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
          >
            <option value="">All care providers</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.specialty})
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </section>

      {error && (
        <div className="error-banner">
          <span>
            <AlertCircle size={16} /> {error}
          </span>
          <Button variant="ghost" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      )}

      <section className="panel calendar-panel">
        <div className="calendar-key">
          <span>
            <i className="open" /> Available (Click to book)
          </span>
          <span>
            <i className="booked" /> Booked
          </span>
          <span>
            <i className="hold" /> On hold
          </span>
        </div>

        {loading && slots.length === 0 ? (
          <div style={{ textAlign: "center", padding: 50, color: "#8a96a7" }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 10px" }} />
            Querying open slots from PostgreSQL database...
          </div>
        ) : daysList.length === 0 ? (
          <div className="empty-state">
            <Clock3 size={30} />
            <strong>No appointment slots found</strong>
            <span>Try selecting another doctor or refreshing the schedule.</span>
          </div>
        ) : (
          <div className="week-grid">
            <div className="time-column">
              <strong>UTC</strong>
              {times.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>

            {daysList.map((day, di) => {
              const daySlots = daysMap.get(day) || [];

              return (
                <div className="day-column" key={day}>
                  <strong className={di === 0 ? "today" : ""}>{day}</strong>
                  {times.map((time, ti) => {
                    // Match slot by time if possible
                    const match = daySlots.find((s) => {
                      const dt = new Date(s.start_time);
                      const sTime = dt.toLocaleTimeString("en-US", {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return sTime.startsWith(time.split(":")[0]);
                    });

                    const isBooked = match ? match.is_booked : (di + ti) % 4 === 0;
                    const isHold = match ? match.is_held : (di + ti) % 5 === 0;
                    const slotState = isBooked ? "booked" : isHold ? "hold" : "open";
                    const doctorInitials = match?.doctor_initials || doctors[di % (doctors.length || 1)]?.initials || "MC";

                    return (
                      <button
                        type="button"
                        key={time + ti}
                        className={`slot ${slotState}`}
                        disabled={slotState !== "open"}
                        onClick={() => {
                          if (match && !match.is_booked) {
                            onBookSlot(match);
                          }
                        }}
                        title={slotState === "open" ? "Click to book this slot" : "Slot unavailable"}
                      >
                        <span>{slotState === "open" ? "Available" : slotState === "booked" ? "Booked" : "Hold"}</span>
                        <small>{doctorInitials}</small>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function EvaluationsPage({
  calls = false,
  onOpenCallDetail,
  onOpenRetellConfig,
  onRefreshCalls,
  showToast,
  externalCallLogs,
  externalLoading,
}: {
  calls?: boolean;
  onOpenCallDetail?: (call: CallLogItem) => void;
  onOpenRetellConfig?: () => void;
  onRefreshCalls?: () => void;
  showToast?: (title: string, detail: string) => void;
  externalCallLogs?: CallLogItem[];
  externalLoading?: boolean;
}) {
  const [internalCallLogs, setInternalCallLogs] = useState<CallLogItem[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callLogs = externalCallLogs !== undefined ? externalCallLogs : internalCallLogs;
  const loading = externalLoading !== undefined ? externalLoading : internalLoading;

  const fetchCalls = useCallback(async () => {
    if (!calls) return;
    if (onRefreshCalls) {
      onRefreshCalls();
      return;
    }
    setInternalLoading(true);
    setError(null);
    const res = await retellService.listCalls();
    setInternalLoading(false);
    if (res.ok && res.data) {
      setInternalCallLogs(res.data);
    } else {
      setError(res.error);
    }
  }, [calls, onRefreshCalls]);

  useEffect(() => {
    if (externalCallLogs === undefined) {
      fetchCalls();
    }
  }, [fetchCalls, externalCallLogs]);

  const handleSimulate = async () => {
    setSimulating(true);
    const res = await retellService.simulateCall("booking_success");
    setSimulating(false);
    if (res.ok && res.data) {
      if (onRefreshCalls) onRefreshCalls();
      else fetchCalls();
      if (showToast) {
        showToast("Voice Test Call Completed", `Simulated appointment ${res.data.appointment_id || ""} booked via custom functions.`);
      }
      if (onOpenCallDetail) onOpenCallDetail(res.data);
    } else {
      if (showToast) showToast("Simulation Failed", res.error || "Could not complete test call.");
    }
  };

  const scores = [94, 91, 87, 96, 89];

  const [callQuery, setCallQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredCallLogs = useMemo(() => {
    return callLogs.filter((call) => {
      if (statusFilter !== "all" && call.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (!callQuery.trim()) return true;
      const q = callQuery.toLowerCase();
      return (
        call.call_id.toLowerCase().includes(q) ||
        (call.caller_phone && call.caller_phone.toLowerCase().includes(q)) ||
        (call.appointment_id && call.appointment_id.toLowerCase().includes(q)) ||
        (call.transcript && call.transcript.toLowerCase().includes(q))
      );
    });
  }, [callLogs, callQuery, statusFilter]);

  return (
    <div className="page-stack">
      <section className="subpage-hero">
        <div>
          <Badge tone="live">
            {calls ? "Retell AI Ingestion" : "Automated Benchmark"}
          </Badge>
          <h1>{calls ? "Call monitoring & tool logs" : "AI agent evaluations"}</h1>
          <p>
            {calls
              ? "Review voice-agent conversations, Retell custom functions, and live booking outcomes."
              : "Continuously measure safety, accuracy, and patient experience against benchmark clinical scenarios."}
          </p>
        </div>
        <div className="welcome-actions">
          {calls && onOpenRetellConfig && (
            <Button variant="secondary" onClick={onOpenRetellConfig}>
              <Command size={15} /> Retell schemas
            </Button>
          )}
          <Button variant="primary" onClick={calls ? handleSimulate : undefined} disabled={simulating}>
            {simulating ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Simulating call...
              </>
            ) : calls ? (
              <>
                <Play size={15} /> Test voice agent flow
              </>
            ) : (
              <>
                <TestTube2 size={15} /> Run evaluation
              </>
            )}
          </Button>
        </div>
      </section>

      {error && calls && (
        <div className="error-banner">
          <span>
            <AlertCircle size={15} /> {error}
          </span>
          <Button variant="ghost" onClick={fetchCalls}>
            Retry
          </Button>
        </div>
      )}

      <div className="score-grid">
        <article className="score-card dark">
          <span>Overall quality</span>
          <strong>{calls ? "96.8%" : "94.0"}</strong>
          <p>{calls ? "Connection success rate" : "Composite evaluation score"}</p>
          <div className="score-ring">
            <Sparkles size={24} />
          </div>
        </article>
        {["Tool accuracy", "Conversation quality", "Policy adherence"].map((x, i) => (
          <article className="score-card" key={x}>
            <span>{x}</span>
            <strong>{[97, 91, 99][i]}%</strong>
            <div className="progress">
              <i style={{ width: `${[97, 91, 99][i]}%` }} />
            </div>
            <p>Based on automated test benchmark</p>
          </article>
        ))}
      </div>

      <section className="panel evaluation-list">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{calls ? "AUDIT LOG" : "RECENT RUNS"}</span>
            <h2>{calls ? "Recorded voice sessions & tool telemetry" : "Quality review queue"}</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {calls && (
              <label className="table-search" style={{ width: 220 }}>
                <Search size={14} />
                <input
                  placeholder="Search calls or transcript..."
                  value={callQuery}
                  onChange={(e) => setCallQuery(e.target.value)}
                />
              </label>
            )}
            {calls && (
              <select
                className="select-button"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ height: 32 }}
              >
                <option value="all">All statuses</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="ended">Ended</option>
              </select>
            )}
            {calls && (
              <Button variant="secondary" onClick={fetchCalls} title="Refresh call logs">
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </Button>
            )}
          </div>
        </div>

        {calls ? (
          loading && callLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#8a96a7" }}>
              <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
              Loading real voice call logs...
            </div>
          ) : filteredCallLogs.length === 0 ? (
            <div className="empty-state" style={{ padding: 30 }}>
              <Phone size={24} />
              <strong>No call logs found</strong>
              <span>
                {callQuery ? "No calls match your search query." : "Patient voice calls will appear here automatically."}
              </span>
            </div>
          ) : (
            filteredCallLogs.map((call) => {
              const dt = new Date(call.created_at);
              const isLiveCall = call.status === "in_progress" || call.status === "active";
              const timeAgo = isLiveCall
                ? "Live in-progress"
                : `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`;
              const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const timeStr = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

              return (
                <div
                  className="evaluation-row"
                  key={call.id}
                  style={{
                    cursor: "pointer",
                    background: isLiveCall ? "rgba(16, 185, 129, 0.04)" : undefined,
                    borderColor: isLiveCall ? "rgba(16, 185, 129, 0.3)" : undefined
                  }}
                  onClick={() => onOpenCallDetail && onOpenCallDetail(call)}
                >
                  <span
                    className="call-icon"
                    style={{
                      background: isLiveCall ? "rgba(16, 185, 129, 0.15)" : undefined,
                      color: isLiveCall ? "#10b981" : undefined,
                    }}
                  >
                    <Phone size={17} className={isLiveCall ? "animate-pulse" : ""} />
                  </span>
                  <div>
                    <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      Call #{call.call_id}
                      {isLiveCall && (
                        <span className="badge badge-live" style={{ fontSize: "10px" }}>
                          <i /> Live Call
                        </span>
                      )}
                    </strong>
                    <p>
                      Caller: {call.caller_phone || "Protected"} · Duration: {timeAgo} · {dateStr} at {timeStr}
                    </p>
                  </div>
                  <div className="evaluation-tags">
                    {call.caller_phone === "Patient Web Portal" && (
                      <Badge tone="cyan">
                        <Bot size={12} /> Patient Portal
                      </Badge>
                    )}
                    {call.appointment_id && (
                      <Badge tone="confirmed">
                        <Check size={12} /> Booked {call.appointment_id}
                      </Badge>
                    )}
                    <Badge tone="ai">Retell</Badge>
                  </div>
                  <strong className="score-value" style={{ textTransform: "capitalize" }}>
                    {isLiveCall ? "Active" : call.status}
                  </strong>
                  <Button
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenCallDetail) onOpenCallDetail(call);
                    }}
                    title="View transcript & tools"
                  >
                    <ChevronRight size={17} />
                  </Button>
                </div>
              );
            })
          )
        ) : (
          scores.map((score, i) => (
            <div className="evaluation-row" key={i}>
              <span className="call-icon">
                <Bot size={17} />
              </span>
              <div>
                <strong>Evaluation run #EV-{2048 - i}</strong>
                <p>Autonomous scheduling agent · {i * 7 + 2} min ago</p>
              </div>
              <div className="evaluation-tags">
                <Badge tone="confirmed">
                  <Check size={12} /> Passed
                </Badge>
                <Badge tone="ai">Benchmark</Badge>
              </div>
              <strong className="score-value">{score}/100</strong>
              <Button variant="ghost">
                <ChevronRight size={17} />
              </Button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function SettingsPage({
  isLive,
  health,
  onOpenRetellConfig
}: {
  isLive: boolean;
  health: HealthStatus | null;
  onOpenRetellConfig: () => void;
}) {
  return (
    <div className="page-stack">
      <section className="subpage-hero">
        <div>
          <Badge tone={isLive ? "live" : "demo"}>
            {isLive ? "Operational configuration" : "Demo workspace"}
          </Badge>
          <h1>Workspace settings</h1>
          <p>Configure integrations, database connections, and Retell AI voice controls.</p>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="setting-row">
          <span className="setting-icon">
            <Command size={18} />
          </span>
          <div>
            <strong>FastAPI Scheduling Backend</strong>
            <p>Authoritative appointment and concurrency-protected slot engine.</p>
          </div>
          <Badge tone={isLive ? "confirmed" : "pending"}>
            {isLive ? "Connected (Port 8000)" : "Not connected"}
          </Badge>
          <Button variant="secondary">{isLive ? "Active" : "Connect"}</Button>
        </div>

        <div className="setting-row">
          <span className="setting-icon">
            <Phone size={18} />
          </span>
          <div>
            <strong>Retell AI Voice Engine</strong>
            <p>Custom function tool calling for telephone appointment bookings.</p>
          </div>
          <Badge tone="confirmed">Ready</Badge>
          <Button variant="secondary" onClick={onOpenRetellConfig}>
            View schemas & tools
          </Button>
        </div>

        <div className="setting-row">
          <span className="setting-icon">
            <ShieldCheck size={18} />
          </span>
          <div>
            <strong>Storage Provider</strong>
            <p>{health?.database ? `Connected: ${health.database}` : "PostgreSQL with SQLite fallback"}</p>
          </div>
          <Badge tone="confirmed">Operational</Badge>
          <Button variant="secondary">Audit</Button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [portalMode, setPortalMode] = useState<"customer" | "admin">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("portal") === "admin") return "admin";
      if (params.get("portal") === "customer") return "customer";
      const stored = localStorage.getItem("2care_portal_mode");
      if (stored === "admin" || stored === "customer") return stored;
    }
    return "customer";
  });

  const [page, setPage] = useState<Page>("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoVoice, setDemoVoice] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ title: string; detail: string } | null>(null);

  // Live API States
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLive, setIsLive] = useState(false);

  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);

  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [currentPatientName, setCurrentPatientName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("2care_current_patient");
      if (stored) return stored;
    }
    return "All";
  });

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorsError, setDoctorsError] = useState<string | null>(null);

  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [availabilityDoctorFilter, setAvailabilityDoctorFilter] = useState<string>("");

  // Modals & Drawers
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createInitialDoctorId, setCreateInitialDoctorId] = useState<string | undefined>();
  const [createInitialSlotId, setCreateInitialSlotId] = useState<string | undefined>();

  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallLogItem | null>(null);
  const [retellConfigOpen, setRetellConfigOpen] = useState(false);

  // Global Interactive Voice Assistant State
  const [voiceWidgetOpen, setVoiceWidgetOpen] = useState(false);
  const [voiceCallTrigger, setVoiceCallTrigger] = useState(0);

  const handleStartVoiceCall = useCallback(() => {
    setVoiceWidgetOpen(true);
    setVoiceCallTrigger((prev) => prev + 1);
  }, []);

  // Check health and backend connectivity
  const checkConnection = useCallback(async () => {
    const res = await healthService.checkHealth();
    if (res.ok && res.data) {
      setHealth(res.data);
      setIsLive(true);
    } else {
      setIsLive(false);
    }
  }, []);

  // Fetch overview stats
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    const res = await appointmentService.getOverviewData();
    setOverviewLoading(false);
    if (res.ok && res.data) {
      setOverviewData(res.data);
    } else {
      setOverviewError(res.error);
    }
  }, []);

  // Fetch appointments list
  const fetchAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    setAppointmentsError(null);
    const res = await appointmentService.listAppointments();
    setAppointmentsLoading(false);
    if (res.ok && res.data) {
      setAppointments(res.data);
    } else {
      setAppointmentsError(res.error);
    }
  }, []);

  // Fetch unified master patients list
  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true);
    setPatientsError(null);
    const res = await patientService.listPatients();
    setPatientsLoading(false);
    if (res.ok && res.data) {
      setPatients(res.data);
    } else {
      setPatientsError(res.error);
    }
  }, []);

  // Fetch doctors
  const fetchDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    setDoctorsError(null);
    const res = await doctorService.listDoctors();
    setDoctorsLoading(false);
    if (res.ok && res.data) {
      setDoctors(res.data);
    } else {
      setDoctorsError(res.error);
    }
  }, []);

  // Fetch slots
  const fetchSlots = useCallback(async (docId?: string) => {
    setSlotsLoading(true);
    setSlotsError(null);
    const res = await availabilityService.getAvailability({
      doctor_id: docId || undefined,
      only_open: false,
    });
    setSlotsLoading(false);
    if (res.ok && res.data) {
      setSlots(res.data);
    } else {
      setSlotsError(res.error);
    }
  }, []);

  const [callLogs, setCallLogs] = useState<CallLogItem[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);

  // Fetch voice call logs
  const fetchCalls = useCallback(async () => {
    setCallsLoading(true);
    setCallsError(null);
    const res = await retellService.listCalls();
    setCallsLoading(false);
    if (res.ok && res.data) {
      setCallLogs(res.data);
    } else {
      setCallsError(res.error);
    }
  }, []);

  // Refresh all relevant data
  const refreshAll = useCallback(() => {
    checkConnection();
    fetchOverview();
    fetchAppointments();
    fetchPatients();
    fetchDoctors();
    fetchSlots(availabilityDoctorFilter);
    fetchCalls();
  }, [checkConnection, fetchOverview, fetchAppointments, fetchPatients, fetchDoctors, fetchSlots, availabilityDoctorFilter, fetchCalls]);

  const switchPortal = useCallback((mode: "customer" | "admin") => {
    setPortalMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("2care_portal_mode", mode);
      const url = new URL(window.location.href);
      url.searchParams.set("portal", mode);
      window.history.replaceState({}, "", url.toString());
    }
    // Instantly refresh all data so admin portal has latest call logs & appointments
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    document.title = portalMode === "customer" ? "2care - Patient Portal" : "2care - Operations Console";
  }, [portalMode]);

  // Real-time synchronization listener for cross-tab and cross-portal events
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("2care_call_sync");
      channel.onmessage = (event) => {
        if (event.data?.type === "CALL_COMPLETED") {
          refreshAll();
          setTimeout(refreshAll, 1200);
          setTimeout(refreshAll, 3000);
          const apt = event.data?.data?.appointment;
          if (apt) {
            setAppointments((prev) => {
              const exists = prev.some((a) => a.id === apt.id || a.reference_id === apt.reference_id);
              if (exists) return prev;
              return [apt, ...prev];
            });
            if (apt.patient_name) {
              setCurrentPatientName(apt.patient_name);
              if (typeof window !== "undefined") {
                localStorage.setItem("2care_current_patient", apt.patient_name);
                localStorage.setItem("2care_latest_booking", JSON.stringify(apt));
              }
            }
          }
          if (portalMode === "admin") {
            showToast(
              "Patient Voice Call Recorded",
              `Call details for ${event.data.call_id || "new session"} are now reflected in the Admin Console.`
            );
          }
        } else if (event.data?.type === "CALL_STARTED" && portalMode === "admin") {
          showToast(
            "Patient Voice Call Active",
            "A patient has connected to the AI assistant from the portal."
          );
        }
      };
    } catch (e) {
      // ignore
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "2care_last_call_sync" || e.key === "2care_portal_mode") {
        refreshAll();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Efficient background polling (every 8s) to automatically catch external telephony, webhooks, or multi-portal activity
    const interval = window.setInterval(() => {
      fetchCalls();
      fetchAppointments();
      fetchOverview();
    }, 8000);

    return () => {
      if (channel) channel.close();
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(interval);
    };
  }, [refreshAll, fetchCalls, fetchAppointments, fetchOverview, portalMode]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Re-fetch slots when filter changes
  useEffect(() => {
    fetchSlots(availabilityDoctorFilter);
  }, [availabilityDoctorFilter, fetchSlots]);

  const showToast = (title: string, detail: string) => {
    setToastMessage({ title, detail });
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  const startDemoVoice = () => {
    handleStartVoiceCall();
  };

  const handleBookingSuccess = (newApt: Appointment) => {
    showToast(
      `Appointment ${newApt.reference_id} Confirmed!`,
      `Scheduled with ${newApt.doctor_name || "Doctor"} for ${newApt.patient_name}.`
    );
    // Refresh all data
    refreshAll();
  };

  const handleCancellationSuccess = (cancelledApt: Appointment) => {
    showToast(
      `Appointment ${cancelledApt.reference_id} Cancelled`,
      "The associated time slot has been freed back into available capacity."
    );
    // Refresh all data
    refreshAll();
  };

  const handleBookFromSlot = (slot: DoctorSlot) => {
    setCreateInitialDoctorId(slot.doctor_id);
    setCreateInitialSlotId(slot.id);
    setCreateModalOpen(true);
  };

  const handleSelectDoctorForAvailability = (doctorId: string) => {
    setAvailabilityDoctorFilter(doctorId);
    setPage("Availability");
  };

  // ==========================================
  // VIEW 1: DEDICATED CUSTOMER / PATIENT PORTAL
  // ==========================================
  if (portalMode === "customer") {
    return (
      <div className="app-shell">
        {/* Customer Sidebar with identical Admin Navy Theme */}
        <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
          <div className="brand">
            <Logo />
            <div>
              <strong>2care</strong>
              <span>Patient Healthcare</span>
            </div>
            <Button variant="ghost" className="mobile-close" onClick={() => setMenuOpen(false)}>
              <X size={18} />
            </Button>
          </div>

          <nav className="nav-list" aria-label="Patient navigation">
            <p className="nav-caption">Patient portal</p>
            <button
              type="button"
              className="nav-item active"
            >
              <CalendarCheck size={18} strokeWidth={1.8} />
              <span>My Appointments</span>
              <span className="badge badge-live" style={{ marginLeft: "auto", fontSize: "10px" }}>
                {appointments.length}
              </span>
            </button>
            <button
              type="button"
              className="nav-item"
              onClick={handleStartVoiceCall}
            >
              <Sparkles size={18} strokeWidth={1.8} className="text-cyan-400" />
              <span>Book Voice AI</span>
              <i className="live-dot" />
            </button>
            <button
              type="button"
              className="nav-item"
              onClick={() => {
                const el = document.getElementById("patient-appointments-panel");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Stethoscope size={18} strokeWidth={1.8} />
              <span>Medical Specialists</span>
            </button>
          </nav>

          <div className="system-card">
            <div className="system-top">
              <span>
                <i style={{ background: isLive ? "var(--mint)" : "#f0737d" }} />
                Verified Patient Portal
              </span>
              <ShieldCheck size={15} />
            </div>
            <div className="system-meta">
              <span>AI Voice Assistant Active</span>
              <span>HIPAA Compliant</span>
            </div>
          </div>
        </aside>

        {menuOpen && <div className="mobile-overlay" onClick={() => setMenuOpen(false)} />}

        <div className="workspace">
          {/* Topbar with identical Admin Style */}
          <header className="topbar">
            <div className="page-identity">
              <Button variant="ghost" className="menu-button" onClick={() => setMenuOpen(true)}>
                <Menu size={20} />
              </Button>
              <div>
                <span>Patient Care / Appointments</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>Patient Command Center</strong>
                  <Badge tone="live"><i /> 24/7 Voice AI Active</Badge>
                </div>
              </div>
            </div>

            <div className="header-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={handleStartVoiceCall}
              >
                <PhoneCall size={14} className="shrink-0" />
                <span className="hidden sm:inline">Talk to Voice Assistant</span>
                <span className="sm:hidden">Voice AI</span>
              </button>

              <Button variant="ghost" className="icon-button" title="Refresh data" onClick={refreshAll}>
                <RefreshCw size={17} className={appointmentsLoading ? "animate-spin" : ""} />
              </Button>

              <Button
                variant="secondary"
                onClick={() => switchPortal("admin")}
                title="Switch to Admin Operations Console"
              >
                <ShieldCheck size={15} className="text-cyan-600 shrink-0" />
                <span className="hidden sm:inline">Admin Console &rarr;</span>
                <span className="sm:hidden">Admin</span>
              </Button>

              <div className="profile">
                <span>
                  {currentPatientName && currentPatientName.toLowerCase() !== "all"
                    ? currentPatientName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
                    : "2C"}
                </span>
                <div className="hidden sm:flex">
                  <strong>
                    {currentPatientName && currentPatientName.toLowerCase() !== "all"
                      ? currentPatientName
                      : "Patient Portal"}
                  </strong>
                  <small>
                    {currentPatientName && currentPatientName.toLowerCase() !== "all"
                      ? "Registered Patient"
                      : "24/7 Autonomous Care"}
                  </small>
                </div>
              </div>
            </div>
          </header>

          <main>
            <PatientPortal
              appointments={appointments}
              doctors={doctors}
              currentPatientName={currentPatientName}
              onSwitchPatient={(name) => {
                setCurrentPatientName(name);
                if (typeof window !== "undefined") {
                  localStorage.setItem("2care_current_patient", name);
                }
              }}
              availablePatients={patients}
              onStartVoiceCall={handleStartVoiceCall}
              onRefresh={refreshAll}
              onSelectAppointment={(id) => setSelectedAppointmentId(id)}
              onCancelAppointment={async (id) => {
                await appointmentService.cancelAppointment(id);
                refreshAll();
                showToast("Appointment Cancelled", "Your booking has been updated.");
              }}
              isLive={isLive}
            />
          </main>
        </div>

        {/* Appointment Detail Drawer */}
        <AppointmentDetailDrawer
          appointmentId={selectedAppointmentId}
          onClose={() => setSelectedAppointmentId(null)}
          onCancelled={handleCancellationSuccess}
        />

        {/* Patient EHR Medical Chart Drawer */}
        <PatientDetailDrawer
          patientId={selectedPatientId}
          onClose={() => setSelectedPatientId(null)}
          onPatientUpdated={refreshAll}
          onSelectAppointment={(id) => {
            setSelectedPatientId(null);
            setSelectedAppointmentId(id);
          }}
        />

        {/* In-Browser Interactive Voice Call Widget */}
        <VoiceCallWidget
          isOpenControlled={voiceWidgetOpen}
          onOpenChange={setVoiceWidgetOpen}
          triggerCall={voiceCallTrigger}
          initialContext={{
            patient_name: currentPatientName && currentPatientName.toLowerCase() !== "all" ? currentPatientName : undefined,
            patient_phone: patients.find(p => p.name.toLowerCase() === (currentPatientName || "").toLowerCase())?.phone,
            patient_id: patients.find(p => p.name.toLowerCase() === (currentPatientName || "").toLowerCase())?.id,
            clinic_name: "2care Clinical Command Center"
          }}
          onCallCompleted={(callData) => {
            refreshAll();
            setTimeout(refreshAll, 1200);
            setTimeout(refreshAll, 3000);
            setTimeout(refreshAll, 5500);
            if (callData?.appointment) {
              const apt = callData.appointment;
              setAppointments((prev) => {
                const exists = prev.some((a) => a.id === apt.id || a.reference_id === apt.reference_id);
                if (exists) return prev;
                return [apt, ...prev];
              });
              if (apt.patient_name) {
                setCurrentPatientName(apt.patient_name);
                if (typeof window !== "undefined") {
                  localStorage.setItem("2care_current_patient", apt.patient_name);
                  localStorage.setItem("2care_latest_booking", JSON.stringify(apt));
                }
              }
              if (apt.id) {
                setSelectedAppointmentId(apt.id);
              }
            } else {
              appointmentService.listAppointments().then((res) => {
                if (res.ok && res.data && res.data.length > 0) {
                  setAppointments(res.data);
                  const newest = res.data[0];
                  if (newest && typeof window !== "undefined") {
                    localStorage.setItem("2care_latest_booking", JSON.stringify(newest));
                  }
                }
              });
            }
          }}
          showToast={showToast}
          onNavigateToAppointments={() => {
            const el = document.getElementById("patient-appointments-panel");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
          onNavigateToCalls={() => {
            switchPortal("admin");
            setPage("Call Logs");
          }}
        />

        {/* Toast Notification */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              className="toast"
              initial={{ opacity: 0, y: 20, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: 12 }}
            >
              <span>
                <Check size={17} />
              </span>
              <div>
                <strong>{toastMessage.title}</strong>
                <p>{toastMessage.detail}</p>
              </div>
              <Button variant="ghost" onClick={() => setToastMessage(null)}>
                <X size={16} />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: DEDICATED ADMIN OPERATIONS PORTAL
  // ==========================================
  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        setPage={setPage}
        open={menuOpen}
        close={() => setMenuOpen(false)}
        health={health}
        callLogsCount={callLogs.length}
        hasActiveCall={callLogs.some(c => c.status === "in_progress" || c.status === "active")}
        appointmentsCount={appointments.length}
        patientsCount={patients.length}
      />

      {menuOpen && <div className="mobile-overlay" onClick={() => setMenuOpen(false)} />}

      <div className="workspace">
        <Header
          page={page}
          openMenu={() => setMenuOpen(true)}
          onRefresh={refreshAll}
          isLive={isLive}
          onSwitchToCustomer={() => switchPortal("customer")}
        />

        <main>

          {page === "Overview" && (
            <Overview
              overviewData={overviewData}
              loading={overviewLoading}
              error={overviewError}
              isLive={isLive}
              onRefresh={refreshAll}
              appointments={appointments}
              onSelectAppointment={(id) => setSelectedAppointmentId(id)}
              demoVoice={demoVoice}
              startDemoVoice={startDemoVoice}
              callLogs={callLogs}
              onNavigateToCalls={() => setPage("Call Logs")}
              onOpenCallDetail={(call) => setSelectedCall(call)}
            />
          )}

          {page === "Appointments" && (
            <div className="page-stack">
              <section className="subpage-hero">
                <div>
                  <Badge tone={isLive ? "live" : "demo"}>
                    {isLive ? "PostgreSQL Verified" : "Demo Records"}
                  </Badge>
                  <h1>Appointments</h1>
                  <p>Search, review, coordinate, and cancel patient bookings with real-time slot synchronization.</p>
                </div>
                <div className="welcome-actions">
                  <Button variant="secondary" onClick={() => setPage("Availability")}>
                    <CalendarDays size={16} /> Calendar view
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setCreateInitialDoctorId(undefined);
                      setCreateInitialSlotId(undefined);
                      setCreateModalOpen(true);
                    }}
                  >
                    <Plus size={16} /> Create appointment
                  </Button>
                </div>
              </section>

              <AppointmentsTable
                appointments={appointments}
                loading={appointmentsLoading}
                error={appointmentsError}
                onRefresh={fetchAppointments}
                onOpenCreate={() => {
                  setCreateInitialDoctorId(undefined);
                  setCreateInitialSlotId(undefined);
                  setCreateModalOpen(true);
                }}
                onSelectAppointment={(id) => setSelectedAppointmentId(id)}
                full={true}
                isLive={isLive}
              />
            </div>
          )}

          {page === "Patients" && (
            <PatientsPage
              patients={patients}
              loading={patientsLoading}
              error={patientsError}
              onRefresh={fetchPatients}
              onSelectPatient={(id) => setSelectedPatientId(id)}
              isLive={isLive}
            />
          )}

          {page === "Doctors" && (
            <DoctorsPage
              doctors={doctors}
              loading={doctorsLoading}
              error={doctorsError}
              onRefresh={fetchDoctors}
              onSelectDoctorForAvailability={handleSelectDoctorForAvailability}
              isLive={isLive}
            />
          )}

          {page === "Availability" && (
            <AvailabilityPage
              doctors={doctors}
              slots={slots}
              loading={slotsLoading}
              error={slotsError}
              selectedDoctorId={availabilityDoctorFilter}
              setSelectedDoctorId={setAvailabilityDoctorFilter}
              onRefresh={() => fetchSlots(availabilityDoctorFilter)}
              onBookSlot={handleBookFromSlot}
              isLive={isLive}
            />
          )}

          {(page === "Voice Agents" || page === "Call Logs") && (
            <EvaluationsPage
              calls={true}
              onOpenCallDetail={(call) => setSelectedCall(call)}
              onOpenRetellConfig={() => setRetellConfigOpen(true)}
              onRefreshCalls={refreshAll}
              showToast={showToast}
              externalCallLogs={callLogs}
              externalLoading={callsLoading}
            />
          )}

          {page === "AI Evaluations" && (
            <EvaluationsPage
              calls={false}
              onOpenCallDetail={(call) => setSelectedCall(call)}
              onOpenRetellConfig={() => setRetellConfigOpen(true)}
              onRefreshCalls={refreshAll}
              showToast={showToast}
              externalCallLogs={callLogs}
              externalLoading={callsLoading}
            />
          )}

          {page === "Settings" && (
            <SettingsPage
              isLive={isLive}
              health={health}
              onOpenRetellConfig={() => setRetellConfigOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Appointment Detail Drawer */}
      <AppointmentDetailDrawer
        appointmentId={selectedAppointmentId}
        onClose={() => setSelectedAppointmentId(null)}
        onCancelled={handleCancellationSuccess}
      />

      {/* Patient EHR Medical Chart Drawer */}
      <PatientDetailDrawer
        patientId={selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
        onPatientUpdated={refreshAll}
        onSelectAppointment={(id) => {
          setSelectedPatientId(null);
          setSelectedAppointmentId(id);
        }}
      />

      {/* Interactive Appointment Booking Modal */}
      <CreateAppointmentModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleBookingSuccess}
        initialDoctorId={createInitialDoctorId}
        initialSlotId={createInitialSlotId}
      />

      {/* Call Detail Modal */}
      <CallDetailModal
        call={selectedCall}
        onClose={() => setSelectedCall(null)}
      />

      {/* Retell Agent Configuration Modal */}
      <RetellAgentConfigModal
        isOpen={retellConfigOpen}
        onClose={() => setRetellConfigOpen(false)}
      />

      {/* In-Browser Interactive Voice Call Widget */}
      <VoiceCallWidget
        isOpenControlled={voiceWidgetOpen}
        onOpenChange={setVoiceWidgetOpen}
        triggerCall={voiceCallTrigger}
        initialContext={{
          patient_name: currentPatientName && currentPatientName.toLowerCase() !== "all" ? currentPatientName : undefined,
          patient_phone: patients.find(p => p.name.toLowerCase() === (currentPatientName || "").toLowerCase())?.phone,
          patient_id: patients.find(p => p.name.toLowerCase() === (currentPatientName || "").toLowerCase())?.id,
          selected_doctor_id: availabilityDoctorFilter || undefined,
          clinic_name: "2care Clinical Command Center"
        }}
        onCallCompleted={(callData) => {
          refreshAll();
          if (callData?.appointment) {
            if (callData.appointment.patient_name) {
              setCurrentPatientName(callData.appointment.patient_name);
              if (typeof window !== "undefined") {
                localStorage.setItem("2care_current_patient", callData.appointment.patient_name);
              }
            }
            if (callData.appointment.id) {
              setSelectedAppointmentId(callData.appointment.id);
            }
          }
        }}
        showToast={showToast}
        onNavigateToAppointments={() => {
          setPage("Appointments");
        }}
        onNavigateToCalls={() => {
          setPage("Call Logs");
        }}
      />

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <span>
              <Check size={17} />
            </span>
            <div>
              <strong>{toastMessage.title}</strong>
              <p>{toastMessage.detail}</p>
            </div>
            <Button variant="ghost" onClick={() => setToastMessage(null)}>
              <X size={16} />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
