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
    // collect unique dates that are 15 or 16
    const candidateDates = Array.from(new Set(deudas.map((d) => d.fecha)))
      .map((s) => {
        const parts = s.split("-");
        if (parts.length !== 3) return null;
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      })
      .filter(Boolean)
      .filter((dt) => dt.getDate() === 15 || dt.getDate() === 16)
      .sort((a, b) => a - b);

    // pick the first date that is >= today, otherwise the next one in future
    for (const d of candidateDates) {
      if (d >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
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

  function buildWhatsAppMessage(targetDate) {
    // include debts that match the targetDate (or all if null)
    const list = (targetDate ? deudas.filter((x) => x.fecha === formatDateYMD(targetDate)) : deudas);
    const total = list.reduce((s, it) => s + Number(it.monto || 0), 0);
    let text = `Recordatorio de pagos para el día ${targetDate ? targetDate.toLocaleDateString() : "próximo"}:` + "\n";
    list.forEach((it) => {
      text += `- ${it.descripcion}: $${Number(it.monto).toLocaleString()}\n`;
    });
    text += `Total: $${total.toLocaleString()}`;
    return text;
  }

  function openWhatsAppWithMessage(message) {
    // require phone number in international format without +, e.g. 5213312345678
    let phone = phoneNumber;
    if (!phone) {
      phone = window.prompt("Ingresa el número de WhatsApp (código internacional, sin +). Ej: 5213312345678");
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

  // Schedule a browser notification for reminder if permission given (works only while app/tab open)
  function scheduleBrowserNotification(atTimestamp, title, body) {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        const delay = atTimestamp - Date.now();
        if (delay <= 0) {
          new Notification(title, { body });
          return;
        }
        if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = setTimeout(() => {
          new Notification(title, { body });
        }, delay);
        try { localStorage.setItem('scheduledReminder', String(atTimestamp)); } catch {}
      }
    } catch (err) {
      console.error('scheduleBrowserNotification error', err);
    }
  }

  // compute quincena and reminder date
  const upcomingQuincena = getUpcomingQuincena();
  const reminderDate = upcomingQuincena ? new Date(upcomingQuincena.getTime() - 24 * 60 * 60 * 1000) : null;

  useEffect(() => {
    // if we have a reminder date in future, ask for notification permission and schedule
    if (!reminderDate) return;
    const ts = reminderDate.setHours(9, 0, 0, 0); // at 9:00 local time the day before
    // ask permission if not granted
    if (Notification && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          scheduleBrowserNotification(ts, 'Recordatorio de pagos', 'Tienes pagos próximamente. Toca para enviar recordatorio por WhatsApp.');
        }
      });
    } else if (Notification && Notification.permission === 'granted') {
      scheduleBrowserNotification(ts, 'Recordatorio de pagos', 'Tienes pagos próximamente. Toca para enviar recordatorio por WhatsApp.');
    }
    // cleanup on unmount
    return () => {
      if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deudas?.length]);

  function handleSendWhatsAppForQuincena() {
    const message = buildWhatsAppMessage(upcomingQuincena);
    openWhatsAppWithMessage(message);
  }

  function handleClearAll() {
    setShowClearConfirm(true);
  }

  function confirmClearAll() {
    setDeudas([]);
    try { localStorage.removeItem('deudas'); } catch {}
    setShowClearConfirm(false);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
      <div className="app-shell w-full max-w-3xl bg-slate-800/70 backdrop-blur rounded-2xl shadow-lg p-4 md:p-6 border border-slate-700">
        <h1 className="text-2xl font-bold mb-1 text-center">Mis Deudas / Gastos</h1>
        <p className="text-slate-300 text-center text-sm mb-6">
          Administra tus compromisos financieros de forma sencilla.
        </p>

        {/* Header */}
        <div className="ios-header">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button onClick={() => { /* placeholder back */ }} className="text-slate-300" aria-label="back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div>
              <div className="ios-title">Mis Deudas</div>
              <div className="text-[12px] text-slate-400">Resumen y control</div>
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div className="segmented">
              <button className={filter==='all'? 'active':''} onClick={() => setFilter('all')}>Todos</button>
              <button className={filter==='pendiente'? 'active':''} onClick={() => setFilter('pendiente')}>Pendiente</button>
              <button className={filter==='pagada'? 'active':''} onClick={() => setFilter('pagada')}>Pagadas</button>
            </div>
            <div className="ml-2 px-2 py-1 rounded-md bg-slate-800/40 text-[12px] text-slate-300">
              {phoneNumber ? `WA: ${phoneNumber}` : "WA: No configurado"}
            </div>
            <button onClick={() => setShowSettings(true)} title="Ajustes" className="bg-white text-sky-500 p-2 rounded-full ml-2 shadow-md" aria-label="Ajustes">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zm8.94-2.5a1 1 0 0 0-.11-.37l-1.2-2.08a1 1 0 0 0-.9-.52l-2.45-.2a6.98 6.98 0 0 0-1.2-1.04l.52-2.36a1 1 0 0 0-.3-1.02l-1.5-1.5a1 1 0 0 0-1.02-.3l-2.36.52c-.33-.43-.7-.82-1.1-1.18L9.4 1.8a1 1 0 0 0-1.1 0L6.22 2.8c-.4.36-.77.75-1.1 1.18L2.76 3.46a1 1 0 0 0-1.02.3L.24 5.26a1 1 0 0 0-.3 1.02l.52 2.36c-.44.33-.84.69-1.2 1.04l-2.45.2a1 1 0 0 0-.9.52L.17 13.1a1 1 0 0 0-.11.37c0 .13-.06.25-.06.38s.02.25.06.37l1.2 2.08c.16.28.44.49.78.54l2.45.2c.37.58.8 1.12 1.3 1.6l-.52 2.36c-.09.36.04.73.3 1.02l1.5 1.5c.29.26.66.39 1.02.3l2.36-.52c.33.43.7.82 1.1 1.18l1.9 1c.37.2.8.2 1.17 0l1.9-1c.4-.36.77-.75 1.1-1.18l2.36.52c.36.09.73-.04 1.02-.3l1.5-1.5c.26-.29.39-.66.3-1.02l-.52-2.36c.5-.48.93-1.02 1.3-1.6l2.45-.2c.34-.05.62-.26.78-.54l1.2-2.08c.04-.12.06-.24.06-.37s-.02-.25-.06-.38z"/></svg>
            </button>
          </div>
        </div>

        {/* Resumen rápido */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-sm">
          <div className="rounded-xl p-3 total-pendiente">
            <p className="total-label">Total pendiente</p>
            <p className="total-amount">${totalPendiente.toLocaleString()}</p>
          </div>
          <div className="rounded-xl p-3 total-pagado">
            <p className="total-label">Total pagado (histórico)</p>
            <p className="total-amount">${totalPagado.toLocaleString()}</p>
          </div>
        </div>

        {/* Tarjetas resumen */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Tarjetas rápidas</h2>

          {deudas.length === 0 ? (
            <p className="text-sm text-slate-400">No hay deudas para mostrar como tarjetas. Crea una nueva arriba.</p>
          ) : (
            <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-2 md:snap-x md:snap-mandatory -mx-1 px-1">
              {filteredDeudas.map((d) => {
                const isOpen = expandedId === d.id;
                return (
                  <div key={d.id} className={`w-full md:min-w-[260px] md:min-w-[300px] flex-shrink-0 bg-slate-900/60 rounded-2xl border border-slate-700 ios-card ios-card-enter md:snap-start ${isOpen ? 'card-expanded' : 'card-collapsed'}`}>
                    <button onClick={() => toggleExpand(d.id)} className="w-full text-left" style={{border:'none',background:'transparent'}}>
                      <div className="card-header">
                        <div>
                          <div className="card-title text-slate-100">{d.descripcion}</div>
                          <div className="card-meta">{isOpen ? '' : `Fecha: ${d.fecha}`}</div>
                        </div>

                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div className={`${isOpen ? 'chevron open' : 'chevron'} text-slate-300`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                          <div className={
                            "text-sm font-semibold px-2 py-1 rounded-full " +
                            (d.estado === "pendiente" ? "bg-amber-400 text-slate-900" : "bg-emerald-500 text-white")
                          }>
                            {d.estado.charAt(0).toUpperCase() + d.estado.slice(1)}
                          </div>
                          <div className="card-amount text-slate-50">${d.monto.toLocaleString()}</div>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-3 px-1">
                        <p className="card-meta">Fecha: {d.fecha}</p>
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => { setDeudas((prev) => prev.map(p => p.id===d.id?{...p,estado:'pagada'}:p)); }} className="flex-1 py-2 rounded-lg bg-emerald-500 text-white">Marcar pagada</button>
                          <button onClick={() => { setDeudas((prev) => prev.filter(p => p.id!==d.id)); }} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300">Eliminar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reminder banner & actions */}
        <div className="mb-4">
          {reminderDate && (
            <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 text-sm flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Recordatorio programado</div>
                <div className="text-slate-400 text-xs">El recordatorio será enviado el {new Date(reminderDate).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { Notification && Notification.requestPermission(); }} className="px-3 py-1 rounded-lg border border-slate-700 text-slate-300">Activar notificaciones</button>
                <button onClick={() => handleSendWhatsAppForQuincena()} className="px-3 py-1 rounded-lg bg-sky-500 text-white ios-button">Enviar WhatsApp</button>
              </div>
            </div>
          )}
        </div>

        {/* Clear all button on quincena days */}
        {(() => {
          const today = new Date();
          const isQuincenaDay = today.getDate() === 15 || today.getDate() === 16;
          if (isQuincenaDay && deudas.length > 0) {
            return (
              <div className="mb-4 text-center">
                <button onClick={handleClearAll} className="px-4 py-2 rounded-lg bg-red-600 text-white ios-button">Borrar todos los pagos (ya pagué)</button>
              </div>
            );
          }
          return null;
        })()}
        {/* Small hint where the add button is the primary action */}
        <div className="text-center mb-6 text-sm text-slate-400">Usa el botón <strong>+</strong> para agregar una nueva deuda</div>

        {/* Floating Add Button */}
        <div className="ios-fab">
          <button onClick={() => setShowForm(true)} aria-label="Agregar" title="Agregar">+
          </button>
        </div>

        {/* Modal sheet for form */}
        {showForm && (
          <div className="ios-modal-backdrop" onClick={() => setShowForm(false)}>
            <div className="ios-modal-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="ios-modal-close">
                <button onClick={() => setShowForm(false)} className="text-slate-400">Cerrar</button>
              </div>
              <form onSubmit={(e) => { handleSubmit(e); setShowForm(false); }} className="mt-2">
                <h3 className="text-lg font-semibold mb-3">Nueva deuda</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium mb-1 text-slate-300">Descripción</label>
                    <input type="text" name="descripcion" value={form.descripcion} onChange={handleChange} placeholder="Ej. Pago tarjeta, préstamo amigo, etc." className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ios-input" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-300">Monto</label>
                    <input type="number" name="monto" value={form.monto} onChange={handleChange} min="0" step="0.01" placeholder="0.00" className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ios-input" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-300">Fecha</label>
                    <input type="date" name="fecha" value={form.fecha} onChange={handleChange} className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ios-input" />
                    <p className="text-[11px] text-slate-400 mt-1">Si la dejas vacía, se usará la fecha de hoy.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-300">Estado</label>
                    <select name="estado" value={form.estado} onChange={handleChange} className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ios-input">
                      {ESTADOS.map((estado) => (
                        <option key={estado} value={estado}>{estado.charAt(0).toUpperCase() + estado.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300">Cancelar</button>
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-sky-500 text-white ios-button">Guardar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Clear confirmation modal */}
        {showClearConfirm && (
          <div className="ios-modal-backdrop" onClick={() => setShowClearConfirm(false)}>
            <div className="ios-modal-sheet" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-3">Confirmar borrado</h3>
              <p className="text-sm text-slate-300">Si confirmas, se eliminará toda la información almacenada de pagos. Esta acción no se puede deshacer.</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300">Cancelar</button>
                <button onClick={confirmClearAll} className="flex-1 py-2 rounded-lg bg-red-600 text-white ios-button">Borrar todo</button>
              </div>
            </div>
          </div>
        )}

        {/* Settings modal */}
        {showSettings && (
          <div className="ios-modal-backdrop" onClick={() => setShowSettings(false)}>
            <div className="ios-modal-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="ios-modal-close">
                <button onClick={() => setShowSettings(false)} className="text-slate-400">Cerrar</button>
              </div>

              <h3 className="text-lg font-semibold mb-3">Ajustes</h3>
              <div className="mb-3">
                <label className="block text-xs text-slate-300 mb-1">Número de WhatsApp (sin +)</label>
                <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="5213312345678" className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm ios-input" />
                <p className="text-[12px] text-slate-400 mt-2">Se usa para pre-poblar el link de WhatsApp al enviar recordatorios.</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { savePhoneNumber(phoneNumber); setShowSettings(false); }} className="flex-1 py-2 rounded-lg bg-sky-500 text-white ios-button">Guardar</button>
                <button onClick={() => { savePhoneNumber(''); setShowSettings(false); }} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300">Eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
