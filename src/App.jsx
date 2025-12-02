import { useState, useEffect, useRef } from "react";
import MiniCalendar from "./components/MiniCalendar";

const ESTADOS = ["pendiente", "pagada"];

function App() {
  const [deudas, setDeudas] = useState(() => {
    try {
      const raw = localStorage.getItem("deudas");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [form, setForm] = useState({
    descripcion: "",
    monto: "",
    fecha: "",
    type: "one-time",          // one-time | installments | recurring
    estado: "pendiente",
    installmentsTotal: 1,
    installmentsPaid: 0,
    nextDue: "",
    recurrence: "monthly",     // monthly | quincena
  });

  const [filter, setFilter] = useState("all"); // all | pendiente | pagada
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCalendar, setShowCalendar] = useState({ open: false, debtId: null });

  const [phoneNumber, setPhoneNumber] = useState(() => {
    try {
      return localStorage.getItem("whatsappPhone") || "";
    } catch {
      return "";
    }
  });

  const reminderTimerRef = useRef(null); // para recordatorio quincena global
  const debtTimersRef = useRef({});      // para recordatorios por deuda

  // --- Helpers de fecha y formato ---

  function formatDateYMD(d) {
    try {
      if (d instanceof Date) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
      if (typeof d === "string") {
        // Try to extract YYYY-MM-DD from string to avoid timezone shifts
        const m = d.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          return `${m[1]}-${m[2]}-${m[3]}`;
        }
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) {
          const yyyy = parsed.getFullYear();
          const mm = String(parsed.getMonth() + 1).padStart(2, "0");
          const dd = String(parsed.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        }
        return "";
      }
      return "";
    } catch {
      return "";
    }
  }

  // Normalizar/parsear montos que pueden venir como strings con comas o símbolos
  function parseAmount(a) {
    if (a == null) return 0;
    if (typeof a === "string") {
      a = a.replace(/\s+/g, "").replace(/\$/g, "").replace(/\./g, function(m, idx, str){
        // keep thousands separators? heuristic: if comma exists it's decimal, so remove dots
        return m;
      });
      // replace comma decimal with dot
      a = a.replace(/,/g, ".");
    }
    const n = Number(a);
    return Number.isFinite(n) ? n : 0;
  }

  function getNextDueAmount(debt) {
    try {
      if (!debt) return null;
      if (debt.type === "installments" && Array.isArray(debt.schedule)) {
        const next = debt.schedule.find((s) => !s.paid);
        if (next) return parseAmount(next.amount || next.amount === 0 ? next.amount : debt.installmentAmount);
        return null;
      }
      if (debt.type === "recurring") {
        return parseAmount(debt.monto || 0);
      }
      // one-time
      if ((debt.nextDue || debt.fecha) && debt.estado === "pendiente") {
        return parseAmount(debt.monto || 0);
      }
      return null;
    } catch {
      return null;
    }
  }

  function formatDateShort(dateStr) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    } catch {
      return dateStr;
    }
  }

  function addMonthsTo(dateStr, months) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      d.setMonth(d.getMonth() + Number(months));
      return formatDateYMD(d);
    } catch {
      return dateStr;
    }
  }

  function addDaysTo(dateStr, days) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      d.setDate(d.getDate() + Number(days));
      return formatDateYMD(d);
    } catch {
      return dateStr;
    }
  }

  function daysAgo(dateStr) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff === 0) return "hoy";
      if (diff === 1) return "hace 1 día";
      return `hace ${diff} días`;
    } catch {
      return "";
    }
  }

  // --- Lógica de cuotas / recurrentes ---

  function generateInstallments(monto, total, firstDue, period = "monthly") {
    const list = [];
    const base = Math.round((monto / total) * 100) / 100;
    for (let i = 0; i < total; i++) {
      let due = firstDue;
      if (i > 0) {
        due = advanceByPeriod(firstDue, period, i);
      }
      const amount =
        i === total - 1
          ? Math.round((monto - base * (total - 1)) * 100) / 100
          : base;

      list.push({
        index: i + 1,
        dueDate: due,
        amount,
        paid: false,
        paidAt: null,
      });
    }
    return list;
  }

    function generateRecurringPreview(firstDue, count = 6, amount = 0, period = "monthly") {
      const list = [];
      for (let i = 0; i < count; i++) {
          let due = firstDue;
          if (i > 0) {
            due = advanceByPeriod(firstDue, period, i);
          }
          list.push({ index: i + 1, dueDate: due, amount: Number(amount) || 0, paid: false, paidAt: null });
      }
      return list;
    }

  function advanceNextDue(dateStr, recurrence) {
    try {
      if (!dateStr) return dateStr;
      return advanceByPeriod(dateStr, recurrence, 1);
    } catch {
      return dateStr;
    }
  }

  // Avanza una fecha según un periodo: monthly, quincena (15 días), weekly (7 días), annual
  function advanceByPeriod(dateStr, period = "monthly", count = 1) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const n = Number(count) || 1;
      switch (period) {
        case "weekly":
          d.setDate(d.getDate() + 7 * n);
          break;
        case "quincena":
          d.setDate(d.getDate() + 15 * n);
          break;
        case "annual":
          d.setFullYear(d.getFullYear() + n);
          break;
        case "monthly":
        default:
          d.setMonth(d.getMonth() + n);
          break;
      }
      return formatDateYMD(d);
    } catch {
      return dateStr;
    }
  }

  // --- Helpers de UI / categorías ---

  function getCategory(text) {
    if (!text) return "Otros";
    const t = text.toLowerCase();
    if (t.includes("tel") || t.includes("telefono") || t.includes("cel"))
      return "Teléfono";
    if (t.includes("tarjeta")) return "Tarjeta";
    if (t.includes("prestamo") || t.includes("préstamo") || t.includes("loan"))
      return "Préstamo";
    if (t.includes("comida") || t.includes("resta") || t.includes("restaurante"))
      return "Alimentos";
    if (t.includes("servicio") || t.includes("luz") || t.includes("agua") || t.includes("internet"))
      return "Servicios";
    return "Otros";
  }

  function getInitials(text) {
    if (!text) return "?";
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function getTypeLabel(type) {
    if (type === "installments") return "Cuotas";
    if (type === "recurring") return "Recurrente";
    return "Una vez";
  }

  function getRecurrenceLabel(r) {
    if (!r) return "Mensual";
    if (r === "monthly") return "mensual";
    if (r === "quincena") return "quincenal";
    if (r === "weekly") return "semanal";
    if (r === "annual") return "anual";
    return r;
  }

  // --- Persistencia localStorage ---

  useEffect(() => {
    try {
      localStorage.setItem("deudas", JSON.stringify(deudas));
    } catch {
      // ignore
    }
  }, [deudas]);

  // --- Migración: generar `schedule` para deudas antiguas de tipo installments ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem("deudas");
      const parsed = raw ? JSON.parse(raw) : [];
      let changed = false;
      const updated = parsed.map((d) => {
        if (d && d.type === "installments" && (!Array.isArray(d.schedule) || d.schedule.length === 0)) {
          changed = true;
          const total = Math.max(1, Number(d.installmentsTotal) || 1);
          const firstDue = d.nextDue || d.fecha || formatDateYMD(new Date());
          const schedule = generateInstallments(Number(d.monto) || 0, total, firstDue, d.recurrence || "monthly");
          return {
            ...d,
            schedule,
            installmentAmount: schedule.length ? schedule[0].amount : d.installmentAmount || 0,
            nextDue: schedule.length ? schedule[0].dueDate : d.nextDue || d.fecha,
          };
        }
        return d;
      });
      if (changed) {
        setDeudas(updated);
      }
    } catch (err) {
      // ignore
    }
    // run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Si el usuario expande una deuda que es 'installments' pero no tiene schedule,
  // generar el schedule y persistirlo para que aparezca el botón 'Ver calendario'.
  useEffect(() => {
    if (!expandedId) return;
    const debt = deudas.find((d) => d.id === expandedId);
    if (!debt) return;
    if (debt.type === "installments" && !Array.isArray(debt.schedule)) {
      const total = Math.max(1, Number(debt.installmentsTotal) || 1);
      const firstDue = debt.nextDue || debt.fecha || formatDateYMD(new Date());
      const schedule = generateInstallments(Number(debt.monto) || 0, total, firstDue, debt.recurrence || "monthly");
      setDeudas((prev) =>
        prev.map((d) => (d.id === debt.id ? { ...d, schedule, installmentAmount: schedule[0]?.amount || d.installmentAmount || 0, nextDue: schedule[0]?.dueDate || d.nextDue } : d))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  // --- Notificaciones por deuda (nextDue) ---

  function scheduleDebtNotification(debt) {
    try {
      if (!debt || !debt.nextDue) return;
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

      const when = new Date(debt.nextDue + "T09:00:00").getTime();
      const delay = when - Date.now();
      if (delay <= 0) return;

      if (debtTimersRef.current[debt.id]) {
        clearTimeout(debtTimersRef.current[debt.id]);
      }

      debtTimersRef.current[debt.id] = setTimeout(() => {
        new Notification("Recordatorio: " + debt.descripcion, {
          body: `Vence ${debt.nextDue}. Monto: $${debt.monto}`,
        });
      }, delay);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    deudas.forEach((d) => scheduleDebtNotification(d));
    return () => {
      Object.values(debtTimersRef.current).forEach((t) => clearTimeout(t));
      debtTimersRef.current = {};
    };
  }, [deudas]);

  // --- Quincena: próxima fecha 15/16 basada en nextDue o fecha ---

  function getUpcomingQuincena() {
    if (!deudas || deudas.length === 0) return null;
    const today = new Date();

    const candidateDates = Array.from(
      new Set(
        deudas
          .map((d) => d.nextDue || d.fecha)
          .filter(Boolean)
      )
    )
      .map((s) => {
        const parts = s.split("-");
        if (parts.length !== 3) return null;
        return new Date(
          Number(parts[0]),
          Number(parts[1]) - 1,
          Number(parts[2])
        );
      })
      .filter((d) => d && !isNaN(d.getTime()))
      .filter((dt) => dt.getDate() === 15 || dt.getDate() === 16)
      .sort((a, b) => a - b);

    for (const d of candidateDates) {
      const todayYMD = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      if (d >= todayYMD) {
        return d;
      }
    }
    return candidateDates.length ? candidateDates[0] : null;
  }

  const upcomingQuincena = getUpcomingQuincena();
  const reminderDate = upcomingQuincena
    ? new Date(upcomingQuincena.getTime() - 24 * 60 * 60 * 1000)
    : null;

  function scheduleBrowserNotification(atTimestamp, title, body) {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        const delay = atTimestamp - Date.now();
        if (delay <= 0) {
          new Notification(title, { body });
          return;
        }
        if (reminderTimerRef.current) {
          clearTimeout(reminderTimerRef.current);
        }
        reminderTimerRef.current = setTimeout(() => {
          new Notification(title, { body });
        }, delay);
        try {
          localStorage.setItem("scheduledReminder", String(atTimestamp));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error("scheduleBrowserNotification error", err);
    }
  }

  useEffect(() => {
    if (!reminderDate) return;
    const ts = reminderDate.setHours(9, 0, 0, 0);
    if (typeof Notification !== "undefined") {
      if (Notification.permission === "default") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            scheduleBrowserNotification(
              ts,
              "Recordatorio de pagos",
              "Tienes pagos próximamente. Toca para enviar recordatorio por WhatsApp."
            );
          }
        });
      } else if (Notification.permission === "granted") {
        scheduleBrowserNotification(
          ts,
          "Recordatorio de pagos",
          "Tienes pagos próximamente. Toca para enviar recordatorio por WhatsApp."
        );
      }
    }
    return () => {
      if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deudas?.length, reminderDate?.getTime?.()]);

  // --- Totales y filtros ---

  // Total restante: para 'installments' sumar las cuotas no pagadas (schedule)
  // para 'one-time' sumar el monto si está pendiente. Excluimos recurrentes
  // del total restante porque son pagos periódicos (se muestran en el total próximo).
  const totalRestante = deudas.reduce((sum, d) => {
    try {
      if (d.type === "installments") {
        if (Array.isArray(d.schedule)) {
          const unpaid = d.schedule.filter((s) => !s.paid).reduce((ss, s) => ss + parseAmount(s.amount), 0);
          return sum + unpaid;
        }
        // fallback: usar monto menos lo pagado (si hay datos)
        const installmentAmt = Number(d.installmentAmount) || 0;
        const paidCount = Number(d.installmentsPaid) || 0;
        const totalPaid = installmentAmt * paidCount;
        return sum + Math.max(0, Number(d.monto || 0) - totalPaid);
      }
      if (d.type === "recurring") {
        // exclude recurring from remaining total (they are ongoing)
        return sum;
      }
      // one-time
      if (d.estado === "pendiente") return sum + parseAmount(d.monto);
      return sum;
    } catch {
      return sum;
    }
  }, 0);

  const totalPagado = deudas
    .filter((d) => d.estado === "pagada")
    .reduce((sum, d) => sum + parseAmount(d.monto), 0);

  const filteredDeudas = deudas.filter((d) => {
    if (filter === "all") return true;
    return d.estado === filter;
  });

  const today = new Date();
  const isQuincenaDay = today.getDate() === 15 || today.getDate() === 16;

  // --- Próxima fecha y total para ese día ---
  function getEarliestUpcomingDue() {
    try {
      const todayYMD = formatDateYMD(new Date());
      const candidates = [];
      deudas.forEach((d) => {
        if (d.type === "installments" && Array.isArray(d.schedule)) {
          const next = d.schedule.find((s) => !s.paid);
          if (next && next.dueDate) candidates.push(formatDateYMD(next.dueDate));
        } else if (d.type === "recurring") {
          if (d.nextDue) candidates.push(formatDateYMD(d.nextDue));
        } else {
          const nd = d.nextDue || d.fecha;
          if (nd && d.estado === "pendiente") candidates.push(formatDateYMD(nd));
        }
      });
      const unique = Array.from(new Set(candidates)).filter(Boolean);
      const dates = unique.map((s) => new Date(s)).filter((dt) => !isNaN(dt.getTime()));
      if (dates.length === 0) return null;
      dates.sort((a, b) => a - b);
      const next = dates.find((d) => formatDateYMD(d) >= todayYMD) || dates[0];
      return formatDateYMD(next);
    } catch {
      return null;
    }
  }

  function getTotalForDate(dateStr) {
    try {
      if (!dateStr) return 0;
      let total = 0;
      function parseAmount(a) {
        if (a == null) return 0;
        if (typeof a === "string") {
          // replace comma decimal and remove currency symbols/spaces
          a = a.replace(/\s+/g, "").replace(/\$/g, "").replace(/,/g, ".");
        }
        const n = Number(a);
        return Number.isFinite(n) ? n : 0;
      }
      deudas.forEach((d) => {
        if (d.type === "installments" && Array.isArray(d.schedule)) {
          d.schedule.forEach((s) => {
            try {
              const sDate = formatDateYMD(s.dueDate);
              if (!s.paid && sDate === dateStr) total += parseAmount(s.amount);
            } catch {
              // ignore
            }
          });
        } else if (d.type === "recurring") {
          try {
            if (formatDateYMD(d.nextDue) === dateStr) total += parseAmount(d.monto);
          } catch {}
        } else {
          const nd = d.nextDue || d.fecha;
          try {
            if (formatDateYMD(nd) === dateStr && d.estado === "pendiente") total += parseAmount(d.monto);
          } catch {}
        }
      });
      return Math.round(total * 100) / 100;
    } catch {
      return 0;
    }
  }

  const nextDueDate = getEarliestUpcomingDue();
  const totalNextDue = nextDueDate ? getTotalForDate(nextDueDate) : 0;

  // --- WhatsApp ---

  function buildWhatsAppMessage(targetDate) {
    const list = targetDate
      ? deudas.filter(
          (x) =>
            (x.nextDue || x.fecha) === formatDateYMD(targetDate)
        )
      : deudas;

    const total = list.reduce((s, it) => s + Number(it.monto || 0), 0);
    let text =
      `Recordatorio de pagos (${targetDate ? targetDate.toLocaleDateString() : "resumen"}):\n`;
    list.forEach((it) => {
      const base = `- ${it.descripcion}: $${Number(it.monto).toLocaleString()}`;
      const extra =
        it.type === "installments"
          ? ` (${it.installmentsPaid || 0}/${it.installmentsTotal} cuotas)`
          : it.type === "recurring"
          ? " (recurrente)"
          : "";
      text += base + extra + "\n";
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
      } catch {
        // ignore
      }
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  function handleSendWhatsAppForQuincena() {
    const message = buildWhatsAppMessage(upcomingQuincena);
    openWhatsAppWithMessage(message);
  }

  function handleSendWhatsAppAll() {
    const message = buildWhatsAppMessage(null);
    openWhatsAppWithMessage(message);
  }

  function savePhoneNumber(value) {
    setPhoneNumber(value);
    try {
      if (value) localStorage.setItem("whatsappPhone", value);
      else localStorage.removeItem("whatsappPhone");
    } catch {
      // ignore
    }
  }

  // --- Handlers de formulario y acciones ---

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    const monto = Number(form.monto) || 0;
    if (!form.descripcion.trim()) {
      alert("La descripción es obligatoria.");
      return;
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      alert("Ingresa un monto válido mayor a 0.");
      return;
    }

    const id = String(Date.now());
    const fechaBase = form.fecha || formatDateYMD(new Date());

    let nueva = {
      id,
      descripcion: form.descripcion.trim() || "(sin descripción)",
      monto,
      fecha: fechaBase,
      estado: form.estado || "pendiente",
      creadaEn: new Date().toISOString(),
      type: form.type || "one-time",
      nextDue: fechaBase,
    };

    if (form.type === "installments") {
      const total = Math.max(1, Number(form.installmentsTotal) || 1);
      const firstDue = form.nextDue || fechaBase;
      const schedule = generateInstallments(
        monto,
        total,
        firstDue,
        form.recurrence || "monthly"
      );
      const installmentAmount = schedule.length
        ? schedule[0].amount
        : Math.round((monto / total) * 100) / 100;
      nueva = {
        ...nueva,
        type: "installments",
        installmentsTotal: total,
        installmentsPaid: 0,
        installmentAmount,
        nextDue: schedule.length ? schedule[0].dueDate : firstDue,
        schedule,
        recurrence: form.recurrence || "monthly",
      };
    } else if (form.type === "recurring") {
      nueva = {
        ...nueva,
        type: "recurring",
        recurrence: form.recurrence || "monthly",
        nextDue: form.nextDue || fechaBase,
      };
    }

    setDeudas((prev) => [nueva, ...prev]);

    setForm({
      descripcion: "",
      monto: "",
      fecha: "",
      type: "one-time",
      estado: "pendiente",
      installmentsTotal: 1,
      installmentsPaid: 0,
      nextDue: "",
      recurrence: "monthly",
    });
    setShowForm(false);
  }

  function markInstallmentItemPaid(id, index) {
    setDeudas((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        if (d.type !== "installments") return d;
        const schedule = Array.isArray(d.schedule) ? d.schedule.slice() : [];
        const idx = index - 1;
        if (!schedule[idx] || schedule[idx].paid) return d;

        schedule[idx] = {
          ...schedule[idx],
          paid: true,
          paidAt: new Date().toISOString(),
        };
        const paidCount = schedule.filter((s) => s.paid).length;
        const nextUnpaid = schedule.find((s) => !s.paid);

        return {
          ...d,
          schedule,
          installmentsPaid: paidCount,
          estado:
            paidCount >= (d.installmentsTotal || schedule.length)
              ? "pagada"
              : "pendiente",
          nextDue: nextUnpaid ? nextUnpaid.dueDate : null,
        };
      })
    );
  }

  function markRecurringPaid(id) {
    setDeudas((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        if (d.type === "recurring") {
          const nd = advanceNextDue(
            d.nextDue || d.fecha,
            d.recurrence || "monthly"
          );
          return { ...d, nextDue: nd };
        }
        return d;
      })
    );
  }

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleClearAll() {
    setShowClearConfirm(true);
  }

  function confirmClearAll() {
    setDeudas([]);
    try {
      localStorage.removeItem("deudas");
    } catch {
      // ignore
    }
    setShowClearConfirm(false);
  }

  // --- Render ---

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
          <div className="rounded-2xl p-3.5 md:p-4 bg-gradient-to-br from-amber-500/10 via-amber-400/10 to-amber-300/10 border border-amber-400/40">
            <p className="text-xs uppercase tracking-wide text-amber-200/90">
              Total restante
            </p>
            <p className="text-xl md:text-2xl font-semibold mt-1">
              ${ (Math.round(totalRestante * 100) / 100).toLocaleString() }
            </p>
            {nextDueDate && (
              <div className="text-[12px] text-slate-300 mt-2">
                Próx venc: <span className="font-medium text-slate-100">${(Math.round(totalNextDue * 100) / 100).toLocaleString()}</span>
                <span className="text-slate-400"> · {formatDateShort(nextDueDate)}</span>
              </div>
            )}
          </div>
          <div className="rounded-2xl p-3.5 md:p-4 bg-gradient-to-br from-emerald-500/10 via-emerald-400/10 to-emerald-300/10 border border-emerald-400/40">
            <p className="text-xs uppercase tracking-wide text-emerald-200/90">
              Total pagado (histórico)
            </p>
            <p className="text-xl md:text-2xl font-semibold mt-1">
              ${totalPagado.toLocaleString()}
            </p>
          </div>
        </section>

        {/* Tarjetas resumen */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base md:text-lg font-semibold">
                Tarjetas rápidas
              </h2>
              {deudas.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[11px] md:text-xs text-slate-300 border border-slate-700/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {filteredDeudas.length} registro
                  {filteredDeudas.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <span className="text-[11px] md:text-xs text-slate-500">
              Vista compacta por deuda
            </span>
          </div>

          {deudas.length === 0 ? (
            <p className="text-sm text-slate-400 bg-slate-900/70 rounded-2xl border border-dashed border-slate-700 px-4 py-4 text-center">
              No hay deudas para mostrar todavía. Agrega una nueva con el botón{" "}
              <strong className="font-semibold">+</strong> de abajo.
            </p>
          ) : (
            <div className="flex flex-col md:flex-row gap-3.5 md:gap-4 md:overflow-x-auto pb-1 md:pb-2 -mx-1 px-1">
              {filteredDeudas.map((d) => {
                const isOpen = expandedId === d.id;
                const category = getCategory(d.descripcion);
                const initials = getInitials(d.descripcion);
                const isPendiente = d.estado === "pendiente";

                return (
                  <article
                    key={d.id}
                    className={
                      "group w-full md:min-w-[300px] flex-shrink-0 rounded-2xl border ios-card ios-card-enter md:snap-start transition-all duration-200 " +
                      (isOpen
                        ? "shadow-lg border-slate-700 bg-slate-900/90"
                        : "border-slate-800 bg-slate-900/80 hover:border-slate-700/80 hover:bg-slate-900")
                    }
                  >
                    {/* Cabecera de la tarjeta */}
                    <button
                      onClick={() => toggleExpand(d.id)}
                      className="w-full text-left px-3.5 py-3 md:px-4 md:py-3.5"
                      style={{ border: "none", background: "transparent" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Icono + texto principal */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={
                              "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold " +
                              (isPendiente
                                ? "bg-amber-400/90 text-slate-900"
                                : "bg-emerald-400/90 text-slate-900")
                            }
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="inline-flex items-center rounded-full bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300 border border-slate-700/80">
                                {category}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400 border border-slate-700/80">
                                {getTypeLabel(d.type)}
                              </span>
                              {!isOpen && (
                                <span className="text-[10px] text-slate-500">
                                  {formatDateShort(d.nextDue || d.fecha)} ·{" "}
                                  {daysAgo(d.creadaEn?.slice(0, 10) || d.fecha)}
                                </span>
                              )}
                            </div>
                            <div className="text-sm md:text-base font-semibold text-slate-100 truncate">
                              {d.descripcion}
                            </div>
                          </div>
                        </div>

                        {/* Estado + monto */}
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <div
                              className={
                                "h-5 w-5 flex items-center justify-center rounded-full border text-[10px] text-slate-300 transition-transform " +
                                (isOpen
                                  ? "border-slate-500 bg-slate-800 rotate-180"
                                  : "border-slate-700 bg-slate-900 group-hover:border-slate-500")
                              }
                            >
                              <svg
                                width="12"
                                height="12"
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
                          <div className="text-base md:text-lg font-semibold text-slate-50">
                            ${d.monto.toLocaleString()}
                          </div>
                          {(() => {
                            const nextAmt = getNextDueAmount(d);
                            if (nextAmt != null) {
                              return (
                                <div className="text-[11px]">
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-[11px] px-2 py-0.5">
                                    Próx: {'$' + nextAmt.toFixed(2)}
                                  </span>
                                </div>
                              );
                            }
                            return d.nextDue ? (
                              <div className="text-[11px] text-slate-400">
                                Próx: {formatDateShort(d.nextDue)}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </button>

                    {/* Detalle expandido */}
                    {isOpen && (
                      <div className="mt-1 px-3.5 pb-3.5 md:px-4 md:pb-4 border-t border-slate-800/80 bg-slate-950/60 rounded-b-2xl text-sm">
                        <div className="flex items-center justify-between text-[11px] md:text-xs text-slate-400 mb-2.5">
                          <span>
                            Fecha creada:{" "}
                            <span className="font-medium text-slate-200">
                              {(d.creadaEn || "").slice(0, 10) || d.fecha}
                            </span>
                          </span>
                          <span className="text-slate-500">
                            Registrado{" "}
                            {daysAgo(
                              d.creadaEn?.slice(0, 10) || d.fecha
                            )}
                          </span>
                        </div>

                        {d.type === "installments" && Array.isArray(d.schedule) ? (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-medium">
                                Plan de cuotas
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {(d.installmentsPaid || 0)}/
                                {d.installmentsTotal} pagadas
                              </div>
                            </div>
                            <ul className="space-y-2 mb-3 max-h-48 overflow-auto pr-1">
                              {d.schedule.map((s) => (
                                <li
                                  key={s.index}
                                  className="flex items-center justify-between text-[12px]"
                                >
                                  <div>
                                    <div className="font-medium">
                                      Cuota {s.index}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                      {formatDateShort(s.dueDate)} — $
                                      {s.amount.toLocaleString()}
                                    </div>
                                  </div>
                                  <div>
                                    {s.paid ? (
                                      <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px]">
                                        Pagada
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          markInstallmentItemPaid(
                                            d.id,
                                            s.index
                                          )
                                        }
                                        className="px-2 py-1 rounded-full bg-amber-400 text-slate-900 text-[11px] hover:bg-amber-300"
                                      >
                                        Marcar pagada
                                      </button>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  setShowCalendar({
                                    open: true,
                                    debtId: d.id,
                                  })
                                }
                                className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:bg-slate-900"
                              >
                                Ver calendario
                              </button>
                              <button
                                onClick={() =>
                                  setDeudas((prev) =>
                                    prev.filter((p) => p.id !== d.id)
                                  )
                                }
                                className="flex-1 py-2 rounded-xl border border-red-600 text-red-400 text-xs hover:bg-red-600/10"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        ) : d.type === "recurring" ? (
                          <div className="space-y-3">
                            <div className="text-[12px] text-slate-300">
                              Pago recurrente <span className="font-semibold">{getRecurrenceLabel(d.recurrence)}</span>. Próximo vencimiento: <span className="font-semibold">{d.nextDue ? formatDateShort(d.nextDue) : "—"}</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => markRecurringPaid(d.id)}
                                className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-400"
                              >
                                Registrar pago (mover próximo vencimiento)
                              </button>
                              <button
                                onClick={() =>
                                  setDeudas((prev) =>
                                    prev.filter((p) => p.id !== d.id)
                                  )
                                }
                                className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:bg-slate-900"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 flex flex-col sm:flex-row gap-2">
                            <button
                              onClick={() =>
                                setDeudas((prev) =>
                                  prev.map((p) =>
                                    p.id === d.id
                                      ? { ...p, estado: "pagada" }
                                      : p
                                  )
                                )
                              }
                              className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition"
                            >
                              Marcar pagada
                            </button>
                            <button
                              onClick={() =>
                                setDeudas((prev) =>
                                  prev.filter((p) => p.id !== d.id)
                                )
                              }
                              className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:bg-slate-800 transition"
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
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
                    if (typeof Notification !== "undefined") {
                      Notification.requestPermission();
                    }
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
              onClick={() => {
                setForm((p) => ({ ...p, fecha: formatDateYMD(new Date()) }));
                setShowForm(true);
              }}
              aria-label="Agregar"
              title="Agregar"
              className="h-12 w-12 rounded-full bg-sky-500 text-white text-2xl leading-none flex items-center justify-center shadow-xl hover:bg-sky-400 transition border border-sky-300/70"
            >
              +
            </button>
          </div>
        </div>

        {/* Modal: formulario */}
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
                onSubmit={handleSubmit}
                className="mt-2 space-y-3"
              >
                <h3 className="text-lg font-semibold mb-1">Nueva deuda</h3>
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
                      Fecha de registro
                    </label>
                    <input
                      type="date"
                      name="fecha"
                      value={form.fecha}
                      onChange={handleChange}
                      readOnly
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Se establece automáticamente al crear la deuda.
                    </p>
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1 text-slate-300">
                        Tipo y estado
                      </label>
                      <div className="flex gap-2 items-center">
                        <select
                          name="type"
                          value={form.type}
                          onChange={handleChange}
                          className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                        >
                          <option value="one-time">Una vez</option>
                          <option value="installments">Cuotas (meses / quincenas)</option>
                          <option value="recurring">Recurrente</option>
                        </select>

                        <select
                          name="estado"
                          value={form.estado}
                          onChange={handleChange}
                          className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                        >
                          {ESTADOS.map((estado) => (
                            <option key={estado} value={estado}>
                              {estado.charAt(0).toUpperCase() + estado.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {form.type === "installments" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1 text-slate-300">
                            Número de cuotas
                          </label>
                          <input
                            type="number"
                            name="installmentsTotal"
                            value={form.installmentsTotal}
                            onChange={handleChange}
                            min="1"
                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-slate-300">
                            Primer vencimiento
                          </label>
                          <input
                            type="date"
                            name="nextDue"
                            value={form.nextDue}
                            onChange={handleChange}
                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-slate-300">
                            Periodicidad
                          </label>
                          <select
                            name="recurrence"
                            value={form.recurrence}
                            onChange={handleChange}
                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                          >
                            <option value="monthly">Mensual</option>
                            <option value="quincena">Quincena</option>
                            <option value="weekly">Semanal</option>
                            <option value="annual">Anual</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {form.type === "recurring" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1 text-slate-300">
                            Periodicidad
                          </label>
                          <select
                            name="recurrence"
                            value={form.recurrence}
                            onChange={handleChange}
                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                          >
                            <option value="monthly">Mensual</option>
                            <option value="quincena">Quincena</option>
                            <option value="weekly">Semanal</option>
                            <option value="annual">Anual</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-slate-300">
                            Próximo vencimiento
                          </label>
                          <input
                            type="date"
                            name="nextDue"
                            value={form.nextDue}
                            onChange={handleChange}
                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                          />
                        </div>
                      </div>
                    )}
                    {form.type === "one-time" && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium mb-1 text-slate-300">
                          Fecha exigible / Vencimiento
                        </label>
                        <input
                          type="date"
                          name="nextDue"
                          value={form.nextDue}
                          onChange={handleChange}
                          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm ios-input"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Fecha en la que se exige el pago. Si no se elige,
                          se usará la fecha de registro.
                        </p>
                      </div>
                    )}
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
              <div className="text-base font-semibold mb-1.5">
                Confirmar borrado de todos los pagos
              </div>
              <div className="text-xs md:text-sm text-slate-300 mb-3">
                Esta acción eliminará toda la información almacenada de pagos
                en este equipo. No se puede deshacer. Revisa el resumen antes
                de confirmar.
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <div className="px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-200 text-xs font-medium border border-amber-400/40">
                  Pendiente: ${totalPendiente.toLocaleString()}
                </div>
                <div className="px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-200 text-xs font-medium border border-emerald-400/40">
                  Pagado: ${totalPagado.toLocaleString()}
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:bg-slate-900/70"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmClearAll}
                  className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500"
                >
                  Borrar todo
                </button>
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

        {/* Calendario de cuotas */}
        {showCalendar.open && (
          <div
            className="ios-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCalendar({ open: false, debtId: null })}
          >
            <div
              className="ios-modal-sheet w-full max-w-lg rounded-2xl bg-slate-950/95 border border-slate-800 px-4 py-5 md:px-5 md:py-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">
                  Calendario de vencimientos
                </h3>
                <button
                  onClick={() =>
                    setShowCalendar({ open: false, debtId: null })
                  }
                  className="text-slate-400 text-sm"
                >
                  Cerrar
                </button>
              </div>
              <div className="text-sm text-slate-300">
                {(() => {
                  const debt = deudas.find((x) => x.id === showCalendar.debtId);
                  if (!debt) return <div>No se encontró la deuda.</div>;

                  const schedule = Array.isArray(debt.schedule)
                    ? debt.schedule
                    : [];

                  if (schedule.length === 0)
                    return <div>No hay vencimientos programados.</div>;

                  const startDate = schedule[0]?.dueDate || debt.nextDue || debt.fecha;
                  const monthsCount = debt.installmentsTotal || Math.max(3, schedule.length);

                  return (
                    <MiniCalendar
                      startDate={startDate}
                      months={monthsCount}
                      schedule={schedule}
                      onMarkInstallment={(index) =>
                        markInstallmentItemPaid(debt.id, index)
                      }
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
