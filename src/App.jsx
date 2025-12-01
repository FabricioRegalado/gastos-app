import { useState, useEffect, useRef } from "react";

const ESTADOS = ["pendiente", "pagada"];

function App() {
  const [deudas, setDeudas] = useState(() => {
    try {
      const raw = localStorage.getItem("deudas");
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Error parseando 'deudas' desde localStorage:", err);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("deudas", JSON.stringify(deudas));
    } catch (err) {
      console.error("Error guardando 'deudas' en localStorage:", err);
    }
  }, [deudas]);

  const [form, setForm] = useState({
    descripcion: "",
    monto: "",
    fecha: "",
    estado: "pendiente",
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    // Validaciones básicas
    if (!form.descripcion.trim()) {
      alert("La descripción es obligatoria.");
      return;
    }

    const montoNumber = Number(form.monto);
    if (!Number.isFinite(montoNumber) || montoNumber <= 0) {
      alert("Ingresa un monto válido mayor a 0.");
      return;
    }

    const hoy = new Date().toISOString().slice(0, 10);

    const nuevaDeuda = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      descripcion: form.descripcion.trim(),
      monto: montoNumber,
      fecha: form.fecha || hoy,
      estado: form.estado,
      creadaEn: new Date().toISOString(),
    };

    setDeudas((prev) => [nuevaDeuda, ...prev]);

    // Limpiar formulario
    setForm({
      descripcion: "",
      monto: "",
      fecha: "",
      estado: "pendiente",
    });
  }

  const totalPendiente = deudas
    .filter((d) => d.estado === "pendiente")
    .reduce((sum, d) => sum + d.monto, 0);

  const totalPagado = deudas
    .filter((d) => d.estado === "pagada")
    .reduce((sum, d) => sum + d.monto, 0);

  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(() => {
    try {
      return localStorage.getItem("whatsappPhone") || "";
    } catch {
      return "";
    }
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const reminderTimerRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);

  const filteredDeudas = deudas.filter((d) => {
    if (filter === "all") return true;
    return d.estado === filter;
  });

  const [expandedId, setExpandedId] = useState(null);
  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Helpers: find upcoming due date that falls on 15 or 16
  function getUpcomingQuincena() {
    if (!deudas || deudas.length === 0) return null;
    const today = new Date();
    const candidateDates = Array.from(new Set(deudas.map((d) => d.fecha)))
      .map((s) => {
        const parts = s.split("-");
        if (parts.length !== 3) return null;
        return new Date(
          Number(parts[0]),
          Number(parts[1]) - 1,
          Number(parts[2])
        );
      })
      .filter(Boolean)
      .filter((dt) => dt.getDate() === 15 || dt.getDate() === 16)
      .sort((a, b) => a - b);

    for (const d of candidateDates) {
      if (
        d >= new Date(today.getFullYear(), today.getMonth(), today.getDate())
      ) {
        return d;
      }
    }
    return candidateDates.length ? candidateDates[0] : null;
  }

  function formatDateYMD(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDateShort(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    } catch {
      return dateStr;
    }
  }

  function daysAgo(dateStr) {
    try {
      const d = new Date(dateStr);
      const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff === 0) return "hoy";
      if (diff === 1) return "hace 1 día";
      return `hace ${diff} días`;
    } catch {
      return "";
    }
  }

  function getCategory(text) {
    if (!text) return "Otros";
    const t = text.toLowerCase();
    if (t.includes("tel") || t.includes("telefono") || t.includes("cel")) return "Teléfono";
    if (t.includes("tarjeta")) return "Tarjeta";
    if (t.includes("prestamo") || t.includes("préstamo") || t.includes("loan")) return "Préstamo";
    if (t.includes("comida") || t.includes("resta") || t.includes("restaurante")) return "Alimentos";
    if (t.includes("servicio") || t.includes("luz") || t.includes("agua") || t.includes("internet")) return "Servicios";
    return "Otros";
  }

  function getInitials(text) {
    if (!text) return "?";
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function buildWhatsAppMessage(targetDate) {
    const list = targetDate
      ? deudas.filter((x) => x.fecha === formatDateYMD(targetDate))
      : deudas;
    const total = list.reduce((s, it) => s + Number(it.monto || 0), 0);
    let text =
      `Recordatorio de pagos para el día ${
        targetDate ? targetDate.toLocaleDateString() : "próximo"
      }:` + "\n";
    list.forEach((it) => {
      text += `- ${it.descripcion}: $${Number(it.monto).toLocaleString()}\n`;
    });
    text += `Total: $${total.toLocaleString()}`;
    return text;
  }

  function openWhatsAppWithMessage(message) {
    let phone = phoneNumber;
    if (!phone) {
      phone = window.prompt(
        "Ingresa el número de WhatsApp (código internacional, sin +). Ej: 5213312345678"
      );
      if (!phone) return;
      setPhoneNumber(phone);
      try {
        localStorage.setItem("whatsappPhone", phone);
      } catch {}
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  function savePhoneNumber(value) {
    setPhoneNumber(value);
    try {
      if (value) localStorage.setItem("whatsappPhone", value);
      else localStorage.removeItem("whatsappPhone");
    } catch {}
  }

  function scheduleBrowserNotification(atTimestamp, title, body) {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        const delay = atTimestamp - Date.now();
        if (delay <= 0) {
          new Notification(title, { body });
          return;
        }
        if (reminderTimerRef.current)
          clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = setTimeout(() => {
          new Notification(title, { body });
        }, delay);
        try {
          localStorage.setItem("scheduledReminder", String(atTimestamp));
        } catch {}
      }
    } catch (err) {
      console.error("scheduleBrowserNotification error", err);
    }
  }

  const upcomingQuincena = getUpcomingQuincena();
  const reminderDate = upcomingQuincena
    ? new Date(upcomingQuincena.getTime() - 24 * 60 * 60 * 1000)
    : null;

  useEffect(() => {
    if (!reminderDate) return;
    const ts = reminderDate.setHours(9, 0, 0, 0);
    if (Notification && Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          scheduleBrowserNotification(
            ts,
            "Recordatorio de pagos",
            "Tienes pagos próximamente. Toca para enviar recordatorio por WhatsApp."
          );
        }
      });
    } else if (Notification && Notification.permission === "granted") {
      scheduleBrowserNotification(
        ts,
        "Recordatorio de pagos",
        "Tienes pagos próximamente. Toca para enviar recordatorio por WhatsApp."
      );
    }
    return () => {
      if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deudas?.length]);

  function handleSendWhatsAppForQuincena() {
    const message = buildWhatsAppMessage(upcomingQuincena);
    openWhatsAppWithMessage(message);
  }

  function handleSendWhatsAppAll() {
    const message = buildWhatsAppMessage(null);
    openWhatsAppWithMessage(message);
  }

  function handleClearAll() {
    setShowClearConfirm(true);
  }

  function confirmClearAll() {
    setDeudas([]);
    try {
      localStorage.removeItem("deudas");
    } catch {}
    setShowClearConfirm(false);
  }

  const today = new Date();
  const isQuincenaDay = today.getDate() === 15 || today.getDate() === 16;

  return (
    <div className="min-h-screen bg-slate-950 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex items-center justify-center px-3 py-6">
      <div className="app-shell relative w-full max-w-4xl bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-800/80 px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-7">
        {/* Título principal */}
        <div className="mb-4 md:mb-6 text-center">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Mis Deudas / Gastos
          </h1>
          <p className="text-slate-300 text-xs md:text-sm mt-1">
            Administra tus compromisos financieros de forma sencilla.
          </p>
        </div>

        {/* Header estilo iOS */}
        <header className="ios-header flex items-center justify-between gap-3 rounded-2xl bg-slate-900/80 border border-slate-800 px-3 py-2.5 md:px-4 md:py-3 mb-4">
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => {}}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 transition"
              aria-label="back"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                className="inline-block"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M15 18L9 12L15 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="leading-tight">
              <div className="ios-title text-sm md:text-base font-semibold">
                Mis Deudas
              </div>
              <div className="text-[11px] md:text-xs text-slate-400">
                Resumen y control
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="segmented text-[11px] md:text-xs">
              <button
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                Todos
              </button>
              <button
                className={filter === "pendiente" ? "active" : ""}
                onClick={() => setFilter("pendiente")}
              >
                Pendiente
              </button>
              <button
                className={filter === "pagada" ? "active" : ""}
                onClick={() => setFilter("pagada")}
              >
                Pagadas
              </button>
            </div>

            <div className="hidden sm:flex items-center px-2.5 py-1.5 rounded-lg bg-slate-800/80 text-[11px] text-slate-300 border border-slate-700/80">
              {phoneNumber ? `WA: ${phoneNumber}` : "WA: No configurado"}
            </div>

            <button
              onClick={handleSendWhatsAppAll}
              title="Enviar resumen por WhatsApp"
              className="send-summary-btn ios-button btn-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] md:text-xs"
              aria-label="Enviar resumen por WhatsApp"
            >
              <svg
                className="icon h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22 2L11 13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 2l-7 20-4-9-9-4 20-7z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Enviar resumen</span>
            </button>

            <button
              onClick={() => setShowSettings(true)}
              title="Ajustes"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-sky-500 shadow-md hover:bg-white transition"
              aria-label="Ajustes"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zm8.94-2.5a1 1 0 0 0-.11-.37l-1.2-2.08a1 1 0 0 0-.9-.52l-2.45-.2a6.98 6.98 0 0 0-1.2-1.04l.52-2.36a1 1 0 0 0-.3-1.02l-1.5-1.5a1 1 0 0 0-1.02-.3l-2.36.52c-.33-.43-.7-.82-1.1-1.18L9.4 1.8a1 1 0 0 0-1.1 0L6.22 2.8c-.4.36-.77.75-1.1 1.18L2.76 3.46a1 1 0 0 0-1.02.3L.24 5.26a1 1 0 0 0-.3 1.02l.52 2.36c-.44.33-.84.69-1.2 1.04l-2.45.2a1 1 0 0 0-.9.52L.17 13.1a1 1 0 0 0-.11.37c0 .13-.06.25-.06.38s.02.25.06.37l1.2 2.08c.16.28.44.49.78.54l2.45.2c.37.58.8 1.12 1.3 1.6l-.52 2.36c-.09.36.04.73.3 1.02l1.5 1.5c.29.26.66.39 1.02.3l2.36-.52c.33.43.7.82 1.1 1.18l1.9 1c.37.2.8.2 1.17 0l1.9-1c.4-.36.77-.75 1.1-1.18l2.36.52c.36.09.73-.04 1.02-.3l1.5-1.5c.26-.29.39-.66.3-1.02l-.52-2.36c.5-.48.93-1.02 1.3-1.6l2.45-.2c.34-.05.62-.26.78-.54l1.2-2.08c.04-.12.06-.24.06-.37s-.02-.25-.06-.38z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Resumen rápido */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-5 text-sm">
          <div className="rounded-2xl p-3.5 md:p-4 total-pendiente bg-gradient-to-br from-amber-500/10 via-amber-400/10 to-amber-300/10 border border-amber-400/40">
            <p className="total-label text-xs uppercase tracking-wide text-amber-200/90">
              Total pendiente
            </p>
            <p className="total-amount text-xl md:text-2xl font-semibold mt-1">
              ${totalPendiente.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl p-3.5 md:p-4 total-pagado bg-gradient-to-br from-emerald-500/10 via-emerald-400/10 to-emerald-300/10 border border-emerald-400/40">
            <p className="total-label text-xs uppercase tracking-wide text-emerald-200/90">
              Total pagado (histórico)
            </p>
            <p className="total-amount text-xl md:text-2xl font-semibold mt-1">
              ${totalPagado.toLocaleString()}
            </p>
          </div>
        </section>

        {/* Tarjetas resumen */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base md:text-lg font-semibold">
              Tarjetas rápidas
            </h2>
            <span className="text-[11px] md:text-xs text-slate-400">
              {filteredDeudas.length} registro
              {filteredDeudas.length === 1 ? "" : "s"}
            </span>
          </div>

          {deudas.length === 0 ? (
            <p className="text-sm text-slate-400 bg-slate-900/70 rounded-2xl border border-dashed border-slate-700 px-4 py-3 text-center">
              No hay deudas para mostrar como tarjetas. Agrega una nueva con el
              botón <strong className="font-semibold">+</strong> de abajo.
            </p>
          ) : (
            <div className="flex flex-col md:flex-row gap-3.5 md:gap-4 md:overflow-x-auto pb-1 md:pb-2 -mx-1 px-1">
              {filteredDeudas.map((d) => {
                const isOpen = expandedId === d.id;
                return (
                  <article
                    key={d.id}
                    className={`w-full md:min-w-[300px] flex-shrink-0 bg-slate-900/80 rounded-2xl border border-slate-800 ios-card ios-card-enter md:snap-start transition-all duration-200 ${
                      isOpen ? "card-expanded shadow-lg" : "card-collapsed"
                    }`}
                  >
                    <button
                      onClick={() => toggleExpand(d.id)}
                      className="w-full text-left px-3.5 py-3 md:px-4 md:py-3.5"
                      style={{ border: "none", background: "transparent" }}
                    >
                      <div className="card-header flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="card-icon">
                            <span className="text-sm font-semibold text-slate-800">{getInitials(d.descripcion)}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs text-slate-300 uppercase tracking-wide">{getCategory(d.descripcion)}</div>
                            <div className="card-title text-sm md:text-base font-semibold text-slate-100 truncate">
                              {d.descripcion}
                            </div>
                            {!isOpen && (
                              <div className="card-meta text-[11px] md:text-xs text-slate-400 mt-0.5">
                                {formatDateShort(d.fecha)} · {daysAgo(d.fecha)}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`chevron ${
                                isOpen ? "open" : ""
                              } text-slate-400`}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M6 9l6 6 6-6"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                            <span
                              className={
                                "text-[11px] md:text-xs font-semibold px-2 py-1 rounded-full " +
                                (d.estado === "pendiente"
                                  ? "bg-amber-400 text-slate-900"
                                  : "bg-emerald-500 text-white")
                              }
                            >
                              {d.estado.charAt(0).toUpperCase() +
                                d.estado.slice(1)}
                            </span>
                          </div>
                          <div className="card-amount text-base md:text-lg font-semibold text-slate-50">
                            ${d.monto.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-1 px-3.5 pb-3.5 md:px-4 md:pb-4">
                        <p className="card-meta text-[11px] md:text-xs text-slate-400 mb-2">
                          Fecha:{" "}
                          <span className="font-medium text-slate-200">
                            {d.fecha}
                          </span>
                        </p>
                        <div className="mt-2 flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={() => {
                              setDeudas((prev) =>
                                prev.map((p) =>
                                  p.id === d.id
                                    ? { ...p, estado: "pagada" }
                                    : p
                                )
                              );
                            }}
                            className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition"
                          >
                            Marcar pagada
                          </button>
                          <button
                            onClick={() => {
                              setDeudas((prev) =>
                                prev.filter((p) => p.id !== d.id)
                              );
                            }}
                            className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:bg-slate-800 transition"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Recordatorio & acciones */}
        <section className="mb-4 space-y-3">
          {reminderDate && (
            <div className="bg-slate-900/80 rounded-2xl p-3.5 md:p-4 border border-slate-800 text-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <div className="font-medium flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Recordatorio programado
                </div>
                <div className="text-slate-400 text-[11px] md:text-xs mt-1">
                  El recordatorio será el{" "}
                  {new Date(reminderDate).toLocaleDateString()} a las 9:00 am.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    Notification && Notification.requestPermission();
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-200 text-xs ios-button hover:bg-slate-800 transition"
                >
                  Activar notificaciones
                </button>
                <button
                  onClick={handleSendWhatsAppForQuincena}
                  className="send-summary-btn ios-button btn-primary inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs"
                  title="Enviar resumen por WhatsApp"
                >
                  <svg
                    className="icon h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M22 2L11 13"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M22 2l-7 20-4-9-9-4 20-7z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Quincena</span>
                </button>
              </div>
            </div>
          )}

          {isQuincenaDay && deudas.length > 0 && (
            <div className="text-center">
              <button
                onClick={handleClearAll}
                className="px-4 py-2.5 rounded-2xl bg-red-600 text-white text-sm font-semibold ios-button hover:bg-red-500 transition inline-flex items-center gap-1.5"
              >
                <span>Ya pagué todo</span>
              </button>
            </div>
          )}
        </section>

        <p className="text-center mb-8 text-[11px] md:text-xs text-slate-500">
          Usa el botón <strong>+</strong> para agregar una nueva deuda.
        </p>

        {/* Floating Add Button */}
        <div className="ios-fab pointer-events-none">
          <div className="pointer-events-auto">
            <button
              onClick={() => setShowForm(true)}
              aria-label="Agregar"
              title="Agregar"
              className="h-12 w-12 rounded-full bg-sky-500 text-white text-2xl leading-none flex items-center justify-center shadow-xl hover:bg-sky-400 transition border border-sky-300/70"
            >
              +
            </button>
          </div>
        </div>

        {/* Modal sheet for form */}
        {showForm && (
          <div
            className="ios-modal-backdrop fixed inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          >
            <div
              className="ios-modal-sheet w-full max-w-md rounded-t-3xl bg-slate-950/95 border-t border-slate-800 p-4 pb-6 md:p-5 md:pb-7"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ios-modal-close flex items-center justify-between mb-2">
                <span className="text-[13px] text-slate-400">
                  Nueva deuda / gasto
                </span>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-slate-400 text-xs px-2 py-1 rounded-full hover:bg-slate-800/80"
                >
                  Cerrar
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  handleSubmit(e);
                  setShowForm(false);
                }}
                className="mt-2 space-y-3"
              >
                <h3 className="text-lg font-semibold mb-1">
                  Nueva deuda
                </h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium mb-1 text-slate-300">
                      Descripción
                    </label>
                    <input
                      type="text"
                      name="descripcion"
                      value={form.descripcion}
                      onChange={handleChange}
                      placeholder="Ej. Pago tarjeta, préstamo amigo, etc."
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ios-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-300">
                      Monto
                    </label>
                    <input
                      type="number"
                      name="monto"
                      value={form.monto}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ios-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-300">
                      Fecha
                    </label>
                    <input
                      type="date"
                      name="fecha"
                      value={form.fecha}
                      onChange={handleChange}
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ios-input"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Si la dejas vacía, se usará la fecha de hoy.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-300">
                      Estado
                    </label>
                    <select
                      name="estado"
                      value={form.estado}
                      onChange={handleChange}
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ios-input"
                    >
                      {ESTADOS.map((estado) => (
                        <option key={estado} value={estado}>
                          {estado.charAt(0).toUpperCase() +
                            estado.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:bg-slate-900/80 ios-button"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold ios-button hover:bg-sky-400"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Clear confirmation modal */}
        {showClearConfirm && (
          <div
            className="ios-modal-backdrop fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowClearConfirm(false)}
          >
            <div
              className="ios-modal-sheet w-full max-w-md rounded-2xl bg-slate-950/95 border border-slate-800 px-4 py-5 md:px-5 md:py-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="confirm-card">
                <div className="confirm-title text-base font-semibold mb-1.5">
                  Confirmar borrado de todos los pagos
                </div>
                <div className="confirm-body text-xs md:text-sm text-slate-300 mb-3">
                  Esta acción eliminará toda la información almacenada de pagos
                  en este equipo. No se puede deshacer. Revisa el resumen antes
                  de confirmar.
                </div>
                <div className="confirm-totals flex flex-wrap gap-2 mb-3">
                  <div className="chip chip-pend px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-200 text-xs font-medium border border-amber-400/40">
                    Pendiente: ${totalPendiente.toLocaleString()}
                  </div>
                  <div className="chip chip-paid px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-200 text-xs font-medium border border-emerald-400/40">
                    Pagado: ${totalPagado.toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-2 rounded-xl ios-button btn-ghost border border-slate-700 text-slate-200 text-sm hover:bg-slate-900/70"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmClearAll}
                    className="flex-1 py-2 rounded-xl btn-danger bg-red-600 text-white text-sm font-semibold hover:bg-red-500"
                  >
                    Borrar todo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings modal */}
        {showSettings && (
          <div
            className="ios-modal-backdrop fixed inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <div
              className="ios-modal-sheet w-full max-w-md rounded-t-3xl bg-slate-950/95 border-t border-slate-800 px-4 py-5 md:px-5 md:py-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ios-modal-close flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Ajustes</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-slate-400 text-xs px-2 py-1 rounded-full hover:bg-slate-800/80"
                >
                  Cerrar
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-xs text-slate-300 mb-1">
                  Número de WhatsApp (sin +)
                </label>
                <input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="5213312345678"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-2">
                  Se usa para prellenar el link de WhatsApp al enviar
                  recordatorios.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    savePhoneNumber(phoneNumber);
                    setShowSettings(false);
                  }}
                  className="flex-1 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold ios-button hover:bg-sky-400"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    savePhoneNumber("");
                    setShowSettings(false);
                  }}
                  className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:bg-slate-900/80"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
