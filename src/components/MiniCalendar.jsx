import React from "react";
import "./MiniCalendar.css";

function formatMonthLabel(date) {
  // date expected as 'YYYY-MM' or Date
  try {
    if (date instanceof Date) {
      return date.toLocaleString(undefined, { month: "short", year: "numeric" });
    }
    const parts = String(date).split("-").map((p) => Number(p));
    const year = parts[0];
    const month = (parts[1] || 1) - 1; // zero-based
    const d = new Date(year, month, 1);
    return d.toLocaleString(undefined, { month: "short", year: "numeric" });
  } catch {
    return String(date);
  }
}

function getMonthKey(dateStr) {
  if (!dateStr) return "";
  if (dateStr instanceof Date) {
    return `${dateStr.getFullYear()}-${String(dateStr.getMonth() + 1).padStart(2, "0")}`;
  }
  const parts = String(dateStr).split("-").map((p) => Number(p));
  const year = parts[0];
  const month = parts[1] || 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default function MiniCalendar({
  startDate,
  months = 3,
  schedule = [],
  onMarkInstallment = () => {},
}) {
  if (!startDate) return <div>No hay fecha inicial.</div>;

  let start;
  if (startDate instanceof Date) start = startDate;
  else if (typeof startDate === "string") {
    const parts = startDate.split("-").map((p) => Number(p));
    if (parts.length < 3) {
      // try YYYY-MM
      start = new Date(parts[0], (parts[1] || 1) - 1, 1);
    } else {
      start = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  } else {
    start = new Date(startDate);
  }
  if (!start || isNaN(start.getTime())) return <div>Fecha inválida.</div>;

  const byMonth = schedule.reduce((acc, s) => {
    const key = getMonthKey(s.dueDate);
    acc[key] = acc[key] || [];
    acc[key].push(s);
    return acc;
  }, {});

  const monthsArr = [];
  for (let i = 0; i < months; i++) {
    const year = start.getFullYear();
    const monthIndex = start.getMonth() + i;
    const d = new Date(year, monthIndex, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthsArr.push({ key, label: formatMonthLabel(d), date: d });
  }

  return (
    <div className="mini-calendar grid gap-2">
      <div className="flex gap-2 flex-wrap">
        {monthsArr.map((m) => {
          const items = byMonth[m.key] || [];
          return (
            <div key={m.key} className="mini-month rounded-lg border p-2 bg-slate-900/80">
              <div className="mini-month-label text-xs text-slate-300 mb-1">
                {m.label}
              </div>
              <div className="mini-month-body text-[12px] text-slate-200">
                {items.length === 0 ? (
                  <div className="text-slate-400 text-[11px]">—</div>
                ) : (
                  <ul className="space-y-1">
                    {items.map((s) => (
                      <li key={s.index} className="flex items-center justify-between">
                        <div className="text-[12px]">
                          {new Date(s.dueDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                          {" — $" + Number(s.amount).toLocaleString()}
                        </div>
                        <div>
                          {s.paid ? (
                            <span className="due-paid text-emerald-400 text-xs">Pagada</span>
                          ) : (
                            <button
                              onClick={() => onMarkInstallment(s.index)}
                              className="due-mark text-amber-300 text-xs"
                            >
                              Marcar
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
